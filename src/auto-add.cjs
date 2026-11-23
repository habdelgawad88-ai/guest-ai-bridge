'use strict';
// Admission is restricted to public Hugging Face Gradio apps exposing an explicitly
// documented chat endpoint. Search pages, undocumented endpoints and ordinary
// guest websites never become executable routes merely by being discoverable.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {ROOT,POLICY_FILE,EXAMPLE}=require('./state.cjs');
const {publicDnsVerified}=require('./safety.cjs');
const {askGradioSpace}=require('./gradio.cjs');
const DOCS='https://huggingface.co/docs/hub/spaces-api-endpoints';
const HUB='https://huggingface.co';
const PROMPT='What is 117 + 104? Reply with only the integer.';
const DAY=24*60*60*1000;
const HOUR=60*60*1000;
const SAFE_OPTIONS=new Set(['max_new_tokens','max_tokens','temperature','thinking']);
const INPUT_FIELDS=['message','prompt','text','query'];
function selectChatEndpoint(spec) {
  if(!spec||typeof spec!=='object'||!spec.paths||typeof spec.paths!=='object')return null;
  for(const [pathName,entry] of Object.entries(spec.paths)) {
    const m=/^\/gradio_api\/call\/v2\/([a-z0-9_-]{1,50})$/i.exec(pathName);
    if(!m||!entry?.post||!spec.paths[`/gradio_api/call/${m[1]}/{event_id}`]?.get)continue;
    const name=m[1],post=entry.post;
    if(!/(?:chat|ask|reply|respond|generate|complete|predict|answer)/i.test(`${name} ${post.summary||''} ${post.description||''}`)||/(?:login|auth|upload|flag|delete|private|image|voice|speech)/i.test(name))continue;
    const schema=post.requestBody?.content?.['application/json']?.schema;
    const props=schema?.properties;
    if(!props||typeof props!=='object')continue;
    const field=INPUT_FIELDS.find(k=>props[k]?.type==='string') ||
      ((props.messages?.type==='array'&&props.messages.items?.type==='object')?'messages':null);
    if(!field)continue;
    const supported=new Set([field,...SAFE_OPTIONS]);
    if((schema.required||[]).some(k=>!supported.has(k)))continue;
    const api_params=Object.keys(props).filter(k=>SAFE_OPTIONS.has(k));
    return {api_name:name,input_field:field,api_params};
  }
  return null;
}
function validId(id){return typeof id==='string'&&/^[a-zA-Z0-9_.-]{1,110}\/[a-zA-Z0-9_.-]{1,140}$/.test(id)&&!id.includes('..')}
function validSubdomain(x){return typeof x==='string'&&x.length<=100&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)}
function relevantChat(s){
  const name=[s.id,s.cardData?.title,s.cardData?.short_description].filter(Boolean).join(' ');
  return /(?:chat|llm|assistant|qwen|gemma|gpt|mistral|language.model|text.generation|coder)/i.test(name)&&
    !/(?:image.edit|image.generate|face.swap|tts|speech.synthesis|voice.clone|image.studio|prompt.generator|prompt.format|text.to.speech)/i.test(name);
}
function routeId(id){
  const stem=id.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42).replace(/-$/,'');
  return 'hf-'+stem+'-'+crypto.createHash('sha256').update(id).digest('hex').slice(0,8);
}
async function getJson(url,{fetchImpl,dnsVerify,timeoutMs=9000}) {
  await dnsVerify(url);
  const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{'Accept':'application/json','User-Agent':'GuestAIBridge/0.6 (public Gradio API qualification)'},signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const length=Number(response.headers?.get('content-length')||0);
  if(length>600000)throw Error('Oversized API response');
  const text=await response.text();
  if(text.length>600000)throw Error('Oversized API response');
  return JSON.parse(text);
}
function correctProbe(result){
  if(result?.status!=='reply'||typeof result.reply!=='string')return false;
  const answer=result.reply.trim();
  return answer.length<=160&&/(?:^|\D)221(?:\D|$)/.test(answer)&&!/error|quota|retry|exception|rate.limit|worker/i.test(answer);
}
function resolveLimits(options={}) {
  const c=Number(options.max_checks),p=Number(options.max_probes);
  return {max_checks:Number.isFinite(c)&&c>=1?Math.max(1,Math.min(15,Math.trunc(c))):15,
    max_probes:Number.isFinite(p)&&p>=0?Math.max(0,Math.min(3,Math.trunc(p))):2};
}
// Uses a separate local directory/registry dependency during tests. No prompts or model
// replies are ever stored. Existing manually disabled entries remain disabled.
async function discoverAndAdd(options={},deps={}) {
  const dir=deps.stateDir||ROOT,file=deps.policyFile||POLICY_FILE;
  const fetchImpl=deps.fetchImpl||fetch,dnsVerify=deps.dnsVerify||publicDnsVerified;
  const probe=deps.probe||((p,text)=>askGradioSpace(p,text));
  const clock=deps.now||(()=>Date.now());
  const {max_checks,max_probes}=resolveLimits(options);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Policy path must not be a symlink');
  const metaFile=path.join(dir,'auto-admission.json'),lockFile=path.join(dir,'auto-admission.lock');
  const now=clock();
  let previous={};try{previous=JSON.parse(fs.readFileSync(metaFile,'utf8'))}catch{}
  const cacheMs=previous.status==='source_unavailable'?HOUR:DAY;
  if(!options.force&&previous.last_checked_ms&&now-previous.last_checked_ms<cacheMs)
    return {status:'cached',last_checked_at:previous.last_checked_at,added:[],verified:0,previous_status:previous.status||'scanned',previous_added:previous.last_added||[],next_scan_at:new Date(previous.last_checked_ms+cacheMs).toISOString()};
  let fd;
  try{fd=fs.openSync(lockFile,'wx',0o600)}catch(e){
    if(e.code!=='EEXIST')throw e;
    const st=fs.lstatSync(lockFile);
    if(st.isSymbolicLink())throw Error('Unsafe discovery lock file');
    if(now-st.mtimeMs<6*60*1000)return {status:'busy',added:[],note:'Another agent process is already checking public routes'};
    fs.unlinkSync(lockFile);fd=fs.openSync(lockFile,'wx',0o600);
  }
  const summary={status:'scanned',checked:0,probed:0,verified:0,added:[],revalidated:[],rejected:[],source:'Hugging Face public Gradio OpenAPI',evidence:DOCS};
  function saveMeta(metadata){
    const tmp=metaFile+'.'+process.pid+'.tmp';
    try{fs.writeFileSync(tmp,JSON.stringify(metadata,null,2),{mode:0o600});fs.renameSync(tmp,metaFile)}
    finally{try{fs.rmSync(tmp,{force:true})}catch{}}
  }
  try {
    // Only a public, platform-defined directory can supply automatically admitted candidates.
    let candidates;
    try{candidates=await getJson(`${HUB}/api/spaces?search=${encodeURIComponent(options.query||'chat')}&limit=48&full=true`,{fetchImpl,dnsVerify})}
    catch(e){
      const reason=String(e.message||e).slice(0,160);
      saveMeta({status:'source_unavailable',last_checked_ms:clock(),last_checked_at:new Date(clock()).toISOString(),last_added:[],error:reason});
      return {...summary,status:'source_unavailable',reason};
    }
    if(!Array.isArray(candidates))throw Error('Hugging Face directory returned unexpected data');
    const seen=new Set();
    let priorProviders=[];
    try{priorProviders=JSON.parse(fs.readFileSync(file,'utf8')).providers||[]}catch{}
    const known=new Map(priorProviders.filter(p=>p.auto_source_space).map(p=>[p.auto_source_space,p]));
    const failed={...(previous.failed_candidates||{})};
    for(const [key,at] of Object.entries(failed))if(!Number.isFinite(at)||clock()-at>7*DAY)delete failed[key];
    for(const c of candidates) {
      if(summary.checked>=max_checks||summary.probed>=max_probes)break;
      if(!validId(c.id)||seen.has(c.id)||c.sdk!=='gradio'||c.private===true||!relevantChat(c))continue;
      seen.add(c.id);
      const existing=known.get(c.id);
      // Respect user-disabled routes, and search elsewhere before needlessly
      // spending the same public model's free inference again.
      if(existing&&(!existing.enabled||(clock()-Date.parse(existing.auto_verified_at||''))<3*DAY))continue;
      if(failed[c.id]&&clock()-failed[c.id]<DAY)continue;
      summary.checked++;
      try{
        const idPath=c.id.split('/').map(encodeURIComponent).join('/');
        const detail=await getJson(`${HUB}/api/spaces/${idPath}`,{fetchImpl,dnsVerify});
        if(detail.id!==c.id||detail.private===true||detail.sdk!=='gradio'||detail.runtime?.stage!=='RUNNING'||!validSubdomain(detail.subdomain))throw Error('Not a running public Gradio Space');
        const origin=`https://${detail.subdomain}.hf.space`;
        const spec=await getJson(origin+'/gradio_api/openapi.json',{fetchImpl,dnsVerify});
        const endpoint=selectChatEndpoint(spec);
        if(!endpoint)throw Error('No compatible public single-text chat endpoint');
        summary.probed++;
        const provider={id:routeId(c.id),display_name:`${String(detail.cardData?.title||c.id).slice(0,90)} (HF public chat)`,url:origin+'/',transport:'gradio_space',
          ...endpoint,model:String(detail.cardData?.title||c.id).slice(0,90),adapter:'none',enabled:true,automation_authorized:true,policy_reviewed:true,
          free_only:true,policy_evidence:DOCS,policy_reviewed_at:new Date(clock()).toISOString().slice(0,10),auto_discovered:true,auto_verified_at:new Date(clock()).toISOString(),
          auto_source_space:c.id,daily_max:2,min_interval_seconds:180,timeout_seconds:55,max_prompt_chars:1200,capabilities:['general','writing','reasoning','coding','summarization'],priority:-8,
          notes:'Automatically admitted only after public OpenAPI schema + a completed synthetic answer. Third-party Space, no uptime/quality promise; public non-sensitive text only.'};
        const result=await probe(provider,PROMPT);
        if(!correctProbe(result))throw Error('Synthetic chat probe failed or returned no verified final answer');
        summary.verified++;
        (summary.providers||(summary.providers=[])).push(provider);
      }catch(e){failed[c.id]=clock();summary.rejected.push({space:c.id,reason:String(e.message||e).slice(0,145)})}
    }
    if(summary.providers?.length) {
      const base=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):JSON.parse(fs.readFileSync(EXAMPLE,'utf8'));
      if(!Array.isArray(base.providers))throw Error('Invalid existing provider config');
      for(const provider of summary.providers){
        const existing=base.providers.find(p=>p.id===provider.id);
        if(!existing){base.providers.push(provider);summary.added.push(provider.id)}
        else if(existing.auto_discovered&&existing.enabled){
          existing.auto_verified_at=provider.auto_verified_at;
          existing.api_name=provider.api_name;
          existing.input_field=provider.input_field;
          existing.api_params=provider.api_params;
          summary.revalidated.push(existing.id);
        }
      }
      if(summary.added.length||summary.revalidated.length){
        if(fs.existsSync(file)){
          const backup=file+'.before-auto-'+clock()+'-'+process.pid+'.bak';
          fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);fs.chmodSync(backup,0o600);
        }
        const temp=file+'.auto-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');
        try{fs.writeFileSync(temp,JSON.stringify(base,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}
        finally{try{fs.rmSync(temp,{force:true})}catch{}}
      }
    }
    delete summary.providers;
    const metadata={status:'scanned',last_checked_ms:clock(),last_checked_at:new Date(clock()).toISOString(),last_added:summary.added,checked:summary.checked,probed:summary.probed,verified:summary.verified,failed_candidates:Object.fromEntries(Object.entries(failed).slice(-100))};
    saveMeta(metadata);
    return summary;
  }finally{fs.closeSync(fd);try{fs.unlinkSync(lockFile)}catch{}}
}
function startPeriodicDiscovery({intervalMs=HOUR}={}) {
  if(process.env.GUEST_BRIDGE_AUTO_ADD==='0')return;
  const run=()=>discoverAndAdd({max_checks:15,max_probes:2}).catch(e=>process.stderr.write('Guest AI Bridge auto-admission: '+String(e.message||e).slice(0,160)+'\n'));
  setImmediate(run);
  const tick=setInterval(run,intervalMs);tick.unref();
}
module.exports={selectChatEndpoint,discoverAndAdd,startPeriodicDiscovery,correctProbe,routeId};
