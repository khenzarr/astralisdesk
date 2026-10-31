# QFEX Volume Desk

Local, single-account QFEX volume strategy configuration, live market scanning and persistent candidate monitoring. The execution adapter is **not implemented**: no orders, leverage changes or positions are created. This is explicitly shown in the UI; monitoring is not trading.

## Run

Node 22+ on Windows: `npm start`, then open http://localhost:4173. `npm test` runs synthetic unit/integration fixtures (never production orders). API secrets are encrypted with Windows DPAPI CurrentUser, kept in `data/qfex.dpapi`, and excluded from Git. Create a QFEX account-scoped API key with View balance / View positions / View orders and enter it in Hesap Bağlantısı. Do not send wallet private keys or seed phrases. Keys are validated via private positions and fees endpoints before saving. No browser storage or API response contains the secret. Restart with the same Windows user; re-test the connection. Disconnect removes local credentials; revocation is performed separately in QFEX.

### Topluluk yayını

Vercel arayüzü ve güvenli API geçidini çalıştırır. Kesintisiz tarama ile görev kayıtları VPS'teki `src/community-server.js` servisinde kalır. Her tarayıcıya HttpOnly oturum verilir; QFEX anahtarları AES-256-GCM ile ayrı ayrı şifrelenir ve tarayıcı depolamasına yazılmaz. Vercel ile VPS arasındaki bağlantı özel sertifika yetkilisi ve paylaşılan geçit anahtarıyla doğrulanır.

Topluluk sunucusunda `ASTRALIS_MASTER_KEY`, `ASTRALIS_PROXY_SECRET`, `ASTRALIS_TLS_KEY` ve `ASTRALIS_TLS_CERT`; Vercel'de `ASTRALIS_BACKEND_URL`, `ASTRALIS_BACKEND_CA` ve aynı `ASTRALIS_PROXY_SECRET` tanımlanır. Gerçek emir yürütme hâlâ kapalıdır.

## Real data only

Explorer includes the union of QFEX reference catalog and contract feed, with category and quote availability shown per row. Missing values remain unknown. The current upstream categories determine available instruments; no synthetic crypto pairs are added. Account connection accepts QFEX's documented null positions list for an empty account. Failed validation preserves form fields and shows an inline error; successful encrypted saving clears the keys. If positions returns HTTP 5xx but authenticated fees succeed, the documented account-balance endpoint is used as a fallback. Keys, fees and balance can be verified while positions remain unknown; the execution safety gate stays closed. Error messages identify endpoints without exposing upstream response bodies. GET requests retry once on HTTP 5xx, using a new nonce/signature.

There is no demo/fallback dataset. The server connects directly to public `wss://mds.qfex.com`, subscribing to wildcard `level2` (up to 20 levels, 500ms pulses) and `market_stats` (10-second wildcard snapshots). Component timestamps are checked individually; stale streaming funding falls back only to the current real REST snapshot, never a fabricated zero. Connections reconnect with bounded backoff and a stale-message watchdog. The browser refreshes the local snapshot every 2 seconds; this is not a subsecond UI guarantee.

Contracts, reference data and account fees refresh every 15 seconds (non-overlapping scans). During WebSocket outages, REST refreshes books for the 12 highest-volume markets plus monitored candidates and another 12-market group for three consecutive scans before rotating. Candidate books older than 30 seconds, invalid/missing depth, unknown fees, inactive products and missing funding data fail closed. REST snapshots expire after 45 seconds; tasks re-evaluate every 5 seconds. QFEX `market_hours` describes funding-active sessions, not trading availability; an active product with fresh liquidity is not rejected solely for being outside funding hours.

The short-term movement filter uses the range of sampled book midpoints over the last 60 seconds, requiring at least two points separated by 5 seconds. It is a sampled risk filter, not a volatility forecast or loss guarantee. Account fee failures do not turn public market data into invented data. Costs remain unknown until authenticated fees arrive.

## Cost and schedule

One account, one directional position, open then close. This is not delta-neutral. Positive funding suggests SHORT and negative funding LONG as the funding-receiving side; this is not a directional price prediction. Zero/unknown funding does not select a direction automatically. Manual LONG/SHORT may be selected.

Defaults: duration 1 minute, frequency 30 seconds, cycle sleep 1 minute, optional operation sleep 30 minutes, hold **off**. Duration spans first through last child: 0/30/60 seconds = 3 child orders per side. Closing starts only after opening fills are reconciled; sleeping follows confirmed close. A full cycle without hold budgets 3 minutes. This is a schedule estimate, not an executed order schedule yet.

Cost uses authenticated taker fees and volume-weighted buy/sell prices for the full requested size against current depth. QFEX native TWAP uses IOC limit orders; no assumed maker fill ratio. Spread is included once in the round trip, not charged again as a separate duplicate cost. Exit prices are estimates from the current book. Price PnL is excluded and can dominate these costs. Funding credit is not prepaid into the score; currently adverse estimated settlement is included when exposure overlaps the next settlement. Unknown/old settlement time prevents eligibility.

Weekly theoretical volume = 2 × position notional × floor(10080 / cycle minutes). Notional already includes leverage; leverage does not multiply volume again. This is before market-hours, daily budget, partial fills and risk pauses. Entry cost, round-trip cost, cost per $1M, spread, depth impact, leverage/reference limit, min child size and sampled movement limits gate candidate eligibility. The daily cost budget has a planning cap; actual budget and position-loss enforcement require the missing execution adapter.

## Tasks and extension boundary

Optional CCXT and Hummingbot integration preparation is kept in [integrations/README.md](integrations/README.md). Both are disabled. CCXT has an isolated read-only adapter; Hummingbot is a documented future service boundary, not a running execution bridge.

`src/lib/scanner.js` obtains QFEX data through a client provider. `src/lib/volume.js` evaluates venue-tagged candidates and defines rotation decisions. `src/lib/tasks.js` persists real market-monitoring tasks and candidate-change history to `data/tasks.json`. This separation allows future venue adapters without claiming cross-exchange execution exists.

Monitoring retains a healthy candidate to avoid unnecessary churn. If invalid, it clears/replaces the selection with the lowest-cost eligible candidate; if none, it waits. The rotation policy explicitly requires zero position and no pending orders before switching a trading instrument. Current monitors have no positions because there is no executor. On process restart monitoring tasks are paused until resumed. They can be paused/resumed/deleted in Automatic Tasks. Start-trading requests return a clear unavailable error.

## Outstanding before real trading

- Authenticated trade WebSocket, live balances, order/fill tracking, actual leverage and margin checks.
- Durable order identifiers and reconciliation after disconnect/crash; avoid duplicate orders.
- Lot/tick rounding, min/max order checks, partial fills, bounded retries, reduce-only close and confirmed flatten before rotation.
- Live daily budget and realized loss accounting; loss-triggered close, price limits, stale-data response, emergency stop and cancel-on-disconnect.
- Real account integration verification and an explicitly authorized minimum-size end-to-end transaction.

Sources: [QFEX contracts](https://docs.qfex.com/api-reference/rest/market-data/contracts), [order book](https://docs.qfex.com/api-reference/rest/market-data/order-book), [reference data](https://docs.qfex.com/api-reference/rest/market-data/refdata), [fees](https://docs.qfex.com/api-reference/rest/user/user-fees), [TWAP](https://docs.qfex.com/websocket/channels/trade/add_twap).
