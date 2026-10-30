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
  $('#connectionMessage').textContent='İşlem sürüyor…';
  try {
    renderConnection(await api(path,method,payload));
    $('#connectionMessage').textContent=method==='DELETE'?'Yerel bağlantı kaldırıldı.':'QFEX bakiye, pozisyon ve komisyon erişimi doğrulandı.';
    if(payload) $('#connectionForm').reset();loadMarkets();
  }catch(e){$('#connectionMessage').textContent=e.message;}
  finally{buttons.forEach(b=>b.disabled=false);await loadConnection();}
}
$('#connectionForm').onsubmit=event=>{
  event.preventDefault();const credentials=Object.fromEntries(new FormData(event.currentTarget));
  event.currentTarget.elements.secretKey.value='';event.currentTarget.elements.publicKey.value='';
  connectionAction('/api/connection','POST',credentials);
};
$('#retest').onclick=()=>connectionAction('/api/connection/test','POST');
$('#disconnect').onclick=()=>connectionAction('/api/connection','DELETE');
loadConnection();
