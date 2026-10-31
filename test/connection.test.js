import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from '../src/lib/credentials.js';
import { validateCredentials, inspectAccount } from '../src/lib/connection.js';
import { QfexClient } from '../src/lib/qfex.js';

test('credentials reject missing keys, header injection and wallet address as account ID', () => {
  assert.throws(() => validateCredentials({publicKey:'key'}));
  assert.throws(() => validateCredentials({publicKey:'key\r\nInjected',secretKey:'secret'}));
  assert.throws(() => validateCredentials({publicKey:'key',secretKey:'secret',accountId:'0x1234'}));
  assert.deepEqual(validateCredentials({publicKey:' key ',secretKey:' secret '}), {publicKey:'key',secretKey:'secret',accountId:''});
});
test('account test requires both positions and fees; empty account is valid', async () => {
  const client = { positions: async () => ({balance:{available_balance:0},positions:[]}), fees: async () => ({fees:{}}), balances:async()=>({accounts:[]}) };
  const result = await inspectAccount(client);
  assert.equal(result.balance.available_balance, 0);
  client.positions = async () => ({balance:{available_balance:0},positions:null});
  assert.deepEqual((await inspectAccount(client)).positions, []);
  client.positions = async () => ({balance:{available_balance:0}});
  await assert.rejects(inspectAccount(client), /beklenenden/);
  client.positions = async () => ({balance:{available_balance:0},positions:[]});
  client.fees = async () => { throw new Error('permission denied'); };
  await assert.rejects(inspectAccount(client), /permission/);
  client.fees = async () => ({});
  await assert.rejects(inspectAccount(client), /doğrulanamadı/);
});
test('upstream errors do not echo credentials or raw response bodies', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('secret-reflected-by-server', {status:401});
  try { await assert.rejects(new QfexClient({publicKey:'key',secretKey:'secret'}).positions(), error => !error.message.includes('secret') && error.message.includes('doğrulaması')); }
  finally { globalThis.fetch = original; }
});

test('server failures retry once with fresh auth and identify failed endpoints without response bodies',async()=>{
  const original=globalThis.fetch,nonces=[];
  globalThis.fetch=async(url,options)=>{nonces.push(options.headers['x-qfex-nonce']);return new Response('sensitive upstream body',{status:500});};
  try {
    await assert.rejects(new QfexClient({publicKey:'test',secretKey:'test'}).fees(),e=>e.status===500&&e.endpoint==='/user/fees'&&!e.message.includes('sensitive'));
    assert.equal(nonces.length,2);assert.notEqual(nonces[0],nonces[1]);
  } finally {globalThis.fetch=original;}
  await assert.rejects(inspectAccount({positions:async()=>{throw Error('positions 500');},fees:async()=>{throw Error('fees 403');},balances:async()=>({accounts:[]})}),/fees 403/);
});

test('verified fees can be saved during positions 500 without inventing an empty account',async()=>{
  const error=new Error('QFEX /user/positions HTTP 500');error.status=500;
  const client={positions:async()=>{throw error;},fees:async()=>({fees:{TEST:{maker_fee:0,taker_fee:0.001}}}),balances:async()=>({accounts:[{account_id:'00000000-0000-0000-0000-000000000001',is_master:true,available_balance:0,equity:0}]})};
  const snapshot=await inspectAccount(client);
  assert.equal(snapshot.accountVerified,false);assert.equal(snapshot.balance.available_balance,0);assert.equal(snapshot.positions,null);
  assert.equal(snapshot.balanceVerified,true);assert.equal(snapshot.positionsVerified,false);
  assert.equal(snapshot.fees.TEST.taker_fee,0.001);
  error.status=401;await assert.rejects(inspectAccount(client));
});
test('Windows encrypted storage survives reload, replacement and deletion', {skip: process.platform !== 'win32'}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qfex-store-test-'));
  const file = join(dir,'test.dpapi');
  try {
    const store = new CredentialStore(file);
    assert.equal(await store.load(),null);
    const credentials = {publicKey:'synthetic-test-public',secretKey:'synthetic-test-secret'};
    await store.save(credentials);
    assert.ok(!(await readFile(file,'utf8')).includes(credentials.secretKey));
    assert.deepEqual(await new CredentialStore(file).load(),credentials);
    await store.save({...credentials,accountId:'changed'});
    assert.equal((await store.load()).accountId,'changed');
    await store.remove();
    assert.equal(await store.load(),null);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
