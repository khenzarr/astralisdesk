import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {settings,validateTask,rotationDecision} from './volume.js';

// Live market monitoring only. No synthetic orders, fills, balances or PnL.
// The execution adapter must reconcile fills and flatten before acting on close_then_rotate.
export class TaskManager {
  constructor(path,scanner) {this.path=path;this.scanner=scanner;this.tasks=[];this.queue=Promise.resolve();}
  async load() {
    try {
      const data=JSON.parse(await readFile(this.path,'utf8'));
      if(data.version!==1||!Array.isArray(data.tasks)) throw new Error('Görev dosyası geçersiz.');
      this.tasks=data.tasks.map(t=>({...t,status:'paused',candidate:null,reason:'Sunucu yeniden başladı; takibi yeniden başlatın.'}));
    } catch(e) {if(e.code!=='ENOENT') throw e;}
  }
  async save() {
    await mkdir(dirname(this.path),{recursive:true});
    await writeFile(this.path+'.tmp',JSON.stringify({version:1,tasks:this.tasks},null,2));
    await rename(this.path+'.tmp',this.path);
  }
  serial(fn) {const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
  create(input) {return this.serial(async()=>{
    const errors=validateTask(input);if(errors.length) throw new Error(errors.join(' '));
    if(this.tasks.length>=20) throw new Error('En fazla 20 görev saklanabilir.');
    const task={id:randomUUID(),input:settings(input),createdAt:new Date().toISOString(),status:'monitoring',candidate:null,history:[],executionEnabled:false,reason:'Piyasa taraması bekleniyor.'};
    this.tasks.unshift(task);await this.save();return task;
  });}
  action(id,action) {return this.serial(async()=>{
    const task=this.tasks.find(t=>t.id===id);if(!task) throw new Error('Görev bulunamadı.');
    if(action==='delete') this.tasks=this.tasks.filter(t=>t!==task);
    else if(action==='pause') {task.status='paused';task.candidate=null;task.reason='Takip durduruldu.';}
    else if(action==='resume') {task.status='monitoring';task.reason='Yeniden taranıyor.';}
    else throw new Error('Geçersiz görev işlemi.');
    await this.save();return task;
  });}
  tick() {return this.serial(async()=>{
    for(const task of this.tasks.filter(t=>t.status==='monitoring')) {
      const snapshot=this.scanner.snapshot(task.input);
      const decision=rotationDecision(task.candidate,snapshot.contracts);
      const changed=JSON.stringify(task.candidate)!==JSON.stringify(decision.next);
      if(changed||task.reason!==decision.reason) {
        task.history.unshift({at:new Date().toISOString(),action:decision.action,from:task.candidate,to:decision.next,reason:decision.reason});
        task.history=task.history.slice(0,50);
      }
      task.candidate=decision.next;task.reason=decision.reason;task.checkedAt=new Date().toISOString();
      task.estimate=snapshot.contracts.find(c=>c.symbol===task.candidate?.symbol)?.cycle??null;
    }
    this.scanner.pinned=[...new Set(this.tasks.filter(t=>t.status==='monitoring').map(t=>t.candidate?.symbol).filter(Boolean))];
    if(this.tasks.some(t=>t.status==='monitoring')) await this.save();
  });}
}
