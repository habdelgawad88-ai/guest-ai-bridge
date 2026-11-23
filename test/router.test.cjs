'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {inferTask,scoreProvider,rankProviders,routePlan,guestAuto}=require('../src/router.cjs');
const {askAnonymousOpenAI}=require('../src/api.cjs');
const {policy}=require('../src/state.cjs');
const free=policy().providers.find(x=>x.id==='jarvisclaw-free');
function permitted(overrides={}) {return {...free,id:'test-provider',...overrides}}
const fakeResponse=(status,value,contentType='application/json')=>({status,ok:status>=200&&status<300,headers:{get(k){return k==='content-type'?contentType:null}},text:async()=>JSON.stringify(value)});

test('task classifier identifies coding, math and general without an LLM',()=>{
 assert.equal(inferTask('Debug this Python function'), 'coding');
 assert.equal(inferTask('Calculate 15 * 18'), 'math');
 assert.equal(inferTask('Say hello'), 'general');
 assert.equal(inferTask('Say hello','writing'),'writing');
 assert.throws(()=>inferTask('Hello','anything'));
});
test('free anonymous API selects only auto/free, sends no Authorization and records returned model',async()=>{
 let request;
 const result=await askAnonymousOpenAI(free,'What is 13 times 17?',{
  dnsFn:async u=>new URL(u),fetchFn:async(url,init)=>{
   request={url,init};return fakeResponse(200,{model:'nvidia/nemotron-3.5-bolt',choices:[{message:{content:'221'}}],usage:{total_tokens:29,prompt_tokens:25,completion_tokens:4}});
  }
 });
 assert.equal(result.status,'reply'); assert.equal(result.reply,'221');assert.equal(result.model,'nvidia/nemotron-3.5-bolt');
 assert.equal(request.url,free.url);assert.equal(request.init.redirect,'error');
 assert.equal(request.init.headers.Authorization,undefined);
 assert.equal(JSON.parse(request.init.body).model,'auto/free');
 assert.deepEqual(Object.keys(result.usage).sort(),['completion_tokens','prompt_tokens','total_tokens']);
 await assert.rejects(()=>askAnonymousOpenAI({...free,model:'paid-premium'},'Hello',{dnsFn:async u=>new URL(u)}),/Only documented anonymous FREE model aliases/);
 await assert.rejects(()=>askAnonymousOpenAI({...free,url:'https://other.example/chat'},'Hello',{dnsFn:async u=>new URL(u)}),/Unreviewed API/);
});
test('anonymous free API handles rate limits, payment and malformed response',async()=>{
 let deps={dnsFn:async u=>new URL(u),fetchFn:async()=>fakeResponse(429,{error:'rate limit'})};
 assert.equal((await askAnonymousOpenAI(free,'test',deps)).status,'rate_limited');
 deps.fetchFn=async()=>fakeResponse(402,{error:'payment'});
 assert.equal((await askAnonymousOpenAI(free,'test',deps)).status,'payment_required');
 deps.fetchFn=async()=>fakeResponse(200,{choices:[]});
 assert.equal((await askAnonymousOpenAI(free,'test',deps)).status,'no_verified_reply');
});
test('provider selection excludes unreviewed, quota exhausted, and unhealthy providers',()=>{
 const now=Date.parse('2026-11-22T12:00:00Z');
 const usageData={'test-provider':{day:'2026-11-22',count:0,last_ms:0}};
 assert.equal(scoreProvider(permitted(),{task_type:'coding',now,usageData,healthStats:{}}).eligible,true);
 assert.equal(scoreProvider(permitted({automation_authorized:false}),{task_type:'coding',now,usageData}).eligible,false);
 assert.equal(scoreProvider(permitted({free_only:false}),{task_type:'coding',now,usageData}).eligible,false);
 assert.equal(scoreProvider(permitted({model:'not-free'}),{task_type:'coding',now,usageData}).eligible,false);
 assert.equal(scoreProvider(permitted({max_prompt_chars:10}),{task_type:'coding',max_chars:12,now,usageData}).eligible,false);
 assert.equal(scoreProvider(permitted({daily_max:1}),{task_type:'coding',now,usageData:{'test-provider':{day:'2026-11-22',count:1,last_ms:0}}}).eligible,false);
 assert.equal(scoreProvider(permitted(),{task_type:'coding',now,usageData,healthStats:{'test-provider':{blocked_until_ms:now+60000}}}).eligible,false);
 assert.equal(scoreProvider(permitted(),{task_type:'research',now,usageData}).eligible,false);
});
test('ranking favors reliable documented API and falls back to another approved provider',async()=>{
 const another=permitted({id:'second-provider',display_name:'Second authorized provider',transport:'browser',url:'https://example.org/chat',adapter:'generic'});
 const fakeDeps={now:Date.parse('2026-11-22T12:00:00Z'),providers:[another,free],usageData:{},healthStats:{},
   discover:async()=>({total_candidates:42,shown:25,directory_status:'cached',search_status:'not_requested',candidates:[{name:'Candidate',url:'https://candidate.example/',source:'directory'}]})};
 const plan=await routePlan({message:'Debug this code',task_type:'auto',discover_sites:true},fakeDeps);
 assert.equal(plan.task_type,'coding'); assert.equal(plan.status,'route_ready'); assert.equal(plan.selected,'jarvisclaw-free');
 assert.equal(plan.discovery.total_candidates,42);
 assert.equal(plan.discovery.unverified_samples.length,1);
 assert.equal(plan.discovery.unverified_samples[0].url,'https://candidate.example/');
 let calls=0;
 const result=await guestAuto({message:'Debug this code',max_attempts:2}, {...fakeDeps,ask:async({provider_id})=>{
   calls++;
   if(provider_id==='jarvisclaw-free')return {status:'rate_limited',reply:null};
   return {status:'reply',reply:'function fixed() {}',model:'example',model_verified:true,method:'browser'};
 }});
 assert.equal(result.status,'reply');assert.equal(result.provider_id,'second-provider');assert.equal(result.attempts.length,2);assert.equal(calls,2);
});
test('failure is explicit and discovery never forwards the user prompt',async()=>{
 let querySeen='';const fakeDeps={providers:[permitted({enabled:false})],usageData:{},healthStats:{},
  discover:async({query})=>{querySeen=query;return {total_candidates:2,shown:2,candidates:[]}}};
 const msg='Draft a short public product headline';
 const outcome=await guestAuto({message:msg,discover_sites:true},fakeDeps);
 assert.equal(outcome.status,'no_authorized_provider');assert.equal(outcome.reply,null);
 assert.equal(querySeen,'free AI chat no account');assert.ok(!querySeen.includes(msg));
 const privatePlan=await routePlan({message:'Patient MRN 123456 has fever'},fakeDeps);
 assert.equal(privatePlan.status,'sensitive_content_blocked');
});
test('model failures do not count as successful response',async()=>{
 const deps={providers:[free],usageData:{},healthStats:{},discover:async()=>({total_candidates:0,shown:0,candidates:[]}),
 ask:async()=>({status:'no_verified_reply',reply:null})};
 const result=await guestAuto({message:'Hello',max_attempts:1},deps);
 assert.equal(result.status,'all_candidates_failed');assert.equal(result.attempts.length,1);
});
