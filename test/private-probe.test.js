import test from 'node:test';
import assert from 'node:assert/strict';
import {probePrivateAccount} from '../src/lib/private-probe.js';
import {QfexClient} from '../src/lib/qfex.js';

test('private probe authenticates before subscribing and never treats empty stream as flat',async()=>{
 const sent=[];
 class Socket {
  constructor(){queueMicrotask(()=>this.onopen());}
  send(raw){const m=JSON.parse(raw);sent.push(m);queueMicrotask(()=>{
   if(m.type==='auth')this.onmessage({data:JSON.stringify({authenticated:true})});
   if(m.type==='subscribe')for(const subscribed of m.params.channels)this.onmessage({data:JSON.stringify({subscribed})});
   if(m.type==='get_user_orders')this.onmessage({data:JSON.stringify({all_orders_response:{orders:[],twaps:[]}})});
  });}
  close(){}
 }
 const result=await probePrivateAccount(new QfexClient({publicKey:'test',secretKey:'secret'}),{Socket,timeoutMs:30});
 assert.equal(sent[0].type,'auth');assert.deepEqual(sent.map(m=>m.type),['auth','subscribe','get_user_orders']);
 assert.equal(result.authenticated,true);assert.equal(result.ordersReceived,true);assert.equal(result.positionsComplete,false);
 assert.equal(result.positionMessages,0);assert.ok(!JSON.stringify(result).includes('secret'));
});
