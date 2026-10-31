import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {CloudStore} from '../src/lib/cloud-store.js';

test('community sessions isolate and encrypt exchange credentials',async()=>{
  const dir=await mkdtemp(join(process.cwd(),'data','cloud-store-test-')),file=join(dir,'users.json');
  try{
    const key=crypto.randomBytes(32).toString('base64'),store=new CloudStore(file,key);await store.load();
    const first=store.session(null),second=store.session(null),credentials={publicKey:'public-a',secretKey:'secret-a',accountId:''};
    await store.setCredentials(first,credentials,{fees:{BTC:{taker_fee:0.001}}});
    assert.deepEqual(store.decrypt(first.data.credentials),credentials);
    assert.equal(second.data.credentials,null);
    const raw=await readFile(file,'utf8');assert.ok(!raw.includes('secret-a'));assert.ok(!raw.includes('public-a'));
    const reloaded=new CloudStore(file,key);await reloaded.load();
    assert.deepEqual(reloaded.decrypt(reloaded.session(first.token,false).data.credentials),credentials);
  }finally{await rm(dir,{recursive:true,force:true});}
});
