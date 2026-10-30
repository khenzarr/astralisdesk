# QFEX Volume Desk

Local, single-account QFEX volume strategy configuration, live market scanning and persistent candidate monitoring. The execution adapter is **not implemented**: no orders, leverage changes or positions are created. This is explicitly shown in the UI; monitoring is not trading.

## Run

Node 22+ on Windows: `npm start`, then open http://localhost:4173. `npm test` runs synthetic unit/integration fixtures (never production orders). API secrets are encrypted with Windows DPAPI CurrentUser, kept in `data/qfex.dpapi`, and excluded from Git. Create a QFEX account-scoped API key with View balance / View positions / View orders and enter it in Hesap Bağlantısı. Do not send wallet private keys or seed phrases. Keys are validated via private positions and fees endpoints before saving. No browser storage or API response contains the secret. Restart with the same Windows user; re-test the connection. Disconnect removes local credentials; revocation is performed separately in QFEX.

## Real data only

There is no demo/fallback dataset. The server polls QFEX contracts, reference data and account fees every 15 seconds (non-overlapping scans). It refreshes order books for the 12 highest-volume markets plus monitored candidates, and watches another 12-market group for three consecutive scans before rotating, with 3 workers and request spacing. This coverage is shown in Explorer; it is **not a complete, simultaneous cross-market snapshot**. Candidate books older than 30 seconds, invalid/missing depth, unknown fees/hours, closed markets and missing funding data fail closed. Contract snapshots expire after 45 seconds; tasks re-evaluate every 5 seconds even during a slow upstream scan. WebSocket market streaming is not implemented.

The short-term movement filter uses the range of sampled book midpoints over the last 60 seconds, requiring at least two points separated by 5 seconds. It is a sampled risk filter, not a volatility forecast or loss guarantee. Account fee failures do not turn public market data into invented data. Costs remain unknown until authenticated fees arrive.

## Cost and schedule

One account, one directional position, open then close. This is not delta-neutral. Positive funding suggests SHORT and negative funding LONG as the funding-receiving side; this is not a directional price prediction. Zero/unknown funding does not select a direction automatically. Manual LONG/SHORT may be selected.

Defaults: duration 1 minute, frequency 30 seconds, cycle sleep 1 minute, optional operation sleep 30 minutes, hold **off**. Duration spans first through last child: 0/30/60 seconds = 3 child orders per side. Closing starts only after opening fills are reconciled; sleeping follows confirmed close. A full cycle without hold budgets 3 minutes. This is a schedule estimate, not an executed order schedule yet.

Cost uses authenticated taker fees and volume-weighted buy/sell prices for the full requested size against current depth. QFEX native TWAP uses IOC limit orders; no assumed maker fill ratio. Spread is included once in the round trip, not charged again as a separate duplicate cost. Exit prices are estimates from the current book. Price PnL is excluded and can dominate these costs. Funding credit is not prepaid into the score; currently adverse estimated settlement is included when exposure overlaps the next settlement. Unknown/old settlement time prevents eligibility.

Weekly theoretical volume = 2 × position notional × floor(10080 / cycle minutes). Notional already includes leverage; leverage does not multiply volume again. This is before market-hours, daily budget, partial fills and risk pauses. Entry cost, round-trip cost, cost per $1M, spread, depth impact, leverage/reference limit, min child size and sampled movement limits gate candidate eligibility. The daily cost budget has a planning cap; actual budget and position-loss enforcement require the missing execution adapter.

## Tasks and extension boundary

`src/lib/scanner.js` obtains QFEX data through a client provider. `src/lib/volume.js` evaluates venue-tagged candidates and defines rotation decisions. `src/lib/tasks.js` persists real market-monitoring tasks and candidate-change history to `data/tasks.json`. This separation allows future venue adapters without claiming cross-exchange execution exists.

Monitoring retains a healthy candidate to avoid unnecessary churn. If invalid, it clears/replaces the selection with the lowest-cost eligible candidate; if none, it waits. The rotation policy explicitly requires zero position and no pending orders before switching a trading instrument. Current monitors have no positions because there is no executor. On process restart monitoring tasks are paused until resumed. They can be paused/resumed/deleted in Automatic Tasks. Start-trading requests return a clear unavailable error.

## Outstanding before real trading

- Authenticated trade WebSocket, live balances, order/fill tracking, actual leverage and margin checks.
- Durable order identifiers and reconciliation after disconnect/crash; avoid duplicate orders.
- Lot/tick rounding, min/max order checks, partial fills, bounded retries, reduce-only close and confirmed flatten before rotation.
- Live daily budget and realized loss accounting; loss-triggered close, price limits, stale-data response, emergency stop and cancel-on-disconnect.
- Real account integration verification and an explicitly authorized minimum-size end-to-end transaction.

Sources: [QFEX contracts](https://docs.qfex.com/api-reference/rest/market-data/contracts), [order book](https://docs.qfex.com/api-reference/rest/market-data/order-book), [reference data](https://docs.qfex.com/api-reference/rest/market-data/refdata), [fees](https://docs.qfex.com/api-reference/rest/user/user-fees), [TWAP](https://docs.qfex.com/websocket/channels/trade/add_twap).
