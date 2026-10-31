// Optional, read-only connector. Never imported by the production QFEX scanner.
// Install a reviewed, pinned ccxt version before explicitly enabling this factory.
export async function createCcxtPublic({ enabled = false, exchangeId } = {}) {
  if (!enabled) throw new Error('CCXT integration is disabled.');
  const { default: ccxt } = await import('ccxt');
  if (!ccxt.exchanges.includes(exchangeId)) throw new Error('Unsupported CCXT exchange.');
  const exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 10000 });
  return publicConnector(exchange, exchangeId);
}

export function publicConnector(exchange, exchangeId) {
  const requireMethod = name => {
    if (!exchange.has[name]) throw new Error(`${exchangeId} does not support ${name}.`);
  };
  return Object.freeze({
    venue: exchangeId,
    async markets() {
      const markets = await exchange.loadMarkets();
      return Object.values(markets).filter(m => m.swap && m.active !== false);
    },
    async fundingRates(symbols) {
      requireMethod('fetchFundingRates');
      const rates = await exchange.fetchFundingRates(symbols);
      // Preserve the venue and original interval/timestamp. Do not fabricate APR
      // or apply another exchange's funding/fees to QFEX instruments.
      return Object.values(rates).map(rate => ({ venue: exchangeId, ...rate }));
    },
    async orderbook(symbol, limit) {
      requireMethod('fetchOrderBook');
      return { venue: exchangeId, ...await exchange.fetchOrderBook(symbol, limit) };
    },
    async close() { await exchange.close?.(); }
  });
}
