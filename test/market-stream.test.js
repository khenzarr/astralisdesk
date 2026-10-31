import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketStream} from '../src/lib/market-stream.js';

test('stream uses component timestamps, replaces snapshots and rejects old sequences',()=>{
  const now=Date.now(),time=new Date(now).toISOString(),books=[];
  const stream=new MarketStream((s,b)=>books.push(b));stream.connected=true;
  stream.accept({type:'market_stats',symbol:'*',sequence:1,time,
    funding_rates:[{symbol:'TEST',time,funding_rate:'0.0001',time_remaining:50}],
    mark_prices:[{symbol:'TEST',time,price:'100'}],daily_volumes_notional:[{symbol:'TEST',volume:'1000'}]},now);
  const c=stream.overlay({symbol:'TEST'},now);
  assert.equal(c.fundingApr,87.6);assert.equal(c.signal,'SHORT');assert.equal(c.nextFundingAt,now/1000+50);
  stream.accept({type:'level2',symbol:'TEST',sequence:2,time,bid:[['99','1']],ask:[['101','1']]},now);
  assert.equal(books.length,1);
  stream.accept({type:'level2',symbol:'TEST',sequence:1,time,bid:[],ask:[]},now);
  assert.equal(books.length,1);
  stream.accept({type:'market_stats',symbol:'*',sequence:3,time:new Date(now+31000).toISOString(),funding_rates:[{symbol:'TEST',time,funding_rate:'0.1',time_remaining:50}]},now+31000);
  assert.equal(stream.overlay({symbol:'TEST'},now+31000).fundingRate,null);
  assert.equal(stream.overlay({symbol:'TEST'},now+31000).signal,'UNKNOWN');
  stream.accept({type:'market_stats',symbol:'*',sequence:4,time:new Date(now+31000).toISOString(),funding_rates:[]},now+31000);
  assert.equal(stream.rows.size,0);
  stream.stop();assert.equal(stream.status(now).connected,false);
});
