'use strict';
// Optional, local model preference. No credentials and no paid-model fallback.
// Catalog names are untrusted metadata; Kilo's published zero-cost, :free models
// are the ONLY concrete remote model IDs this bridge may select anonymously.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {ROOT,ensureRoot,policy,authorization}=require('./state.cjs');
const {refreshCatalog}=require('./catalog.cjs');

const DEFAULT={mode:'auto'};
function selectionFile({stateDir=ROOT}={}){return path.join(stateDir,'selected-model.json')}
function readSelection(opts={}) {
 const file=selectionFile(opts);
 if(!fs.existsSync(file))return {...DEFAULT};
 if(fs.lstatSync(file).isSymbolicLink())throw Error('Unsafe model selection file (symbolic link)');
 if(fs.statSync(file).size>4096)throw Error('Model selection file is oversized');
 const x=JSON.parse(fs.readFileSync(file,'utf8'));
 if(x?.mode==='auto')return {...DEFAULT};
 if(x?.mode!=='fixed'||typeof x.choice_id!=='string'||typeof x.provider_id!=='string')throw Error('Invalid model selection file');
 return x;
}
function eligible(p){try{authorization(p);return p.free_only===true;}catch{return false}}
function userSafeId(id){return typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,180}$/.test(id)&&!id.includes('..')}
function trimName(x){return String(x||'').slice(0,140)}
function filterSearch(arr,q){return q?arr.filter(x=>[x.choice_id,x.label,x.model_id].some(s=>String(s||'').toLowerCase().includes(q))):arr}
async function listModelChoices({refresh=false,include_locked=true,query=''}={},deps={}) {
 if(typeof query!=='string'||query.length>80)throw Error('Search must be at most 80 characters');
 const q=query.trim().toLowerCase();
 const providers=deps.providers||policy().providers;
 const byId=new Map(providers.map(p=>[p.id,p]));
 const catalog=await (deps.catalog||refreshCatalog)({refresh});
 const kiloCatalog=catalog.catalogs?.find(c=>c.id==='kilo-free');
 const fresh=Number.isFinite(catalog.checked_at)&&Date.now()-catalog.checked_at<=60*60*1000&&catalog.checked_at<Date.now()+60000;
 const kiloEnabled=fresh&&eligible(byId.get('kilo-free')||{});
 const freeModels=kiloEnabled&&kiloCatalog?.status==='available'? (kiloCatalog.free_models||[]).filter(x=>x.id!=='kilo-auto/free'&&x.id.endsWith(':free'))
   .map(x=>({choice_id:x.id,model_id:x.id,provider_id:'kilo-free',label:trimName(x.name||x.id),kind:'specific_free_model',selectable:true,
     status:'catalog_eligible_not_live_verified',catalog_source:'https://ai-gateway.kilo.ai/api/v1/models',context_length:x.context_length||null,
     underlying_model_verified:false})):[];
 const aliases=providers.filter(p=>p.transport==='openai_compatible'&&eligible(p)).map(p=>({
   choice_id:p.id==='kilo-free'?'kilo-auto/free':p.id,model_id:p.model,provider_id:p.id,label:trimName(p.display_name||p.id),kind:'free_auto_alias',
   selectable:true,status:'free_router_alias',underlying_model_verified:false,
   note:'The upstream model is chosen by the provider; a request response may identify it.'
 }));
 const spaces=providers.filter(p=>p.transport==='gradio_space'&&eligible(p)).map(p=>({
   choice_id:p.id,provider_id:p.id,model_id:null,label:trimName(p.display_name||p.id),kind:'public_chat_demo',
   model_claim:trimName(p.model||p.display_name||p.id),selectable:true,status:'third_party_demo_no_uptime_guarantee',underlying_model_verified:false,
   note:'Model identity is asserted by the Space operator, not independently verified by Guest AI Bridge.'
 }));
 const locked=include_locked&&kiloCatalog?.status==='available'?(kiloCatalog.frontier_models||[]).map(x=>({
   choice_id:x.id,model_id:x.id,label:trimName(x.name||x.id),kind:'frontier_catalog_listing',selectable:false,
   status:'locked_requires_own_credentials_or_payment',context_length:x.context_length||null,
   catalog_source:'https://ai-gateway.kilo.ai/api/v1/models',note:'Catalog listing only. Bridge never invokes paid or authenticated models.'
 })):[];
 const selected=deps.selection?deps.selection():readSelection(deps);
 return {status:'ok',checked_at:catalog.checked_at?new Date(catalog.checked_at).toISOString():null,from_cache:!!catalog.from_cache,
   selected,free_models:filterSearch(freeModels,q).slice(0,100),free_auto:filterSearch(aliases,q),browser_demos:filterSearch(spaces,q),
   frontier_locked:filterSearch(locked,q).slice(0,45),locked_models_total:locked.length,notes:[
    'FREE means catalog-eligible, not guaranteed to answer at this moment or proven frontier-class performance.',
    'Paid frontier model listings are shown for comparison only; they CANNOT be selected by this free-only bridge.',
    'JarvisClaw and Vireonix expose auto aliases anonymously; their underlying models are not individually selectable.'
   ]};
}
async function resolveChoice(choiceId,deps={}) {
 if(!userSafeId(choiceId))throw Error('Invalid model choice');
 const catalog=await listModelChoices({refresh:false,include_locked:true},deps);
 const choice=[...catalog.free_models,...catalog.free_auto,...catalog.browser_demos].find(x=>x.choice_id===choiceId);
 if(!choice)throw Error('Model is not selectable as an anonymous free route (paid, unknown, unavailable, or expired). Use guest_models / models to see eligible options.');
 return choice;
}
async function chooseModel(choiceId,deps={}) {
 const dir=deps.stateDir||ROOT;
 if(typeof choiceId!=='string'||!choiceId.trim())throw Error('Model ID is required');
 const id=choiceId.trim();
 let value;
 if(id==='auto')value={mode:'auto'};
 else {
   const choice=await resolveChoice(id,deps);
   value={mode:'fixed',choice_id:choice.choice_id,provider_id:choice.provider_id,
    model_id:choice.kind==='specific_free_model'?choice.model_id:null,
    selected_at:new Date().toISOString()};
 }
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=selectionFile({stateDir:dir});
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Unsafe model selection file (symbolic link)');
 const tmp=file+'.'+process.pid+'.'+crypto.randomBytes(4).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}
 finally{try{fs.rmSync(tmp,{force:true})}catch{}}
 return {status:'selected',selection:value,warning:value.mode==='fixed'?'Strict mode: the bridge will not silently switch to another model if this choice fails. Use auto to restore fallback.':null};
}
async function verifyFreeKiloModel(modelId,deps={}) {
 if(typeof modelId!=='string'||!modelId.endsWith(':free')||!userSafeId(modelId))return false;
 const catalog=await (deps.catalog||refreshCatalog)({refresh:false});
 // No stale/offline provider catalog is accepted as permission.
 if(!Number.isFinite(catalog.checked_at)||Date.now()-catalog.checked_at>60*60*1000||catalog.checked_at>Date.now()+60000)return false;
 const kilo=catalog.catalogs?.find(x=>x.id==='kilo-free');
 return !!(kilo?.status==='available'&&kilo.free_models?.some(x=>x.id===modelId));
}
module.exports={readSelection,listModelChoices,resolveChoice,chooseModel,verifyFreeKiloModel};
