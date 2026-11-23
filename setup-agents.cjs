#!/usr/bin/env node
'use strict';
// User-invoked, non-destructive MCP setup for Codex, Hermes, Pi and Antigravity.
// No provider credentials, login, or model defaults are changed.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const AGENTS=['codex','hermes','pi','antigravity'];
const NAME='guest-ai-bridge';
const HOME=os.homedir();
const APP=path.join(HOME,'.guest-ai-bridge','app');
const SERVER=path.join(APP,'src','mcp-personal.cjs');
const NODE=process.execPath;
const ORIGINAL=__dirname;
const APP_ITEMS=['setup-agents.cjs','setup-claude.cjs','src','config','assets','docs','examples','README.md','INSTALL.md','package.json','CHANGELOG.md'];

function cli(command,args,ms=14000){
  return spawnSync(command,args,{encoding:'utf8',timeout:ms,stdio:['ignore','pipe','pipe']});
}
function checked(program,args,ms){
  const r=cli(program,args,ms);
  if(r.error||r.status!==0)throw Error(program+' '+args.join(' ')+' failed: '+String(r.error?.message||r.stderr||r.stdout||r.status).slice(0,350));
  return r;
}
function available(program){
  const r=cli(program,['--version'],9000);
  if(r.error||r.status!==0)throw Error(program+' CLI unavailable. Install it or run its manual MCP command from INSTALL.md.');
}
function isSecureFile(filename){
  let s;
  try{s=fs.lstatSync(filename)}catch(e){if(e.code==='ENOENT')return false;throw e}
  if(!s.isFile())throw Error('Refusing non-regular/symlink config file: '+filename);
  return true;
}
function isSecureDirectory(filename){
  let stats;try{stats=fs.lstatSync(filename)}catch(e){if(e.code==='ENOENT')return;throw e}
  if(!stats.isDirectory())throw Error('Refusing non-directory or symlink install path: '+filename);
}
function isSame(entry){
  if(!entry||typeof entry!=='object')return false;
  // Codex wraps stdio settings in transport; Pi and Antigravity use command/args.
  return (entry.command===NODE&&Array.isArray(entry.args)&&entry.args.includes(SERVER)) ||
    (entry.transport?.command===NODE&&Array.isArray(entry.transport?.args)&&entry.transport.args.includes(SERVER));
}
function copyApp(){
  if(fs.existsSync(APP)||fs.existsSync(path.dirname(APP))){
    isSecureDirectory(path.dirname(APP));
    isSecureDirectory(APP);
  }
  fs.mkdirSync(APP,{recursive:true,mode:0o700});
  for(const item of APP_ITEMS){
    const src=path.join(ORIGINAL,item);
    const target=path.join(APP,item);
    if(fs.existsSync(src)&&path.resolve(src)!==path.resolve(target))fs.cpSync(src,target,{recursive:true,force:true});
  }
}
function parseConfig(filename){
  if(!isSecureFile(filename))return {};
  const config=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Unexpected config root (object required): '+filename);
  if(config.mcpServers!==undefined&&(!config.mcpServers||typeof config.mcpServers!=='object'||Array.isArray(config.mcpServers)))throw Error('Invalid mcpServers map: '+filename);
  return config;
}
function installCodex(){
  available('codex');
  const current=cli('codex',['mcp','get',NAME,'--json']);
  if(current.error)throw Error('Unable to check existing Codex MCP: '+current.error.message);
  if(current.status===0){
    let obj;try{obj=JSON.parse(current.stdout)}catch{throw Error('Cannot parse existing Codex registration; refusing to replace it.')}
    if(!isSame(obj))throw Error('Conflicting Codex guest-ai-bridge registration. Refusing to overwrite it.');
    copyApp();return 'Already registered at the stable location; application refreshed.';
  }
  const list=cli('codex',['mcp','list','--json']);
  if(list.error||list.status!==0)throw Error('Cannot verify Codex server inventory; refusing to write.');
  let entries;try{entries=JSON.parse(list.stdout)}catch{throw Error('Codex returned invalid MCP inventory JSON; refusing to write.')}
  const rows=Array.isArray(entries)?entries:Object.entries(entries||{}).map(([name,value])=>({name,...value}));
  if(rows.some(r=>r.name===NAME))throw Error('Codex already lists '+NAME+'; refusing to replace it.');
  copyApp();
  checked('codex',['mcp','add',NAME,'--',NODE,SERVER]);
  const post=checked('codex',['mcp','get',NAME,'--json']);
  let obj;try{obj=JSON.parse(post.stdout)}catch{throw Error('Codex registration command ran but verification JSON was invalid.')}
  if(!isSame(obj))throw Error('Codex registration did not match requested server.');
  return 'Registered and verified using codex mcp get.';
}
function installHermes(){
  available('hermes');
  const list=checked('hermes',['mcp','list']);
  if(new RegExp('(^|[^A-Za-z0-9_-])'+NAME+'([^A-Za-z0-9_-]|$)','m').test(list.stdout||'')){
    throw Error('Hermes already lists '+NAME+'; refusing to replace existing settings. Inspect: hermes mcp list');
  }
  copyApp();
  checked('hermes',['mcp','add',NAME,'--command',NODE,'--args',SERVER],24000);
  const post=checked('hermes',['mcp','list']);
  if(!post.stdout.includes(NAME))throw Error('Hermes registration was not visible in hermes mcp list.');
  return 'Registered in Hermes MCP registry; restart Hermes and run hermes mcp test '+NAME+'.';
}
function installPi(){
  available('pi');
  const cfg=path.join(HOME,'.pi','agent','mcp.json');
  const root=parseConfig(cfg);
  const current=root.mcpServers?.[NAME];
  if(current){
    if(!isSame(current))throw Error('Conflicting Pi guest-ai-bridge registration; refusing to overwrite.');
    copyApp();return 'Already registered in Pi global MCP config; application refreshed.';
  }
  copyApp();
  checked('pi',['mcp','add',NAME,'--',NODE,SERVER]);
  const after=parseConfig(cfg).mcpServers?.[NAME];
  if(!isSame(after))throw Error('Pi MCP add exited successfully but global mcp.json did not verify.');
  return 'Registered and verified in ~/.pi/agent/mcp.json; use /mcp or /reload in Pi.';
}
function installAntigravity(){
  const cfg=path.join(HOME,'.gemini','config','mcp_config.json');
  const root=parseConfig(cfg),servers=root.mcpServers||{};
  if(servers[NAME]){
    if(!isSame(servers[NAME]))throw Error('Conflicting Antigravity guest-ai-bridge registration; refusing to overwrite.');
    copyApp();return 'Already registered in Antigravity global MCP config; application refreshed.';
  }
  // Preserve all other settings, including remote servers, with a private dated backup.
  const existed=fs.existsSync(cfg);
  const merged={...root,mcpServers:{...servers,[NAME]:{command:NODE,args:[SERVER]}}};
  copyApp();
  fs.mkdirSync(path.dirname(cfg),{recursive:true,mode:0o700});
  if(existed){
    const backup=cfg+'.bak-'+Date.now()+'-'+process.pid;
    fs.copyFileSync(cfg,backup,fs.constants.COPYFILE_EXCL);
    fs.chmodSync(backup,0o600);
  }
  const tmp=cfg+'.new-'+process.pid;
  try{
    fs.writeFileSync(tmp,JSON.stringify(merged,null,2)+'\n',{mode:0o600,flag:'wx'});
    fs.renameSync(tmp,cfg);
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
  return 'Merged into ~/.gemini/config/mcp_config.json with previous file backed up where present.';
}
function preview(agent){
  if(agent==='codex')return `codex mcp add ${NAME} -- ${NODE} ${SERVER}`;
  if(agent==='hermes')return `hermes mcp add ${NAME} --command ${NODE} --args ${SERVER}`;
  if(agent==='pi')return `pi mcp add ${NAME} -- ${NODE} ${SERVER}`;
  return `Merge ${NAME}: {"command":${JSON.stringify(NODE)},"args":[${JSON.stringify(SERVER)}]} into ~/.gemini/config/mcp_config.json`;
}
function main(args=process.argv.slice(2)){
  const dry=args.includes('--dry-run');
  const requested=args.filter(x=>!x.startsWith('--'));
  const agents=requested.length===1&&requested[0]==='all'?AGENTS:requested;
  if(!agents.length||agents.some(x=>!AGENTS.includes(x))){
    console.log('Usage: node setup-agents.cjs codex|hermes|pi|antigravity|all [--dry-run]\n'+
      'Runs only on this computer. Copies code to ~/.guest-ai-bridge/app; never changes model/API credentials.\n'+
      'Existing conflicting MCP registrations are preserved. Remove them manually before retrying.');
    process.exitCode=agents.length?2:0;return;
  }
  for(const agent of [...new Set(agents)]){
    try{
      if(dry){console.log('[DRY RUN] '+agent+': '+preview(agent));continue}
      const fn={codex:installCodex,hermes:installHermes,pi:installPi,antigravity:installAntigravity}[agent];
      console.log('[OK] '+agent+': '+fn());
    }catch(e){console.error('[NOT INSTALLED] '+agent+': '+e.message);process.exitCode=1}
  }
  if(!dry)console.log('For supported agents, restart/reload and check MCP tools guest_auto, guest_usage, guest_providers, guest_models and guest_select_model.\nThis provides tool delegation, not an automatic replacement for the agent\'s paid model or tool-call protocol.');
}
if(require.main===module)main();
module.exports={main,preview};
