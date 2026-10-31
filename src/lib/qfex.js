import crypto from "node:crypto";

export class QfexClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? "https://api.qfex.com";
    this.apiVersion = options.apiVersion ?? "2026-10-29";
    this.publicKey = options.publicKey;
    this.secretKey = options.secretKey;
    this.accountId = options.accountId;
  }

  authHeaders() {
    if (!this.publicKey || !this.secretKey) throw new Error("QFEX credentials are not configured");
    const nonce = crypto.randomBytes(16).toString("hex");
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", this.secretKey).update(`${nonce}:${timestamp}`).digest("hex");
    return {
      "x-qfex-public-key": this.publicKey,
      "x-qfex-nonce": nonce,
      "x-qfex-timestamp": String(timestamp),
      "x-qfex-hmac-signature": signature,
      ...(this.accountId ? { "x-qfex-requested-account-id": this.accountId } : {})
    };
  }

  async get(path, { authenticated = false, query = {} } = {}) {
    const url = new URL(path, this.baseUrl);
    url.searchParams.set("api_version", this.apiVersion);
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") url.searchParams.set(key, value);
    let response;
    for(let attempt=0;attempt<2;attempt++) {
      response = await fetch(url, {
      redirect: 'error',
      headers: authenticated ? this.authHeaders() : {},
      signal: AbortSignal.timeout(8_000)
      });
      if(response.status<500||attempt===1) break;
      await response.body?.cancel();
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    if (!response.ok) {
      const reason=response.status === 401 ? 'Kimlik doğrulaması başarısız. Anahtarları ve bilgisayar saatini kontrol edin.' : response.status === 403 ? 'Erişim reddedildi. Hesap kapsamını, View balance ve View positions izinlerini kontrol edin.' : response.status>=500?'QFEX sunucusu isteği işleyemedi; ikinci deneme de başarısız. Bu yanıt anahtarın yanlış olduğunu tek başına göstermez.':'İstek reddedildi.';
      const error=new Error(`QFEX ${path} · HTTP ${response.status} · ${reason}`);
      error.endpoint=path;error.status=response.status;throw error;
    }
    return response.json();
  }

  contracts() { return this.get("/md/contracts"); }
  reference() { return this.get('/refdata'); }
  orderbook(symbol) { return this.get(`/md/orderbook/${encodeURIComponent(symbol)}`); }
  fees() { return this.get("/user/fees", { authenticated: true }); }
  positions() { return this.get("/user/positions", { authenticated: true }); }
  volume(duration = "1w") { return this.get("/user/volume", { authenticated: true, query: { duration } }); }
}
