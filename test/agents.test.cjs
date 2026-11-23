'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SETUP = path.resolve(__dirname, '../setup-agents.cjs');
function envHome(fn) {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'guest-agents-'));
  try { return fn(h); } finally { fs.rmSync(h, {recursive:true,force:true}); }
}
function run(h, args, env={}) {
  return cp.spawnSync(process.execPath,[SETUP,...args],{
    env:{...process.env,HOME:h,USERPROFILE:h,...env},encoding:'utf8',timeout:12000
  });
}
function fakeCli(h,name,content){
  const bin=path.join(h,'bin');fs.mkdirSync(bin,{recursive:true});
  fs.writeFileSync(path.join(bin,name),`#!/bin/sh\n${content}\n`,{mode:0o755});
  return bin;
}

test('all-agent dry-run prints targets and makes no home changes',()=>envHome(h=>{
 const x=run(h,['all','--dry-run']);
 assert.equal(x.status,0,x.stderr+'\n'+x.stdout);
 for(const name of ['codex','hermes','pi','antigravity'])assert.match(x.stdout,new RegExp(name));
 assert.equal(fs.existsSync(path.join(h,'.guest-ai-bridge')),false);
 assert.equal(fs.existsSync(path.join(h,'.gemini')),false);
}));

test('Codex registers stable personal server through its native CLI; second run is idempotent', {skip:process.platform==='win32'},()=>envHome(h=>{
 const fake=`
if [ "$1" = "--version" ]; then echo "codex mock"; exit 0; fi
if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then
  if [ -f "$MOCK_STATE" ]; then cat "$MOCK_STATE"; exit 0; fi
  echo 'not found' >&2; exit 1
fi
if [ "$1" = "mcp" ] && [ "$2" = "list" ]; then
  if [ -f "$MOCK_STATE" ]; then printf '[';cat "$MOCK_STATE";echo ']'; else echo '[]'; fi
  exit 0
fi
if [ "$1" = "mcp" ] && [ "$2" = "add" ]; then
  printf '{"name":"guest-ai-bridge","transport":{"type":"stdio","command":"%s","args":["%s"]}}\\n' "$5" "$6" > "$MOCK_STATE"
  echo "add" >> "$MOCK_LOG"
  exit 0
fi
exit 3`;
 const bin=fakeCli(h,'codex',fake),state=path.join(h,'codex.json'),log=path.join(h,'adds.txt');
 const env={PATH:bin+path.delimiter+process.env.PATH,MOCK_STATE:state,MOCK_LOG:log};
 const a=run(h,['codex'],env);
 assert.equal(a.status,0,a.stdout+'\n'+a.stderr);
 const entry=JSON.parse(fs.readFileSync(state,'utf8'));
 assert.match(JSON.stringify(entry),/mcp-personal\.cjs/);
 assert.equal(fs.existsSync(path.join(h,'.guest-ai-bridge','app','src','mcp-personal.cjs')),true);
 const b=run(h,['codex'],env);
 assert.equal(b.status,0,b.stdout+'\n'+b.stderr);
 assert.equal(fs.readFileSync(log,'utf8').trim(),'add');
}));

test('Codex rejects conflicting name and does not copy application', {skip:process.platform==='win32'},()=>envHome(h=>{
 const bin=fakeCli(h,'codex',`
if [ "$1" = "--version" ]; then echo 'mock';exit 0;fi
if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then echo '{"name":"guest-ai-bridge","command":"node","args":["/other/app.js"]}';exit 0;fi
exit 3`);
 const x=run(h,['codex'],{PATH:bin+path.delimiter+process.env.PATH});
 assert.notEqual(x.status,0);
 assert.match(x.stderr+x.stdout,/conflict|refus|different|already/i);
 assert.equal(fs.existsSync(path.join(h,'.guest-ai-bridge')),false);
}));

