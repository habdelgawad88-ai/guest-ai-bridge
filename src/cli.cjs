#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const { dispatch }=require('./bridge.cjs');
const { ROOT,POLICY_FILE,EXAMPLE,ensureRoot,policy }=require('./state.cjs');
async function main(){
 const [cmd,...args]=process.argv.slice(2);
 if(!cmd||cmd==='help'){
   console.log('Guest AI Bridge v0.7.0 (free-model choice; no login, no API key, no CAPTCHA)\n'+
   '  models [--frontier] [--refresh] [--json]   Browse selectable and locked frontier models\n'+
   '  use <model-id|auto>           Pick free model globally; auto restores fallback\n'+
   '  selected                      Show current selected model\n'+
   '  auto <prompt> [--model ID]    Send via selected model, or automatic router\n'+
   '  plan <prompt> [--no-web]       Decide provider without sending prompt\n'+
   '  refresh                        Fetch official public free-model catalogs\n'+
   '  auto-add [--force]             Discover, test, and auto-admit verified public Gradio chats\n'+
   '  discover [term] [--no-web]     Search candidate webchat sites (read only)\n'+
   '  scan [term]                   Inspect guest chat UIs (sends no prompt)\n'+
   '  providers | usage | doctor\n'+
   '  install codex|hermes|pi|antigravity|all [--dry-run]   Stable MCP installers\n'+
   '  Claude personal setup: node setup-claude.cjs [--dry-run]\n'+
   '  proxy: node src/proxy.cjs    Local OpenAI-compatible server, model guest-auto\n'+
   '  proxy-config                   Show localhost base URL + generated-token location\n'+
   '  init | migrate               Optional, NOT required for built-in free APIs\n'+
   '  inspect <https-url>\n  ask <provider-id> <prompt>\n'+
   '  browser-add --id ID --url HTTPS_URL --permission-url HTTPS_POLICY --editor CSS --send CSS --reply CSS --approve\n'+
   '  mcp: node src/mcp.cjs');return;
 }
 if(cmd==='models'){
   const entries=await dispatch.guest_models({refresh:args.includes('--refresh'),include_locked:args.includes('--frontier')||args.includes('--all'),query:args.filter(x=>!x.startsWith('--')).join(' ')});
   if(args.includes('--json')){console.log(JSON.stringify(entries,null,2));return}
   console.log('Guest AI Bridge models (only FREE choices are executable)');
   console.log('Current: '+(entries.selected.mode==='fixed'?entries.selected.choice_id:'auto'));
   console.log('Official catalog checked: '+(entries.checked_at||'unavailable')+(entries.from_cache?' (cached)':''));
   const entriesAvailable=[...entries.free_auto,...entries.free_models,...entries.browser_demos];
   entriesAvailable.forEach((x,i)=>console.log(String(i+1).padStart(2)+'. '+x.choice_id+' — '+x.label+' ['+x.kind+']'));
   if(entries.frontier_locked.length){console.log('\nFRONTIER MODELS — LOCKED (shown for comparison, not free):');for(const x of entries.frontier_locked)console.log(' - '+x.model_id+' — '+x.label);}
   console.log('\nSelect: node src/cli.cjs use <exact-choice-id>');
   console.log('Restore fallback: node src/cli.cjs use auto');return;
 }
 if(cmd==='selected'){const {readSelection}=require('./model-choice.cjs');console.log(JSON.stringify(readSelection(),null,2));return}
 if(cmd==='use'){
   let id=args[0];if(!id)throw Error('Expected model ID from models, or auto');
   if(/^\d+$/.test(id)){
     const c=await dispatch.guest_models({include_locked:false});const a=[...c.free_auto,...c.free_models,...c.browser_demos];
     const index=Number(id)-1;if(!Number.isSafeInteger(index)||!a[index])throw Error('Choice number is not in the current selectable list');id=a[index].choice_id;
   }
   console.log(JSON.stringify(await dispatch.guest_select_model({model_id:id}),null,2));return;
 }
 if(cmd==='proxy-config'){const {localToken}=require('./proxy-token.cjs');localToken();console.log(JSON.stringify({base_url:'http://127.0.0.1:'+(process.env.GUEST_BRIDGE_PROXY_PORT||8843)+'/v1',model:'guest-auto',token_file:require('node:path').join(ROOT,'proxy-token'), note:'Read token from file when configuring a local OpenAI-compatible client; no external account or API key required.'},null,2));return}
 if(cmd==='install'){
   if(args[0]==='claude'){
     const {spawnSync}=require('node:child_process');
     const runner=require('node:path').join(__dirname,'../setup-claude.cjs');
     const p=spawnSync(process.execPath,[runner,...args.slice(1)],{stdio:'inherit',timeout:60000});
     if(p.error)throw p.error;
     if(p.status!==0)process.exitCode=p.status||1;return;
   }
   require('../setup-agents.cjs').main(args);return;
 }
 if(cmd==='init'){
   ensureRoot();if(fs.existsSync(POLICY_FILE)){console.log('Existing policy preserved: '+POLICY_FILE);return}
   fs.copyFileSync(EXAMPLE,POLICY_FILE);fs.chmodSync(POLICY_FILE,0o600);
   console.log('Created optional policy: '+POLICY_FILE);return;
 }
 if(cmd==='migrate'){
   ensureRoot();if(!fs.existsSync(POLICY_FILE)){console.log('No migration needed; latest audited free providers are automatically available');return}
   const current=JSON.parse(fs.readFileSync(POLICY_FILE,'utf8'));
   if(!Array.isArray(current.providers))throw Error('Bad provider config');
   const combined=policy();const existing=new Set(current.providers.map(x=>x.id));
   const additions=combined.providers.filter(x=>!existing.has(x.id));
   if(!additions.length){console.log('Up to date; no changes');return}
   const backup=POLICY_FILE+'.before-v0.3-'+Date.now()+'.bak';
   fs.copyFileSync(POLICY_FILE,backup);fs.chmodSync(backup,0o600);
   const tmp=POLICY_FILE+'.new-'+process.pid;
   fs.writeFileSync(tmp,JSON.stringify({...current,providers:combined.providers},null,2)+'\n',{mode:0o600});fs.renameSync(tmp,POLICY_FILE);
   console.log('Persisted '+additions.map(x=>x.id).join(', ')+' (automatic in-memory defaults work without migrate); backup '+backup);return;
 }
 if(cmd==='browser-add'){const result=require('./browser-policy.cjs').addBrowserRoute(args);console.log(JSON.stringify(result,null,2));return;}
 if(cmd==='auto-add'){
   console.log(JSON.stringify(await require('./auto-add.cjs').discoverAndAdd({force:args.includes('--force')}),null,2));return;
 }
 if(cmd==='doctor'){
   const {findBrowser}=require('./browser.cjs');let chrome;try{chrome=findBrowser()}catch(e){chrome='NOT FOUND (optional for free APIs)'}
   console.log(JSON.stringify({node:process.version,browser:chrome,policy:POLICY_FILE,policy_exists:fs.existsSync(POLICY_FILE),
     approved_anonymous_apis:policy().providers.filter(p=>p.enabled&&p.automation_authorized&&p.transport==='openai_compatible').map(p=>p.id),
     registration_required:false,captcha_required:false,manual_provider_configuration_required:false,stdio_mcp:'supported',remote_mcp:'requires secure hosting and client support'},null,2));return;
 }
 const modelIndex=args.indexOf('--model');
 const modelId=modelIndex>=0?args[modelIndex+1]:undefined;
 if(modelIndex>=0&&!modelId)throw Error('--model requires a choice ID or auto');
 const cleaned=modelIndex>=0?args.filter((_,i)=>i!==modelIndex&&i!==modelIndex+1):args;
 const rest=cleaned.filter(x=>x!=='--web'&&x!=='--no-web');
 const commands={
   providers:()=>dispatch.guest_providers({}),usage:()=>dispatch.guest_usage({}),
   refresh:()=>dispatch.guest_catalog({refresh:true}),
   discover:()=>dispatch.guest_discover({query:rest.join(' ').slice(0,100),search_web:!args.includes('--no-web')}),
   scan:()=>dispatch.guest_scan({query:rest.join(' ').slice(0,100)||undefined,search_web:!args.includes('--no-web')}),
   inspect:()=>dispatch.guest_inspect({url:rest[0]}),
   ask:()=>dispatch.guest_ask({provider_id:rest[0],message:rest.slice(1).join(' '),model_id:modelId}),
   plan:()=>dispatch.guest_route_plan({message:rest.join(' '),search_web:!args.includes('--no-web'),model_id:modelId}),
   auto:()=>dispatch.guest_auto({message:rest.join(' '),search_web:!args.includes('--no-web'),model_id:modelId})
 };
 if(!commands[cmd])throw Error('Unknown command '+cmd);
 console.log(JSON.stringify(await commands[cmd](),null,2));
}
main().catch(e=>{console.error('Error: '+e.message);process.exitCode=1});
