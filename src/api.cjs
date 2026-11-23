'use strict';
const { publicDnsVerified } = require('./safety.cjs');

// Immutable transport allowlist backed by each operator's own published no-key API docs.
// Neither a discovered page nor a provider config may introduce an arbitrary API URL/model.
const ANONYMOUS_APIS = Object.freeze({
  'https://api.jarvisclaw.ai/v1/chat/completions': Object.freeze({model:'auto/free', docs:'https://jarvisclaw.ai/en/free-llm-api'}),
  'https://ai-gateway.kilo.ai/api/v1/chat/completions': Object.freeze({model:'kilo-auto/free',docs:'https://kilo.ai/docs/gateway/authentication'}),
  'https://vireonix.ai/v1/chat/completions': Object.freeze({model:'auto',docs:'https://vireonix.ai/docs'})
});

function validateAnonymousAPI(p) {
  if(p.transport!=='openai_compatible')throw Error('Unsupported anonymous API transport');
  const spec=ANONYMOUS_APIS[p.url];
  if(!spec)throw Error('Unreviewed API endpoint; dedicated verified adapter required');
  if(p.model!==spec.model)throw Error('Only documented anonymous FREE model aliases are permitted for '+p.url);
  if(p.free_only!==true)throw Error('Only free-only routes are permitted');
  return spec;
}

function safeMessages(message, history=[],system_prompt='') {
  if(typeof message!=='string'||!message.trim())throw Error('A message is required');
  if(!Array.isArray(history)||history.length>12)throw Error('history must contain 0–12 user/assistant messages');
  if(typeof system_prompt!=='string'||system_prompt.length>3000)throw Error('system_prompt must be at most 3000 characters');
  let chars=message.length+system_prompt.length;
  const prior=history.map((m,i)=>{
    if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>8000)
      throw Error('Invalid history item '+i+' (only text user/assistant turns allowed)');
    chars+=m.content.length;
    return {role:m.role,content:m.content};
  });
  if(chars>12000)throw Error('Combined prompt and history must be <= 12000 characters');
  return [...(system_prompt.trim()?[{role:'system',content:system_prompt}]:[]),...prior,{role:'user',content:message}];
}

function extractContent(raw){
  if(typeof raw==='string')return raw;
  if(Array.isArray(raw))return raw.filter(x=>x&&x.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n');
  return null;
}

async function askAnonymousOpenAI(p,message,{fetchFn=fetch,dnsFn=publicDnsVerified,history=[],system_prompt='',model_id,verifyFreeModel}={}) {
  validateAnonymousAPI(p);
  let requestedModel=p.model;
  if(model_id!==undefined&&model_id!==p.model){
    if(p.url!=='https://ai-gateway.kilo.ai/api/v1/chat/completions')throw Error('Explicit model override is not supported for this provider');
    const check=verifyFreeModel||require('./model-choice.cjs').verifyFreeKiloModel;
    if(!await check(model_id))throw Error('Model is not eligible for verified anonymous free Kilo access');
    requestedModel=model_id;
  }
  const messages=safeMessages(message,history,system_prompt);
  const url=await dnsFn(p.url);
  const abort=AbortSignal.timeout(Math.min(60000,Math.max(1000,(p.timeout_seconds||45)*1000)));
  const response=await fetchFn(url.toString(),{
    method:'POST',redirect:'error',signal:abort,
    headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'GuestAIBridge/0.3 (+anonymous-free-model; no credentials)'},
    body:JSON.stringify({model:requestedModel,messages,stream:false})
  });
  const http=response.status;
  const common={provider_url:p.url,http_status:http,untrusted_external_content:true};
  if(http===429)return {...common,status:'rate_limited',reply:null,retry_after:response.headers?.get?.('retry-after')||null};
  if(http===401||http===403||http===402)return {...common,status:http===402?'payment_required':'authorization_blocked',reply:null};
  if(!response.ok)return {...common,status:'http_error',reply:null};
  const type=(response.headers?.get?.('content-type')||'').toLowerCase();
  if(!type.includes('json'))return {...common,status:'invalid_response',reply:null};
  const length=Number(response.headers?.get?.('content-length')||0);
  if(length>524288)return {...common,status:'oversized_response',reply:null};
  // Bound response size even if the remote server omits Content-Length.
  const body=await response.text();
  if(body.length>524288)return {...common,status:'oversized_response',reply:null};
  let data;try{data=JSON.parse(body)}catch{return {...common,status:'invalid_response',reply:null}};
  // When a concrete model was selected, refuse to claim another (or unknown) model answered.
  if(requestedModel!==p.model&&data?.model!==requestedModel)return {...common,status:'model_mismatch',reply:null,requested_model:requestedModel,reported_model:data?.model||null};
  const reply=extractContent(data?.choices?.[0]?.message?.content);
  if(typeof reply!=='string'||!reply.trim())return {...common,status:'no_verified_reply',reply:null,model:data?.model||null};
  return {
    ...common,status:'reply',reply:reply.slice(0,20000),
    model:typeof data.model==='string'?data.model.slice(0,180):null,
    model_verified:typeof data.model==='string',requested_model:requestedModel,
    usage:data.usage&&typeof data.usage==='object'?{
      prompt_tokens:Number.isFinite(data.usage.prompt_tokens)?data.usage.prompt_tokens:null,
      completion_tokens:Number.isFinite(data.usage.completion_tokens)?data.usage.completion_tokens:null,
      total_tokens:Number.isFinite(data.usage.total_tokens)?data.usage.total_tokens:null
    }:null,
    provider_rate_limit_remaining:response.headers?.get?.('x-ratelimit-remaining')||null,
    method:'documented_public_api',
    warning:'External provider output may be wrong or retained. Never submit personal, patient, confidential or credential data.'
  };
}
module.exports={ANONYMOUS_APIS,validateAnonymousAPI,safeMessages,askAnonymousOpenAI};
