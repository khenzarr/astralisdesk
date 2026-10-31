const number = v => v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const fresh = (at,now) => Number.isFinite(at)&&now-at>=-5000&&now-at<=30000;

// Public, read-only MDS. Each level2/market_stats message is a full snapshot.
export class MarketStream {
  constructor(onBook,Socket=WebSocket) {
    this.onBook=onBook;this.Socket=Socket;this.rows=new Map();this.socket=null;
    this.connected=false;this.lastAt=0;this.sequence=-1;this.stopped=true;this.retry=0;
  }
  start() {this.stopped=false;this.connect();}
  stop() {this.stopped=true;clearTimeout(this.timer);clearInterval(this.watchdog);this.socket?.close();this.connected=false;this.rows.clear();}
  connect() {
    if(this.stopped) return;
    this.rows.clear();this.sequence=-1;this.lastAt=0;
    const socket=this.socket=new this.Socket('wss://mds.qfex.com');
    const opened=Date.now();
    socket.onopen=()=>{this.connected=true;socket.send(JSON.stringify({type:'subscribe',channels:['market_stats','level2'],symbols:['*']}));};
    socket.onmessage=e=>{if(socket!==this.socket)return;try{this.accept(JSON.parse(e.data));}catch{/* Invalid frames never replace valid data. */}};
    socket.onerror=()=>socket.close();
    socket.onclose=()=>{
      if(socket!==this.socket)return;
      this.connected=false;this.rows.clear();clearInterval(this.watchdog);
      if(!this.stopped)this.timer=setTimeout(()=>this.connect(),Math.min(30000,1000*2**Math.min(this.retry++,5)));
    };
    this.watchdog=setInterval(()=>{if(Date.now()-(this.lastAt||opened)>30000)socket.close();},5000);
    this.watchdog.unref?.();
  }
  accept(message,now=Date.now()) {
    if(!['market_stats','level2'].includes(message.type))return;
    if(!Number.isFinite(message.sequence)||message.sequence<=this.sequence)return;
    const at=Date.parse(message.time);
    if(!fresh(at,now))return;
    this.sequence=message.sequence;this.lastAt=now;this.retry=0;
    if(message.type==='level2') {
      if(typeof message.symbol!=='string'||!Array.isArray(message.bid)||!Array.isArray(message.ask))return;
      this.onBook(message.symbol,{ticker_id:message.symbol,timestamp:at,bids:message.bid,asks:message.ask});
      return;
    }
    const next=message.symbol==='*'?new Map():new Map(this.rows);
    const put=(symbol,values)=>{if(typeof symbol==='string')next.set(symbol,{...next.get(symbol),...values});};
    for(const row of message.mark_prices??[])put(row.symbol,{price:number(row.price),priceAt:Date.parse(row.time)});
    for(const row of message.funding_rates??[]) {
      const rate=number(row.funding_rate),remaining=number(row.time_remaining),fundingAt=Date.parse(row.time);
      put(row.symbol,{fundingRate:rate,fundingAt,intervalMinutes:60,fundingApr:rate===null?null:rate*8760*100,
        nextFundingAt:remaining===null?null:fundingAt/1000+remaining,signal:rate===null?'UNKNOWN':rate>0?'SHORT':rate<0?'LONG':'NEUTRAL'});
    }
    for(const row of message.daily_volumes_notional??[])put(row.symbol,{volumeUsd:number(row.volume),volumeAt:at});
    this.rows=next;
  }
  overlay(contract,now=Date.now()) {
    const row=this.rows.get(contract.symbol);
    if(!this.connected||!row||now-this.lastAt>30000)return contract;
    const fundingFresh=fresh(row.fundingAt,now);
    return {...contract,price:fresh(row.priceAt,now)?row.price:contract.price,
      volumeUsd:fresh(row.volumeAt,now)?row.volumeUsd:contract.volumeUsd,
      fundingRate:fundingFresh?row.fundingRate:contract.fundingRate??null,fundingApr:fundingFresh?row.fundingApr:contract.fundingApr??null,
      signal:fundingFresh?row.signal:contract.signal??'UNKNOWN',nextFundingAt:fundingFresh?row.nextFundingAt:contract.nextFundingAt??null,
      intervalMinutes:fundingFresh?60:contract.intervalMinutes,liveFundingAt:fundingFresh?row.fundingAt:null};
  }
  status(now=Date.now()) {return {connected:this.connected&&now-this.lastAt<=30000,lastAt:this.lastAt,symbols:this.rows.size};}
}
