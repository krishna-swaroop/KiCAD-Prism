# Distributor API Research: DigiKey, Mouser, LCSC, JLCPCB

Date: 2026-08-22

Scope: primary-source investigation of direct distributor integrations for per-part
tiered pricing, stock, lifecycle status, datasheet URLs and supplier-PN mapping.
Target: ~20k MPN initial hydration plus refresh cadence, write-our-own adapters,
no intermediary services. Every claim links to the document that owns it; anything
that could not be confirmed from a primary source is marked **unverified**.

## A. DigiKey (developer.digikey.com)

### A1. Product Information V4 endpoints and where price breaks live

The Product Information V4 product contains two APIs: `ProductSearch` and
`ProductChangeNotifications` ([products](https://developer.digikey.com/products/product-information-v4)).
ProductSearch exposes these operations
([ProductSearch](https://developer.digikey.com/products/product-information-v4/productsearch)):

| Operation | Method | Path (base `/products/v4`) |
| --- | --- | --- |
| KeywordSearch | POST | `/search/keyword` |
| ProductPricing | GET | `/search/{productNumber}/pricing` |
| ProductDetails | GET | `/search/{productNumber}/productdetails` |
| PricingOptionsByQuantity | GET | `/search/{productNumber}/pricingbyquantity/{requestedQuantity}` |
| Manufacturers / Categories / CategoriesById / Media / AlternatePackaging / DigiReelPricing / RecommendedProducts / Substitutions / Associations / PackageTypeByQuantity (deprecated) | GET | see [ProductSearch page](https://developer.digikey.com/products/product-information-v4/productsearch) |

Paths verified against the official swagger ("Download Swagger File" linked from
the KeywordSearch page): host `api.digikey.com`, basePath `/products/v4`
([OAS download](https://developer.digikey.com/node/2357/oas-download),
[KeywordSearch page](https://developer.digikey.com/products/product-information-v4/productsearch/keywordsearch)).

**Tiered price breaks live at** `KeywordResponse.Products[].ProductVariations[].StandardPricing[]`,
each entry `{BreakQuantity: int32, UnitPrice: double, TotalPrice: double}`, with a parallel
`MyPricing[]` array of the same `PriceBreak` schema on each variation. The same
`ProductVariations[].StandardPricing[]` shape is used by ProductPricing responses
([OAS](https://developer.digikey.com/node/2357/oas-download), definitions `Product`,
`ProductVariation`, `PriceBreak`). Note this corrects two common assumptions:

- There is **no** `PriceBreaks` array and no flat `StandardPricing` on the product;
  breaks are nested one level deeper, under each package-type variation.
- V3's `StandardPricing` lived directly on the product; V4 moved it into
  `ProductVariations` in the 4.0.0/4.0.1 changes
  ([changelog](https://developer.digikey.com/changelog)).

Caveat: in KeywordSearch, `MyPricing` is returned but never populated — only
`StandardPricing`; use ProductDetails or ProductPricing for MyPricing
([changelog 4.0.3](https://developer.digikey.com/changelog)). Results are rolled up by MPN
since 4.0.0, so one product carries all package-type variations.

### A2. Field paths for stock, lifecycle, datasheet, packaging

All from the official OAS (`Product`, `ProductVariation`, `ProductStatusV4` definitions)
([OAS](https://developer.digikey.com/node/2357/oas-download)):

| Data | Field path |
| --- | --- |
| Total stock | `Products[].QuantityAvailable` (int64) |
| Stock per package type | `Products[].ProductVariations[].QuantityAvailableforPackageType` (renamed from `QuantityAvailable` in 4.0.1, [changelog](https://developer.digikey.com/changelog)) |
| Lifecycle/status object | `Products[].ProductStatus{Id, Status}` |
| Discontinued / EOL flags | `Products[].Discontinued`, `Products[].EndOfLife`, plus `DateLastBuyChance`; ProductPricing additionally has `IsDiscontinued`, `IsObsolete`, `IsEndOfLife`, `NormallyStocking`, `BackOrderNotAllowed`/`IsBoNotAllowed`, `Ncnr`/`IsNcnr` |
| Datasheet URL | `Products[].DatasheetUrl` (renamed from `PrimaryDatasheet` in 4.0.0, [changelog](https://developer.digikey.com/changelog)) |
| Supplier PN mapping | `Products[].ManufacturerProductNumber` + `Products[].ProductVariations[].DigiKeyProductNumber`; base number in `BaseProductNumber.Name` |
| Package variants | `ProductVariations[]`: `PackageType{Id,Name}`, `MinimumOrderQuantity`, `StandardPackage`, `MaxQuantityForDistribution`, `DigiReelFee`, `MarketPlace`, `TariffActive` |
| Price currency | Not a response field; currency follows the `X-DIGIKEY-Locale-Currency` request header and is echoed back in `SettingsUsed.SearchLocaleUsed.Currency` ([OAS](https://developer.digikey.com/node/2357/oas-download), [headers doc](https://developer.digikey.com/documentation)) |

### A3. OAuth2 two-legged flow

Documented verbatim in the developer portal docs
([documentation](https://developer.digikey.com/documentation)):

- Token endpoint: `POST https://api.digikey.com/v1/oauth2/token`,
  `application/x-www-form-urlencoded` with `client_id`, `client_secret`,
  `grant_type=client_credentials`.
- Response: `access_token`, `expires_in` (example shows 599 s), `token_type`;
  access token lifetime is **10 minutes**.
- Per-request headers: `Authorization: Bearer <token>`, `X-DIGIKEY-Client-Id`,
  `X-DIGIKEY-Locale-Site` (e.g. `US`), `X-DIGIKEY-Locale-Language` (`en`),
  `X-DIGIKEY-Locale-Currency` (`USD`); older examples add `X-DIGIKEY-Customer-Id: 0`.
- Header migration (2025-11-24 changelog): `X-DIGIKEY-Customer-Id` is being sunset;
  ProductDetails/ProductPricing/PricingByQuantity move to `X-DIGIKEY-Account-ID`,
  while KeywordSearch/Substitutions/Associations/Media/AlternatePackaging drop it
  entirely ([changelog](https://developer.digikey.com/changelog)).

### A4. Rate limits

From the official rate-limit table for standard products
([documentation](https://developer.digikey.com/documentation)):
**Product Information: 120 requests/minute burst, 1,000 requests/day**, applied at
product level per application. Quota headers on every response:
`X-RateLimit-Limit`, `X-RateLimit-Remaining`; when limits are hit, HTTP 429 with
either `X-BurstLimit-{Limit,Remaining,Reset,ResetTime}` or
`X-RateLimit-{Limit,Remaining,Reset,ResetTime}` plus `Retry-After`
([documentation](https://developer.digikey.com/documentation),
[FAQ](https://developer.digikey.com/faq)).

### A5. Batch Product Details

- The BatchProductDetailsAPI is a separate, login-gated product page at
  [developer.digikey.com/products/batch-productdetails/batchproductdetailsapi](https://developer.digikey.com/products/batch-productdetails/batchproductdetailsapi);
  it redirects anonymous visitors to `/user/login`, so its quota accounting could
  not be read without an account (**unverified**: whether batch calls draw from the
  same 1,000/day pool).
- Request shape `{ "Products": ["MPN1", ...] }` (list of strings) per the generated
  client for the official v3 spec
  ([batch_product_details_request.py](https://raw.githubusercontent.com/peeter123/digikey-api/master/digikey/v3/batchproductdetails/models/batch_product_details_request.py));
  the community client's README states usage "upto 50" part numbers per call and that
  the endpoint must be explicitly enabled for your account
  ([digikey-api README](https://github.com/peeter123/digikey-api/blob/master/README.md))
  (**community-sourced numbers; enablement requirement not confirmable from open docs**).

### A6. Sandbox and locale control

Sandbox host is `sandbox-api.digikey.com`, same flow as production; sandbox apps are
per-developer and return structurally valid but non-production data
([documentation](https://developer.digikey.com/documentation)); also encoded as
`x-host-sandbox` in the official swagger
([OAS](https://developer.digikey.com/node/2357/oas-download)). Site/language/currency are
purely header-driven (A2/A3). Postman collections for production and sandbox are
published by DigiKey ([Postman-Collection](https://github.com/Digi-Key/Postman-Collection)).

Terms: the [API User Agreement](https://developer.digikey.com/api-user-agreement)
explicitly permits internal applications that automate purchasing; no caching ban was
found in the agreement text reviewed.

## B. Mouser

### B1. Search endpoints (official Swagger JSON)

Fetched live from [api.mouser.com/api/docs/V1](https://api.mouser.com/api/docs/V1)
and [V2](https://api.mouser.com/api/docs/V2) ("Mouser APIs V1"/"V2"):

| Endpoint | Notes |
| --- | --- |
| POST `/api/v{version}/search/keyword` | keyword search, "return a maximum of 50 parts" (swagger summary); body has `keyword`, `records`, `startingRecord`, `searchOptions` (`None/Rohs/InStock/RohsAndInStock`) |
| POST `/api/v{version}/search/partnumber` | **accepts multiple part numbers pipe-delimited: "maximum input of 10 part numbers", each 3–40 chars**, e.g. `494-JANTX2N2222A|610-2N2222-TL`; `partSearchOptions: None\|Exact` (swagger description of `mouserPartNumber`). Numbers are *Mouser* part numbers (vendor-prefixed); exact-match option exists |
| POST `/api/v2/search/partnumberandmanufacturer` | V1 variant deprecated; adds `manufacturerName` filter |
| POST `/api/v2/search/keywordandmanufacturer` | V1 variant deprecated; adds `manufacturerName` |
| GET `/api/v2/search/manufacturerlist` | manufacturer list (V1 deprecated) |
| cart/order/orderhistory endpoints | ordering-side, not needed for catalog hydration |

There is **no** `family` or `partmfr` endpoint in the current V1/V2 specs; those names
from the legacy API do not exist anymore (absent from both fetched swagger files).

### B2. Response fields

`SearchResponseRoot.SearchResults.Parts[]` items are `MouserPart` objects
([V1 swagger](https://api.mouser.com/api/docs/V1)):

| Data | Field |
| --- | --- |
| Tiered price breaks | `PriceBreaks[] { Quantity: int, Price: string, Currency: string }` |
| Stock | `Availability` (free-text string, e.g. combines count/state), `FactoryStock`, `AvailableOnOrder[] { Quantity, Date }`, `AvailabilityInStock` |
| Lifecycle | `LifecycleStatus` (string), `IsDiscontinued` (string-typed flag), `SuggestedReplacement` |
| Datasheet | `DataSheetUrl` |
| Supplier PN mapping | `MouserPartNumber`, `ManufacturerPartNumber`, `Manufacturer`, `AlternatePackagings[].APMfrPN` |
| Misc | `Category`, `LeadTime`, `Min`, `Mult` (order multiples), `Reeling`, `ROHSStatus`, `ProductDetailUrl`, `ImagePath` |

Mouser's own api-search page lists the available data set including "Lifecycle Status",
"Suggested Replacement(s)", "Pricing Information (up to 4 price breaks)" and confirms
50 results per call ([api-search page](http://web.archive.org/web/20260709194124/https://www.mouser.com/api-search/),
July 2026 archived copy of www.mouser.com/api-search — live page bot-blocks scripts).
Parsing gotcha: `Availability` is prose ("In Stock", counts embedded), not a code;
numeric stock needs string parsing, with `AvailableOnOrder` for incoming quantities.
Exact enumeration values are not documented in the swagger (**unverified** beyond the
field's existence).

### B3. Auth mechanics

Simple key auth: every search endpoint takes `apiKey` as a **query parameter**
([V1 swagger parameters](https://api.mouser.com/api/docs/V1)). Sign-up: log in to a My
Mouser account, complete the online Search API Request Form, key arrives by email
([api-search page](http://web.archive.org/web/20260709194124/https://www.mouser.com/api-search/);
form at [MyMouser/MouserSearchApplication.aspx](https://www.mouser.com/MyMouser/MouserSearchApplication.aspx)).
No paid tiers are mentioned on the page (**unverified** whether higher quotas can be
negotiated).

### B4. Rate limits

From Mouser's api-search page: **up to 30 calls per minute, up to 1,000 calls per day,
up to 50 results per call**
([archived api-search](http://web.archive.org/web/20260709194124/https://www.mouser.com/api-search/)).

### B5. Terms: caching/attribution

The [Search API Terms of Service](https://www.mouser.com/apiterms) (last modified
2013-03-11; live page bot-blocks automated fetches, content verified via
[archived copy](http://web.archive.org/web/2026/https://www.mouser.com/apiterms/)) says:

- You will **not "cache, record, pre-fetch, or otherwise store any portion of the
  Mouser Electronics Content", nor run bulk downloads**.
- Use that "aggregates … any Mouser Electronics Content with third party content
  (without distinction)" or "fails to attribute the Mouser Electronics Data
  appropriately" is expressly not permitted; permitted purpose is presenting data to
  end users in ways that complement Mouser's own services, at Mouser's sole discretion.
- Section 5 grants a limited license conditioned on attribution.

This is in direct tension with Prism's hydrate-and-cache model — a local 20k-part price/
stock database is arguably "storing Content" and "aggregation". Flag before building on
Mouser; real-time lookup-only integration fits the terms better than a cached catalog.

## C. LCSC and JLCPCB

### C1. Official position

LCSC officially operates a signed "agent" API documented via Redocly at
[lcsc.com/docs/openapi/index.html](https://www.lcsc.com/docs/openapi/index.html):

- Base: `https://ips.lcsc.com/rest/wmsc2agent/...`. Endpoints: `GET /category`,
  `GET /brand`, `GET /category/product/{category_id}`, `GET /product/info/{product_number}`
  (Item Details), `GET /search/product` (Keyword Search List, max 30 parts/page,
  matches LCSC SKU/MPN/category/manufacturer with `match_type=exact|fuzzy`),
  order create/check and shipment APIs.
- Auth: query params `key` (API key), `nonce` (16-char random string), `signature`,
  `timestamp` — i.e., request signing, not OAuth. Currency parameter accepts USD/CNY/EUR/HKD.
- The Redocly page documents query parameters only, with no response schemas
  (**response shapes undocumented publicly**).

Who can get keys: the FAQ says you need an LCSC account and then apply via the
[agent page form](https://www.lcsc.com/agent) for evaluation
([get-lcsc-apis](https://www.lcsc.com/help-center/api/get-lcsc-apis)); the agent page
lists the full API portfolio including KeywordSearch, Categories, CategoricalItem List,
cart/order APIs, and describes the apply → evaluate → document workflow. Catalog-wide
data access is included in principle (Category/Categorical Item List APIs), but issuance
is application-based, not self-service.

Official rate limits: **"limited to 1000 searches per day and 200 searches per minute";
higher volumes "must be approved by LCSC"** via support@lcsc.com
([api-access-frequency FAQ](https://www.lcsc.com/help-center/api/api-access-frequency),
quoted on the [agent page](https://www.lcsc.com/agent)).

JLCPCB (sister company) runs the official
[JLCPCB API Platform](https://api.jlcpcb.com/) whose Components API provides "access to
millions of components in our library … real-time pricing, inventory data, and component
specifications"; onboarding is sign-up on the portal then apply for free API access
([api.jlcpcb.com](https://api.jlcpcb.com/)). The working endpoints used by adapters are
`POST https://open.jlcpcb.com/overseas/openapi/component/getComponentLibraryList`
(full-library pagination, stub rows incl. `componentCode`, `componentModel` = MPN,
`stockCount`, `priceRanges[{startQuantity,endQuantity,unitPrice}]`, `datasheetUrl`)
and `GET /overseas/openapi/component/getComponentDetailByCode`, authenticated with an
HMAC-SHA256-signed `Authorization: JOP appid=…,accesskey=…,nonce=…,timestamp=…,signature=…`
header over `"{METHOD}\n{path}\n{timestamp}\n{nonce}\n{body}\n"`
([jlcparts/jlcpcb.py](https://raw.githubusercontent.com/yaqwsx/jlcparts/master/jlcparts/jlcpcb.py),
[Eyalm321/jlcpcb-mcp src/official-client.ts](https://github.com/Eyalm321/jlcpcb-mcp)).
One adapter reports detail calls accept batches of up to 1000 codes per call and that
the API has no delta/"modified-since" filter
([mageoch/LCSC-MCP-Server README](https://github.com/mageoch/LCSC-MCP-Server))
(**adapter-sourced; not in public docs**). Approval reportedly depends on account/order
history ([jlcpcb-mcp README](https://github.com/Eyalm321/jlcpcb-mcp)) (**community-reported, unverified**).

### C2. Unofficial routes (open-source evidence)

**yaqwsx/jlcparts** maintains a full-catalog SQLite snapshot of the JLC/LCSC SMT library:

- Its build workflow runs 3× daily, authenticates with `LCSC_KEY`/`LCSC_SECRET`
  (official LCSC agent credentials) and `JLCPCB_APP_ID`/`ACCESS_KEY`/`SECRET_KEY`
  (official JLC OpenAPI credentials), fetches incrementally with rate caps
  (`--max-seconds 2400 --age --limit 1000`), and publishes `cache.zip` (split zips) to
  GitHub Pages data directory
  ([update_components.yaml](https://raw.githubusercontent.com/yaqwsx/jlcparts/master/.github/workflows/update_components.yaml)).
- Its LCSC layer signs sorted params with SHA1: `key`, 16-char lowercase `nonce`,
  `secret`, unix `timestamp` → `signature = sha1(urlencode(...))`, hitting e.g.
  `https://ips.lcsc.com/rest/wmsc2agent/product/info/C7063`; it also pulls JLCPCB's
  preferred-parts via keyless website API
  [jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList]
  using an XSRF token from cookies
  ([jlcparts/lcsc.py](https://raw.githubusercontent.com/yaqwsx/jlcparts/master/jlcparts/lcsc.py)).
- Downstream tools consume the published SQLite dump (e.g. jlcpcb-search-mcp cites
  "450,000+ components" from yaqwsx/jlcparts snapshots
  ([peterb154/jlcpcb-search-mcp](https://github.com/peterb154/jlcpcb-search-mcp))) —
  i.e., the practical keyless path to LCSC-linked catalog breadth today is jlcparts'
  published artifact, not a scrape you operate.

**wmsc.lcsc.com internal JSON API** (browser frontend endpoints; no key). Two independent
implementations agree on the shapes:

- wavenumber-eng/supply-chain-monkey (`src/py/scm/server/providers/lcsc_api.py`):
  `POST https://wmsc.lcsc.com/ftps/wm/search/v2/global` with JSON `{keyword, currentPage, pageSize}`;
  `GET /ftps/wm/product/detail?productCode=Cxxxx`; required browser-ish headers:
  desktop Chrome `User-Agent`, `Accept: application/json,...`, `Referer: https://www.lcsc.com/`,
  `Origin: https://www.lcsc.com`. Response envelope `{code:200, msg, result}`;
  search results at `result.productSearchResultVO.productList[]`; field mapping:
  `productCode`, `productModel` (MPN), `brandNameEn`, `productIntroEn`,
  `pdfUrl` (datasheet), `encapStandard` (package), `productArrange` (packaging),
  `productCycle` (`normal` = active), stock via `domesticStockVO.total` /
  `overseasStockVO.total` fallback `stockNumber`, price ladder
  `productPriceList[]{ladder, usdPrice | productPrice}`
  ([source](https://raw.githubusercontent.com/wavenumber-eng/supply-chain-monkey/main/src/py/scm/server/providers/lcsc_api.py)).
- Eyalm321/jlcpcb-mcp (`src/live-client.ts`): same detail endpoint
  `GET https://wmsc.lcsc.com/ftps/wm/product/detail?productCode=…` with browser UA +
  `Referer: https://jlcpcb.com/`, envelope `{code:200,result}`, fields `stockNumber`,
  `productPriceList[]{ladder, usdPrice, currencyPrice}`, `pdfUrl`, `paramVOList`
  ([source](https://raw.githubusercontent.com/Eyalm321/jlcpcb-mcp/main/src/live-client.ts)).
- 30350n/inventree-part-import (`supplier_lcsc.py`): documents that the **v2 search was
  removed by LCSC** and replaced by `POST /ftps/wm/search/v3/global`, which requires
  encrypting the keyword with an SM2 public key scraped from the lcsc.com homepage
  (`encryptPublicHexKey:"…"`, payload `{"keyword": "{secret}04<sm2-hex>"}`);
  the plain `GET /ftps/wm/product/detail?productCode=…` still works
  ([source](https://raw.githubusercontent.com/30350n/inventree-part-import/master/inventree_part_import/suppliers/supplier_lcsc.py));
  see also the breaking-change report
  [inventree-part-import#105](https://github.com/30350n/inventree-part-import/issues/105).
- lcsc-toolkit independently documents v3-global semantics: `result.scene` =
  `FULL_MATCH` → `result.exactMatchResult[0]`, else `REDIRECT_PRODUCT_DETAIL` with
  `result.tipProductDetailUrlVO.productCode`; `productPriceList{ladder, discountPrice}`
  ([PyPI lcsc-toolkit](https://pypi.org/project/lcsc-toolkit/)).
- Older tooling used yet another path, `https://wmsc.lcsc.com/wmsc/search/global`
  ([Part-DB issue #552](https://github.com/Part-DB/Part-DB-server/issues/552)) — more
  evidence of endpoint churn. jlcparts' own historical notes describe the even older
  lcsc.com/api pages requiring CSRF tokens+cookies
  ([jlcparts/LCSC-API.md](https://raw.githubusercontent.com/yaqwsx/jlcparts/master/LCSC-API.md)).

A free community intermediary also exists (jlcsearch.tscircuit.com, backed by jlcparts
snapshots), but it is exactly the kind of third-party dependency Prism wants to avoid.

### C3. Risk assessment (unofficial routes)

- Demonstrated churn: v1→v2→v3 global-search path changes, v2 removal breaking
  consumers, and SM2 encryption added to search within ~a year
  ([inventree-part-import#105](https://github.com/30350n/inventree-part-import/issues/105),
  [Part-DB#552](https://github.com/Part-DB/Part-DB-server/issues/552)).
- Browser spoofing (UA/Referer/Origin) is load-bearing today; any bot-wall tightening
  breaks adapters silently. No SLA, no quota contract, block behavior undocumented.
- ToS exposure: LCSC's site terms govern scraping like any consumer site; the official
  agent API is the sanctioned route. Using unofficial endpoints for a sustained 20k-part
  hydration is exactly the pattern that historically triggers breakage/blocking.
  (**No public LCSC enforcement actions found; unverified.**)
- Mitigation observed in the wild: jlcparts survives because it holds official keys and
  distributes a static snapshot; Prism should prefer official keys, with the jlcparts
  SQLite dump as a bootstrapping seed rather than a live dependency.

## D. Synthesis

### Comparison

| | DigiKey PI V4 | Mouser Search | LCSC official (agent) | LCSC unofficial (wmsc) | JLCPCB official |
| --- | --- | --- | --- | --- | --- |
| Auth | OAuth2 client-credentials, 10-min tokens, client-id header | Static API key as query param | key+nonce+timestamp, SHA1-signed sorted params | none (browser headers) | HMAC-SHA256 `JOP` header (appid/accesskey/secret) |
| Documented quota | 120/min, 1000/day | 30/min, 1000/day | 1000/day, 200/min (more by approval) | none documented | not published (**unverified**) |
| Batching | BatchProductDetails API: 50 MPNs/call, separate gated product | partnumber search: 10 PNs/call pipe-delimited | none for details; category lists enumerate catalog | none | getComponentLibraryList full-catalog paging; detail batches ≤1000 codes/call (adapter-reported) |
| Price-ladder fidelity | Full ladder per package type (`ProductVariations[].StandardPricing[]`), currency via header | Up to 4 breaks, qty/int, price+currency strings | ladder in Item Details (shape undocumented publicly) | `productPriceList[{ladder,usdPrice}]` | `priceRanges[{startQuantity,endQuantity,unitPrice}]` |
| Lifecycle status | `ProductStatus{Id,Status}` + `Discontinued`/`EndOfLife` booleans | `LifecycleStatus` string + `IsDiscontinued` + suggested replacement | not publicly documented | `productCycle` (`normal`=active) | not documented publicly; library type basic/extended instead |
| Datasheet URLs | `DatasheetUrl` per product | `DataSheetUrl` per part | Item Details (undocumented shape) | `pdfUrl` | `datasheetUrl`/`dataManualUrl` |
| Stability / ToS risk | Low risk; internal-app use permitted | Simple API, but ToS bans caching/storage/aggregation — high friction for our model | Official but approval-gated; sparse docs | High fragility (v2 removed, SM2 added) | Approval-gated; stable once approved |
| Sandbox/dev-friendliness | Real sandbox host + Postman collections + downloadable OAS | None documented; instant key after form | None; docs are parameter-level only | N/A | Portal-based app creation |

### Writing three Prism adapters: effort ranking and gotchas

Ranking (least to most effort): **DigiKey ≈ Mouser < JLCPCB official < LCSC official < LCSC unofficial maintenance burden.**

1. **DigiKey** — cleanest contract: published OAS, real sandbox, standard OAuth2.
   Gotchas: price breaks nested at `ProductVariations[].StandardPricing[]` (not a flat
   `PriceBreaks`); currency comes from the locale header, not the payload; token
   refresh every 10 minutes; `X-DIGIKEY-Customer-Id` → `X-DIGIKEY-Account-ID`
   migration (Nov 2025); 1,000/day cap dominates hydration math; batch endpoint needs
   account enablement we cannot verify from outside.
2. **Mouser** — simplest auth (one query-param key) and true multi-PN batching.
   Gotchas: `Availability` is prose, numeric stock must be parsed out (with
   `AvailableOnOrder[]` for inbound); `Price`/`Currency`/`IsDiscontinued` are strings;
   max 4 price breaks; and the ToS caching prohibition conflicts with a hydrated local
   catalog — needs a written allowance or a display-only design.
3. **JLCPCB official** — signing is 15 lines (HMAC-SHA256 over method/path/ts/nonce/body);
   the blocker is approval, not code. Once approved, the library-list feed maps
   `componentModel`(MPN) → C-code once, then ≤1000-code detail batches make refreshes
   cheap. Watch: no delta feed; two stock pools (LCSC retail vs JLC assembly) differ.
4. **LCSC official** — signing trivial, but response schemas are unpublished, keys are
   evaluation-gated, and the keyword API caps at 30 results/page; expect reverse-
   engineering even on the sanctioned path.
5. **LCSC unofficial** — fastest first data (no key), but you own header spoofing,
   possible SM2 keyword encryption, and breakage-driven patches indefinitely.

### Hydration math for ~20k MPNs

| Provider | Without batching | With batching | Refresh cadence implication |
| --- | --- | --- | --- |
| DigiKey | 20,000 × ProductDetails ÷ 1,000/day = **20 days** (burst 120/min ⇒ ≥8.4 min/day of pure throttle) | Batch @50/call ⇒ 400 calls = well under one day's quota — **if enabled**; batch quota accounting unverified | Weekly refresh impossible without batch; monthly full pass feasible |
| Mouser | n/a single-PN would be 20 days | Pipe-batched partnumber search @10/call ⇒ 2,000 calls ÷ 1,000/day = **2 days** (30/min ⇒ ≥67 min/day) | Mechanically weekly-refreshable; ToS storage ban is the real constraint |
| LCSC official | Item Details per part ⇒ **20 days** @1,000/day | none for details | Monthly cadence realistic post-approval |
| LCSC unofficial | no contract; empirically fine at modest rates | none | Breakage-prone; not recommended as system of record |
| JLCPCB official | library list ≈ hundreds of stub pages, then detail @≤1000/call ⇒ **~20 detail calls** for 20k codes | native | Cheapest full-refresh story of all four, post-approval |

Bottom line: DigiKey + Batch enablement and/or JLCPCB approval are the only routes that
hydrate 20k MPNs inside a week under documented rules. Mouser fits mechanically in two
days but carries a caching-terms conflict. LCSC data is best obtained either through an
approved agent key or by seeding from jlcparts' published snapshot and refreshing the
long tail via official channels.

## Sources

DigiKey:
- https://developer.digikey.com/ (portal home)
- https://developer.digikey.com/documentation (rate limits, OAuth 2-legged/3-legged, sandbox)
- https://developer.digikey.com/faq (quota headers)
- https://developer.digikey.com/products (API products)
- https://developer.digikey.com/products/product-information-v4
- https://developer.digikey.com/products/product-information-v4/productsearch
- https://developer.digikey.com/products/product-information-v4/productsearch/keywordsearch
- https://developer.digikey.com/node/2357/oas-download (ProductSearch Api v4 swagger)
- https://developer.digikey.com/changelog (model renames, MyPricing note, Account-ID sunset)
- https://developer.digikey.com/api-user-agreement
- https://developer.digikey.com/products/batch-productdetails/batchproductdetailsapi (login-gated)
- https://github.com/Digi-Key/Postman-Collection
- https://github.com/peeter123/digikey-api (README + generated v3 batch client source)

Mouser:
- https://api.mouser.com/api/docs/V1 (live swagger JSON)
- https://api.mouser.com/api/docs/V2 (live swagger JSON)
- http://web.archive.org/web/20260709194124/https://www.mouser.com/api-search/ (rate limits, sign-up, data list)
- https://www.mouser.com/apiterms (Search API ToS; text via web.archive.org copy)
- https://www.mouser.com/MyMouser/MouserSearchApplication.aspx (sign-up form link)

LCSC / JLCPCB:
- https://www.lcsc.com/faqs/api (help-center index)
- https://www.lcsc.com/help-center/api/get-lcsc-apis
- https://www.lcsc.com/help-center/api/lcsc-api-description
- https://www.lcsc.com/help-center/api/api-access-frequency (limits quoted on agent page too)
- https://www.lcsc.com/docs/openapi/index.html (official agent API, Redocly)
- https://www.lcsc.com/agent (API portfolio, application flow, limits)
- https://api.jlcpcb.com/ (JLCPCB API Platform, Components API)
- https://raw.githubusercontent.com/yaqwsx/jlcparts/master/LCSC-API.md
- https://raw.githubusercontent.com/yaqwsx/jlcparts/master/jlcparts/lcsc.py
- https://raw.githubusercontent.com/yaqwsx/jlcparts/master/jlcparts/jlcpcb.py
- https://raw.githubusercontent.com/yaqwsx/jlcparts/master/.github/workflows/update_components.yaml
- https://raw.githubusercontent.com/wavenumber-eng/supply-chain-monkey/main/src/py/scm/server/providers/lcsc_api.py
- https://raw.githubusercontent.com/30350n/inventree-part-import/master/inventree_part_import/suppliers/supplier_lcsc.py
- https://github.com/30350n/inventree-part-import/issues/105 (v2 removal, SM2 v3 search)
- https://github.com/Part-DB/Part-DB-server/issues/552 (older wmsc path)
- https://raw.githubusercontent.com/Eyalm321/jlcpcb-mcp/main/src/live-client.ts
- https://github.com/Eyalm321/jlcpcb-mcp (README: official client, approval note)
- https://github.com/mageoch/LCSC-MCP-Server (getComponentDetailByCode batching, no delta feed)
- https://github.com/peterb154/jlcpcb-search-mcp (catalog size from jlcparts dumps)
- https://pypi.org/project/lcsc-toolkit/ (v3-global scene/exactMatch semantics)
