// Public market data only; no wallet access or order execution.
const panel=document.createElement('section');
panel.className='card';
panel.innerHTML='<div class="card-head"><div><p class="eyebrow">HYPERLIQUID · KRİPTO</p><h2>Kripto funding piyasaları</h2></div><span id="cryptoStatus">Yükleniyor…</span></div><p class="muted table-note">Hesap bağlamadan canlı fiyat ve funding. Bu liste henüz otomatik işlem seçimine dahil değildir. Funding yönü fiyat tahmini değildir.</p><div class="table-wrap"><table><thead><tr><th>Market</th><th>Mark fiyatı</th><th>Funding / saat</th><th>Funding alan yön</th><th>24 saat hacim</th></tr></thead><tbody id="cryptoRows"></tbody></table></div>';
document.querySelector('#explorer .table-card').before(panel);
panel.style.marginBottom='24px';
const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('tr-TR',{maximumFractionDigits:6}):'—';
let busy=false;
async function refresh(){
 if(busy)return;busy=true;
 try{
  const r=await fetch('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'metaAndAssetCtxs'}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const [meta,ctx]=await r.json();
  if(!Array.isArray(meta?.universe)||!Array.isArray(ctx))throw new Error('Beklenmeyen veri');
  const rows=meta.universe.map((m,i)=>({...m,...ctx[i]})).filter(m=>!m.isDelisted&&m.markPx!=null).sort((a,b)=>Number(b.dayNtlVlm)-Number(a.dayNtlVlm));
  const body=document.querySelector('#cryptoRows');body.replaceChildren();
  for(const m of rows){const tr=document.createElement('tr');for(const value of [m.name,fmt(m.markPx),m.funding==null?'—':fmt(Number(m.funding)*100)+'%',m.funding==null?'—':Number(m.funding)<0?'LONG':Number(m.funding)>0?'SHORT':'NÖTR',fmt(m.dayNtlVlm)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
  document.querySelector('#cryptoStatus').textContent=`${rows.length} market · ${new Date().toLocaleTimeString('tr-TR')} · 15 sn`;
 }catch(e){document.querySelector('#cryptoRows').replaceChildren();document.querySelector('#cryptoStatus').textContent='Kripto verisi alınamadı: '+e.message;}
 finally{busy=false;}
}
void refresh();setInterval(refresh,15000);
