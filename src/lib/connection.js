import {probePrivateAccount} from './private-probe.js';

export function validateCredentials(input) {
  const result = {};
  for (const name of ['publicKey', 'secretKey', 'accountId']) {
    const value = input[name] ?? '';
    if (typeof value !== 'string' || value.length > 2048 || /[\r\n\x00-\x1f]/.test(value.trim())) throw new Error('Anahtar alanları geçersiz.');
    result[name] = value.trim();
  }
  if (!result.publicKey || !result.secretKey) throw new Error('Public Key ve Secret Key gerekli.');
  if (result.accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.accountId)) throw new Error('Account ID bir UUID olmalı; cüzdan adresi değildir.');
  return result;
}

export async function inspectAccount(client) {
  const [positionsResult, feesResult, balancesResult] = await Promise.allSettled([
    client.positions(), client.fees(), client.balances()
  ]);
  if (feesResult.status === 'rejected') throw feesResult.reason;
  const fees=feesResult.value?.fees;
  if(!fees||typeof fees!=='object'||Array.isArray(fees)) throw new Error('QFEX komisyon yanıtı doğrulanamadı.');

  let balance=null,positions=null,positionsVerified=false,balanceVerified=false;
  if(positionsResult.status==='fulfilled') {
    const account=positionsResult.value;
    if(!account?.balance||!(account.positions===null||Array.isArray(account.positions))) throw new Error('QFEX pozisyon yanıtı beklenenden farklı.');
    balance=account.balance;positions=account.positions??[];positionsVerified=true;balanceVerified=true;
  } else {
    if(!(positionsResult.reason?.status>=500)) throw positionsResult.reason;
    if(balancesResult.status==='rejected') throw new Error(`${positionsResult.reason.message} | ${balancesResult.reason.message}`);
    const accounts=balancesResult.value?.accounts;
    if(!(accounts===null||Array.isArray(accounts))) throw new Error('QFEX bakiye yanıtı beklenenden farklı.');
    const selected=(accounts??[]).find(a=>client.accountId?a.account_id===client.accountId:a.is_master)??null;
    if(!selected&&client.accountId) throw new Error('Seçilen QFEX Account ID bakiye listesinde bulunamadı.');
    balance=selected?{available_balance:selected.available_balance,equity:selected.equity}:null;
    balanceVerified=Boolean(selected);
  }
  const privateStream=!positionsVerified&&typeof client.authHeaders==='function'
    ? await probePrivateAccount(client):null;
  return {
    checkedAt:new Date().toISOString(),balance,positions,fees,
    credentialsVerified:true,balanceVerified,positionsVerified,privateStream,
    accountVerified:balanceVerified&&positionsVerified,
    warning:positionsVerified?null:`${positionsResult.reason.message} Bakiye erişimi doğrulandı; açık pozisyon listesi QFEX tarafından doğrulanamadı.`
  };
}
