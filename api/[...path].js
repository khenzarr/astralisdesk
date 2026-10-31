import https from 'node:https';

export const config={api:{bodyParser:false}};

export default function handler(req,res){
  const host=req.headers.host,origin=req.headers.origin;
  if(origin&&origin!==`https://${host}`&&origin!==`http://${host}`){res.status(403).json({error:'Farklı kaynak engellendi.'});return;}
  const target=process.env.ASTRALIS_BACKEND_URL,secret=process.env.ASTRALIS_PROXY_SECRET,ca=process.env.ASTRALIS_BACKEND_CA;
  if(!target||!secret||!ca){res.status(503).json({error:'Sunucu bağlantısı yapılandırılmadı.'});return;}
  const url=new URL(req.url,target);
  const upstream=https.request(url,{method:req.method,ca,headers:{'x-astralis-proxy':secret,...(req.headers.cookie?{cookie:req.headers.cookie}:{}),...(req.headers['content-type']?{'content-type':req.headers['content-type']}:{}),'user-agent':'AstralisDesk-Vercel-Proxy/1'}},up=>{
    res.statusCode=up.statusCode||502;
    for(const name of ['content-type','cache-control','set-cookie'])if(up.headers[name])res.setHeader(name,up.headers[name]);
    up.pipe(res);
  });
  upstream.setTimeout(20000,()=>upstream.destroy(new Error('Backend timeout')));
  upstream.on('error',()=>{if(!res.headersSent)res.status(502).json({error:'AstralisDesk sunucusuna ulaşılamadı.'});else res.end();});
  req.pipe(upstream);
}
