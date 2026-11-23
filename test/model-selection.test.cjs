'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {getOne}=require('../src/catalog.cjs');
const {askAnonymousOpenAI}=require('../src/api.cjs');
const {guestAuto}=require('../src/router.cjs');
const {policy}=require('../src/state.cjs');
const kilo=policy().providers.find(p=>p.id==='kilo-free');
const jarvis=policy().providers.find(p=>p.id==='jarvisclaw-free');
const freeId='nvidia/nemotron-3.5-lightning:free';
const rawModels=[
 {id:'kilo-auto/free',name:'Auto Free',isFree:true,pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']},context_length:256000},
 {id:freeId,name:'Nemotron Lightning (free)',isFree:true,pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']},context_length:1000000},
 {id:'anthropic/claude-opus-5.5',name:'Claude Opus 5.5',isFree:false,pricing:{prompt:'0.000004',completion:'0.00002'},architecture:{input_modalities:['text'],output_modalities:['text']},context_length:1000000},
 {id:'stealth/glyph-cluster',name:'Claimed free but no anonymous tag',isFree:true,pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']},context_length:256000},
 {id:'bad/priced:free',name:'Misleading free suffix',isFree:true,pricing:{prompt:'0.01',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']}},
 {id:'bad/incomplete:free',name:'Incomplete metadata',pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']}},
 {id:'bad/image-only:free',name:'Image only',isFree:true,pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['image'],output_modalities:['image']}}
];
const asResponse=(data)=>({status:200,ok:true,headers:{get(k){return k==='content-type'?'application/json':null}},text:async()=>JSON.stringify(data)});
const catalogs={checked_at:Date.now(),from_cache:false,catalogs:[{id:'kilo-free',status:'available',models_total:rawModels.length,free_models:[{id:freeId,name:'Nemotron Lightning (free)',context_length:1000000},{id:'kilo-auto/free',name:'Auto Free',context_length:256000}],frontier_models:[{id:'anthropic/claude-opus-5.5',name:'Claude Opus 5.5',context_length:1000000}]},{id:'vireonix-free',status:'available',models:['auto']}]};

test('official Kilo catalog allows only truly zero-priced tagged, text-capable free models',async()=>{
 const result=await getOne({id:'kilo-free',url:'https://ai-gateway.kilo.ai/api/v1/models',kind:'free_tagged_models'},{dnsFn:async x=>new URL(x),fetchFn:async()=>asResponse({data:rawModels})});
 assert.equal(result.status,'available');
 assert.deepEqual(result.free_models.map(x=>x.id),['kilo-auto/free',freeId]);
 assert.ok(result.frontier_models.some(x=>x.id==='anthropic/claude-opus-5.5'));
 assert.ok(!result.free_models.some(x=>x.id.includes('stealth')||x.id.includes('priced')||x.id.includes('incomplete')));
});

test('list choices distinguishes truly selectable free, aliases, self-declared Spaces and paid frontier',async()=>{
 const {listModelChoices}=require('../src/model-choice.cjs');
 const space={id:'hf-public-chat-123',display_name:'Public Chat',model:'Qwen Demo (operator label only)',url:'https://mock-public-chat.hf.space/',transport:'gradio_space',enabled:true,policy_reviewed:true,automation_authorized:true,free_only:true,daily_max:2,policy_reviewed_at:'2026-11-23',policy_evidence:'https://huggingface.co/docs/hub/spaces-api-endpoints',auto_discovered:true,auto_verified_at:new Date().toISOString()};
 const result=await listModelChoices({include_locked:true},{catalog:async()=>catalogs,providers:[kilo,jarvis,space],selection:()=>({mode:'auto'})});
 assert.ok(result.free_models.some(x=>x.choice_id===freeId&&x.selectable));
 assert.ok(result.free_auto.some(x=>x.choice_id==='jarvisclaw-free'&&x.underlying_model_verified===false));
 assert.ok(result.browser_demos.some(x=>x.choice_id==='hf-public-chat-123'&&x.underlying_model_verified===false));
 assert.ok(result.frontier_locked.some(x=>x.model_id==='anthropic/claude-opus-5.5'&&!x.selectable));
});

test('selection writes a private file and cannot select a locked paid model',async(t)=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'guest-model-select-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const {chooseModel,readSelection}=require('../src/model-choice.cjs');
 const deps={catalog:async()=>catalogs,providers:[kilo,jarvis],stateDir:tmp};
 await assert.rejects(()=>chooseModel('anthropic/claude-opus-5.5',deps),/not selectable|paid|not allowed/i);
 const chosen=await chooseModel(freeId,deps);
 assert.equal(chosen.selection.choice_id,freeId);
 assert.equal(chosen.selection.provider_id,'kilo-free');
 assert.equal(readSelection({stateDir:tmp}).choice_id,freeId);
 assert.equal(fs.statSync(path.join(tmp,'selected-model.json')).mode&0o777,0o600);
 const alias=await chooseModel('jarvisclaw-free',deps);
 assert.equal(alias.selection.provider_id,'jarvisclaw-free');
 const reset=await chooseModel('auto',deps);assert.equal(reset.selection.mode,'auto');
});

test('free model override is verified against fresh catalog before any anonymous request',async()=>{
 let request;
 const ok=await askAnonymousOpenAI(kilo,'What is 117+104?',{model_id:freeId,verifyFreeModel:async id=>id===freeId,dnsFn:async x=>new URL(x),fetchFn:async(url,init)=>{request=JSON.parse(init.body);return asResponse({model:freeId,choices:[{message:{content:'221'}}]})}});
 assert.equal(request.model,freeId);assert.equal(ok.requested_model,freeId);
 await assert.rejects(()=>askAnonymousOpenAI(kilo,'Hi',{model_id:'anthropic/claude-opus-5.5',verifyFreeModel:async()=>false,dnsFn:async x=>new URL(x)}),/not available|not eligible|not free/i);
 await assert.rejects(()=>askAnonymousOpenAI(jarvis,'Hi',{model_id:freeId,verifyFreeModel:async()=>true,dnsFn:async x=>new URL(x)}),/not supported/i);
});

test('chosen model is respected by guest_auto, never silently falls back to different route',async()=>{
 let calls=[];
 const common={providers:[kilo,jarvis],usageData:{},healthStats:{},selection:()=>({mode:'fixed',choice_id:freeId,provider_id:'kilo-free',model_id:freeId}),resolveChoice:async()=>({choice_id:freeId,provider_id:'kilo-free',model_id:freeId,selectable:true}),ask:async a=>{calls.push(a);return {status:'no_verified_reply',reply:null}}};
 const r=await guestAuto({message:'Give three public syntax examples'},common);
 assert.equal(r.status,'selected_model_failed');assert.equal(calls.length,1);assert.equal(calls[0].provider_id,'kilo-free');assert.equal(calls[0].model_id,freeId);
 const unavail=await guestAuto({message:'Public tests'}, {...common,usageData:{'kilo-free':{day:new Date().toISOString().slice(0,10),count:60,last_ms:Date.now()}}});
 assert.equal(unavail.status,'selected_model_unavailable');assert.equal(calls.length,1);
});

test('MCP exposes model listing and selection, including small personal profile',async()=>{
 const {handle}=require('../src/protocol.cjs');
 const reply=await handle({jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.ok(reply.result.tools.find(x=>x.name==='guest_models'));
 assert.ok(reply.result.tools.find(x=>x.name==='guest_select_model'));
 assert.ok(reply.result.tools.find(x=>x.name==='guest_auto').inputSchema.properties.model_id);
 const fs=require('node:fs');const src=fs.readFileSync(require.resolve('../src/mcp.cjs'),'utf8');
 assert.match(src,/guest_select_model/);assert.match(src,/guest_models/);
});

test('selected concrete model requires matching reported model, never mislabels a reply',async()=>{
 const wrong=await askAnonymousOpenAI(kilo,'Public math',{model_id:freeId,verifyFreeModel:async()=>true,dnsFn:async x=>new URL(x),
   fetchFn:async()=>asResponse({model:'other/open-model:free',choices:[{message:{content:'221'}}]})});
 assert.equal(wrong.status,'model_mismatch');assert.equal(wrong.reply,null);
 const unknown=await askAnonymousOpenAI(kilo,'Public math',{model_id:freeId,verifyFreeModel:async()=>true,dnsFn:async x=>new URL(x),
   fetchFn:async()=>asResponse({choices:[{message:{content:'221'}}]})});
 assert.equal(unknown.status,'model_mismatch');
});

test('CLI model menu, named choice and auto reset persist across separate processes without network',async(t)=>{
 const cp=require('node:child_process');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'guest-choice-cli-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 fs.writeFileSync(path.join(tmp,'official-catalog-cache.json'),JSON.stringify(catalogs),{mode:0o600});
 const env={...process.env,GUEST_BRIDGE_STATE_DIR:tmp,GUEST_BRIDGE_AUTO_ADD:'0'};
 const cli=path.join(__dirname,'../src/cli.cjs');
 const run=(...args)=>{const x=cp.spawnSync(process.execPath,[cli,...args],{encoding:'utf8',env,timeout:8000});assert.equal(x.status,0,(x.stderr||'')+'\n'+(x.stdout||''));return x.stdout;};
 const menu=JSON.parse(run('models','--json'));
 assert.ok(menu.free_models.some(x=>x.choice_id===freeId));
 assert.deepEqual(menu.frontier_locked,[]);
 assert.ok(run('models','--frontier').includes('LOCKED'));
 const chosen=JSON.parse(run('use',freeId));assert.equal(chosen.selection.choice_id,freeId);
 assert.equal(JSON.parse(run('selected')).choice_id,freeId);
 const plan=JSON.parse(run('plan','Write a public toy function','--no-web'));
 assert.equal(plan.selected_model.choice_id,freeId);
 assert.equal(plan.selected,'kilo-free');
 run('use','auto');assert.equal(JSON.parse(run('selected')).mode,'auto');
});

test('personal MCP profile offers models and selection without exposing unrelated browser tools',async(t)=>{
 const cp=require('node:child_process');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'guest-choice-mcp-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 fs.writeFileSync(path.join(tmp,'official-catalog-cache.json'),JSON.stringify(catalogs),{mode:0o600});
 const proc=cp.spawn(process.execPath,[path.join(__dirname,'../src/mcp-personal.cjs')],{env:{...process.env,GUEST_BRIDGE_AUTO_ADD:'0',GUEST_BRIDGE_STATE_DIR:tmp},stdio:['pipe','pipe','pipe']});
 t.after(()=>proc.kill());
 const requests=[{id:1,method:'tools/list'}, {id:2,method:'tools/call',params:{name:'guest_models',arguments:{include_locked:true}}},
  {id:3,method:'tools/call',params:{name:'guest_select_model',arguments:{model_id:freeId}}}];
 for(const {id,method,params} of requests)proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 const responses=await new Promise((resolve,reject)=>{let buf='',items=[];const timer=setTimeout(()=>reject(Error('MCP test timed out')),8000);proc.stdout.on('data',d=>{buf+=d;for(let i;(i=buf.indexOf('\n'))>=0;){const line=buf.slice(0,i);buf=buf.slice(i+1);items.push(JSON.parse(line));if(items.length===3){clearTimeout(timer);resolve(items);return}}});proc.on('error',reject)});
 const by=Object.fromEntries(responses.map(x=>[x.id,x]));
 const exposed=by[1].result.tools.map(x=>x.name);
 assert.ok(exposed.includes('guest_models')&&exposed.includes('guest_select_model'));assert.ok(!exposed.includes('guest_inspect'));
 assert.ok(by[2].result.structuredContent.free_models.some(x=>x.choice_id===freeId));
 assert.equal(by[3].result.structuredContent.selection.choice_id,freeId);
});
