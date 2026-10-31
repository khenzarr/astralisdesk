import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { QfexClient } from "./lib/qfex.js";
import { CredentialStore } from './lib/credentials.js';
import { validateCredentials, inspectAccount } from './lib/connection.js';
import { timing, settings, validateTask } from './lib/volume.js';
import { MarketScanner } from './lib/scanner.js';
import { MarketStream } from './lib/market-stream.js';
import { TaskManager } from './lib/tasks.js';

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT || 4173);
const store = new CredentialStore(fileURLToPath(new URL('../data/qfex.dpapi', import.meta.url)));
let storageError = null;
let stored = null;
try { stored = await store.load(); } catch { storageError = 'Kayıtlı anahtarlar çözülemedi. Aynı Windows kullanıcısıyla açın veya bağlantıyı kaldırıp yeniden ekleyin.'; }
let client = new QfexClient({
  baseUrl: process.env.QFEX_API_BASE,
  apiVersion: process.env.QFEX_API_VERSION,
  ...stored
});
let accountSnapshot = null;
let connectionBusy = false;
const connectionStatus = () => ({ configured: Boolean(client.publicKey && client.secretKey), connected: accountSnapshot?.accountVerified===true, feesVerified:Boolean(accountSnapshot), accountId: client.accountId || '', storageError, snapshot: accountSnapshot, executionMode: 'unavailable' });
const scanner = new MarketScanner(() => client);
scanner.stream=new MarketStream((symbol,book)=>scanner.recordBook(symbol,book));
scanner.stream.start();
const taskManager = new TaskManager(fileURLToPath(new URL('../data/tasks.json', import.meta.url)), scanner);
await taskManager.load();
let scanBusy = false;
async function scanAndEvaluate() {
  if (scanBusy) return;
  scanBusy = true;
  try { await scanner.scan(); await taskManager.tick(); }
  catch { console.error('Piyasa taraması / görev kaydı tamamlanamadı.'); }
  finally { scanBusy = false; }
}
setInterval(scanAndEvaluate, 15000).unref();
setInterval(() => taskManager.tick().catch(() => console.error('Görev durumları kaydedilemedi.')), 5000).unref();
void scanAndEvaluate();

const json = (res, status, payload) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
};

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('İstek çok büyük.'); chunks.push(chunk); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`];
    if (!allowedHosts.includes(req.headers.host)) return json(res, 403, { error: 'Yerel erişim gerekli.' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Farklı kaynak engellendi.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Farklı kaynak engellendi.' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/connection')) {
      if (url.pathname === '/api/connection' && req.method === 'GET') return json(res, 200, connectionStatus());
      if (!['POST', 'DELETE'].includes(req.method) || req.headers['x-local-request'] !== '1') return json(res, 403, { error: 'Yerel uygulama isteği gerekli.' });
      if (connectionBusy) return json(res, 409, { error: 'Bağlantı işlemi sürüyor.' });
      connectionBusy = true;
      try {
        if (url.pathname === '/api/connection' && req.method === 'DELETE') {
          await store.remove();
          client = new QfexClient(); accountSnapshot = null; storageError = null; scanner.invalidate(); void scanAndEvaluate();
          return json(res, 200, connectionStatus());
        }
        if (url.pathname === '/api/connection' && req.method === 'POST') {
          const credentials = validateCredentials(await body(req));
          const candidate = new QfexClient({baseUrl:client.baseUrl,apiVersion:client.apiVersion,...credentials});
          const snapshot = await inspectAccount(candidate);
          await store.save(credentials);
          client = candidate; accountSnapshot = snapshot; storageError = null; scanner.invalidate(); void scanAndEvaluate();
          return json(res, 200, connectionStatus());
        }
        if (url.pathname === '/api/connection/test' && req.method === 'POST') {
          accountSnapshot = null;
          accountSnapshot = await inspectAccount(client);
          return json(res, 200, connectionStatus());
        }
        return json(res, 404, { error: 'Not found' });
      } catch (error) {
        return json(res, 422, { error: error.name === 'TimeoutError' ? 'QFEX yanıt vermedi. Tekrar deneyin.' : error.message, state: connectionStatus() });
      } finally { connectionBusy = false; }
    }
    if (url.pathname === "/api/health") return json(res, 200, { ok: true, executionMode: "unavailable", credentialsConfigured: Boolean(client.publicKey && client.secretKey), scannerAt: scanner.at });
    if (url.pathname === "/api/explorer") {
      const input = Object.fromEntries(url.searchParams);
      if ('holdEnabled' in input) input.holdEnabled = input.holdEnabled === 'true';
      const errors = validateTask(input);
      if (errors.length) return json(res, 422, { errors });
      return json(res, 200, scanner.snapshot(input));
    }
    if (req.method !== 'GET' && url.pathname.startsWith('/api/') && req.headers['x-local-request'] !== '1') return json(res, 403, {error:'Yerel uygulama isteği gerekli.'});
    if (url.pathname === "/api/estimate" && req.method === "POST") {
      const input = await body(req), errors = validateTask(input);
      if (errors.length) return json(res, 422, { errors });
      const snapshot = scanner.snapshot(input);
      return json(res, 200, { timing:timing(input), candidate:snapshot.contracts.find(c=>c.eligible)??null, warning:snapshot.warning });
    }
    if (url.pathname === "/api/tasks" && req.method === "GET") return json(res, 200, { tasks:taskManager.tasks, executionAvailable:false });
    if (url.pathname === "/api/tasks" && req.method === "POST") {
      const input = await body(req);
      const errors = validateTask(input);
      if (errors.length) return json(res, 422, { errors });
      const task = await taskManager.create(settings(input));
      await taskManager.tick();
      return json(res, 201, task);
    }
    if (url.pathname.startsWith('/api/tasks/') && req.method === 'POST') {
      const id=url.pathname.split('/')[3], input=await body(req);
      if(input.action==='start') return json(res,409,{error:'Gerçek emir yürütücüsü henüz bağlı değil. Aday takibi emir göndermez.'});
      try {return json(res,200,await taskManager.action(id,input.action));}
      catch(error) {return json(res,422,{error:error.message});}
    }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "Not found" });

    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const safe = normalize(requested).replace(/^(\.\.[/\\])+/, "");
    const file = join(root, safe);
    if (!file.startsWith(root)) return json(res, 403, { error: "Forbidden" });
    const content = await readFile(file);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return json(res, 404, { error: "Not found" });
    json(res, 500, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`QFEX Volume Desk: http://localhost:${port}`));
