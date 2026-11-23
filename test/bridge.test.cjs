'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const cp=require('node:child_process');
const { safeHttpsUrl, isPublicIP, detectSensitive, summarizeUi }=require('../src/safety.cjs');
const {robotsPathAllowed}=require('../src/robots.cjs');
const {parseDirectory,parseRss}=require('../src/discovery.cjs');
const {extractReply}=require('../src/browser.cjs');
const {handle}=require('../src/protocol.cjs');
const {getProvider,authorization}=require('../src/state.cjs');

test('URL and IP safety: reject private, login, non-TLS',()=>{
 for(const u of ['http://example.com','https://127.0.0.1/','https://localhost/','https://10.0.0.1/','https://admin:password@example.org','https://example.org:8443/','https://a.internal'])assert.throws(()=>safeHttpsUrl(u));
 assert.equal(safeHttpsUrl('https://example.org/chat').hostname,'example.org');
 assert.equal(isPublicIP('8.8.8.8'),true);assert.equal(isPublicIP('192.168.0.1'),false);assert.equal(isPublicIP('169.254.169.254'),false);assert.equal(isPublicIP('::1'),false);
});
test('sensitive content and CAPTCHA hints',()=>{
 assert.equal(detectSensitive('sk-proj-12345678901234567890'),true);
 assert.equal(detectSensitive('Patient MRN 123456'),true);
 assert.equal(detectSensitive('hello@example.org'),true);
 assert.equal(detectSensitive('Draft a short headline for a new product'),false);
 assert.equal(summarizeUi('Please drag the slider to complete the puzzle'),'verification_required');
 assert.equal(summarizeUi('Duck.ai is temporarily unavailable'),'unavailable_or_limited');
});
test('robots specificity and disallow',()=>{
 const robots='User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /chat/\n';
 assert.equal(robotsPathAllowed(robots,'/'),true);assert.equal(robotsPathAllowed(robots,'/app/abc'),false);
 assert.equal(robotsPathAllowed(robots,'/chat/abc'),false);
 assert.equal(robotsPathAllowed('User-agent: *\nDisallow: /bad/\nAllow: /bad/public/','/bad/public/ok'),true);
});
test('directory and RSS discovery parse and deduplicate',()=>{
 let d=parseDirectory('<a href="https://example.org/chat" target="_blank"><b>Chat A</b></a>\n<a href="https://example.org/other">duplicate</a>');
 assert.equal(d.length,1);assert.equal(d[0].name,'Chat A');
 let x=parseRss('<rss><item><title>Chat &amp; Co</title><link>https://chat.example.org/</link></item></rss>');
 assert.equal(x.length,1);assert.equal(x[0].name,'Chat & Co');
});
test('guest reply extraction',()=>{
 let t='Studio\nYOU\nWhat is 13 times 17?\nLIQUID AI LFM3-VL 2B\nCopy\n221\n\nin 8 · out 4\nMessage\n';
 assert.equal(extractReply(t,'What is 13 times 17?','usingopen'),'221');
 assert.equal(extractReply('You\nWhat is 13 times 17?\nContinue your conversation\nSign up for free','What is 13 times 17?','generic'),null);
});
test('only explicitly documented anonymous API enabled by default; guest browser sites disabled',()=>{
 assert.doesNotThrow(()=>authorization(getProvider('jarvisclaw-free')));
 for(const id of ['usingopen','gemini-guest','duckai','tryingopen'])assert.throws(()=>authorization(getProvider(id)));
});
test('MCP protocol initialization and tools list',async()=>{
 let init=await handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});
 assert.equal(init.result.serverInfo.name,'guest-ai-bridge');
 let tools=await handle({jsonrpc:'2.0',id:2,method:'tools/list'});const names=tools.result.tools.map(x=>x.name);
 for(const name of ['guest_discover','guest_inspect','guest_providers','guest_usage','guest_ask','guest_route_plan','guest_auto'])assert.ok(names.includes(name));
 let call=await handle({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'guest_ask',arguments:{provider_id:'usingopen',message:'Hello'}}});
 assert.equal(call.result.isError,true);assert.match(call.result.content[0].text,/Provider disabled/);
});
test('real stdio MCP subprocess sends exactly valid JSON-RPC lines',async()=>{
 const child=cp.spawn(process.execPath,[path.join(__dirname,'../src/mcp.cjs')],{stdio:['pipe','pipe','pipe']});
 let output='';child.stdout.on('data',c=>output+=c);
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2026-07-28'}})+'\n');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');
 await new Promise((resolve,reject)=>{let n=0;let t=setInterval(()=>{if(output.split('\n').filter(Boolean).length>=2){clearInterval(t);resolve()}else if(++n>100){clearInterval(t);reject(new Error('stdio timeout'))}},20)});
 child.stdin.end();child.kill('SIGTERM');const msgs=output.split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(msgs.length,2);assert.equal(msgs[0].id,1);assert.ok(msgs[1].result.tools.length>=5);
});
