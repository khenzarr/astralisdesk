import {CredentialStore} from '../src/lib/credentials.js';
import {QfexClient} from '../src/lib/qfex.js';
import {probePrivateAccount} from '../src/lib/private-probe.js';
import {fileURLToPath} from 'node:url';
const credentials=await new CredentialStore(fileURLToPath(new URL('../data/qfex.dpapi',import.meta.url))).load();
if(!credentials)throw new Error('Yerel kayıtlı hesap yok.');
console.log(JSON.stringify(await probePrivateAccount(new QfexClient(credentials)),null,2));
for(const apiVersion of ['2026-10-29','2026-10-30']) {
 try {const data=await new QfexClient({...credentials,apiVersion}).positions();console.log(JSON.stringify({apiVersion,positionsResponse:true,balancePresent:Boolean(data.balance),positionsList:Array.isArray(data.positions)||data.positions===null}));}
 catch(e){console.log(JSON.stringify({apiVersion,positionsResponse:false,status:e.status??null}));}
}
