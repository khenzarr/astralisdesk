import test from 'node:test';
import assert from 'node:assert/strict';
import { createCcxtPublic, publicConnector } from '../integrations/ccxt-public.js';

test('optional CCXT stays disabled without loading the package', async () => {
  await assert.rejects(createCcxtPublic(), /disabled/);
});

test('public adapter preserves funding units and rejects unsupported capabilities', async () => {
  const adapter = publicConnector({
    has: { fetchFundingRates: true, fetchOrderBook: false },
    fetchFundingRates: async () => ({ BTC: {symbol:'BTC/USD:USD', fundingRate:0.0001, timestamp:null} })
  }, 'test-venue');
  const [rate] = await adapter.fundingRates();
  assert.equal(rate.venue, 'test-venue');
  assert.equal(rate.fundingRate, 0.0001);
  assert.equal(rate.timestamp, null);
  await assert.rejects(adapter.orderbook('BTC/USD:USD'), /does not support/);
  assert.equal(adapter.createOrder, undefined);
});
