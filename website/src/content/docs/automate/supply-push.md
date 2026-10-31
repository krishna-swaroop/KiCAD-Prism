---
title: Push offers and stock
description: Send distributor offers and local stock levels to Supply from a script, an ERP export or a scraper, with a token that can push to one target only.
sidebar:
  order: 9
---

Send offers to a CSV, LCSC or JLCPCB connector, or your whole stock to a push
inventory source, from anything that can make an HTTPS request. Prism stores
them as it stores what it reads itself.

## Get a push token

A push token can push to one connector or one inventory source, and nothing
else. It reads nothing.

1. In **Supply → Sources**, open the menu of a CSV, LCSC or JLCPCB
   connector, or of a push inventory source, and choose **Push token**.
2. Choose **Create token** and copy it. It starts with `prism_push_` and is
   shown only once.

**Replace token** makes a new one and stops the old one at once; **Revoke**
stops it. An administrator's own token or session can push too.

:::caution
Store the token like a password. Anyone holding it can change the offers or
stock of that connector or source.
:::

## Push offers

`POST /api/v1/supply/connectors/{id}/offers` takes the columns of the offers
file, with prices as a list:

```bash
curl -X POST "https://prism.example.com/api/v1/supply/connectors/$CONNECTOR/offers" -H "Authorization: Bearer $PRISM_PUSH_TOKEN" -H "Content-Type: application/json" -d '{"offers": [{"sku": "C12345", "mpn": "LM358DR", "manufacturer": "Texas Instruments", "stock": 1200, "currency": "EUR", "prices": [{"quantity": 1, "unit_price": "0.21"}, {"quantity": 100, "unit_price": "0.12"}]}]}'
```

- `sku`, `mpn`, `manufacturer` and `stock` are required. The others are
  those of the [offers file](/KiCAD-Prism/admin/supply/#upload-offers-from-a-file):
  `currency` (the connector's when left out), `moq`, `order_multiple`,
  `packaging`, `lead_time_days`, `lifecycle`, `discontinued`, `rohs`,
  `product_url`, `incoming_qty`, `incoming_date`, `jlc_library` and
  `jlc_preferred`.
- Without `"replace": true`, the offers replace those with the same `sku` and
  the connector keeps the rest. With it, they are all the connector's offers,
  as an uploaded file is.
- If any offer is wrong, nothing is taken: the answer lists each problem by
  `row` (from 1) and `field`.
- The answer says how many offers were `received`, how many the connector now
  `kept`, and how many listings Prism already had for them were `recorded` at
  once. A part Prism has not matched at this connector yet is matched on the
  next search, as an upload's are.

Uploading a CSV file is the same push with `"replace": true`.

## Push stock

Add a push inventory source first (see
[Connect your inventory](/KiCAD-Prism/admin/supply/#connect-your-inventory)).
`POST /api/v1/supply/inventory-sources/{id}/levels` takes your whole stock, one
row per stock record, and replaces what the source pushed before:

```bash
curl -X POST "https://prism.example.com/api/v1/supply/inventory-sources/$SOURCE/levels" -H "Authorization: Bearer $PRISM_PUSH_TOKEN" -H "Content-Type: application/json" -d '{"items": [{"part": "P-1001", "mpn": "LM358DR", "manufacturer": "Texas Instruments", "location": "Main/A/01", "quantity": 250}]}'
```

| Field | Means |
| --- | --- |
| `part` | your own id for the part (required); rows with the same id are one part |
| `quantity` | how many (required) |
| `ipn`, `mpn` and `manufacturer`, `sku` and `supplier` | the numbers Prism matches the part on |
| `name`, `units` | shown with unmatched stock |
| `location` | the location's path; `external: true` for stock at a vendor or contract manufacturer |
| `allocated` | how many are set aside for work orders |
| `status` | blank or `ok` for usable stock; any other word, such as `on hold`, counts as held |
| `batch`, `updated` | kept with the record |

Parts are matched to library components as an InvenTree read's are. Parts that
match nothing wait under **Unmatched local stock** in **Library Manager →
Review**. The answer gives the number of `records`, and of parts `matched` and
`unmatched`.

## From the CLI or the SDK

With `PRISM_TOKEN` set to the push token:

```bash
prism supply push-offers "$CONNECTOR" offers.json --replace
```

```bash
prism supply push-levels "$SOURCE" stock.json
```

Each file is a JSON list of rows, or an object holding them under `offers` or
`items`. In Python, `Client().push_connector_offers(id, body={...})` and
`Client().push_inventory_levels(id, body={...})` do the same. See
[SDK and CLI](/KiCAD-Prism/automate/sdk-and-cli/).
