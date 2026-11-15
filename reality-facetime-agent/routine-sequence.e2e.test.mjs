// Child runner → loopback HTTP → integrated Python perception. No external provider.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
for(const delay of [100,6200])test(`controlled sequence CLI + HTTP, mock delay ${delay} ms`,{timeout:45000},async()=>{
 const child=spawn(process.execPath,['routine-sequence-cli.mjs','--delay-ms',String(delay)],{stdio:['ignore','pipe','pipe'],env:process.env});
 let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 const summary=stdout.split('\n').filter(s=>s.startsWith('{')).map(s=>JSON.parse(s)).find(s=>s.scope==='CONTROLLED_IMAGE_REPLAY');
 assert.ok(summary,`Missing replay summary; exit=${code}, sanitized stderr=${stderr}`);
 assert.equal(summary.provider,'mock');assert.equal(summary.realWorldVerification,false);
 const report=JSON.parse(await readFile(summary.report,'utf8'));
 if(delay===100){assert.equal(code,0);assert.equal(summary.complete,true);assert.deepEqual(summary.steps,['done','done','done']);assert.equal(summary.rounds,8);
 assert.ok(report.steps.every(s=>s.evidenceFrame?.dataUrl.startsWith('data:image/jpeg;base64,/9j/')));
 }else{assert.equal(code,1);assert.equal(summary.complete,false);assert.deepEqual(report.steps,[]);}
});
