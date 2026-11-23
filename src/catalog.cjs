'use strict';
const fs=require('node:fs');const path=require('node:path');
const {ROOT,ensureRoot}=require('./state.cjs');
const {publicDnsVerified}=require('./safety.cjs');
const CATALOGS=Object.freeze([
 {id:'kilo-free',url:'https://ai-gateway.kilo.ai/api/v1/models',kind:'free_tagged_models'},
 {id:'vireonix-free',url:'https://vireonix.ai/v1/models',kind:'auto_only'},
 {id:'vireonix-quota',url:'https://vireonix.ai/api/limits',kind:'usage_percent'}
]);
const TTL_MS=60*60*1000;
async function getOne(c,{fetchFn=fetch,dnsFn=publicDnsVerified}={}){
 const u=await dnsFn(c.url);
 const r=await fetchFn(u.toString(),{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Accept':'application/json','User-Agent':'GuestAIBridge/0.3 (official public catalog read only)'}});
 if(!r.ok)return {id:c.id,status:'unavailable',http_status:r.status};
 const type=(r.headers?.get?.('content-type')||'').toLowerCase();
 if(!type.includes('json'))return {id:c.id,status:'non_json'};
 const length=Number(r.headers?.get?.('content-length')||0);if(length>1500000)return {id:c.id,status:'oversized'};
 const body=await r.text();if(body.length>1500000)return {id:c.id,status:'oversized'};
 let data;try{data=JSON.parse(body)}catch{return {id:c.id,status:'invalid_json'}};
 if(c.kind==='usage_percent'){
   // Never use a quota endpoint to infer permission or manipulate upstream limits.
   const candidates=['remaining_input_percent','remaining_output_percent','remaining'];
   return {id:c.id,status:'available',quota_fields:Object.fromEntries(candidates.filter(k=>Number.isFinite(data?.[k])).map(k=>[k,data[k]]))};
 }
 const models=Array.isArray(data?.data)?data.data:Array.isArray(data?.models)?data.models:[];
 if(c.kind==='auto_only')return {id:c.id,status:'available',models:['auto'],observed_count:models.length};
 // A model being catalogued does NOT make it anonymously callable. Kilo's
 // documented anonymous allowance is tagged :free models plus kilo-auto/free.
 // Require official isFree AND zero prompt/completion prices to fail closed.
 const free=models.filter(m=>{
   const id=m?.id;
   if(typeof id!=='string'||!(id.endsWith(':free')||id==='kilo-auto/free'))return false;
   if(m.isFree!==true||Number(m.pricing?.prompt)!==0||Number(m.pricing?.completion)!==0)return false;
   return (m.architecture?.input_modalities||[]).includes('text') && (m.architecture?.output_modalities||[]).includes('text');
 }).map(m=>({id:m.id,name:String(m.name||m.id).slice(0,150),context_length:Number.isFinite(m.context_length)?m.context_length:null}));
 // These are displayed for comparison ONLY, never passed to chat by this app.
 const frontierPrefix=/^(?:anthropic|openai|google|x-ai|deepseek|moonshotai|qwen|z-ai|minimax|mistralai|meta-llama)\//i;
 const locked=models.filter(m=>typeof m?.id==='string' && frontierPrefix.test(m.id) && !free.some(x=>x.id===m.id))
   .filter(m=>Number(m.pricing?.prompt)>0 || Number(m.pricing?.completion)>0)
   .sort((a,b)=>(b.created||0)-(a.created||0))
   .slice(0,90)
   .map(m=>({id:m.id,name:String(m.name||m.id).slice(0,150),context_length:Number.isFinite(m.context_length)?m.context_length:null}));
 return {id:c.id,status:'available',free_model_count:free.length,free_model_examples:free.slice(0,25).map(x=>x.id),free_models:free,frontier_models:locked,model_alias:'kilo-auto/free',observed_count:models.length};
}
async function refreshCatalog({refresh=false}={},deps={}){
 ensureRoot();const file=path.join(ROOT,'official-catalog-cache.json');
 if(!refresh){try{const x=JSON.parse(fs.readFileSync(file,'utf8'));if(Date.now()-x.checked_at<TTL_MS && Array.isArray(x.catalogs?.find(c=>c.id==='kilo-free')?.free_models))return {...x,from_cache:true}}catch{}}
 const fetched=await Promise.all(CATALOGS.map(async c=>{try{return await (deps.getOne||getOne)(c,deps)}catch(e){return {id:c.id,status:'error',reason:String(e.message||e).slice(0,140)}}}));
 const output={checked_at:Date.now(),from_cache:false,catalogs:fetched,policy:'Official public endpoints only; never send a user prompt or credentials to catalog discovery; no arbitrary new providers auto-admitted.'};
 if(!deps.getOne){fs.writeFileSync(file,JSON.stringify(output),{mode:0o600})}
 return output;
}
module.exports={CATALOGS,refreshCatalog,getOne};
