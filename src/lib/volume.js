export const DEFAULTS = Object.freeze({ venue:'qfex', notional:1000, leverage:2, durationMinutes:1, frequencySeconds:30, cycleSleepMinutes:1, holdEnabled:false, operationSleepMinutes:30, direction:'funding', maxEntryCost:2.5, maxCycleCost:5, maxCostPerMillion:500, maxSpreadBps:10, maxImpactBps:10, maxMoveBps:25, maxBookAgeSeconds:30, maxDailyCost:50, maxPositionLoss:10 });
export const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export function settings(input={}) {
  const p={...DEFAULTS};
  for(const key of Object.keys(p)) if(key in input) p[key]=typeof DEFAULTS[key]==='number'?finite(input[key]):input[key];
  return p;
}
export function validateTask(input) {
  const p=settings(input), errors=[];
  if(p.venue!=='qfex') errors.push('Yalnızca QFEX destekleniyor.');
  for(const key of ['notional','leverage','durationMinutes','frequencySeconds','maxEntryCost','maxCycleCost','maxCostPerMillion','maxSpreadBps','maxImpactBps','maxMoveBps','maxBookAgeSeconds','maxDailyCost','maxPositionLoss']) if(!(p[key]>0)) errors.push(`${key}: pozitif sayı gerekli.`);
  for(const key of ['cycleSleepMinutes','operationSleepMinutes']) if(p[key]===null||p[key]<0) errors.push(`${key}: sıfır veya pozitif olmalı.`);
  if(typeof p.holdEnabled!=='boolean') errors.push('Bekleme seçimi geçersiz.');
  if(!['funding','LONG','SHORT'].includes(p.direction)) errors.push('Yön seçimi geçersiz.');
  if(p.frequencySeconds<30) errors.push('QFEX TWAP sıklığı en az 30 saniye olmalı.');
  if(!Number.isInteger(p.durationMinutes*60/p.frequencySeconds)||p.durationMinutes*60<p.frequencySeconds) errors.push('TWAP süresi sıklığın tam katı olmalı.');
  if(p.maxBookAgeSeconds>60) errors.push('Veri yaşı en fazla 60 saniye olabilir.');
  if(p.durationMinutes>1440||p.operationSleepMinutes>10080||p.cycleSleepMinutes>10080) errors.push('Zamanlama sınırı aşıldı.');
  return errors;
}
export function timing(input={}) {
  const p=settings(input), childOrders=p.durationMinutes*60/p.frequencySeconds+1;
  // Duration spans first to last child: 0, 30, 60 sec for a 1 min TWAP.
  const holdingMinutes=p.holdEnabled?p.operationSleepMinutes:0;
  const cycleMinutes=2*p.durationMinutes+holdingMinutes+p.cycleSleepMinutes;
  const cyclesPerWeek=Math.floor(10080/cycleMinutes);
  return {childOrders,holdingMinutes,cycleMinutes,cyclesPerWeek,weeklyVolume:2*p.notional*cyclesPerWeek};
}
export function normalizeContract(raw,fees={},ref={}) {
  const symbol=raw.ticker_id??raw.symbol, fundingRate=finite(raw.next_funding_rate??raw.funding_rate), intervalMinutes=finite(raw.funding_interval_minutes);
  return {venue:'qfex',symbol,price:finite(raw.last_price),fundingRate,intervalMinutes,
    fundingApr:fundingRate!==null&&intervalMinutes>0?fundingRate*525600/intervalMinutes*100:null,
    nextFundingAt:finite(raw.next_funding_rate_timestamp),volumeUsd:finite(raw.target_volume),openInterestUsd:finite(raw.open_interest_usd),
    makerFee:finite(fees[symbol]?.maker_fee),takerFee:finite(fees[symbol]?.taker_fee),
    signal:fundingRate===null?'UNKNOWN':fundingRate>0?'SHORT':fundingRate<0?'LONG':'NEUTRAL',ref,book:null,bookAt:null,moveBps:null};
}
function levels(rows,desc) {
  return (Array.isArray(rows)?rows:[]).map(r=>[finite(r[0]),finite(r[1])]).filter(([p,q])=>p>0&&q>0).sort((a,b)=>desc?b[0]-a[0]:a[0]-b[0]);
}
function fill(rows,quantity) {
  let left=quantity,value=0;
  for(const [price,size] of rows) {const take=Math.min(left,size);value+=take*price;left-=take;if(left<quantity*1e-10) break;}
  return left>quantity*1e-10?null:value/quantity;
}
export function bookQuote(book,notional) {
  const bids=levels(book?.bids,true),asks=levels(book?.asks,false);
  if(!bids.length||!asks.length||bids[0][0]>=asks[0][0]||!(notional>0)) return null;
  const mid=(bids[0][0]+asks[0][0])/2,quantity=notional/mid,buy=fill(asks,quantity),sell=fill(bids,quantity);
  if(buy===null||sell===null) return null;
  const spreadBps=(asks[0][0]-bids[0][0])/mid*10000;
  return {mid,quantity,buy,sell,spreadBps,impactBps:Math.max(0,(buy-sell)/mid*10000-spreadBps)};
}
export function marketOpen(ref,now=Date.now()) {
  if(ref.status!=='ACTIVE') return false;
  const h=ref.market_hours;if(!h?.tz) return null;
  try {
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:h.tz,weekday:'long',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
    const time=`${p.hour}:${p.minute}:${p.second}`,sessions=h[p.weekday.toLowerCase()];
    return Array.isArray(sessions)?sessions.some(s=>s.session==='open'&&time>=s.open&&time<=s.close):null;
  } catch {return null;}
}
export function evaluateCandidate(c,input={},now=Date.now()) {
  const p=settings(input),reasons=[],schedule=timing(p),quote=bookQuote(c.book,p.notional);
  const age=c.bookAt?(now-c.bookAt)/1000:Infinity;
  // QFEX market_hours describes funding activity, not a ban on 24/7 trading.
  if(c.ref.status!=='ACTIVE') reasons.push('Ürün aktif değil / durumu doğrulanamadı');
  if(c.takerFee===null) reasons.push('Hesap komisyonu bilinmiyor');
  if(!quote) reasons.push('Emir defteri / çift taraflı derinlik yetersiz');
  if(age< -5||age>p.maxBookAgeSeconds) reasons.push('Emir defteri eski veya alınamadı');
  if(c.moveBps===null) reasons.push('Fiyat hareketi ölçümü bekleniyor');
  else if(c.moveBps>p.maxMoveBps) reasons.push('Kısa vadeli fiyat hareketi sınırı aşıldı');
  if(!(c.volumeUsd>0)) reasons.push('İşlem hacmi yok / bilinmiyor');
  if(!(Number(c.ref.default_max_leverage)>=p.leverage)) reasons.push('Kaldıraç sınırı doğrulanamadı / aşıldı');
  const side=p.direction==='funding'?c.signal:p.direction;
  if(!['LONG','SHORT'].includes(side)) reasons.push('Funding yönü yok; manuel yön seçin');
  if(c.fundingRate===null) reasons.push('Funding verisi yok');
  if(quote&&quote.spreadBps>p.maxSpreadBps) reasons.push('Spread sınırı aşıldı');
  if(quote&&quote.impactBps>p.maxImpactBps) reasons.push('Derinlik maliyeti sınırı aşıldı');
  if(quote&&!(quote.quantity/schedule.childOrders>=Number(c.ref.min_quantity))) reasons.push('TWAP alt emri minimum miktardan küçük / kural bilinmiyor');
  let cycle=null;
  if(quote&&c.takerFee!==null) {
    const entryPrice=side==='SHORT'?quote.sell:quote.buy,exitPrice=side==='SHORT'?quote.buy:quote.sell;
    const entryFee=quote.quantity*entryPrice*c.takerFee,exitFee=quote.quantity*exitPrice*c.takerFee;
    const entryCost=entryFee+Math.abs(entryPrice-quote.mid)*quote.quantity,exitCost=exitFee+Math.abs(exitPrice-quote.mid)*quote.quantity;
    // Do not subsidize turnover with unearned funding. Count current-rate adverse settlement only.
    const until=c.nextFundingAt===null?null:c.nextFundingAt-now/1000,exposure=(2*p.durationMinutes+schedule.holdingMinutes)*60;
    const known=until!==null&&until>=0&&c.intervalMinutes>0;
    const settlements=known&&until<=exposure?1+Math.floor((exposure-until)/(c.intervalMinutes*60)):0;
    const fundingCost=c.fundingRate===null?null:settlements*p.notional*Math.max(0,c.fundingRate*(side==='SHORT'?-1:1));
    if(!known) reasons.push('Funding ödeme zamanı eski / bilinmiyor');
    const costPerCycle=entryCost+exitCost+(fundingCost||0),costPerMillion=costPerCycle/(2*p.notional)*1000000;
    cycle={...schedule,entryFee,exitFee,entryCost,exitCost,fundingCost,costPerCycle,costPerMillion,weeklyCost:costPerCycle*schedule.cyclesPerWeek,
      budgetCyclesPerDay:costPerCycle>0?Math.floor(p.maxDailyCost/costPerCycle):null};
    if(entryCost>=p.maxEntryCost) reasons.push('Giriş maliyeti sınırına ulaşıldı');
    if(costPerCycle>p.maxCycleCost) reasons.push('Aç–kapat maliyeti sınırı aşıldı');
    if(costPerMillion>p.maxCostPerMillion) reasons.push('$1M hacim maliyeti sınırı aşıldı');
    if(costPerCycle>p.maxDailyCost) reasons.push('Tek döngü günlük bütçeyi aşıyor');
  }
  return {...c,book:undefined,ref:undefined,fundingHoursActive:marketOpen(c.ref,now),side,quote,cycle,reasons,eligible:reasons.length===0,bookAgeSeconds:Number.isFinite(age)?age:null};
}
export function rankContracts(contracts,input={},now=Date.now()) {
  return contracts.map(c=>evaluateCandidate(c,input,now)).sort((a,b)=>Number(b.eligible)-Number(a.eligible)
    ||(a.cycle?.costPerMillion??Infinity)-(b.cycle?.costPerMillion??Infinity)||(b.volumeUsd??0)-(a.volumeUsd??0));
}
export function rotationDecision(current,candidates,{flat=true,pendingOrders=false}={}) {
  const best=candidates.find(c=>c.eligible),active=candidates.find(c=>c.symbol===current?.symbol&&c.side===current?.side);
  if(current&&!active?.eligible) return !flat||pendingOrders
    ?{action:'close_then_rotate',next:null,reason:'Mevcut aday sınır dışında; kapanış doğrulaması gerekli.'}
    :{action:best?'rotate':'wait',next:best?{symbol:best.symbol,side:best.side}:null,reason:'Mevcut aday sınır dışında.'};
  if(!current) return !flat||pendingOrders?{action:'reconcile',next:null,reason:'Pozisyon / emir mutabakatı gerekli.'}
    :{action:best?'select':'wait',next:best?{symbol:best.symbol,side:best.side}:null,reason:best?'En düşük maliyetli uygun aday.':'Uygun aday yok.'};
  return {action:'keep',next:current,reason:'Mevcut aday sınırlar içinde.'};
}
