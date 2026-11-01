import {CredentialStore} from '../src/lib/credentials.js';
import {QfexClient} from '../src/lib/qfex.js';
import {probePrivateAccount} from '../src/lib/private-probe.js';
import {fileURLToPath} from 'node:url';
const credentials=await new CredentialStore(fileURLToPath(new URL('../data/qfex.dpapi',import.meta.url))).load();
if(!credentials)throw new Error('Yerel kayıtlı hesap yok.');
console.log(JSON.stringify(await probePrivateAccount(new QfexClient(credentials)),null,2));
