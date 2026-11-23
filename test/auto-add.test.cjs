'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {askGradioSpace}=require('../src/gradio.cjs');

const goodSpec={paths:{
 '/gradio_api/call/v2/chat':{post:{summary:'Chat with the language model',requestBody:{content:{'application/json':{schema:{type:'object',properties:{message:{type:'string'},temperature:{type:'number'},max_new_tokens:{type:'number'}}}}}}}},
 '/gradio_api/call/chat/{event_id}':{get:{description:'SSE results'}}
}};
const list=[{id:'open/chat-with-llm',sdk:'gradio',private:false,subdomain:'open-chat-with-llm'}];
const details={id:'open/chat-with-llm',sdk:'gradio',private:false,subdomain:'open-chat-with-llm',runtime:{stage:'RUNNING'},cardData:{title:'Example Chat LLM'}};
function fixture({spec=goodSpec,items=list,detail=details,probeStatus='reply',probeText='221'}={}){
 const calls=[], asks=[];
 const fetchImpl=async (url,opts)=>{
  calls.push([url,opts]);
  if(url.includes('/api/spaces?'))return Response.json(items);
  if(url.includes('/api/spaces/'))return Response.json(detail);
  if(url.endsWith('/gradio_api/openapi.json'))return Response.json(spec);
  throw Error('Unexpected URL '+url);
 };
 return {calls,asks,deps:{fetchImpl,dnsVerify:async url=>new URL(url),probe:async(p,prompt)=>{asks.push({p,prompt});return {status:probeStatus,reply:probeText}}}};
}
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gbridge-admit-'));const policyFile=path.join(dir,'providers.json');return {dir,policyFile,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};}

test('OpenAPI selection accepts a narrow public text-chat endpoint only',()=>{
 const {selectChatEndpoint}=require('../src/auto-add.cjs');
 assert.deepEqual(selectChatEndpoint(goodSpec),{api_name:'chat',input_field:'message',api_params:['temperature','max_new_tokens']});
 assert.equal(selectChatEndpoint({paths:{'/gradio_api/call/v2/chat':goodSpec.paths['/gradio_api/call/v2/chat']}}),null);
 const impossible=structuredClone(goodSpec); impossible.paths['/gradio_api/call/v2/chat'].post.requestBody.content['application/json'].schema.required=['message','image_url'];
 assert.equal(selectChatEndpoint(impossible),null);
 const upload={paths:{'/gradio_api/call/v2/login':{post:{summary:'Login endpoint',requestBody:{content:{'application/json':{schema:{properties:{message:{type:'string'}}}}}}}},'/gradio_api/call/login/{event_id}':{get:{}}}};
 assert.equal(selectChatEndpoint(upload),null);
});

test('chat endpoints accepting a standard messages array are safely shaped',()=>{
 const {selectChatEndpoint}=require('../src/auto-add.cjs');
 const {gradioBody}=require('../src/gradio.cjs');
 const s=structuredClone(goodSpec);
 s.paths['/gradio_api/call/v2/chat'].post.requestBody.content['application/json'].schema={properties:{messages:{type:'array',items:{type:'object'}},thinking:{type:'boolean'}}};
 const ep=selectChatEndpoint(s);
 assert.deepEqual(ep,{api_name:'chat',input_field:'messages',api_params:['thinking']});
 assert.deepEqual(gradioBody(ep,'What is 117 plus 104?'),{messages:[{role:'user',content:'What is 117 plus 104?'}],thinking:false});
});

test('auto admission adds only verified running public Gradio chat, preserving unrelated configuration',async(t)=>{
 const tmp=temp();t.after(tmp.cleanup);
 fs.writeFileSync(tmp.policyFile,JSON.stringify({schema_version:2,providers:[{id:'usingopen',enabled:false,notes:'KEEP'}, {id:'kilo-free',enabled:false,notes:'user disabled'}]}));
 const fx=fixture();const {discoverAndAdd}=require('../src/auto-add.cjs');
 const result=await discoverAndAdd({max_checks:3,max_probes:2,force:true},{...fx.deps,stateDir:tmp.dir,policyFile:tmp.policyFile});
 assert.equal(result.status,'scanned');assert.equal(result.added.length,1);assert.equal(fx.asks.length,1);
 assert.match(fx.asks[0].prompt,/117\s*\+\s*104/);assert.doesNotMatch(fx.asks[0].prompt,/221/);
 const out=JSON.parse(fs.readFileSync(tmp.policyFile,'utf8'));
 assert.equal(out.providers.length,3);assert.equal(out.providers.find(x=>x.id==='kilo-free').enabled,false);
 assert.equal(out.providers.find(x=>x.id==='usingopen').notes,'KEEP');
 const added=out.providers[2];assert.equal(added.transport,'gradio_space');assert.equal(added.enabled,true);
 assert.equal(added.url,'https://open-chat-with-llm.hf.space/');assert.equal(added.api_name,'chat');assert.equal(added.input_field,'message');
 assert.equal(added.auto_discovered,true);assert.match(added.auto_verified_at,/Z$/);assert.equal(added.policy_evidence,'https://huggingface.co/docs/hub/spaces-api-endpoints');
});

test('provider with worker error, malformed schema or private Space is never admitted',async(t)=>{
 for(const scenario of [
  {probeStatus:'provider_error',probeText:null},
  {spec:{paths:{}}},
  {detail:{...details,private:true}},
  {detail:{...details,runtime:{stage:'SLEEPING'}}}
 ]){
  const tmp=temp();t.after(tmp.cleanup);const fx=fixture(scenario);
  const {discoverAndAdd}=require('../src/auto-add.cjs');
  const result=await discoverAndAdd({max_checks:2,max_probes:1,force:true},{...fx.deps,stateDir:tmp.dir,policyFile:tmp.policyFile});
  assert.equal(result.added.length,0);
  assert.equal(fs.existsSync(tmp.policyFile),false);
 }
});

