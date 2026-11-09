---
title: Add a distributor
description: Write a Supply adapter for a new distributor, check it with the contract kit against recorded answers, and register it.
sidebar:
  order: 7
---

A distributor in Supply is one adapter module and one `register` line. The
adapter turns the distributor's answers into Prism's offers; Prism does the
scheduling, the call budget, storage and everything the user sees. This page
takes you from a copy of the template to a tested adapter in one pull request.

Prism does not load distributors from outside the repository: a new one is a
pull request like any other change.

## What an adapter is

Read these files first, in `backend/app/services/supply/`:

| File | What it gives you |
| --- | --- |
| `providers/base.py` | The contract: `ProviderSpec`, the `SupplyProvider` methods, the optional capabilities, and the errors to raise |
| `models.py` | What an adapter returns: `PartMatch`, `Offer`, `PriceBreak`, `PartData` |
| `providers/http.py` | `HttpProvider`, the base every web adapter builds on: the HTTP client, pacing, the call meter and OAuth client-credentials tokens |
| `http_client.py` | `SafeHttpClient`, the only way an adapter reaches the network, and how it turns HTTP statuses into the contract's errors |
| `providers/normalise.py` | Price breaks, RoHS wording, packaging words and links, read the same way for every distributor |
| `providers/template.py` | A complete adapter for a made-up API, to copy |

An adapter has three methods:

- `lookup_mpn(mpn, manufacturer)` finds the distributor's listings for a
  manufacturer part number. The manufacturer is a hint for ranking; never use
  it to drop results.
- `get_offers(skus)` reads stock, order terms and prices for listings it found
  before. A number the distributor no longer knows is left out, not raised.
- `get_part_data(match)` reads the description, datasheet and attributes of
  one listing.

It may also have `lookup_mpns` (several numbers in one call), `lookup_family`,
`check_connection`, `change_notices`, `substances` or `substitutes`. Prism
checks for each with `isinstance`, so an adapter only has the ones it serves.

An adapter never writes to the database, never logs credentials and never
catches the errors the HTTP client raises: Prism decides what a refusal, a
rate limit or an outage means for the connector. The one exception is
`NotFound` (HTTP 404) where a missing record is an answer, as in the
template's `get_part_data`. Raise `ProviderError` for an answer you cannot
read: any other exception is recorded on the connector as `internal_error`
and rests it like a failed call.

## Write the adapter

1. Copy the template to a module named after the distributor.

   ```bash
   cp backend/app/services/supply/providers/template.py backend/app/services/supply/providers/acme.py
   ```

2. Set `KEY` (2 to 32 lower-case letters, digits or underscores, starting
   with a letter; stored with every listing, never changed once released),
   the label, the URLs, and `HOSTS`: every host the adapter calls, as bare
   lower-case names. The HTTP client reaches no other host, so a missing one
   fails on the first call. It also calls only `https://` on port 443, checks
   that every address the name resolves to is public, and checks each
   redirect again.
3. Set `PACE_SECONDS` under the distributor's per-minute limit, and
   `default_daily_budget` to its daily limit.
4. Map the answers. Use `normalise` for prices, RoHS, packaging and links, and
   `unrecognised.note` for a status or word you have not seen, so it is logged
   once instead of guessed. Prism keeps and shows only `https://` product
   links, so a plain `http://` one is dropped.
5. Fill in the spec honestly. The contract kit checks it against the adapter:
   - `search_batch` above 1 needs `lookup_mpns`, and the other way round.
   - `max_batch` and `calls_per_offers_batch` say what reading offers costs.
     Reading `max_batch` listings must not take more calls than
     `calls_per_offers_batch`.
   - Each of `CAP_PCN`, `CAP_SUBSTANCES` and `CAP_SUBSTITUTES` needs its
     method (`change_notices`, `substances`, `substitutes`), and each method
     needs its capability.
   - `search_reads_offers` is `True` when a search answer carries stock and
     prices; every match then carries its offer.
   - `groups_by_part` is `True` when one answer covers every listing of a part
     (DigiKey lists all its packagings in one product), so Prism asks once per
     part.
   - `limits_storage` is `True` when the distributor's API terms forbid keeping
     its data as a database of your own.
   - `guesses_packaging` is `False` when the distributor's packaging words are
     complete, so a listing it says nothing about stays unknown instead of
     being guessed from its number and order terms.
   - `standard_packaging` is `True` when the packaging it states is the
     product's standard reel, and what is sold is read from the price breaks.
