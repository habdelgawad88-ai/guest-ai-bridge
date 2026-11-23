'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {guestAuto}=require('../src/router.cjs');

function callPersonalMcp(){
 return new Promise((resolve,reject)=>{
  const c=cp.spawn(process.execPath,[path.join(__dirname,'../src/mcp-personal.cjs')],{stdio:['pipe','pipe','pipe']});
  const result=[];let err='';let out='';
  const timeout=setTimeout(()=>{c.kill();reject(new Error('MCP personal timed out: '+err))},5000);
  c.stderr.on('data',b=>err+=b);
  c.stdout.on('data',b=>{out+=b;for(let idx=out.indexOf('\n');idx>=0;idx=out.indexOf('\n')){const line=out.slice(0,idx);out=out.slice(idx+1);try{result.push(JSON.parse(line))}catch(e){reject(e)}if(result.length===3){clearTimeout(timeout);c.kill();resolve(result)}}});
  for(const req of [
   {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}},
   {jsonrpc:'2.0',id:2,method:'tools/list'},
   {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'guest_inspect',arguments:{url:'https://example.com/'}}}
  ])c.stdin.write(JSON.stringify(req)+'\n');
 });
}

test('personal MCP advertises model choice plus three low-overhead tools, rejects non-advertised actions',async()=>{
 const res=await callPersonalMcp();
 const byId=Object.fromEntries(res.map(r=>[r.id,r]));
 assert.equal(byId[1].result.serverInfo.name,'guest-ai-bridge');
 assert.deepEqual(byId[2].result.tools.map(t=>t.name).sort(),['guest_auto','guest_providers','guest_usage','guest_models','guest_select_model'].sort());
 assert.equal(byId[3].error.code,-32602);
});

test('normal guest_auto skips read-only website discovery to avoid useless network delay',async()=>{
 let didDiscover=false;
 const result=await guestAuto({message:'Suggest three synthetic, public parser test cases'},
   {providers:[],usageData:{},healthStats:{},discover:async()=>{didDiscover=true;throw Error('should not call')}});
 assert.equal(result.status,'no_authorized_provider');
 assert.equal(didDiscover,false);
});

test('Claude installer dry-run never touches home directory',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'guest-personal-test-'));
 try{
  const proc=cp.spawnSync(process.execPath,[path.join(__dirname,'../setup-claude.cjs'),'--dry-run'],{encoding:'utf8',env:{...process.env,HOME:home,USERPROFILE:home},timeout:5000});
  assert.equal(proc.status,0,proc.stderr);
  assert.match(proc.stdout,/claude mcp add/);
  assert.equal(fs.existsSync(path.join(home,'.claude')),false);
 }finally{fs.rmSync(home,{force:true,recursive:true});}
});

test('Claude personal setup installs into stable home location, registers once, preserves existing skill', {skip:process.platform==='win32'},()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'guest-install-test-'));
 try{
  const bin=path.join(home,'bin');fs.mkdirSync(bin);
  const fake=path.join(bin,'claude');
  fs.writeFileSync(fake,`#!/bin/sh
if [ "$1" = "--version" ]; then echo "Claude Code 2.1 mock"; exit 0; fi
if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then
  if [ -f "$MOCK_CLAUDE_STATE" ]; then cat "$MOCK_CLAUDE_STATE"; exit 0; fi
  exit 1
fi
if [ "$1" = "mcp" ] && [ "$2" = "add" ]; then
  echo "$*" > "$MOCK_CLAUDE_STATE"; exit 0
fi
exit 3
`,{mode:0o755});
  const state=path.join(home,'fake-mcp-state.txt');
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,HOME:home,USERPROFILE:home,MOCK_CLAUDE_STATE:state};
  const cmd=[path.join(__dirname,'../setup-claude.cjs')];
  const first=cp.spawnSync(process.execPath,cmd,{encoding:'utf8',env,timeout:8000});
  assert.equal(first.status,0,first.stdout+'\n'+first.stderr);
  const stable=path.join(home,'.guest-ai-bridge','app','src','mcp-personal.cjs');
  const skill=path.join(home,'.claude','skills','guest-ai-bridge','SKILL.md');
  assert.equal(fs.existsSync(stable),true);
  assert.equal(fs.existsSync(skill),true);
  assert.match(fs.readFileSync(state,'utf8'),/--scope user guest-ai-bridge/);
  assert.ok(fs.readFileSync(state,'utf8').includes(stable));
  fs.writeFileSync(skill,'custom skill to preserve\n');
  const second=cp.spawnSync(process.execPath,cmd,{encoding:'utf8',env,timeout:8000});
  assert.equal(second.status,0,second.stdout+'\n'+second.stderr);
  assert.equal(fs.readFileSync(skill,'utf8'),'custom skill to preserve\n');
  assert.match(second.stdout,/Existing MCP registration/);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
