#!/usr/bin/env node
'use strict';
// User-invoked personal installer: read-only preflight, no clobbering existing Claude config or skills.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {installAgent}=require('./src/install.cjs');
const installDir=path.join(os.homedir(),'.guest-ai-bridge','app');
const server=path.join(installDir,'src','mcp-personal.cjs');
const skillSource=path.resolve(__dirname,'assets','claude','SKILL.md');
const skillTarget=path.join(os.homedir(),'.claude','skills','guest-ai-bridge','SKILL.md');
const command=['claude','mcp','add','--transport','stdio','--scope','user','guest-ai-bridge','--','node',server];
function printCommand(){console.log('Claude Code registration command:\n'+command.map(x=>/\s/.test(x)?JSON.stringify(x):x).join(' ')+'\n');}
function installApp(){
  fs.mkdirSync(installDir,{recursive:true,mode:0o700});
  // The code lives at a fixed path, so deleting/moving the downloaded ZIP will not break MCP.
  for(const item of ['src','config','assets','docs','examples','README.md','INSTALL.md','package.json','CHANGELOG.md']){
    const from=path.join(__dirname,item);
    if(fs.existsSync(from))fs.cpSync(from,path.join(installDir,item),{recursive:true,force:true});
  }
}
function run(){
 const dry=process.argv.includes('--dry-run');
 printCommand();
 console.log('Permanent install directory: '+installDir);
 console.log('Skill location: '+skillTarget);
 if(dry){console.log('DRY RUN: no configuration or files changed.');return}
 const ver=spawnSync('claude',['--version'],{encoding:'utf8',timeout:12000});
 if(ver.error?.code==='ENOENT'){
   console.error('Claude Code CLI not found in PATH. Install/access Claude Code first if your plan permits it.');
   console.error('Guest AI Bridge still works standalone: node src/cli.cjs auto "Suggest three synthetic test cases"');
   process.exitCode=2;return;
 }
 if(ver.error||ver.status!==0){console.error('Claude Code CLI did not run normally. No settings changed. '+(ver.stderr||ver.error?.message||''));process.exitCode=2;return;}
 // Guard against overriding another existing MCP server, including project-scoped definitions.
 const get=spawnSync('claude',['mcp','get','guest-ai-bridge'],{encoding:'utf8',timeout:12000});
 if(get.error){console.error('Could not inspect current MCP registration; no settings changed: '+get.error.message);process.exitCode=2;return;}
 if(get.status===0){
   const text=(get.stdout||'')+'\n'+(get.stderr||'');
   if(!text.includes(server)){
     console.error('Guest AI Bridge is already registered to a different or unverified location. Refusing to overwrite it.');
     console.error('Inspect with: claude mcp get guest-ai-bridge');
     console.error('If you choose to replace it: claude mcp remove guest-ai-bridge --scope user');
     process.exitCode=3;return;
   }
   console.log('Existing MCP registration refers to this personal server. Leaving it unchanged.');
   installApp();
 } else {
   installApp();
   const registered=installAgent('claude',{mcpScript:server});
   if(registered.status!=='registered'){
     console.error('Claude MCP registration failed; no skill was installed.');
     console.error(JSON.stringify(registered,null,2));process.exitCode=4;return;
   }
   console.log('Claude Code MCP registration command succeeded.');
 }
 if(fs.existsSync(skillTarget)){
   const old=fs.readFileSync(skillTarget,'utf8');
   const fresh=fs.readFileSync(skillSource,'utf8');
   console.log(old===fresh?'Personal skill already current.':'Existing personal skill preserved; compare with '+skillSource+' before updating.');
 } else {
   fs.mkdirSync(path.dirname(skillTarget),{recursive:true});
   fs.copyFileSync(skillSource,skillTarget);
   console.log('Installed optional Claude skill: /guest-ai-bridge');
 }
 const verify=spawnSync('claude',['mcp','get','guest-ai-bridge'],{encoding:'utf8',timeout:12000});
 if(verify.status===0&&((verify.stdout||'')+'\n'+(verify.stderr||'')).includes(server))console.log('Verified MCP registration points to the personal bridge.');
 else console.warn('MCP registration was not verified after setup. Check: claude mcp get guest-ai-bridge');
 console.log('Next: restart Claude Code, type /mcp to confirm connection, then ask: "Use guest_auto for three public JavaScript unit-test ideas."');
 console.log('Note: Claude Code still requires its own eligible account/API access; this tool does not unlock the Free plan.');
}
try{run()}catch(e){console.error('Setup error: '+e.message);process.exitCode=1}
