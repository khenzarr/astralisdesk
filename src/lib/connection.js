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
  const results = await Promise.allSettled([client.positions(), client.fees()]);
  // Fees are user-scoped: they verify the key but do not prove access to the selected account.
  const partial=results[0].status==='rejected'&&results[0].reason.status>=500&&results[1].status==='fulfilled';
  if(partial) {
    const fees=results[1].value?.fees;
    if(!fees||typeof fees!=='object'||Array.isArray(fees))throw new Error('QFEX komisyon yanıtı doğrulanamadı.');
    return {checkedAt:new Date().toISOString(),balance:null,positions:null,fees,
      warning:results[0].reason.message,accountVerified:false};
  }
  const failures=results.filter(r=>r.status==='rejected');
  if(failures.length) throw new Error(failures.map(r=>r.reason.message).join(' | '));
  const [account, feeData] = results.map(r=>r.value);
  if (!account?.balance || !(account.positions === null || Array.isArray(account.positions)) || !feeData?.fees || typeof feeData.fees !== 'object' || Array.isArray(feeData.fees)) throw new Error('QFEX yanıt biçimi beklenenden farklı.');
  return { checkedAt: new Date().toISOString(), balance: account.balance, positions: account.positions ?? [], fees: feeData.fees,accountVerified:true };
}
