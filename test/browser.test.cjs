'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {ChromeBrowser,findBrowser}=require('../src/browser.cjs');
const html='<!doctype html><html><head><title>Fictional Guest Chat Fixture</title></head><body><main>Fixture Chat <div id="messages"></div><textarea id="input" placeholder="Ask something"></textarea><button aria-label="Send message" onclick="go()">Send</button></main><script>function go(){const a=document.querySelector("#input");let msg=a.value;document.querySelector("#messages").insertAdjacentHTML("beforeend","<section>YOU\\n"+msg+"</section>");a.value="";setTimeout(()=>document.querySelector("#messages").insertAdjacentHTML("beforeend","<article data-role=assistant>AI\\n221</article>"),250)}</script></body></html>';
test('browser UI controlled fixture: sends text and reads response', {timeout:45000},async(t)=>{
 let exe;try{exe=findBrowser()}catch{t.skip('Chromium not installed');return}
 const browser=new ChromeBrowser();
 const old=process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX;
 process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX='1';
 try{
   await browser.start();const frame=await browser.cmd('Page.getFrameTree');await browser.cmd('Page.setDocumentContent',{frameId:frame.frameTree.frame.id,html});
   const s=await browser.state();assert.equal(s.title,'Fictional Guest Chat Fixture');
   assert.ok(s.editors.length);
   const msg='What is 13 times 17?';
   const send=await browser.send(msg);assert.equal(send,'click');
   const result=await browser.awaitReply(msg,{timeoutMs:9000});
   assert.equal(result.status,'reply');assert.match(result.reply,/221/);
 }finally{await browser.close();if(old===undefined)delete process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX;else process.env.GUEST_BRIDGE_ALLOW_NO_SANDBOX=old;}
});
