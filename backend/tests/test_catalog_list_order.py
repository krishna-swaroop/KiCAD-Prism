"""Paginated catalog lists end ORDER BY with immutable component identity."""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.component_queries import (  # noqa: E402
    COMPONENT_LIST_TIEBREAKER,
    CatalogComponentQueries,
)
from app.services.catalog.remote_heads import (  # noqa: E402
    REMOTE_HEAD_TIEBREAKER,
    CatalogRemoteHeads,
)


class _RecordingConn:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def execute(self, sql: str, _params: object = ()) -> "_RecordingConn":
        self.statements.append(sql)
        return self

    def fetchone(self) -> dict[str, object]:
        return {"total": 0, "value": "1"}

    def fetchall(self) -> list[object]:
        return []


def _list_select_sql(statements: list[str]) -> str:
    for sql in statements:
        if "LIMIT" in sql and "OFFSET" in sql:
            return " ".join(sql.split())
    raise AssertionError(f"no paged SELECT in {statements!r}")


class CatalogListOrderPlanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.queries = CatalogComponentQueries(component_read_models=object())  # type: ignore[arg-type]

    def test_every_admin_order_branch_ends_with_component_id(self) -> None:
        cases = (
            self.queries.prepare_list_components(),
            self.queries.prepare_list_components(sort_by="name", sort_dir="asc"),
            self.queries.prepare_list_components(sort_by="name", sort_dir="desc"),
            self.queries.prepare_list_components(sort_by="availability_state"),
            self.queries.prepare_list_components(query="PG-R"),
            self.queries.prepare_list_components(query="PG-R", sort_by="manufacturer"),
        )
        for plan in cases:
            with self.subTest(order_sql=plan.order_sql):
                self.assertTrue(
                    plan.order_sql.endswith(f", {COMPONENT_LIST_TIEBREAKER}"),
                    plan.order_sql,
                )
                self.assertIn("ORDER BY", plan.order_sql)

    def test_search_ranking_keeps_prefix_order_before_the_tiebreaker(self) -> None:
        plan = self.queries.prepare_list_components(query="PG-R")
        self.assertIn("WHEN LOWER(cr.mpn) = LOWER(%s) THEN 0", plan.order_sql)
        self.assertIn("WHEN LOWER(cr.mpn) LIKE LOWER(%s) THEN 1", plan.order_sql)
        self.assertIn("WHEN LOWER(cr.name) LIKE LOWER(%s) THEN 2", plan.order_sql)
        self.assertTrue(plan.order_sql.endswith(f", {COMPONENT_LIST_TIEBREAKER}"))


class RemoteHeadOrderTests(unittest.TestCase):
    def test_default_and_search_orders_end_with_component_id(self) -> None:
        default_conn = _RecordingConn()
        CatalogRemoteHeads.list_heads(default_conn)
        self.assertIn(
            f"ORDER BY updated_at DESC, {REMOTE_HEAD_TIEBREAKER}",
            _list_select_sql(default_conn.statements),
        )

        search_conn = _RecordingConn()
        CatalogRemoteHeads.list_heads(search_conn, query="PG-R")
        search_sql = _list_select_sql(search_conn.statements)
        self.assertIn("WHEN LOWER(mpn) = LOWER(%s) THEN 0", search_sql)
        self.assertIn(f"ELSE 3 END, updated_at DESC, {REMOTE_HEAD_TIEBREAKER}", search_sql)

    def test_category_listing_orders_by_category_name(self) -> None:
        conn = _RecordingConn()
        CatalogRemoteHeads.list_categories(conn)
        grouped = next(sql for sql in conn.statements if "GROUP BY" in sql)
        self.assertIn("ORDER BY category", grouped)


if __name__ == "__main__":
    unittest.main()
