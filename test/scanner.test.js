import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMarkets} from '../src/lib/scanner.js';
import {rankContracts} from '../src/lib/volume.js';

test('catalog and live markets are unioned without invented quotes or duplicate symbols',()=>{
  const rows=mergeMarkets([{ticker_id:'LIVE',last_price:10},{ticker_id:'UNLISTED',last_price:20}],
    [{symbol:'LIVE',product_category:'INDEX'},{symbol:'CATALOG',product_category:'FX'}]);
  assert.equal(rows.length,3);
  const catalog=rows.find(r=>r.symbol==='CATALOG');
  assert.equal(catalog.hasContract,false);
  assert.equal(catalog.price,null);
  assert.equal(catalog.fundingRate,null);
  assert.equal(rankContracts([catalog],{})[0].eligible,false);
  assert.equal(rows.find(r=>r.symbol==='LIVE').category,'INDEX');
  assert.equal(rows.find(r=>r.symbol==='UNLISTED').price,20);
});
