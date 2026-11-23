'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});

test('local OpenAI-compatible free proxy requires local token, advertises only guest-auto and rejects paid/tool requests', {timeout:16000}, async()=>{
 const port=await freePort(),secret='test-local-guest-router-token-01234567890123456789';
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'free-ai-proxy-test-'));
 const proc=cp.spawn(process.execPath,[path.join(__dirname,'../src/proxy.cjs')],{
   env:{...process.env,GUEST_BRIDGE_PROXY_PORT:String(port),GUEST_BRIDGE_PROXY_TOKEN:secret,GUEST_BRIDGE_STATE_DIR:tmp},stdio:['ignore','pipe','pipe']});
 try{
   let ready=false;
   for(let i=0;i<100;i++){
     try{const r=await fetch('http://127.0.0.1:'+port+'/healthz',{signal:AbortSignal.timeout(300)});if(r.status===200){ready=true;break}}catch{}
     await new Promise(r=>setTimeout(r,50));
   }
   assert.ok(ready,'proxy failed to start');
   const base='http://127.0.0.1:'+port+'/v1';
   let r=await fetch(base+'/models');assert.equal(r.status,401);
   r=await fetch(base+'/models',{headers:{Authorization:'Bearer '+secret}});assert.equal(r.status,200);
   assert.deepEqual((await r.json()).data.map(x=>x.id),['guest-auto']);
   async function post(body){return fetch(base+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body)})}
   r=await post({model:'anthropic/claude-opus-4.6',messages:[{role:'user',content:'Hello'}]});assert.equal(r.status,400);
   r=await post({model:'guest-auto',messages:[{role:'user',content:'Hello'}],tools:[{type:'function',function:{name:'a'}}]});assert.equal(r.status,400);
   r=await post({model:'guest-auto',messages:[{role:'user',content:['image']}]});assert.equal(r.status,400);
 }finally{proc.kill('SIGTERM');fs.rmSync(tmp,{recursive:true,force:true})}
});