test('Hermes registers via native mcp add --command, without editing model provider', {skip:process.platform==='win32'},()=>envHome(h=>{
 const bin=fakeCli(h,'hermes',`
if [ "$1" = "--version" ];then echo 'mock';exit 0;fi
if [ "$1" = "mcp" ] && [ "$2" = "list" ];then
  if [ -f "$MOCK_HERMES" ];then echo 'guest-ai-bridge (stdio)';else echo 'No MCP servers configured';fi
  exit 0
fi
if [ "$1" = "mcp" ] && [ "$2" = "add" ];then printf '%s\\n' "$*" > "$MOCK_HERMES";exit 0;fi
exit 3`);
 const state=path.join(h,'hermes-state'),env={PATH:bin+path.delimiter+process.env.PATH,MOCK_HERMES:state};
 const a=run(h,['hermes'],env);
 assert.equal(a.status,0,a.stdout+'\n'+a.stderr);
 assert.match(fs.readFileSync(state,'utf8'),/mcp add guest-ai-bridge --command/);
 assert.match(fs.readFileSync(state,'utf8'),/mcp-personal\.cjs/);
 const b=run(h,['hermes'],env);
 assert.notEqual(b.status,0); // existing registration: no unsafe overwrite on unknown CLI format
 assert.match(b.stderr+b.stdout,/already|refus|conflict/i);
}));

test('Pi native MCP CLI installs stable personal server; verifies global config', {skip:process.platform==='win32'},()=>envHome(h=>{
 const bin=fakeCli(h,'pi',`
if [ "$1" = "--version" ];then echo '1.5.0';exit 0;fi
if [ "$1" = "mcp" ] && [ "$2" = "add" ];then
  mkdir -p "$HOME/.pi/agent"
  printf '{"mcpServers":{"guest-ai-bridge":{"command":"%s","args":["%s"]}}}\\n' "$5" "$6" > "$HOME/.pi/agent/mcp.json"
  exit 0
fi
exit 3`);
 const env={PATH:bin+path.delimiter+process.env.PATH};
 const a=run(h,['pi'],env);
 assert.equal(a.status,0,a.stdout+'\n'+a.stderr);
 const obj=JSON.parse(fs.readFileSync(path.join(h,'.pi','agent','mcp.json'),'utf8'));
 assert.match(obj.mcpServers['guest-ai-bridge'].args[0],/mcp-personal\.cjs$/);
 const b=run(h,['pi'],env);
 assert.equal(b.status,0,b.stdout+'\n'+b.stderr);
}));

test('Antigravity merges global MCP config preserving other servers, backs up and stays idempotent',()=>envHome(h=>{
 const loc=path.join(h,'.gemini','config','mcp_config.json');fs.mkdirSync(path.dirname(loc),{recursive:true});
 const prior={mcpServers:{existing:{serverUrl:'https://example.com/mcp'}},other:{untouched:42}};
 fs.writeFileSync(loc,JSON.stringify(prior,null,2));
 const a=run(h,['antigravity']);
 assert.equal(a.status,0,a.stdout+'\n'+a.stderr);
 const now=JSON.parse(fs.readFileSync(loc,'utf8'));
 assert.deepEqual(now.mcpServers.existing,prior.mcpServers.existing);
 assert.deepEqual(now.other,prior.other);
 assert.match(now.mcpServers['guest-ai-bridge'].args[0],/mcp-personal\.cjs$/);
 const backups=fs.readdirSync(path.dirname(loc)).filter(x=>x.startsWith('mcp_config.json.bak-'));
 assert.equal(backups.length,1);
 const b=run(h,['antigravity']);
 assert.equal(b.status,0,b.stdout+'\n'+b.stderr);
 assert.equal(fs.readdirSync(path.dirname(loc)).filter(x=>x.startsWith('mcp_config.json.bak-')).length,1);
}));

test('Antigravity rejects conflicting MCP registration without changing config',()=>envHome(h=>{
 const loc=path.join(h,'.gemini','config','mcp_config.json');fs.mkdirSync(path.dirname(loc),{recursive:true});
 const prior='{"mcpServers":{"guest-ai-bridge":{"command":"node","args":["/other/place.js"]}}}\n';
 fs.writeFileSync(loc,prior);
 const x=run(h,['antigravity']);
 assert.notEqual(x.status,0);
 assert.equal(fs.readFileSync(loc,'utf8'),prior);
 assert.equal(fs.existsSync(path.join(h,'.guest-ai-bridge')),false);
}));

