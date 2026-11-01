// Diagnostic only. A subscription ACK is never proof of a flat account.
export function probePrivateAccount(client,{Socket=WebSocket,timeoutMs=8000}={}) {
  return new Promise(resolve=>{
    const result={opened:false,frames:0,messageShapes:[],authenticated:false,subscriptions:[],positionMessages:0,balanceReceived:false,ordersReceived:false,positionsComplete:false,error:null};
    let socket,done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);result.error=error;try{socket?.close();}catch{}resolve(result);};
    const timer=setTimeout(()=>finish(result.authenticated?null:result.opened?'Özel akış auth yanıtı zaman aşımına uğradı.':'Özel akış bağlantı açılışı zaman aşımına uğradı.'),timeoutMs);
    try {
      socket=new Socket('wss://trade.qfex.com?api_key='+encodeURIComponent(client.publicKey));
      socket.onopen=()=>{
        result.opened=true;
        try {const h=client.authHeaders();socket.send(JSON.stringify({type:'auth',params:{hmac:{public_key:client.publicKey,nonce:h['x-qfex-nonce'],unix_ts:Number(h['x-qfex-timestamp']),signature:h['x-qfex-hmac-signature']},...(client.accountId?{account_id:client.accountId}:{})}}));}
        catch{finish('Özel akış imzalanamadı.');}
      };
      socket.onmessage=e=>{
        if(done)return;
        try {
          const m=JSON.parse(e.data);
          result.frames++;
          // Record only known protocol field presence, never arbitrary keys or values.
          const shape=['type','result','error','err','authenticated','auth','subscribed','position_response','balance_response','all_orders_response'].filter(k=>Object.hasOwn(m,k)).join(',');
          if(!result.messageShapes.includes(shape))result.messageShapes.push(shape);
          if(m.err||m.type==='error'||m.type==='Err')return finish('QFEX özel akış isteğini reddetti.');
          if(typeof m.authenticated==='boolean'||m.type==='auth'){
            const accepted=typeof m.authenticated==='boolean'?m.authenticated:m.result==='success';
            if(!accepted)return finish('Özel akış kimlik doğrulaması reddedildi.');
            if(result.authenticated)return;
            result.authenticated=true;
            socket.send(JSON.stringify({type:'subscribe',params:{channels:['positions','balances','order_responses']}}));
            socket.send(JSON.stringify({type:'get_user_orders',params:{limit:1000,offset:0}}));
          }
          if(!result.authenticated)return;
          if(['positions','balances','order_responses'].includes(m.subscribed)&&!result.subscriptions.includes(m.subscribed))result.subscriptions.push(m.subscribed);
          if(typeof m.position_response?.symbol==='string')result.positionMessages++;
          if(m.balance_response&&typeof m.balance_response==='object')result.balanceReceived=true;
          if(Array.isArray(m.all_orders_response?.orders)&&Array.isArray(m.all_orders_response?.twaps))result.ordersReceived=true;
          // No upstream strings/account payloads retained or returned.
        }catch{finish('Özel akış mesajı işlenemedi.');}
      };
      socket.onerror=()=>finish('Özel akış bağlantısı kurulamadı.');
      socket.onclose=()=>finish('Özel akış bağlantısı kapandı.');
    }catch{finish('Özel akış başlatılamadı.');}
  });
}
