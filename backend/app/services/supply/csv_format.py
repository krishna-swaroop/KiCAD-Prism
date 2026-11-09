"""The CSV offers file: columns, parsing and validation. Pure, no database.

A file is all or nothing. Stock and price data that is half right is worse than
data that is clearly old, so one bad row rejects the import and the errors say
which line and column to fix.

Columns (headers are case-insensitive; spaces, hyphens and ``@`` count as
underscores):

    required   sku, mpn, manufacturer, stock
    optional   currency, moq, order_multiple, packaging, lead_time_days,
               lifecycle, discontinued, rohs, product_url,
               incoming_qty, incoming_date,
               jlc_library (basic or extended), jlc_preferred (yes or no)
    prices     price_<quantity>, for example price_1, price_10, price_100

Comma, semicolon or tab separated. UTF-8, with or without a byte order mark.
Prices take a dot or a comma as the decimal mark.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from app.services.supply.models import Incoming, PriceBreak
from app.services.supply.vocabulary import Lifecycle, Packaging

MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 50_000
MAX_REPORTED_ERRORS = 50

REQUIRED_COLUMNS = ("sku", "mpn", "manufacturer", "stock")
OPTIONAL_COLUMNS = (
    "currency", "moq", "order_multiple", "packaging", "lead_time_days", "lifecycle",
    "discontinued", "rohs", "product_url", "incoming_qty", "incoming_date",
    "jlc_library", "jlc_preferred",
)

TEMPLATE = (
    "sku,mpn,manufacturer,stock,currency,moq,order_multiple,packaging,lead_time_days,lifecycle,"
    "jlc_library,jlc_preferred,price_1,price_10,price_100\n"
    "EXAMPLE-1,ABC123,Acme,1200,EUR,1,1,cut_tape,,active,,,0.52,0.44,0.31\n"
)

_ALIASES = {
    "manufacturer_part_number": "mpn", "mfr_part_number": "mpn", "mfr_part_no": "mpn", "part_number": "mpn",
    "manufacturer_name": "manufacturer", "mfr": "manufacturer", "brand": "manufacturer",
    "supplier_part_number": "sku", "distributor_part_number": "sku", "supplier_sku": "sku",
    "quantity": "stock", "qty": "stock", "in_stock": "stock", "available": "stock",
    "minimum_order_quantity": "moq", "min_order_qty": "moq",
    "lead_time": "lead_time_days", "lead_time_weeks_days": "lead_time_days",
    "url": "product_url", "product_link": "product_url",
}

_PACKAGING = {
    "cut_tape": Packaging.CUT_TAPE, "cut tape": Packaging.CUT_TAPE, "ct": Packaging.CUT_TAPE,
    "tape_reel": Packaging.TAPE_REEL, "tape and reel": Packaging.TAPE_REEL, "tape & reel": Packaging.TAPE_REEL,
    "reel": Packaging.TAPE_REEL, "tr": Packaging.TAPE_REEL,
    "tray": Packaging.TRAY, "tube": Packaging.TUBE, "bulk": Packaging.BULK, "other": Packaging.OTHER,
}
_LIFECYCLE = {
    "active": Lifecycle.ACTIVE, "production": Lifecycle.ACTIVE,
    "nrnd": Lifecycle.NRND, "not recommended for new designs": Lifecycle.NRND,
    "last_time_buy": Lifecycle.LAST_TIME_BUY, "last time buy": Lifecycle.LAST_TIME_BUY, "ltb": Lifecycle.LAST_TIME_BUY,
    "obsolete": Lifecycle.OBSOLETE, "eol": Lifecycle.OBSOLETE, "end of life": Lifecycle.OBSOLETE,
}
_JLC_LIBRARY = {"basic": "Basic", "extended": "Extended"}
_TRUE = {"yes", "y", "true", "1"}
_FALSE = {"no", "n", "false", "0"}
_PRICE_COLUMN = re.compile(r"^price_(\d+)$")
_INT = re.compile(r"^\d+$")


@dataclass(frozen=True, slots=True)
class CsvRowError:
    line: int
    column: str
    message: str


@dataclass(frozen=True, slots=True)
class CsvOfferRow:
    sku: str
    mpn: str
    manufacturer: str
    stock: int
    currency: str
    moq: int
    order_multiple: int
    packaging: Packaging
    lead_time_days: int | None
    lifecycle: Lifecycle
    discontinued: bool
    rohs: bool | None
    product_url: str
    incoming: Incoming | None
    price_breaks: tuple[PriceBreak, ...]
    # JLCPCB's class of the part in its assembly library, and whether it is preferred.
    jlc_library: str = ""
    jlc_preferred: bool = False


@dataclass(frozen=True, slots=True)
class ParsedCsv:
    rows: tuple[CsvOfferRow, ...]
    errors: tuple[CsvRowError, ...]
    error_count: int
    ignored_columns: tuple[str, ...] = field(default=())


class _Cell(ValueError):
    """A single bad cell. The message is shown next to its column."""


def _normalize_header(raw: str) -> str:
    name = re.sub(r"[\s\-@.]+", "_", raw.strip().lower()).strip("_")
    name = re.sub(r"_+", "_", name)
    return _ALIASES.get(name, name)


def _detect_delimiter(header_line: str) -> str:
    counts = {delimiter: header_line.count(delimiter) for delimiter in (",", ";", "\t")}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","


def _text(value: str, *, limit: int = 100, required: bool = False) -> str:
    value = value.strip()
    if required and not value:
        raise _Cell("Required.")
    if len(value) > limit:
        raise _Cell(f"At most {limit} characters.")
    return value


def _integer(value: str, *, minimum: int, default: int | None = None, required: bool = False) -> int | None:
    cleaned = value.strip().replace(" ", "").replace("_", "")
    if not cleaned:
        if required:
            raise _Cell("Required.")
        return default
    if not _INT.match(cleaned):
        raise _Cell("A whole number, digits only.")
    number = int(cleaned)
    if number < minimum:
        raise _Cell(f"At least {minimum}.")
    return number


def _boolean(value: str) -> bool | None:
    token = value.strip().lower()
    if not token:
        return None
    if token in _TRUE:
        return True
    if token in _FALSE:
        return False
    raise _Cell("Use yes or no.")


def _price(value: str) -> Decimal:
    token = value.strip()
    if "," in token and "." not in token:
        token = token.replace(",", ".")
    try:
        amount = Decimal(token)
    except InvalidOperation:
        raise _Cell("A price such as 0.52.") from None
    if not amount.is_finite() or amount < 0:
        raise _Cell("A price of zero or more.")
    return amount


def _choice(value: str, table: dict, default, label: str):
    token = value.strip().lower()
    if not token:
        return default
    if token in table:
        return table[token]
    choices = sorted({getattr(member, "value", member) for member in table.values()})
    raise _Cell(f"Unknown {label}. Use one of: {', '.join(choices)}.")


def _parse_row(cells: dict[str, str], price_columns: list[tuple[int, str]], default_currency: str) -> CsvOfferRow:
    """Parse one row; raises ``_Row`` carrying every bad cell."""

    problems: list[tuple[str, str]] = []

    def attempt(column: str, parse):
        try:
            return parse()
        except _Cell as bad:
            problems.append((column, str(bad)))
            return None

    sku = attempt("sku", lambda: _text(cells.get("sku", ""), required=True))
    mpn = attempt("mpn", lambda: _text(cells.get("mpn", ""), required=True))
    manufacturer = attempt("manufacturer", lambda: _text(cells.get("manufacturer", ""), required=True))
    stock = attempt("stock", lambda: _integer(cells.get("stock", ""), minimum=0, required=True))
    moq = attempt("moq", lambda: _integer(cells.get("moq", ""), minimum=1, default=1))
    multiple = attempt("order_multiple", lambda: _integer(cells.get("order_multiple", ""), minimum=1, default=1))
    lead = attempt("lead_time_days", lambda: _integer(cells.get("lead_time_days", ""), minimum=0))
    packaging = attempt("packaging", lambda: _choice(cells.get("packaging", ""), _PACKAGING, Packaging.UNKNOWN, "packaging"))
    lifecycle = attempt("lifecycle", lambda: _choice(cells.get("lifecycle", ""), _LIFECYCLE, Lifecycle.UNKNOWN, "lifecycle"))
    discontinued = attempt("discontinued", lambda: bool(_boolean(cells.get("discontinued", ""))))
    rohs = attempt("rohs", lambda: _boolean(cells.get("rohs", "")))
    jlc_library = attempt("jlc_library", lambda: _choice(cells.get("jlc_library", ""), _JLC_LIBRARY, "", "JLCPCB library"))
    jlc_preferred = attempt("jlc_preferred", lambda: bool(_boolean(cells.get("jlc_preferred", ""))))

    url = attempt("product_url", lambda: _text(cells.get("product_url", ""), limit=500)) or ""
    if url and not url.lower().startswith("https://"):
        problems.append(("product_url", "Must start with https://."))

    currency = (cells.get("currency", "").strip() or default_currency).upper()
    if cells.get("currency", "").strip() and not re.fullmatch(r"[A-Za-z]{3}", cells["currency"].strip()):
        problems.append(("currency", "A three letter code such as EUR."))

    breaks: list[PriceBreak] = []
    for quantity, header in price_columns:
        raw = cells.get(header, "")
        if not raw.strip():
            continue
        if quantity < 1:
            problems.append((header, "Quantity must be at least 1."))
            continue
        amount = attempt(header, lambda raw=raw: _price(raw))
        if amount is not None:
            breaks.append(PriceBreak(quantity, amount))
    breaks.sort(key=lambda item: item.quantity)
    if breaks and not currency:
        problems.append(("currency", "Set a currency here or on the connector."))

    incoming = None
    qty_text, date_text = cells.get("incoming_qty", "").strip(), cells.get("incoming_date", "").strip()
    if qty_text or date_text:
        quantity = attempt("incoming_qty", lambda: _integer(qty_text, minimum=1, required=True))
        expected = None
        if date_text:
            try:
                expected = date.fromisoformat(date_text)
            except ValueError:
                problems.append(("incoming_date", "A date as YYYY-MM-DD."))
        if quantity is not None:
            incoming = Incoming(quantity, expected)

    if problems:
        raise _Row(problems)
    return CsvOfferRow(
        sku=sku, mpn=mpn, manufacturer=manufacturer, stock=stock, currency=currency,
        moq=moq, order_multiple=multiple, packaging=packaging, lead_time_days=lead, lifecycle=lifecycle,
        discontinued=bool(discontinued), rohs=rohs, product_url=url, incoming=incoming, price_breaks=tuple(breaks),
        jlc_library=jlc_library, jlc_preferred=bool(jlc_preferred),
    )


class _Row(Exception):
    def __init__(self, problems: list[tuple[str, str]]) -> None:
        super().__init__()
        self.problems = problems


def parse_offers_csv(content: bytes, *, default_currency: str = "") -> ParsedCsv:
    """Parse and validate a whole file. Never raises for bad content."""

    errors: list[CsvRowError] = []
    total_errors = 0

    def fail(line: int, column: str, message: str) -> None:
        nonlocal total_errors
        total_errors += 1
        if len(errors) < MAX_REPORTED_ERRORS:
            errors.append(CsvRowError(line, column, message))

    def result(rows=(), ignored=()) -> ParsedCsv:
        return ParsedCsv(tuple(rows), tuple(errors), total_errors, tuple(ignored))

    if len(content) > MAX_BYTES:
        fail(0, "", f"The file is larger than {MAX_BYTES // (1024 * 1024)} MB.")
        return result()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        fail(0, "", "The file is not UTF-8. Save it as CSV UTF-8.")
        return result()
    if not text.strip():
        fail(0, "", "The file is empty.")
        return result()

    first_line = next(line for line in text.splitlines() if line.strip())
    reader = csv.reader(io.StringIO(text), delimiter=_detect_delimiter(first_line))
    try:
        header_row = next(row for row in reader if any(cell.strip() for cell in row))
    except (StopIteration, csv.Error):
        fail(1, "", "The file has no header row.")
        return result()

    headers = [_normalize_header(cell) for cell in header_row]
    seen: set[str] = set()
    for header in headers:
        if header in seen and header:
            fail(reader.line_num, header, "Duplicate column.")
        seen.add(header)
    missing = [name for name in REQUIRED_COLUMNS if name not in headers]
    if missing:
        fail(reader.line_num, "", "Missing columns: " + ", ".join(missing) + ".")
    price_columns = [(int(m.group(1)), h) for h in headers if (m := _PRICE_COLUMN.match(h))]
    known = set(REQUIRED_COLUMNS) | set(OPTIONAL_COLUMNS) | {header for _, header in price_columns}
    ignored = [header or "(blank)" for header in headers if header not in known]
    if total_errors:
        return result(ignored=ignored)

    rows: list[CsvOfferRow] = []
    first_line_of: dict[str, int] = {}
    data_rows = 0
    try:
        for raw in reader:
            line = reader.line_num
            if not any(cell.strip() for cell in raw):
                continue
            data_rows += 1
            if data_rows > MAX_ROWS:
                fail(line, "", f"More than {MAX_ROWS:,} rows.")
                break
            cells = {headers[i]: raw[i] for i in range(min(len(headers), len(raw)))}
            try:
                row = _parse_row(cells, price_columns, default_currency.upper())
            except _Row as bad:
                for column, message in bad.problems:
                    fail(line, column, message)
                continue
            key = row.sku.lower()
            if key in first_line_of:
                fail(line, "sku", f"Duplicate sku, first seen on line {first_line_of[key]}.")
                continue
            first_line_of[key] = line
            rows.append(row)
    except csv.Error as exc:
        fail(reader.line_num, "", f"The file could not be read as CSV: {exc}.")
    if not rows and not total_errors:
        fail(reader.line_num, "", "The file has a header but no rows.")
    return result(rows if not total_errors else (), ignored)


def _record_cell(value) -> str:
    """A pushed value as a file's cell reads: nothing as blank, true and false as yes and no."""

    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    return str(value)


