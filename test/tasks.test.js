import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TaskManager} from '../src/lib/tasks.js';
test('persistent real-data monitor selects, rotates, waits and restarts paused',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'qfex-task-test-'));
  const path=join(dir,'tasks.json');
  let candidates=[{symbol:'A',side:'LONG',eligible:true,cycle:{costPerCycle:1}}];
  const scanner={pinned:[],snapshot:()=>({contracts:candidates})};
  try {
    const manager=new TaskManager(path,scanner);await manager.load();
    const task=await manager.create({});await manager.tick();
    assert.equal(task.candidate.symbol,'A');assert.equal(task.executionEnabled,false);
    candidates=[{symbol:'A',side:'LONG',eligible:false},{symbol:'B',side:'SHORT',eligible:true}];
    await manager.tick();assert.equal(task.candidate.symbol,'B');assert.equal(task.history[0].action,'rotate');
    candidates=[];await manager.tick();assert.equal(task.candidate,null);
    const restored=new TaskManager(path,scanner);await restored.load();
    assert.equal(restored.tasks[0].status,'paused');assert.equal(restored.tasks[0].input.operationSleepMinutes,30);
    await restored.action(task.id,'delete');assert.equal(restored.tasks.length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
