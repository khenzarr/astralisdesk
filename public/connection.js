function renderConnection(state) {
  $('#connectionState').textContent=state.connected?'Bağlantı doğrulandı':state.configured?'Anahtar kayıtlı · doğrulama gerekli':'Hesap bağlı değil';
  $('#connectionInfo').textContent=state.storageError||(state.snapshot?`Son doğrulama: ${new Date(state.snapshot.checkedAt).toLocaleString('tr-TR')} · Hesap: ${state.accountId||'Varsayılan'}`:'Piyasa verisinin gelmesi hesabın bağlı olduğu anlamına gelmez.');
  $('#retest').disabled=$('#disconnect').disabled=!state.configured&&!state.storageError;
  $('#connectionMetrics').textContent=state.snapshot?`Kullanılabilir bakiye: ${money(state.snapshot.balance.available_balance)}`:'';
  $('#accountDetails').classList.toggle('hidden',!state.snapshot);
  $('#positionSummary').textContent=state.snapshot?`Açık pozisyon: ${state.snapshot.positions.length}`:'';
  $('#strategyAccount').textContent=state.connected?`QFEX · ${state.accountId||'Varsayılan hesap'} · Kullanılabilir: ${money(state.snapshot.balance.available_balance)}`:'Hesap henüz doğrulanmadı. Hesap Bağlantısı sekmesinden bağlayın.';
  $('#feeRows').innerHTML=Object.entries(state.snapshot?.fees||{}).map(([symbol,fee])=>`<tr><td>${safeText(symbol)}</td><td>${percent(fee.maker_fee==null?null:Number(fee.maker_fee)*100)}</td><td>${percent(fee.taker_fee==null?null:Number(fee.taker_fee)*100)}</td></tr>`).join('');
}
async function loadConnection() {
  try{renderConnection(await api('/api/connection'));}catch(e){$('#connectionMessage').textContent=e.message;}
}
async function connectionAction(path,method,payload) {
  const buttons=[...document.querySelectorAll('#accounts button')];buttons.forEach(b=>b.disabled=true);
  const message=$('#connectionMessage');
  message.dataset.state='busy';message.textContent='QFEX bağlantısı doğrulanıyor, ardından şifreli kaydedilecek…';
  $('#connectionForm').setAttribute('aria-busy','true');
  try {
    renderConnection(await api(path,method,payload));
    message.dataset.state='success';message.textContent=method==='DELETE'?'Yerel bağlantı kaldırıldı.':'Bağlantı kaydedildi. QFEX bakiye, pozisyon ve komisyon erişimi doğrulandı.';
    if(payload) $('#connectionForm').reset();loadMarkets();
  }catch(e){message.dataset.state='error';message.textContent=`Bağlantı tamamlanamadı: ${e.message} Girdiğiniz alanlar korundu; kontrol edip yeniden deneyin.`;}
  finally{$('#connectionForm').setAttribute('aria-busy','false');buttons.forEach(b=>b.disabled=false);await loadConnection();}
}
$('#connectionForm').onsubmit=event=>{
  event.preventDefault();const credentials=Object.fromEntries(new FormData(event.currentTarget));
  connectionAction('/api/connection','POST',credentials);
};
$('#retest').onclick=()=>connectionAction('/api/connection/test','POST');
$('#disconnect').onclick=()=>connectionAction('/api/connection','DELETE');
loadConnection();
