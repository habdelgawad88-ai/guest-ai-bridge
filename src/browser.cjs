'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { summarizeUi } = require('./safety.cjs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const WS = globalThis.WebSocket || require('undici').WebSocket;

function findBrowser() {
  const files = [process.env.GUEST_BRIDGE_CHROME, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/google/chrome/chrome'].filter(Boolean);
  for (const filename of files) if (fs.existsSync(filename)) return filename;
  throw new Error('Chrome/Chromium not found. Set GUEST_BRIDGE_CHROME.');
}
class ChromeBrowser {
  constructor({timeoutMs=55000}={}) {this.timeoutMs=timeoutMs;this.seq=0;this.pending=new Map();this.ws=null;this.closed=false;}
  async start() {
    this.tmp=fs.mkdtempSync(path.join(os.tmpdir(),'guest-ai-bridge-'));
    fs.chmodSync(this.tmp,0o700);
    const args=['--headless=new','--disable-gpu','--disable-breakpad','--disable-dev-shm-usage','--disable-extensions','--no-first-run','--no-default-browser-check','--disable-background-networking','--no-service-autorun','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+path.join(this.tmp,'profile'),'about:blank'];
    if(process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX === '1') args.unshift('--no-sandbox');
    this.child=spawn(findBrowser(),args,{stdio:'ignore',env:{...process.env, HOME:this.tmp, XDG_CONFIG_HOME:path.join(this.tmp,'.config'), XDG_CACHE_HOME:path.join(this.tmp,'.cache')}});
    const portfile=path.join(this.tmp,'profile','DevToolsActivePort');
    for(let i=0;i<80;i++){if(fs.existsSync(portfile))break;if(this.child.exitCode!==null)break;await sleep(150)}
    if(!fs.existsSync(portfile))throw new Error('Chrome did not start. On restricted containers, set GUEST_BRIDGE_ALLOW_NO_SANDBOX=1 only under a dedicated unprivileged account.');
    const port=Number(fs.readFileSync(portfile,'utf8').split('\n')[0]);
    const tabs=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(3000)}).then(r=>r.json());
    const page=tabs.find(x=>x.type==='page');
    if(!page)throw new Error('No browser page target');
    this.ws=new WS(page.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Browser connect timeout')),5000);this.ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});this.ws.addEventListener('error',e=>{clearTimeout(timer);reject(e)},{once:true})});
    this.ws.addEventListener('message',e=>{
      let msg;try{msg=JSON.parse(e.data)}catch{return};
      const cb=this.pending.get(msg.id);if(cb){this.pending.delete(msg.id);cb(msg)}
    });
    await this.cmd('Page.enable');await this.cmd('Runtime.enable');
    return this;
  }
  async cmd(method,params={}) {
    if(!this.ws||this.closed)throw Error('Browser not open');
    const id=++this.seq;
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Browser command timeout: '+method))},Math.min(this.timeoutMs,15000));
      this.pending.set(id,msg=>{clearTimeout(timer);resolve(msg)});
      this.ws.send(JSON.stringify({id,method,params}));
    });
    if(result.error)throw Error('Chrome: '+JSON.stringify(result.error));
    return result.result;
  }
  async evaluate(js) {
    const r=await this.cmd('Runtime.evaluate',{expression:js,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('Browser JS exception: '+(r.exceptionDetails.text||''));
    return r.result?.value;
  }
  async navigate(url){await this.cmd('Page.navigate',{url});await sleep(2700);}
  async state(){
    return await this.evaluate(`(()=>{
      const visible=e=>!!(e.getClientRects().length&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden');
      const els=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(visible);
      return {url:location.href,title:document.title,body:(document.body?.innerText||'').slice(0,25000),
        editors:els.slice(0,12).map(e=>({tag:e.tagName,id:e.id,placeholder:e.getAttribute('placeholder'),aria:e.getAttribute('aria-label'),editable:e.getAttribute('contenteditable')})),
        button_labels:[...document.querySelectorAll('button')].filter(visible).slice(0,40).map(e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim().slice(0,80)),
        assistants:[...document.querySelectorAll('[data-message-author-role=\"assistant\"],[data-role=\"assistant\"],[role=\"assistant\"],.assistant-message,.message-assistant')].filter(visible).map(e=>(e.innerText||'').trim()).filter(Boolean).slice(-5)};
    })()`);
  }
  async readAssistantMessages(selector='') {
    const css=selector || '[data-message-author-role="assistant"],[data-role="assistant"],[role="assistant"],.assistant-message,.message-assistant';
    if(typeof css!=='string'||css.length>300)throw Error('Invalid assistant selector');
    const messages=await this.evaluate(`(()=>{
      const visible=e=>!!(e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
      return [...document.querySelectorAll(${JSON.stringify(css)})].filter(visible).map(e=>(e.innerText||'').trim()).filter(Boolean).slice(-20);
    })()`);
    return Array.isArray(messages)?messages:[];
  }
  async selectEditor(options='generic'){
    const opt=typeof options==='string'?{adapter:options}:options;
    const preferred=opt.editor_selector || (opt.adapter==='usingopen'?'#input':'');
    if(typeof preferred!=='string'||preferred.length>300)throw Error('Invalid editor selector');
    return await this.evaluate(`(()=>{
       const visible=e=>!!(e.getClientRects().length&&e.getBoundingClientRect().height>0&&!e.disabled);
       const preferred=${JSON.stringify(preferred)};
       const nodes=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')];
       const e=(preferred&&document.querySelector(preferred)) || (!preferred&&nodes.find(e=>visible(e)&&!/(feedback|history|search)/i.test([e.id,e.getAttribute('placeholder'),e.getAttribute('aria-label')].join(' '))));
       if(!e||!visible(e))return false;
       e.focus();return document.activeElement===e || e.contains(document.activeElement);
    })()`);
  }
  async send(message,options='generic'){
    const opt=typeof options==='string'?{adapter:options}:options;
    if(!await this.selectEditor(opt))throw Error('No suitable visible chat editor');
    await this.cmd('Input.insertText',{text:message});await sleep(250);
    const preferred=opt.send_selector || (opt.adapter==='usingopen'?'button[aria-label="Send message"]':'');
    if(typeof preferred!=='string'||preferred.length>300)throw Error('Invalid send selector');
    const method=await this.evaluate(`(()=>{
       const visible=e=>!!(e.getClientRects().length&&e.getBoundingClientRect().height>0);
       const preferred=${JSON.stringify(preferred)};
       const b=(preferred&&document.querySelector(preferred))||(!preferred&&[...document.querySelectorAll('button')].find(e=>visible(e)&&!e.disabled&&/^(send|send message|ask|submit|ask now)(?:\\s*message)?$/i.test((e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim())));
       if(!b||!visible(b)||b.disabled)return preferred?'not_found':'enter'; b.click();return 'click';
    })()`);
    if(method==='not_found')throw Error('Configured send button was not found');
    if(method==='enter') {
      await this.cmd('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
      await this.cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }
    return method;
  }
  async awaitReply(prompt,{adapter='generic',assistant_selector='',initial_assistants=[],timeoutMs=35000}={}){
    const deadline=Date.now()+Math.min(timeoutMs,90000);let last=null,stable=0,previous='';
    while(Date.now()<deadline) {
      await sleep(450);last=await this.state();
      const block=summarizeUi(last.body);
      if(block)return {status:block,reply:null,observed_url:last.url};
      const messages=await this.readAssistantMessages(assistant_selector);
      const latest=messages.at(-1);
      const before=Array.isArray(initial_assistants)?initial_assistants:[];
      const newReply=messages.length>before.length || (messages.length>0 && before.length>0 && latest!==before.at(-1));
      let reply=newReply&&latest&&latest!==prompt?latest:null;
      if(reply&&reply===previous)stable++;else{stable=0;previous=reply||'';}
      if(reply&&stable>=2)return {status:'reply',reply:reply.slice(0,10000),observed_url:last.url,method:'visible_dom_text',untrusted_external_content:true};
    }
    return {status:'no_verified_reply',reply:null,observed_url:last?.url,tail:last?.body.slice(-1100),note:'A typed/sent prompt alone is not counted as a model reply'};
  }
  async inspect(url) {await this.navigate(url);const state=await this.state();return {...state,body:state.body.slice(0,1700),blocker:summarizeUi(state.body)};}
  async close(){this.closed=true;try{this.ws?.close()}catch{};for(const cb of this.pending.values())try{cb({error:{message:'Browser closed'}})}catch{};this.pending.clear();try{this.child?.kill('SIGTERM')}catch{};await sleep(150);try{fs.rmSync(this.tmp,{recursive:true,force:true})}catch{}}
}
function extractReply(body,prompt,adapter='generic') {
  const idx=body.lastIndexOf(prompt);if(idx<0)return null;
  let post=body.slice(idx+prompt.length).trim();
  if(adapter==='usingopen') {
    post=post.split(/\nMessage\n|\nUsingOpen Studio\n|\nCompare\nProvider may log/)[0];
    post=post.replace(/^(?:[A-Z][^\n]{2,90}\n)?Copy\n/,'').replace(/^Thinking\n[\s\S]*?\n\n(?=\S)/,'');
    post=post.replace(/\n(?:in \d+ · out \d+)[\s\S]*$/,'').trim();
  } else {
    return null; // Generic page-tail text is not proof of an assistant response. Require assistant DOM selector.
  }
  if(!post||post===prompt||post.length<1||post.length>10000)return null;
  if(/^(?:copy|thinking|loading|connecting|try again|scroll to latest|send a message)/i.test(post))return null;
  if(summarizeUi(post))return null;
  return post;
}
module.exports = { ChromeBrowser, findBrowser, extractReply };