def parse_offer_records(records, *, default_currency: str = "") -> ParsedCsv:
    """Offers pushed as records (``push.py``), checked as a file's rows are: the same columns, with ``prices`` as
    ``{quantity, unit_price}`` pairs in place of ``price_<quantity>`` columns. A row's ``line`` is its position, from 1."""

    errors: list[CsvRowError] = []
    total_errors = 0

    def fail(line: int, column: str, message: str) -> None:
        nonlocal total_errors
        total_errors += 1
        if len(errors) < MAX_REPORTED_ERRORS:
            errors.append(CsvRowError(line, column, message))

    if len(records) > MAX_ROWS:
        fail(0, "", f"More than {MAX_ROWS:,} rows.")
        return ParsedCsv((), tuple(errors), total_errors)
    rows: list[CsvOfferRow] = []
    first_of: dict[str, int] = {}
    for line, record in enumerate(records, start=1):
        cells = {name: _record_cell(record.get(name)) for name in (*REQUIRED_COLUMNS, *OPTIONAL_COLUMNS)}
        price_columns: list[tuple[int, str]] = []
        for tier in record.get("prices") or []:
            header = f"price_{tier.get('quantity')}"
            if not _PRICE_COLUMN.match(header):
                fail(line, "prices", "A price break needs a whole quantity.")
                continue
            cells[header] = str(tier.get("unit_price"))
            price_columns.append((int(header[len("price_"):]), header))
        try:
            row = _parse_row(cells, price_columns, default_currency.upper())
        except _Row as bad:
            for column, message in bad.problems:
                fail(line, column, message)
            continue
        key = row.sku.lower()
        if key in first_of:
            fail(line, "sku", f"Duplicate sku, first seen in row {first_of[key]}.")
            continue
        first_of[key] = line
        rows.append(row)
    return ParsedCsv(tuple(rows) if not total_errors else (), tuple(errors), total_errors)
