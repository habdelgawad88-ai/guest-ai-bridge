'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {policy,authorization}=require('../src/state.cjs');
const {ANONYMOUS_APIS,validateAnonymousAPI,askAnonymousOpenAI,safeMessages}=require('../src/api.cjs');
const {routePlan,guestAuto}=require('../src/router.cjs');
const {guestScan}=require('../src/scanner.cjs');
const {getOne,refreshCatalog}=require('../src/catalog.cjs');
const {handle}=require('../src/protocol.cjs');
const {installAgent}=require('../src/install.cjs');
const registry=policy().providers.filter(p=>p.transport==='openai_compatible');
function response(status,body,type='application/json'){return {status,ok:status>=200&&status<300,headers:{get(k){return k==='content-type'?type:null}},text:async()=>JSON.stringify(body)}}

test('three built-in no-key provider adapters require no setup and no paid model alias',()=>{
 const names=registry.map(x=>x.id);
 assert.deepEqual(names,['jarvisclaw-free','kilo-free','vireonix-free']);
 for(const p of registry){assert.doesNotThrow(()=>authorization(p));assert.doesNotThrow(()=>validateAnonymousAPI(p));assert.equal(ANONYMOUS_APIS[p.url].model,p.model)}
 assert.throws(()=>validateAnonymousAPI({...registry[1],model:'anthropic/claude-opus'}),/Only documented anonymous FREE/);
});
test('all three adapters send their exact free alias without authentication, allow stateless chat',async()=>{
 for(const p of registry){let req;
   const out=await askAnonymousOpenAI(p,'What is 13 × 17?',{history:[{role:'user',content:'Reply briefly'},{role:'assistant',content:'OK'}],system_prompt:'No fluff.',dnsFn:async u=>new URL(u),fetchFn:async(url,init)=>{
     req={url,init};return response(200,{model:p.model,choices:[{message:{role:'assistant',content:'221'}}]});}});
   assert.equal(out.status,'reply');assert.equal(out.reply,'221');assert.equal(req.url,p.url);
   assert.equal(req.init.headers.Authorization,undefined);
   const parsed=JSON.parse(req.init.body);assert.equal(parsed.model,p.model);
   assert.deepEqual(parsed.messages.map(m=>m.role),['system','user','assistant','user']);
 }
});
test('free-only task routing chooses Kilo, then backs off to Vireonix on temporary outage',async()=>{
 const deps={providers:registry,healthStats:{},usageData:{},now:Date.parse('2026-11-22T12:00:00Z'),discover:async()=>({total_candidates:0,shown:0,candidates:[]})};
 const p=await routePlan({message:'Write Python unit tests'},deps);
 assert.equal(p.selected,'kilo-free');
 const called=[];
 const result=await guestAuto({message:'Write Python unit tests',max_attempts:3}, {...deps,ask:async q=>{
  called.push(q.provider_id);return q.provider_id==='kilo-free'?{status:'rate_limited',reply:null}:{status:'reply',reply:'assert add(1,2)==3',model:'auto',method:'documented_public_api'};
 }});
 assert.equal(result.status,'reply');assert.equal(result.provider_id,'vireonix-free');
 assert.deepEqual(called,['kilo-free','vireonix-free']);
});
test('secrets in any chat history are blocked before a network request',async()=>{
 let discovered=false;
 const result=await guestAuto({message:'Summarize the prior chat',history:[{role:'user',content:'Key: sk-proj-abcdefghijklmnop123456789'}]},
   {providers:registry,usageData:{},healthStats:{},discover:async()=>{discovered=true;return {candidates:[]}}});
 assert.equal(result.status,'sensitive_content_blocked');assert.equal(discovered,false);
 assert.throws(()=>safeMessages('X',Array(14).fill({role:'user',content:'Y'})));
});
test('old v0.2 user policy picks up new official API adapters automatically without editing file',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-old-policy-'));
 const filename=path.join(dir,'providers.json');const old={providers:[registry[0],{id:'usingopen',enabled:false,transport:'browser'}]};
 fs.writeFileSync(filename,JSON.stringify(old));
 const before=fs.readFileSync(filename,'utf8');
 const cmd="const x=require('./src/state.cjs').policy();console.log(JSON.stringify(x.providers.map(p=>p.id)))";
 const out=JSON.parse(cp.execFileSync(process.execPath,['-e',cmd],{cwd:path.join(__dirname,'..'),env:{...process.env,GUEST_BRIDGE_POLICY:filename,GUEST_BRIDGE_STATE_DIR:dir},encoding:'utf8'}));
 assert.ok(out.includes('kilo-free')&&out.includes('vireonix-free'));assert.ok(out.includes('usingopen'));
 assert.equal(fs.readFileSync(filename,'utf8'),before);fs.rmSync(dir,{recursive:true,force:true});
});
test('official public catalog filters out paid models',async()=>{
 const c={id:'kilo-free',url:'https://ai-gateway.kilo.ai/api/v1/models',kind:'free_tagged_models'};
 let seen;
 const out=await getOne(c,{dnsFn:async u=>new URL(u),fetchFn:async(url,init)=>{
  seen=init;return response(200,{data:[{id:'cohere/north-mini-code:free',isFree:true,pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']}},{id:'openai/gpt-6.5-paid',isFree:false,pricing:{prompt:'0.002',completion:'0.01'},architecture:{input_modalities:['text'],output_modalities:['text']}},{id:'google/gemma:free',isFree:true,pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']}}]});
 }});
 assert.equal(out.free_model_count,2);assert.equal(seen.headers.Authorization,undefined);
 assert.ok(out.free_model_examples.every(x=>x.endsWith(':free')));
 const all=await refreshCatalog({}, {getOne:async item=>({id:item.id,status:'available'})});
 assert.equal(all.catalogs.length,3);
});
test('automatic browser survey never submits prompts or activates unknown providers',async()=>{
 const inspected=[];
 const result=await guestScan({max_sites:2},{discover:async()=>({candidates:[{name:'AI Playground',url:'https://example.org/chat'},{name:'Chat AI',url:'https://chat.example.com/'},{name:'Install from GitHub',url:'https://github.com/foo'}]}),
 inspect:async a=>{inspected.push(a.url);return {status:'inspected',chat_editors_found:1}}});
 assert.equal(result.checked,2);assert.equal(inspected.length,2);
 assert.equal(result.results.every(x=>x.ready_for_automated_inference===false),true);
});
test('MCP exposes one-call auto, catalog and scan, each with no required provider ID',async()=>{
 const r=await handle({jsonrpc:'2.0',id:22,method:'tools/list'});
 const names=r.result.tools.map(x=>x.name);
 for(const name of ['guest_auto','guest_catalog','guest_scan'])assert.ok(names.includes(name));
 const auto=r.result.tools.find(x=>x.name==='guest_auto');
 assert.deepEqual(auto.inputSchema.required,['message']);assert.equal(auto.inputSchema.properties.max_attempts.default,3);
 assert.ok(auto.inputSchema.properties.history);
});
test('installer returns a one-shot Codex registration command without invoking it in tests',()=>{
 let call;
 const out=installAgent('codex',{spawn:(command,args)=>{call={command,args};return {status:0,stdout:'registered',stderr:''}}});
 assert.equal(out.status,'registered');assert.equal(call.command,'codex');assert.ok(call.args.includes('guest-ai-bridge'));
 assert.equal(installAgent('hermes').status,'manual_config');
});
