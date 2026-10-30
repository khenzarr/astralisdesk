export function validateCredentials(input) {
  const result = {};
  for (const name of ['publicKey', 'secretKey', 'accountId']) {
    const value = input[name] ?? '';
    if (typeof value !== 'string' || value.length > 2048 || /[\r\n\x00-\x1f]/.test(value)) throw new Error('Anahtar alanları geçersiz.');
    result[name] = value.trim();
  }
  if (!result.publicKey || !result.secretKey) throw new Error('Public Key ve Secret Key gerekli.');
  if (result.accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.accountId)) throw new Error('Account ID bir UUID olmalı; cüzdan adresi değildir.');
  return result;
}

export async function inspectAccount(client) {
  const [account, feeData] = await Promise.all([client.positions(), client.fees()]);
  if (!account.balance || !Array.isArray(account.positions) || !feeData.fees || typeof feeData.fees !== 'object' || Array.isArray(feeData.fees)) throw new Error('QFEX yanıt biçimi beklenenden farklı.');
  return { checkedAt: new Date().toISOString(), balance: account.balance, positions: account.positions, fees: feeData.fees };
}