6. In `providers/registry.py`, add `acme` to the providers import and a
   `register(acme.SPEC)` line.

## Record answers

The contract kit replays what the distributor really answered. Record them
with a connector that has working credentials, in your development setup:

1. Add a connector for the distributor in **Supply → Sources**
   and choose **Test connection**.
2. From `backend`, record a part the distributor sells in several packagings.
   The script uses the first enabled connector for the provider. Add
   `--details` to record change notices or substances too.

   ```bash
   python scripts/record_supply_answer.py --provider acme --mpn LM358DR
   ```

3. Read the file it writes in `backend/tests/fixtures/supply/`. Token answers
   are replaced, headers are not kept, only a short list of search parameters
   is kept from query strings, and the script refuses to write a file that
   contains a credential. Check for anything else that is not for the public:
   an account number, a customer price or a name.

When you cannot get credentials yet, write the answers by hand from the
distributor's documentation in the same format, and say so in the test's
docstring so they are replaced later.

## Run the contract kit

Add a class to `backend/tests/test_supply_provider_contract.py`:

```python
class AcmeContract(ContractChecks, unittest.TestCase):
    spec = acme.SPEC
    build = staticmethod(acme.AcmeProvider)
    recordings = ("acme_live_lm358dr.json",)
```

and add it to `CONTRACTS` in the same file: a test fails when a registered
web adapter has no class there. The kit builds the adapter with a test client
and clocks as keyword arguments, so its constructor passes them on to
`HttpProvider`, as the template does. The kit runs your adapter under
Prism's real HTTP client with the network replaced by the recording, and
checks:

- **The spec** against the methods the adapter has, and that it names its
  hosts and counts its calls.
- **Shapes:** every match, offer and part data is Prism's type, for this
  provider, for a number that was asked for, with absolute links.
- **Paging:** every recorded answer is used, so a page the adapter should have
  asked for is not skipped.
- **The call count:** the adapter's meter matches the requests that went out,
  token requests included, and reading offers stays within what the spec says
  it costs.
- **Errors:** a refusal is an `AuthError`, HTTP 429 a `RateLimited` with its
  wait, an outage `Unavailable`, a web page in place of data `Blocked`, and an
  answer that is not JSON a `ProviderError`. A failed request is still
  counted.
- **Hosts:** the adapter reaches no host outside `HOSTS`.
- **Unknown words:** the recording logs nothing as unrecognised.

Run it from `backend`:

```bash
uv run --no-project --python venv/bin/python --with-requirements ../requirements/test.txt python -m pytest tests/test_supply_provider_contract.py
```

Add adapter tests of your own next to it for what the kit cannot know: how the
distributor's lifecycle words read, how its prices are taxed, how a storefront
changes the currency.

## If you need a table

An adapter needs no table: Prism stores what it returns. When your change
does need a new supply table or column, add a new step to the catalog ledger
in `backend/app/services/catalog_schema_migrations.py` and run it in the
test-schema setup in `backend/app/services/supply/store.py`. Never change
what the released `supply_tables` and `supply_catalog_links` steps create:
their output is frozen in `backend/app/services/supply/schema/frozen.json`,
and `backend/tests/test_supply_frozen_schema.py` fails when it changes. Name
tables and functions `supply_…`, indexes `idx_supply_…` or `uq_supply_…`, and
triggers `trg_supply_…`; `backend/tests/test_supply_schema_names.py` checks.

## Document it

Add the distributor's credentials and limits to the connector section of
[Supply administration](/KiCAD-Prism/admin/supply/). Open the pull request with the
recording, the adapter, its `register` line and its tests.
