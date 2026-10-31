import http from 'node:http';
import https from 'node:https';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {QfexClient} from './lib/qfex.js';
import {validateCredentials,inspectAccount} from './lib/connection.js';
import {timing,settings,validateTask} from './lib/volume.js';
import {MarketScanner} from './lib/scanner.js';
import {MarketStream} from './lib/market-stream.js';
import {TaskManager} from './lib/tasks.js';
import {CloudStore} from './lib/cloud-store.js';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const dataRoot=process.env.ASTRALIS_DATA_DIR||fileURLToPath(new URL('../data/community/',import.meta.url));
const port=Number(process.env.PORT||8443),proxySecret=process.env.ASTRALIS_PROXY_SECRET||'';
if(!proxySecret)throw new Error('ASTRALIS_PROXY_SECRET gerekli.');
const store=new CloudStore(join(dataRoot,'users.json'),process.env.ASTRALIS_MASTER_KEY);await store.load();
const publicClient=new QfexClient({baseUrl:process.env.QFEX_API_BASE,apiVersion:process.env.QFEX_API_VERSION});
const scanner=new MarketScanner(()=>publicClient);scanner.stream=new MarketStream((symbol,book)=>scanner.recordBook(symbol,book));scanner.stream.start();
const managers=new Map(),attempts=new Map();
const taskManager=async session=>{if(managers.has(session.id))return managers.get(session.id);const view={pinned:[],snapshot:input=>scanner.snapshot(input,session.data.snapshot?.fees||null)};const manager=new TaskManager(join(dataRoot,'tasks',`${session.id}.json`),view);await manager.load();managers.set(session.id,manager);return manager;};
const scan=async()=>{await scanner.scan();for(const manager of managers.values())await manager.tick();scanner.pinned=[...new Set([...managers.values()].flatMap(m=>m.tasks.map(t=>t.candidate?.symbol).filter(Boolean)))];};
setInterval(()=>scan().catch(()=>console.error('Tarama tamamlanamadı.')),15000).unref();setInterval(()=>{for(const m of managers.values())m.tick().catch(()=>{});},5000).unref();void scan();

const json=(res,status,payload,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(payload));};
const requestBody=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('İstek çok büyük.');chunks.push(chunk);}return chunks.length?JSON.parse(Buffer.concat(chunks)):{};};
const cookie=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2));
const status=(session,credentials)=>({configured:Boolean(credentials),connected:session.data.snapshot?.accountVerified===true,feesVerified:Boolean(session.data.snapshot?.fees),accountId:credentials?.accountId||'',snapshot:session.data.snapshot,executionMode:'unavailable',storage:'server-encrypted'});
const rateLimit=id=>{const now=Date.now(),recent=(attempts.get(id)||[]).filter(t=>now-t<600000);if(recent.length>=5)throw new Error('Çok fazla bağlantı denemesi. 10 dakika sonra tekrar deneyin.');recent.push(now);attempts.set(id,recent);};

async function handler(req,res){
  try{
    if(req.url.startsWith('/api/')&&req.headers['x-astralis-proxy']!==proxySecret)return json(res,403,{error:'Yetkisiz ağ geçidi.'});
    const cookies=cookie(req),session=store.session(cookies.astralis_session,true),headers=session.token?{'set-cookie':`astralis_session=${session.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`}:{};
    if(session.token)void store.save();
    const credentials=store.decrypt(session.data.credentials),client=new QfexClient({...credentials,baseUrl:process.env.QFEX_API_BASE,apiVersion:process.env.QFEX_API_VERSION});
    const url=new URL(req.url,'https://backend.invalid'),manager=await taskManager(session);
    if(url.pathname==='/api/health')return json(res,200,{ok:true,executionMode:'unavailable',scannerAt:scanner.at},headers);
    if(url.pathname.startsWith('/api/connection')){
      if(url.pathname==='/api/connection'&&req.method==='GET')return json(res,200,status(session,credentials),headers);
      if(!['POST','DELETE'].includes(req.method))return json(res,405,{error:'Geçersiz yöntem.'},headers);
      if(url.pathname==='/api/connection'&&req.method==='DELETE'){await store.clearCredentials(session);return json(res,200,status(session,null),headers);}
      if(url.pathname==='/api/connection'&&req.method==='POST'){rateLimit(session.id);const next=validateCredentials(await requestBody(req)),candidate=new QfexClient({...next,baseUrl:client.baseUrl,apiVersion:client.apiVersion});const snapshot=await inspectAccount(candidate);await store.setCredentials(session,next,snapshot);return json(res,200,status(session,next),headers);}
      if(url.pathname==='/api/connection/test'&&req.method==='POST'){if(!credentials)throw new Error('Önce anahtarları bağlayın.');rateLimit(session.id);const snapshot=await inspectAccount(client);await store.setCredentials(session,credentials,snapshot);return json(res,200,status(session,credentials),headers);}
    }
    if(url.pathname==='/api/explorer'){const input=Object.fromEntries(url.searchParams);if('holdEnabled'in input)input.holdEnabled=input.holdEnabled==='true';const errors=validateTask(input);if(errors.length)return json(res,422,{errors},headers);return json(res,200,scanner.snapshot(input,session.data.snapshot?.fees||null),headers);}
    if(url.pathname==='/api/estimate'&&req.method==='POST'){const input=await requestBody(req),errors=validateTask(input);if(errors.length)return json(res,422,{errors},headers);const snap=scanner.snapshot(input,session.data.snapshot?.fees||null);return json(res,200,{timing:timing(input),candidate:snap.contracts.find(c=>c.eligible)??null,warning:snap.warning},headers);}
    if(url.pathname==='/api/tasks'&&req.method==='GET')return json(res,200,{tasks:manager.tasks,executionAvailable:false},headers);
    if(url.pathname==='/api/tasks'&&req.method==='POST'){const input=await requestBody(req),errors=validateTask(input);if(errors.length)return json(res,422,{errors},headers);const task=await manager.create(settings(input));await manager.tick();return json(res,201,task,headers);}
    if(url.pathname.startsWith('/api/tasks/')&&req.method==='POST'){const id=url.pathname.split('/')[3],input=await requestBody(req);if(input.action==='start')return json(res,409,{error:'Gerçek emir yürütücüsü henüz bağlı değil.'},headers);return json(res,200,await manager.action(id,input.action),headers);}
    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'Bulunamadı.'},headers);
    const requested=url.pathname==='/'?'index.html':url.pathname.slice(1),safe=normalize(requested).replace(/^(\.\.[/\\])+/,''),file=join(root,safe);if(!file.startsWith(root))return json(res,403,{error:'Yasak.'});
    const content=await readFile(file),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store',...headers});res.end(content);
  }catch(error){json(res,422,{error:error.name==='TimeoutError'?'QFEX yanıt vermedi.':error.message});}
}
let server;
if(process.env.ASTRALIS_TLS_KEY&&process.env.ASTRALIS_TLS_CERT)server=https.createServer({key:await readFile(process.env.ASTRALIS_TLS_KEY),cert:await readFile(process.env.ASTRALIS_TLS_CERT)},handler);else server=http.createServer(handler);
server.listen(port,'0.0.0.0',()=>console.log(`AstralisDesk community backend ready on ${port}`));