test('auto discovery throttles repeated scans without network and does not overwrite user disabled route',async(t)=>{
 const tmp=temp();t.after(tmp.cleanup);const fx=fixture();const {discoverAndAdd}=require('../src/auto-add.cjs');
 const opt={max_checks:2,max_probes:1};const dep={...fx.deps,stateDir:tmp.dir,policyFile:tmp.policyFile};
 const first=await discoverAndAdd(opt,dep);assert.equal(first.added.length,1);
 const length=fx.calls.length;
 const second=await discoverAndAdd(opt,dep);assert.equal(second.status,'cached');assert.equal(fx.calls.length,length);
 const conf=JSON.parse(fs.readFileSync(tmp.policyFile));conf.providers.find(p=>p.auto_discovered).enabled=false;
 fs.writeFileSync(tmp.policyFile,JSON.stringify(conf));
 await discoverAndAdd({...opt,force:true},dep);
 assert.equal(JSON.parse(fs.readFileSync(tmp.policyFile)).providers.find(p=>p.auto_discovered).enabled,false);
});

test('automatic scans skip recently verified providers to search for more',async(t)=>{
 const tmp=temp();t.after(tmp.cleanup);const fx=fixture();
 const {discoverAndAdd}=require('../src/auto-add.cjs');
 const deps={...fx.deps,stateDir:tmp.dir,policyFile:tmp.policyFile};
 const first=await discoverAndAdd({force:true},deps);assert.equal(first.added.length,1);
 const second=await discoverAndAdd({force:true},deps);
 assert.equal(second.added.length,0);assert.equal(fx.asks.length,1);
});
test('unavailable discovery is reported, cached briefly and leaves policy untouched',async(t)=>{
 const tmp=temp();t.after(tmp.cleanup);const {discoverAndAdd}=require('../src/auto-add.cjs');
 let calls=0;const deps={stateDir:tmp.dir,policyFile:tmp.policyFile,dnsVerify:async url=>new URL(url),fetchImpl:async()=>{calls++;throw Error('Offline')},probe:async()=>{throw Error('not called')}};
 const first=await discoverAndAdd({},deps);assert.equal(first.status,'source_unavailable');assert.equal(calls,1);assert.equal(fs.existsSync(tmp.policyFile),false);
 const second=await discoverAndAdd({},deps);assert.equal(second.status,'cached');assert.equal(calls,1);
});
test('admission preserves a private backup of an existing policy file',async(t)=>{
 const tmp=temp();t.after(tmp.cleanup);fs.writeFileSync(tmp.policyFile,JSON.stringify({providers:[{id:'my-route',enabled:false}]}));
 const {discoverAndAdd}=require('../src/auto-add.cjs');
 const fx=fixture();await discoverAndAdd({}, {...fx.deps,stateDir:tmp.dir,policyFile:tmp.policyFile});
 const backups=fs.readdirSync(tmp.dir).filter(f=>f.includes('.before-auto-'));
 assert.equal(backups.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(tmp.dir,backups[0]))).providers[0].id,'my-route');
});
test('stale auto discovered routes are not eligible for inference',()=>{
 const {authorization}=require('../src/state.cjs');
 const p={id:'hf-a',url:'https://safe-public.hf.space/',transport:'gradio_space',enabled:true,automation_authorized:true,policy_reviewed:true,policy_evidence:'https://huggingface.co/docs/hub/spaces-api-endpoints',policy_reviewed_at:'2026-11-23',daily_max:2,auto_discovered:true,auto_verified_at:'2020-01-01T00:00:00.000Z'};
 assert.throws(()=>authorization(p),/reverification|expired|stale/i);
 assert.doesNotThrow(()=>authorization({...p,auto_verified_at:new Date().toISOString()}));
});

test('Gradio transport forms body from documented OpenAPI properties for auto-added routes',async()=>{
 const calls=[];const fetchImpl=async(url,options)=>{
  calls.push({url,options});return calls.length===1?Response.json({event_id:'abcdef012345'}):new Response('event: complete\ndata: ["221"]\n\n',{headers:{'Content-Type':'text/event-stream'}});
 };
 const p={url:'https://open-chat-with-llm.hf.space/',api_name:'chat',input_field:'message',api_params:['temperature'],timeout_seconds:4};
 const result=await askGradioSpace(p,'117+104',{fetchImpl});
 assert.equal(result.status,'reply');assert.equal(result.reply,'221');
 assert.deepEqual(JSON.parse(calls[0].options.body),{message:'117+104',temperature:0.3});
});

test('default automatic scan uses a meaningful probe budget and completed answer is not an echo',async(t)=>{
 const tmp=temp();t.after(tmp.cleanup);
 const fx=fixture({probeText:'What is 117 + 104? Reply with only the integer.'});
 const {discoverAndAdd}=require('../src/auto-add.cjs');
 const result=await discoverAndAdd({}, {...fx.deps,stateDir:tmp.dir,policyFile:tmp.policyFile});
 assert.equal(result.probed,1);assert.equal(result.added.length,0);
});
test('MCP exposes a bounded self-admission tool and personal profile keeps low overhead',async()=>{
 const {handle}=require('../src/protocol.cjs');
 const result=await handle({jsonrpc:'2.0',id:2,method:'tools/list'});
 const item=result.result.tools.find(t=>t.name==='guest_expand');
 assert.ok(item);assert.equal(item.inputSchema.properties.max_checks.maximum,15);
});