test('Antigravity refuses invalid JSON and symlink target',()=>envHome(h=>{
 const loc=path.join(h,'.gemini','config','mcp_config.json');fs.mkdirSync(path.dirname(loc),{recursive:true});
 fs.writeFileSync(loc,'{ invalid JSON ');
 assert.notEqual(run(h,['antigravity']).status,0);
 assert.equal(fs.readFileSync(loc,'utf8'),'{ invalid JSON ');
 fs.unlinkSync(loc);
 const target=path.join(h,'dont-touch');fs.writeFileSync(target,'{}');
 fs.symlinkSync(target,loc);
 assert.notEqual(run(h,['antigravity']).status,0);
 assert.equal(fs.readFileSync(target,'utf8'),'{}');
}));

test('Antigravity does not accept a path mention as proof of correct registration',()=>envHome(h=>{
 const cfg=path.join(h,'.gemini','config','mcp_config.json');fs.mkdirSync(path.dirname(cfg),{recursive:true});
 const expected=path.join(h,'.guest-ai-bridge','app','src','mcp-personal.cjs');
 const prior={mcpServers:{'guest-ai-bridge':{command:'/bin/echo',args:['unrelated'],note:`${process.execPath} ${expected}`}}};
 fs.writeFileSync(cfg,JSON.stringify(prior));
 const x=run(h,['antigravity']);
 assert.notEqual(x.status,0,'Unrelated command must be rejected, not accepted as identical');
 assert.match(x.stderr+x.stdout,/conflict|refus|different/i);
 assert.deepEqual(JSON.parse(fs.readFileSync(cfg,'utf8')),prior);
}));

test('Antigravity will not replace a dangling symlink config',()=>envHome(h=>{
 const cfg=path.join(h,'.gemini','config','mcp_config.json');fs.mkdirSync(path.dirname(cfg),{recursive:true});
 const missing=path.join(h,'missing.json');fs.symlinkSync(missing,cfg);
 const x=run(h,['antigravity']);
 assert.notEqual(x.status,0);
 assert.match(x.stderr+x.stdout,/symlink|non-regular|refus/i);
 assert.equal(fs.lstatSync(cfg).isSymbolicLink(),true);
}));

test('legacy install CLI forwards multi-agent dry-run without side effects',()=>envHome(h=>{
 const out=cp.spawnSync(process.execPath,[path.join(__dirname,'../src/cli.cjs'),'install','codex','--dry-run'],{
   env:{...process.env,HOME:h,USERPROFILE:h},encoding:'utf8',timeout:8000
 });
 assert.equal(out.status,0,out.stdout+'\n'+out.stderr);
 assert.match(out.stdout,/DRY RUN.*codex/);
 assert.equal(fs.existsSync(path.join(h,'.guest-ai-bridge')),false);
}));

test('refuses to copy application through a pre-existing stable-install symlink',()=>envHome(h=>{
 const app=path.join(h,'.guest-ai-bridge','app');fs.mkdirSync(path.dirname(app),{recursive:true});
 const target=path.join(h,'different-app');fs.mkdirSync(target);fs.symlinkSync(target,app,'dir');
 const runAnti=run(h,['antigravity']);
 assert.notEqual(runAnti.status,0);
 assert.match(runAnti.stderr+runAnti.stdout,/symlink|non-regular|refus/i);
 assert.deepEqual(fs.readdirSync(target),[]);
}));

test('stable app includes installer and can be rerun from permanent location',()=>envHome(h=>{
 const env={};
 const first=run(h,['antigravity'],env);
 assert.equal(first.status,0,first.stdout+'\n'+first.stderr);
 const stable=path.join(h,'.guest-ai-bridge','app','setup-agents.cjs');
 assert.equal(fs.existsSync(stable),true,'Installation must remain upgradeable without extracted ZIP');
 const second=cp.spawnSync(process.execPath,[stable,'antigravity'],{
   env:{...process.env,HOME:h,USERPROFILE:h},encoding:'utf8',timeout:10000
 });
 assert.equal(second.status,0,second.stdout+'\n'+second.stderr);
}));
