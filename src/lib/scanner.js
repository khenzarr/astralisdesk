import { normalizeContract, bookQuote, rankContracts } from './volume.js';

export function mergeMarkets(raw, refs, fees={}) {
  const reference=new Map(refs.map(r=>[r.symbol,r]));
  const live=new Map(raw.map(r=>[r.ticker_id,r]));
  return [...new Set([...reference.keys(),...live.keys()])].map(symbol=>({
    ...normalizeContract(live.get(symbol)??{ticker_id:symbol},fees,reference.get(symbol)),
    hasContract:live.has(symbol),category:reference.get(symbol)?.product_category??'UNKNOWN'
  }));
}

export class MarketScanner {
  constructor(getClient) {
    this.getClient=getClient;this.contracts=[];this.books=new Map();this.history=new Map();
    this.at=0;this.warning='İlk QFEX taraması bekleniyor.';this.busy=false;this.cursor=0;this.pass=0;this.pinned=[];this.generation=0;
  }
  invalidate() { this.generation++; this.at=0; this.contracts=[]; this.warning='Hesap değişti; ücretler yeniden okunuyor.'; }
  recordBook(symbol,book) {
    const now=Date.now();
    if(book.ticker_id!==symbol||!Number.isFinite(book.timestamp)||book.timestamp<(this.books.get(symbol)?.bookAt??0))return;
    this.books.set(symbol,{book,bookAt:book.timestamp});
    const q=bookQuote(book,1);
    if(q&&now-book.timestamp<=30000&&now-book.timestamp>=-5000) {
      const points=(this.history.get(symbol)||[]).filter(x=>now-x.at<=60000);
      if(!points.some(x=>x.at===book.timestamp))points.push({at:book.timestamp,mid:q.mid});
      this.history.set(symbol,points);
    }
  }
  async scan() {
    if(this.busy) return;
    this.busy=true;
    const generation=this.generation,client=this.getClient();
    try {
      const results=await Promise.allSettled([client.contracts(),client.reference(),client.publicKey?client.fees():Promise.reject(new Error('Hesap bağlı değil'))]);
      if(results[0].status==='rejected'||results[1].status==='rejected') throw new Error('QFEX piyasa verisi alınamadı.');
      const raw=results[0].value.data,refs=results[1].value.data;
      if(!Array.isArray(raw)||!Array.isArray(refs)) throw new Error('QFEX veri biçimi doğrulanamadı.');
      const fees=results[2].status==='fulfilled'?results[2].value.fees??{}:{};
      const bySymbol=new Map(refs.map(r=>[r.symbol,r]));
      const contracts=mergeMarkets(raw,refs,fees);
      const ordered=contracts.filter(c=>c.hasContract).sort((a,b)=>(b.volumeUsd??0)-(a.volumeUsd??0));
      // Refresh liquid/pinned candidates each pass; rotate remaining markets without a request storm.
      const rotating=Array.from({length:Math.min(12,ordered.length)},(_,i)=>ordered[(this.cursor+i)%ordered.length]?.symbol);
      // Keep each rotating group for three passes so its movement can actually be measured.
      if (++this.pass % 3 === 0) this.cursor=(this.cursor+12)%Math.max(1,ordered.length);
      const symbols=this.stream?.status().connected?[]:[...new Set([...this.pinned,...ordered.slice(0,12).map(c=>c.symbol),...rotating])].filter(s=>bySymbol.has(s));
      let cursor=0;
      await Promise.all(Array.from({length:3},async()=>{
        while(cursor<symbols.length) {
          const symbol=symbols[cursor++];
          try {
            const book=await client.orderbook(symbol);
            if(book.ticker_id!==symbol||!Number.isFinite(book.timestamp)) throw new Error('Invalid book');
            this.recordBook(symbol,book);
          } catch {this.books.delete(symbol);this.history.delete(symbol);}
          await new Promise(resolve=>setTimeout(resolve,300));
        }
      }));
      if(generation!==this.generation) return;
      this.contracts=contracts;this.at=Date.now();
      this.warning=results[2].status==='rejected'?'Piyasa verisi alınıyor. Hesap komisyonları için Hesap Bağlantısı sekmesinden bağlantıyı doğrulayın; o zamana kadar maliyet ve aday seçimi hesaplanamaz.':null;
    } catch(error) {
      if(generation!==this.generation) return;
      this.contracts=[];this.at=0;this.warning=error.message;
    } finally {this.busy=false;}
  }
  snapshot(input={}) {
    const now=Date.now(),stale=!this.at||now-this.at>45000;
    const rows=stale?[]:this.contracts.map(c=>{
      const points=(this.history.get(c.symbol)||[]).filter(x=>now-x.at<=60000);
      const prices=points.map(x=>x.mid),enough=points.length>=2&&Math.max(...points.map(x=>x.at))-Math.min(...points.map(x=>x.at))>=5000;
      return {...(this.stream?.overlay(c,now)??c),...this.books.get(c.symbol),moveBps:enough?(Math.max(...prices)-Math.min(...prices))/Math.min(...prices)*10000:null};
    });
    const stream=this.stream?.status(now);
    return {at:this.at,source:stale?'unavailable':stream?.connected?'qfex-websocket':'qfex-rest',stream,scanIntervalSeconds:15,scanning:this.busy,
      warning:stale?'Piyasa verisi yok veya güncel değil. İşlem adayı seçilmiyor.':this.warning,
      coverage:`QFEX kataloğu: ${rows.length} market; REST fiyat/funding: ${rows.filter(c=>c.hasContract).length}. ${stream?.connected?`WebSocket açık: ${stream.symbols} ürünün istatistikleri; tüm ürünlerde 500 ms derinlik yayınına abonelik, toplu istatistikler 10 sn. Ekran 2 sn aralıkla yenilenir.`:'WebSocket bekleniyor / bağlantı yok. REST yedeği: en likit 12 market ve görev adayı her tur; diğerleri 12’li gruplarla taranır.'} Kategoriler: ${[...new Set(rows.map(c=>c.category))].join(', ')}. Eski veya eksik veri uygun sayılmaz.`,
      contracts:rankContracts(rows,input,now)};
  }
}
