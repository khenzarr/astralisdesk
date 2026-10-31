const $ = s => document.querySelector(s);
const money = (v, compact=false) => v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : new Intl.NumberFormat('tr-TR',{style:'currency',currency:'USD',notation:compact?'compact':'standard',maximumFractionDigits:2}).format(v);
const percent = v => v === null || v === undefined ? '—' : `${Number(v).toFixed(4)}%`;
const safeText = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let markets=[],marketBusy=false,lastSnapshotAt=0;
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
function showPage(id) {
  document.querySelectorAll('nav button,.page').forEach(el=>el.classList.remove('active'));
  document.querySelector(`nav button[data-page="${id}"]`).classList.add('active');
  document.getElementById(id).classList.add('active');
  if(id==='tasks') loadTasks(); if(id==='accounts') loadConnection();
}
async function api(path,method='GET',input) {
  const r=await fetch(path,{method,headers:{'content-type':'application/json','x-local-request':'1'},...(input?{body:JSON.stringify(input)}:{})});
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||data.errors?.join(' ')||'İstek tamamlanamadı.');
  return data;
}
function strategyInput() {
  const input=Object.fromEntries(new FormData($('#strategyForm')));
  input.holdEnabled=$('#strategyForm').elements.holdEnabled.checked;
  input.operationSleepMinutes=$('#strategyForm').elements.operationSleepMinutes.value;
  return input;
}
function query() {
  const input=strategyInput();
  for(const key of ['notional','maxEntryCost','maxCycleCost','maxCostPerMillion']) input[key]=$('#'+key).value;
  return new URLSearchParams(input);
}
async function loadMarkets() {
  if(marketBusy) return; marketBusy=true; $('#refresh').disabled=true;
  try {
    const data=await api(`/api/explorer?${query()}`);
    markets=data.contracts;lastSnapshotAt=data.at;
    $('#feedBadge').textContent=data.source==='qfex-websocket'?'● QFEX · WebSocket':data.source==='qfex-rest'?'● QFEX · REST yedeği / 15 sn':'● VERİ YOK';
    $('#warning').classList.toggle('hidden',!data.warning);$('#warning').textContent=data.warning||'';
    if(data.at && data.warning?.startsWith('Piyasa verisi alınıyor.')) {
      $('#warning').textContent='QFEX piyasa verisi güncel. Kişisel işlem maliyetini görmek için bu tarayıcıda hesabını bağla. Yerel uygulamadaki bağlantı web sitesine taşınmaz.';
      $('#warning').style.background='#14283b';
    } else { $('#warning').style.background=''; }
    $('#scanCoverage').textContent=data.coverage;
    $('#scanStatus').textContent=`${markets.filter(m=>m.eligible).length} uygun / ${markets.length} market · Son tarama: ${data.at?new Date(data.at).toLocaleTimeString('tr-TR'):'—'}`;
    renderMarkets();
  } catch(error) {
    markets=[];lastSnapshotAt=0;renderMarkets();$('#feedBadge').textContent='● VERİ YOK';
    $('#warning').classList.remove('hidden');$('#warning').textContent=error.message;
  } finally {marketBusy=false;$('#refresh').disabled=false;}
}
function renderMarkets() {
  const filter=$('#marketSearch').value.toLowerCase();
  const visible=markets.filter(m=>`${m.symbol} ${m.category} ${m.reasons.join(' ')} ${m.eligible?'uygun':''}`.toLowerCase().includes(filter));
  $('#marketRows').innerHTML=visible.length?visible.map(m=>`<tr>
    <td><strong>${safeText(m.symbol)}</strong><br><small class="muted">${safeText(m.category)} · ${m.hasContract?'REST sözleşme verisi mevcut':'REST sözleşme verisi yok'}<br>${money(m.price)} · ${money(m.volumeUsd,true)} hacim</small></td>
    <td>${safeText(m.signal)}<br><small class="muted">${m.fundingHoursActive===false?'Funding saati dışında':''}</small></td><td>${percent(m.fundingApr)}<br><small class="muted">${percent(m.fundingRate===null?null:m.fundingRate*100)} / ${m.intervalMinutes??'—'} dk<br>${m.liveFundingAt?'WebSocket':'REST'}</small></td>
    <td>${percent(m.makerFee===null?null:m.makerFee*100)} / ${percent(m.takerFee===null?null:m.takerFee*100)}</td>
    <td>${m.quote?m.quote.spreadBps.toFixed(2)+' bps':'—'}</td>
    <td>${money(m.cycle?.entryCost)} / ${money(m.cycle?.exitCost)}</td>
    <td>${money(m.cycle?.costPerCycle)}</td><td>${money(m.cycle?.costPerMillion)}</td>
    <td class="risk-reason">${m.eligible?'<span class="positive">Ölçülen sınırlar içinde</span>':safeText(m.reasons.join(' · '))}<br><small>Defter yaşı: ${m.bookAgeSeconds===null?'—':Math.max(0,m.bookAgeSeconds).toFixed(0)+' sn'}</small></td></tr>`).join(''):'<tr><td colspan="9">Güncel veri veya eşleşen market yok.</td></tr>';
  const best=markets.find(m=>m.eligible)?.cycle;
  $('#heroVolume').textContent=best?money(best.weeklyVolume,true):'—';
  $('#heroCost').textContent=best?`${money(best.weeklyCost)} teorik haftalık maliyet · bütçe öncesi`:'Doğrulanmış uygun aday bekleniyor';
}
$('#refresh').onclick=loadMarkets;$('#marketSearch').oninput=renderMarkets;
for(const key of ['notional','maxEntryCost','maxCycleCost','maxCostPerMillion']) $('#'+key).onchange=()=>{
  $('#strategyForm').elements[key].value=$('#'+key).value;loadMarkets();updateTiming();
};
function updateTiming() {
  const p=strategyInput(),hold=p.holdEnabled?Number(p.operationSleepMinutes):0;
  const minutes=Number(p.durationMinutes)*2+hold+Number(p.cycleSleepMinutes);
  const children=Number(p.durationMinutes)*60/Number(p.frequencySeconds)+1;
  $('#strategyForm').elements.operationSleepMinutes.disabled=!p.holdEnabled;
  $('#timingSummary').textContent=`Aç ${p.durationMinutes} dk → ${p.holdEnabled?`bekle ${hold} dk → `:''}kapat ${p.durationMinutes} dk → ara ${p.cycleSleepMinutes} dk. ${Number.isInteger(children)?children:'Geçersiz'} alt emir / yön. Teorik haftalık hacim: ${minutes>0?money(Math.floor(10080/minutes)*2*Number(p.notional),true):'—'}.`;
}
$('#strategyForm').addEventListener('change',()=>{
  updateTiming();
  for(const key of ['notional','maxEntryCost','maxCycleCost','maxCostPerMillion']) $('#'+key).value=$('#strategyForm').elements[key].value;
  $('#estimateResult').classList.add('hidden');loadMarkets();
});
function metrics(e) {
  return `<div class="metrics"><div class="metric"><small>Haftalık hacim (teorik)</small><strong>${money(e.weeklyVolume,true)}</strong></div><div class="metric"><small>Aç–kapat maliyeti</small><strong>${money(e.costPerCycle)}</strong></div><div class="metric"><small>Maliyet / $1M</small><strong>${money(e.costPerMillion)}</strong></div><div class="metric"><small>Bütçeyle döngü / gün</small><strong>${e.budgetCyclesPerDay??'—'}</strong></div></div>`;
}
$('#estimate').onclick=async()=>{
  const box=$('#estimateResult');box.classList.remove('hidden');box.textContent='Hesaplanıyor…';
  try {
    const data=await api('/api/estimate','POST',strategyInput());
    box.innerHTML=data.candidate?`<h2>${safeText(data.candidate.symbol)} · ${safeText(data.candidate.side)}</h2>${metrics(data.candidate.cycle)}<p class="muted">Çıkış fiyatı bugünkü defterle tahmin edilmiştir; gerçekleşme garantisi değildir.</p>`:`<h2>Uygun aday yok</h2><p>${safeText(data.warning||'Ücret, veri, piyasa veya maliyet sınırları sağlanmıyor. Explorer nedenleri gösterir.')}</p>`;
  }catch(e){box.textContent=e.message;}
};
$('#strategyForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try {await api('/api/tasks','POST',strategyInput());showPage('tasks');}
  catch(e){$('#estimateResult').classList.remove('hidden');$('#estimateResult').textContent=e.message;}
  finally{button.disabled=false;}
};
async function loadTasks() {
  try {
    const {tasks}=await api('/api/tasks');
    $('#taskList').innerHTML=tasks.length?tasks.map(t=>`<div class="card task-monitor"><p class="eyebrow">${t.status==='paused'?'DURAKLATILDI':'ADAY TAKİBİ AÇIK'} · EMİR GÖNDERİLMİYOR</p><h3>${t.candidate?safeText(t.candidate.symbol)+' · '+safeText(t.candidate.side):'Uygun aday bekleniyor'}</h3><p>${safeText(t.reason)}</p><p class="muted">${money(t.input.notional)} · ${t.input.leverage}x hedef · TWAP ${t.input.durationMinutes} dk / ${t.input.frequencySeconds} sn · Bekleme ${t.input.holdEnabled?t.input.operationSleepMinutes+' dk':'kapalı'} · Ara ${t.input.cycleSleepMinutes} dk</p>${t.estimate?metrics(t.estimate):''}<p class="scan-time">Son değerlendirme: ${t.checkedAt?new Date(t.checkedAt).toLocaleString('tr-TR'):'—'}</p><button class="action" data-task="${t.id}" data-action="${t.status==='paused'?'resume':'pause'}">${t.status==='paused'?'Takibi sürdür':'Takibi duraklat'}</button> <button class="action" data-task="${t.id}" data-action="delete">Sil</button> <button class="action" disabled>İşlem başlat · yürütücü eksik</button><details><summary>Aday değişim geçmişi</summary><ul>${t.history.map(h=>`<li>${safeText(new Date(h.at).toLocaleString('tr-TR'))}: ${safeText(h.from?.symbol||'—')} → ${safeText(h.to?.symbol||'—')} · ${safeText(h.reason)}</li>`).join('')}</ul></details></div>`).join(''):'<div class="card empty">Volume Stratejisi ekranından aday takibini başlatabilirsiniz.</div>';
    document.querySelectorAll('[data-task]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('/api/tasks/'+b.dataset.task,'POST',{action:b.dataset.action});await loadTasks();}catch(e){$('#taskList').textContent=e.message;}});
  }catch(e){$('#taskList').textContent=e.message;}
}
setInterval(loadMarkets,2000);
setInterval(()=>{if($('#tasks').classList.contains('active')) loadTasks();},5000);
setInterval(()=>{if(lastSnapshotAt&&Date.now()-lastSnapshotAt>45000){markets=[];renderMarkets();$('#feedBadge').textContent='● VERİ ESKİ';}},1000);
updateTiming();loadMarkets();
