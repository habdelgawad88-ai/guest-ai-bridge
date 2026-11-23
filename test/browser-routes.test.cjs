'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ReadableStream}=require('node:stream/web');
const path=require('node:path');
const fs=require('node:fs');
const {ChromeBrowser,findBrowser}=require('../src/browser.cjs');
const {browserRouteHostAllowed}=require('../src/safety.cjs');
const {askGradioSpace}=require('../src/gradio.cjs');
const {scoreProvider}=require('../src/router.cjs');
const {authorization}=require('../src/state.cjs');

const space={id:'demo-gradio',url:'https://example-space.hf.space/',transport:'gradio_space',model:'example',api_name:'generate',enabled:true,automation_authorized:true,policy_reviewed:true,policy_evidence:'https://huggingface.co/docs/hub/spaces-api-endpoints',policy_reviewed_at:'2026-11-23',free_only:true,daily_max:2,min_interval_seconds:20,timeout_seconds:20,capabilities:['general']};
function fakeFetch(posts,events,code=200){
  return async (u,opts)=>{
    posts.push({url:String(u), method:opts.method,headers:opts.headers,body:opts.body});
    if(opts.method==='POST')return new Response(code===200?JSON.stringify({event_id:'abc123456'}):'error',{status:code,headers:{'Content-Type':'application/json'}});
    return new Response(events,{headers:{'Content-Type':'text/event-stream'}});
  };
}
test('Gradio chat through documented Space endpoint requires completed SSE answer',async()=>{
 const posts=[];
 const reply=await askGradioSpace(space,'How much is 117 + 104?',{fetchImpl:fakeFetch(posts,'event: generating\ndata: ["22",null]\n\nevent: complete\ndata: ["221",null]\n\n')});
 assert.equal(reply.status,'reply');assert.equal(reply.reply,'221');
 assert.match(posts[0].url,/\/gradio_api\/call\/v2\/generate$/);
 assert.deepEqual(JSON.parse(posts[0].body).message,'How much is 117 + 104?');
 assert.match(posts[1].url,/\/gradio_api\/call\/generate\/abc123456$/);
});
test('Gradio chat rejects incomplete or errored streams',async()=>{
 const posts=[];
 const incomplete=await askGradioSpace(space,'A',{fetchImpl:fakeFetch(posts,'event: generating\ndata: ["unfinished",null]\n\n')});
 assert.notEqual(incomplete.status,'reply');
 const err=await askGradioSpace(space,'A',{fetchImpl:fakeFetch([],'event: error\ndata: {"error":"ZeroGPU worker error"}\n\n')});
 assert.notEqual(err.status,'reply');
 const limit=await askGradioSpace(space,'A',{fetchImpl:fakeFetch([],null,429)});
 assert.equal(limit.status,'rate_limited');
});
test('prohibited browser-chat domains stay blocked, even in custom policy',()=>{
 for(const url of ['https://duck.ai/','https://chat.qwen.ai/','https://qwen.ai/','https://chat.z.ai/','https://gemini.google.com/app/','https://tryingopen.com/']){
   assert.equal(browserRouteHostAllowed(url),false,url);
   assert.throws(()=>authorization({...space,transport:'browser',url}),/forbid|blocked|permission/i);
 }
 assert.equal(browserRouteHostAllowed('https://my-permitted-chat.example.org/'),true);
});
test('browser routes cannot accept history or system prompts',()=>{
 const inputs={task_type:'general',max_chars:15,healthStats:{},usageData:{},requires_chat_context:true};
 for(const transport of ['browser','gradio_space']){
   const x=scoreProvider({...space,transport},inputs);
   assert.equal(x.eligible,false);
 }
 assert.equal(scoreProvider({...space,transport:'browser'},{...inputs,requires_chat_context:false}).eligible,true);
});
test('Chrome UI browser sends through explicitly configured selectors and rejects stale assistant messages', {timeout:45000},async(t)=>{
 try{findBrowser()}catch{t.skip('Chromium unavailable');return}
 const html=`<!doctype html><title>Permitted fixture</title><div id="chat"><article class="bot">OLD REPLY</article></div><div><textarea id="editor"></textarea><button id="go" onclick="sendMessage()">Submit</button></div><script>function sendMessage(){const msg=document.querySelector('#editor').value;document.querySelector('#chat').insertAdjacentHTML('beforeend','<article class="user">'+msg+'</article>');setTimeout(()=>document.querySelector('#chat').insertAdjacentHTML('beforeend','<article class="bot">221</article>'),140)}</script>`;
 const browser=new ChromeBrowser(); const old=process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX;process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX='1';
 try{
  await browser.start();const frame=await browser.cmd('Page.getFrameTree');
  await browser.cmd('Page.setDocumentContent',{frameId:frame.frameTree.frame.id,html});
  const opts={editor_selector:'#editor',send_selector:'#go',assistant_selector:'.bot'};
  const before=await browser.readAssistantMessages(opts.assistant_selector);
  assert.deepEqual(before,['OLD REPLY']);
  assert.equal(await browser.send('117 + 104?',opts),'click');
  const reply=await browser.awaitReply('117 + 104?',{...opts,initial_assistants:before,timeoutMs:8000});
  assert.equal(reply.status,'reply'); assert.equal(reply.reply,'221');
  const stale=await browser.awaitReply('117 + 104?',{...opts,initial_assistants:await browser.readAssistantMessages(opts.assistant_selector),timeoutMs:2300});
  assert.notEqual(stale.status,'reply');
 }finally{await browser.close();if(old===undefined)delete process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX;else process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX=old;}
});
const cp=require('node:child_process');const os=require('node:os');
test('browser-add requires explicit permission and does not overwrite existing policy',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-browser-policy-'));
 try{
  const env={...process.env,GUEST_BRIDGE_STATE_DIR:home};
  const cli=path.resolve(__dirname,'../src/cli.cjs');
  const base=['browser-add','--id','approved-demo','--url','https://demo.example.org/chat','--permission-url','https://demo.example.org/automation-policy','--editor','#message','--send','#submit','--reply','.assistant'];
  const run=(args)=>cp.spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:10000});
  assert.notEqual(run(base).status,0,'No explicit permission confirmation must fail');
  assert.notEqual(run([...base,'--approve','--url','https://duck.ai/']).status,0,'Prohibited host must fail');
  const done=run([...base,'--approve']);
  assert.equal(done.status,0,done.stderr);
  const contents=JSON.parse(fs.readFileSync(path.join(home,'providers.json'),'utf8'));
  const x=contents.providers.find(p=>p.id==='approved-demo');
  assert.equal(x.transport,'browser');assert.equal(x.enabled,true);
  assert.equal(x.assistant_selector,'.assistant');
  assert.equal(run([...base,'--approve']).status,1,'Must reject same-id overwrite');
  assert.ok(contents.providers.some(p=>p.id==='kilo-free'));
 }finally{fs.rmSync(home,{force:true,recursive:true})}
});
