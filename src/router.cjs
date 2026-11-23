'use strict';
const { discover }=require('./discovery.cjs');
const { policy, quotaSnapshot, usage, health, authorization }=require('./state.cjs');
const { detectSensitive }=require('./safety.cjs');
const { validateAnonymousAPI, safeMessages }=require('./api.cjs');
const { readSelection, resolveChoice }=require('./model-choice.cjs');

const TASKS=['general','coding','reasoning','math','writing','summarization','research'];
function inferTask(message,requested='auto') {
  if(!TASKS.includes(requested)&&requested!=='auto')throw Error('Unknown task_type');
  if(requested!=='auto')return requested;
  if(/```|\b(?:code|function|refactor|program|compile|typescript|javascript|python|debug|git|unit test|sql|bug|schema|api)\b/i.test(message))return 'coding';
  if(/\b(?:calculate|equation|multiply|division|solve the math|arithmetic|algebra)\b/i.test(message))return 'math';
  if(/\b(?:summarize|summary|condense|outline the following|extract key points)\b/i.test(message))return 'summarization';
  if(/\b(?:write|rewrite|draft|polish|email|poem|headline|paragraph)\b/i.test(message))return 'writing';
  if(/\b(?:reason|logic|prove|evaluate tradeoffs|compare alternatives|analyze)\b/i.test(message))return 'reasoning';
  if(/\b(?:search the web|latest news|current sources|web research|find publications)\b/i.test(message))return 'research';
  return 'general';
}
function scoreProvider(p,{task_type='general',max_chars=0,now=Date.now(),healthStats={},usageData=usage(),requires_chat_context=false}={}) {
  try{authorization(p)}catch(e){return {id:p.id,eligible:false,reason:e.message,score:null}}
  if(requires_chat_context&&p.transport!=='openai_compatible')return {id:p.id,eligible:false,reason:'Browser chat routes cannot preserve API system_prompt/history',score:null};
  if(!p.free_only)return {id:p.id,eligible:false,reason:'Paid-capable providers are excluded by the free-only router',score:null};
  if(max_chars>(p.max_prompt_chars||3000))return {id:p.id,eligible:false,reason:'Prompt exceeds provider capacity',score:null};
  if(p.transport==='openai_compatible'){try{validateAnonymousAPI(p)}catch(e){return {id:p.id,eligible:false,reason:e.message,score:null}}}
  const q=quotaSnapshot(p,usageData,now);
  if(!q.available)return {id:p.id,eligible:false,reason:q.reason,score:null,remaining_local:q.remaining,available_at:q.available_at||null};
  const h=healthStats[p.id]||{};
  if(now<(h.blocked_until_ms||0))return {id:p.id,eligible:false,reason:'Provider temporarily on health cooldown',score:null,available_at:new Date(h.blocked_until_ms).toISOString()};
  const caps=Array.isArray(p.capabilities)?p.capabilities:['general'];
  if(task_type==='research'&&!caps.includes('web_search'))return {id:p.id,eligible:false,reason:'No verified live web search capability',score:null};
  if(task_type!=='general'&&!caps.includes(task_type)&&!caps.includes('general'))return {id:p.id,eligible:false,reason:'Task capability not supported',score:null};
  const success=(h.success||0),failure=(h.failure||0);
  const reliability=(success+2)/(success+failure+4); // Beta(2,2) prior, prevent optimistic bias
  const latencyMs=h.ewma_latency_ms||14000;
  const skill=caps.includes(task_type)?26:(caps.includes('general')?7:0);
  const channel=p.transport==='openai_compatible'?24:p.transport==='gradio_space'?9:6;
  const priority=Number.isFinite(p.priority)?Math.max(-20,Math.min(20,p.priority)):0;
  const remainingFrac=Math.min(1,q.remaining/Math.max(1,p.daily_max));
  const score=Math.round((50+skill+channel+priority+35*reliability+10*remainingFrac-Math.min(24,latencyMs/3000))*100)/100;
  return {id:p.id,eligible:true,score,transport:p.transport||'browser',reliability_estimate:Number(reliability.toFixed(3)),
    remaining_local:q.remaining,observed_latency_ms:h.ewma_latency_ms||null,
    capability: caps.includes(task_type)?'declared_match':'general_fallback',
    model:p.transport==='openai_compatible'?p.model:(p.display_name||p.id),
    reason:'eligible: permitted free transport, within local limits; ranking is heuristic'};
}
function rankProviders(providers,opts={}) {
  return providers.map(p=>scoreProvider(p,opts)).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||((b.score??-1)-(a.score??-1))||a.id.localeCompare(b.id));
}
async function selectionForRequest(model_id,deps={}) {
  let choiceId=model_id;
  if(choiceId===undefined){
    const saved=deps.selection?deps.selection():readSelection();
    if(saved.mode==='auto')return null;
    choiceId=saved.choice_id;
  }
  if(choiceId==='auto')return null;
  try{return await (deps.resolveChoice||resolveChoice)(choiceId,deps)}
  catch(e){return {choice_id:choiceId,unavailable:true,reason:String(e.message||e).slice(0,200)}}
}
async function routePlan({message='',history=[],system_prompt='',task_type='auto',discover_sites=false,search_web=false,max_candidates=25,model_id}={},deps={}) {
  if(typeof message!=='string'||message.length>12000)throw Error('message length invalid');
  const messages=message?safeMessages(message,history,system_prompt):[];
  if(messages.some(x=>detectSensitive(x.content)))return {status:'sensitive_content_blocked',selected:null,ranked:[],warning:'Do not send private, patient or credential data to guest providers.'};
  const task=inferTask(message,task_type);
  const providers=deps.providers||policy().providers;
  const ranked=rankProviders(providers,{task_type:task,max_chars:messages.reduce((n,m)=>n+m.content.length,0),now:deps.now||Date.now(),healthStats:deps.healthStats||health(),usageData:deps.usageData,requires_chat_context:!!(history.length||system_prompt)});
  const selectedModel=await selectionForRequest(model_id,deps);
  const best=selectedModel?ranked.find(x=>x.id===selectedModel.provider_id):ranked.find(x=>x.eligible);
  const ready=selectedModel ? (!selectedModel.unavailable&&best?.eligible) : !!best;
  const discoveryFn=deps.discover||discover;
  let discovery_info={status:'skipped'};
  if(discover_sites){
    // Discovery is optional: enabled manually through guest_discover or explicit flags, never on each task.
    // Discovery queries contain NO user prompt. Never leak the request text into web searches.
    try {
      const d=await discoveryFn({query:'free AI chat no account',max_results:Math.max(1,Math.min(100,Number(max_candidates)||25)),search_web:!!search_web});
      discovery_info={status:'complete',total_candidates:d.total_candidates,shown:d.shown,directory_status:d.directory_status,search_status:d.search_status,
        unverified_samples:(d.candidates||[]).slice(0,8).map(({name,url,source})=>({name,url,source}))};
    }catch(e){discovery_info={status:'discovery_unavailable',reason:e.message.slice(0,180)};}
  }
  return {status:ready?'route_ready':selectedModel?'selected_model_unavailable':'no_authorized_provider',
    reason:selectedModel&&!ready?(selectedModel.reason||best?.reason||'Selected provider not available for this request'):null,
    selected_model:selectedModel||null,task_type:task,selected:ready?(best?.id||null):null,ranked,
    discovery:discovery_info,auto_enable_unverified_sites:false,
    note:'Discovered sites are suggestions only. Provider admission requires documented authorization; scoring uses declared capability, local success/latency and quota. No CAPTCHA or registration bypass.'};
}
async function guestAuto({message,history=[],system_prompt='',task_type='auto',discover_sites=false,search_web=false,max_attempts=3,model_id}={},deps={}) {
  if(typeof message!=='string'||!message.trim()||message.length>12000)throw Error('message must be 1–12000 characters');
  max_attempts=Math.max(1,Math.min(3,Number(max_attempts)||3));
  const p=await routePlan({message,history,system_prompt,task_type,discover_sites,search_web,model_id},deps);
  if(p.status!=='route_ready')return {...p,reply:null,attempts:[]};
  const ask=deps.ask||require('./bridge.cjs').guestAsk;
  const attemptLog=[];
  // Rank scores and local cooldowns are refreshed before each attempt.
  const candidates=p.selected_model?p.ranked.filter(x=>x.eligible&&x.id===p.selected_model.provider_id):p.ranked.filter(x=>x.eligible).slice(0,max_attempts);
  for(const candidate of candidates) {
    const started=Date.now();
    try {
      const result=await ask({provider_id:candidate.id,message,history,system_prompt,...(p.selected_model?.model_id?{model_id:p.selected_model.model_id}:{})});
      attemptLog.push({provider_id:candidate.id,status:result.status,elapsed_ms:Date.now()-started});
      if(result.status==='reply'&&typeof result.reply==='string'&&result.reply.trim()){
        return {status:'reply',provider_id:candidate.id,task_type:p.task_type,model:result.model||null,
          reply:result.reply,model_verified:!!result.model_verified,transport:result.method||candidate.transport,
          source_result:result,attempts:attemptLog,discovery:p.discovery,selected_model:p.selected_model||null,
          note:'This response was produced by an external provider; verify factual or code-sensitive outputs before use.'};
      }
    } catch(e){
      attemptLog.push({provider_id:candidate.id,status:'error',reason:String(e.message||e).slice(0,220),elapsed_ms:Date.now()-started});
    }
  }
  return {status:p.selected_model?'selected_model_failed':'all_candidates_failed',reply:null,task_type:p.task_type,attempts:attemptLog,discovery:p.discovery,selected_model:p.selected_model||null,
    note:'No reply was verified. Do not treat a submitted prompt as an answered model request.'};
}
module.exports={TASKS,inferTask,scoreProvider,rankProviders,routePlan,guestAuto};
