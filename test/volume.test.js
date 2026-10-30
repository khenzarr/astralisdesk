import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,timing,validateTask,normalizeContract,bookQuote,evaluateCandidate,rotationDecision,marketOpen} from '../src/lib/volume.js';
import {MarketScanner} from '../src/lib/scanner.js';
const now=Date.UTC(2026,9,30,12);
const ref={status:'ACTIVE',default_max_leverage:10,min_quantity:0.001,market_hours:{tz:'UTC',friday:[{session:'open',open:'00:00:00',close:'23:59:59'}]}};
function candidate() {
  return {...normalizeContract({ticker_id:'TEST',last_price:100,target_volume:100000,funding_rate:0.0001,funding_interval_minutes:60,next_funding_rate_timestamp:now/1000+1800},{TEST:{maker_fee:0,taker_fee:0.0001}},ref),book:{bids:[[99.99,100]],asks:[[100.01,100]]},bookAt:now,moveBps:2};
}
test('single-leg timing: optional hold off, both open and close volume, duration endpoint convention',()=>{
  const t=timing();assert.equal(t.childOrders,3);assert.equal(t.cycleMinutes,3);assert.equal(t.weeklyVolume,6720000);
  assert.equal(timing({holdEnabled:true}).cycleMinutes,33);
  assert.equal(timing({leverage:10}).weeklyVolume,t.weeklyVolume);
  assert.equal(validateTask(DEFAULTS).length,0);
  assert.ok(validateTask({frequencySeconds:10}).length);
  assert.ok(validateTask({notional:'bad'}).length);
  assert.ok(validateTask({holdEnabled:'false'}).length);
});
test('book depth walks levels, ignores zero sizes and rejects insufficient liquidity',()=>{
  const q=bookQuote({bids:[[99,0],[98,20]],asks:[[101,1],[102,19]]},1000);
  assert.ok(q.buy>101);assert.equal(q.sell,98);
  assert.equal(bookQuote({bids:[[99,1]],asks:[[101,1]]},1000),null);
  assert.equal(bookQuote({bids:[[102,10]],asks:[[101,10]]},1000),null);
});
test('missing fees never default to zero or permit a candidate',()=>{
  const c=candidate();c.takerFee=null;
  const result=evaluateCandidate(c,{},now);assert.equal(result.cycle,null);assert.equal(result.eligible,false);
});
test('round-trip includes both fees and spread once; funding credit not prepaid',()=>{
  const result=evaluateCandidate(candidate(),{},now);
  assert.equal(result.eligible,true);assert.equal(result.side,'SHORT');
  assert.ok(Math.abs(result.cycle.costPerCycle-0.4)<1e-8);
  assert.equal(result.cycle.fundingCost,0);
  const c=candidate();c.nextFundingAt=now/1000+60;
  assert.equal(evaluateCandidate(c,{direction:'LONG'},now).cycle.fundingCost,0.1);
});
test('stale book, rapid move, unknown hours and strict entry ceiling block candidates',()=>{
  const c=candidate();c.bookAt=now-31000;assert.equal(evaluateCandidate(c,{},now).eligible,false);
  c.bookAt=now;c.moveBps=50;assert.equal(evaluateCandidate(c,{},now).eligible,false);
  c.moveBps=2;c.ref={...ref,market_hours:{}};assert.equal(evaluateCandidate(c,{},now).eligible,false);
  assert.equal(evaluateCandidate(candidate(),{maxEntryCost:0.1},now).eligible,false);
  assert.equal(marketOpen(ref,now),true);assert.equal(marketOpen(ref,now+86400000),null);
});
test('rotation does not abandon an open position or pending orders; holds healthy candidate',()=>{
  const current={symbol:'A',side:'LONG'},best={symbol:'B',side:'SHORT',eligible:true};
  assert.equal(rotationDecision(current,[best],{flat:false}).action,'close_then_rotate');
  assert.equal(rotationDecision(current,[best],{pendingOrders:true}).next,null);
  assert.equal(rotationDecision(current,[best]).next.symbol,'B');
  assert.equal(rotationDecision(current,[{...current,eligible:true},best]).action,'keep');
  assert.equal(rotationDecision(current,[]).action,'wait');
});
test('scanner outage removes opportunities instead of substituting example data',async()=>{
  const scanner=new MarketScanner(()=>({contracts:async()=>{throw Error('offline');},reference:async()=>({data:[]})}));
  scanner.contracts=[candidate()];scanner.at=Date.now();
  await scanner.scan();assert.equal(scanner.snapshot().source,'unavailable');assert.deepEqual(scanner.snapshot().contracts,[]);
});
