import crypto from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

export class CloudStore {
  constructor(path,masterKey) {
    this.path=path;this.key=Buffer.from(masterKey||'','base64');this.state={version:1,sessions:{}};this.queue=Promise.resolve();
    if(this.key.length!==32) throw new Error('ASTRALIS_MASTER_KEY 32 bayt olmalı.');
  }
  async load() {
    try {const state=JSON.parse(await readFile(this.path,'utf8'));if(state.version!==1||!state.sessions)throw Error();this.state=state;}
    catch(error){if(error.code!=='ENOENT')throw new Error('Topluluk veri kasası açılamadı.');}
  }
  serial(fn){const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
  async save(){return this.serial(async()=>{await mkdir(dirname(this.path),{recursive:true});await writeFile(this.path+'.tmp',JSON.stringify(this.state),{mode:0o600});await rename(this.path+'.tmp',this.path);});}
  session(token,create=true) {
    const id=token?hash(token):null;
    if(id&&this.state.sessions[id]) {this.state.sessions[id].lastSeen=new Date().toISOString();return {id,token:null,data:this.state.sessions[id]};}
    if(!create)return null;
    const next=crypto.randomBytes(32).toString('base64url'),nextId=hash(next),now=new Date().toISOString();
    this.state.sessions[nextId]={createdAt:now,lastSeen:now,credentials:null,snapshot:null};
    return {id:nextId,token:next,data:this.state.sessions[nextId]};
  }
  encrypt(value) {
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);
    const body=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
    return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')};
  }
  decrypt(payload) {
    if(!payload)return null;
    const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(payload.iv,'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag,'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.body,'base64')),decipher.final()]).toString());
  }
  async setCredentials(session,credentials,snapshot){session.data.credentials=this.encrypt(credentials);session.data.snapshot=snapshot;await this.save();}
  async clearCredentials(session){session.data.credentials=null;session.data.snapshot=null;await this.save();}
}
