'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const cp=require('node:child_process');const path=require('node:path');const net=require('node:net');
const secret='A-LOCAL-TESTING-ONLY-TOKEN-DO-NOT-DEPLOY-'+Math.random().toString(36);
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{let port=s.address().port;s.close(()=>resolve(port))})})}
test('experimental HTTP MCP: requires bearer secret, verifies headers, returns tools', {timeout:12000},async()=>{
 const port=await freePort();const child=cp.spawn(process.execPath,[path.join(__dirname,'../src/http.cjs')],{env:{...process.env,GUEST_BRIDGE_HTTP_TOKEN:secret,GUEST_BRIDGE_HTTP_PORT:String(port)},stdio:['ignore','pipe','pipe']});
 try {
  let ready=false;
  for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/healthz',{signal:AbortSignal.timeout(300)});if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}
  assert.equal(ready,true);
  const url='http://127.0.0.1:'+port+'/mcp';const h={'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'};
  const body={jsonrpc:'2.0',id:2,method:'tools/list'};
  let resp=await fetch(url,{method:'POST',headers:h,body:JSON.stringify(body)});assert.equal(resp.status,401);
  resp=await fetch(url,{method:'POST',headers:{...h,Authorization:'Bearer '+secret,Origin:'https://untrusted.invalid'},body:JSON.stringify(body)});assert.equal(resp.status,403);
  resp=await fetch(url,{method:'POST',headers:{...h,Authorization:'Bearer '+secret},body:JSON.stringify(body)});assert.equal(resp.status,200);assert.ok((await resp.json()).result.tools.some(x=>x.name==='guest_ask'));
  let b26={jsonrpc:'2.0',id:3,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}};
  resp=await fetch(url,{method:'POST',headers:{...h,Authorization:'Bearer '+secret,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/list'},body:JSON.stringify(b26)});assert.equal(resp.status,200);
  resp=await fetch(url,{method:'POST',headers:{...h,Authorization:'Bearer '+secret,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call'},body:JSON.stringify(b26)});assert.equal(resp.status,400);
 } finally{child.kill('SIGTERM')}
});
