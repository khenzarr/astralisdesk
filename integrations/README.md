# Passive integrations

## perp-cli evaluation (2026-11-01)

https://github.com/hypurrquant/perp-cli advertises QFEX, Hyperliquid, Pacifica,
Lighter and other venue adapters under MIT. Useful candidate for reviewing
QFEX account request construction and future venue adapters. Only the repository
documentation has been reviewed; implementation/security compatibility is not
verified. Do not install or route user keys through it until the specific adapter
is reviewed. No runtime dependency added. Hummingbot remains deferred.

Hyperliquid public crypto funding is now read directly from the official
metaAndAssetCtxs API by public/crypto.js every 15 seconds. It is display-only;
account fees, order-book cost evaluation and automatic execution are not yet
integrated. Failed requests clear rows instead of displaying old prices.

These integrations are disabled and are not imported by `src/server.js`.
No extra process, dependency, API subscription or order execution is started.

## CCXT

`ccxt-public.js` is a read-only adapter factory for future multi-exchange data.
The package is intentionally not installed while unused. Before activation:

1. Review and pin a current CCXT version; add it to package.json and the lockfile.
2. Check `ccxt.exchanges` and each exchange's `has` capabilities. As checked on
   2026-10-31, QFEX was not found in the official supported exchange list.
3. Explicitly call `createCcxtPublic({enabled:true, exchangeId})` from a new
   provider integration. The registry alone does not enable anything.
4. Map contract size, settlement asset, funding interval, source timestamps and
   freshness to the scanner contract; add live read-only integration checks.
5. Keep venue identity on every row. Another venue's rate or order book cannot
   substitute for QFEX funding, executable prices or account-specific fees.

CCXT is a free/open-source client library, not a hosted market-data service.
Public endpoints usually require no trading credentials; exchange rate limits,
regional availability and endpoint-specific restrictions still apply.

## Hummingbot

Kept as a future integration reference in registry.json. It is a separate bot
framework, not an npm data-provider replacement. No working runtime bridge is
claimed or installed. For future cross-exchange strategies, deploy a separately
versioned service and implement an authenticated bridge with order identifiers,
fill reconciliation and a single owner for execution. First verify exchange
connector coverage, licenses and strategy behavior. QFEX support is not assumed.

## Current QFEX data path

QFEX public MDS WebSocket -> fresh order books / market statistics -> scanner.
QFEX REST -> contract catalog / reference data / fallback books.
Authenticated QFEX fees -> account-specific cost estimates.
Positions endpoint health is separate from public market data availability.
Keep the Node service and internet connection running; a VPS is optional for
24/7 availability. Windows DPAPI credentials do not transfer directly to Linux.
Neither TradingView nor a FundingDesk browser session is required.

## Official references

- https://github.com/ccxt/ccxt
- https://github.com/ccxt/ccxt/wiki/Manual
- https://github.com/hummingbot/hummingbot
- https://hummingbot.org/exchanges/
- https://docs.qfex.com/websocket/main
