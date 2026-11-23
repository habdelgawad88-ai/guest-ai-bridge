'use strict';
// An officially documented Hugging Face Gradio Space endpoint serves the same app
// as a public browser chat UI. This uses that app's declared /gradio_api route,
// NOT an undocumented web-session endpoint or browser anti-bot workaround.
const {safeHttpsUrl}=require('./safety.cjs');
function answerFromGradio(data) {
  const value=Array.isArray(data)?data[0]:data;
  if(typeof value==='string')return value.trim().slice(0,10000);
  if(value&&typeof value==='object'){
    for(const k of ['content','text','response'])if(typeof value[k]==='string')return value[k].trim().slice(0,10000);
  }
  return '';
}
function gradioBody(provider,message) {
  const field=provider.input_field||'message';
  if(!['message','prompt','text','query','messages'].includes(field))throw Error('Invalid Gradio input field');
  const permitted=provider.api_params;
  if(permitted!==undefined&&!Array.isArray(permitted))throw Error('Invalid Gradio parameter declaration');
  const allowed=Array.isArray(permitted)?new Set(permitted):new Set(['max_new_tokens','temperature','thinking']);
  const body={[field]:field==='messages'?[{role:'user',content:message}]:message};
  if(allowed.has('max_new_tokens'))body.max_new_tokens=256;
  if(allowed.has('max_tokens'))body.max_tokens=256;
  if(allowed.has('temperature'))body.temperature=0.3;
  if(allowed.has('thinking'))body.thinking=false;
  return body;
}
async function askGradioSpace(provider,message,{fetchImpl=fetch}={}) {
  if(typeof message!=='string'||!message.trim())throw Error('Empty Gradio message');
  const u=safeHttpsUrl(provider.url);
  if(!u.hostname.endsWith('.hf.space'))throw Error('Only specifically approved Hugging Face Gradio Space hosts are supported');
  const api=provider.api_name;
  if(typeof api!=='string'||!/^[a-z0-9_-]{1,50}$/i.test(api))throw Error('Unsafe Gradio API name');
  const timeout=Math.min(90000,Math.max(4000,Number(provider.timeout_seconds||55)*1000));
  const base=u.origin;
  const settings={method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(gradioBody(provider,message)),signal:AbortSignal.timeout(timeout)};
  let response;
  try{response=await fetchImpl(base+'/gradio_api/call/v2/'+api,settings)}catch(e){return {status:'unavailable',reply:null,reason:String(e.message||e).slice(0,180)}}
  if(response.status===429)return {status:'rate_limited',reply:null};
  if(response.status===401||response.status===403)return {status:'authorization_blocked',reply:null};
  if(response.status===402)return {status:'payment_required',reply:null};
  if(!response.ok)return {status:'unavailable',reply:null,http_status:response.status};
  let event;
  try{event=(await response.json()).event_id}catch{return {status:'invalid_response',reply:null}}
  if(typeof event!=='string'||!/^[a-z0-9-]{8,100}$/i.test(event))return {status:'invalid_response',reply:null};
  try{response=await fetchImpl(base+'/gradio_api/call/'+api+'/'+encodeURIComponent(event),{method:'GET',redirect:'error',headers:{Accept:'text/event-stream'},signal:AbortSignal.timeout(timeout)})}
  catch(e){return {status:'unavailable',reply:null,reason:String(e.message||e).slice(0,160)}}
  if(response.status===429)return {status:'rate_limited',reply:null};
  if(!response.ok)return {status:'unavailable',reply:null,http_status:response.status};
  // SSE complete only; generating events (even if they contain text) are not final answers.
  const reader=response.body?.getReader();
  if(!reader)return {status:'invalid_response',reply:null};
  const decoder=new TextDecoder();let acc='',sseType='',dataLines=[],bytes=0;
  function parseEvent(){
    const type=sseType;const payload=dataLines.join('\n');sseType='';dataLines=[];
    if(type==='error')return {status:'provider_error',reply:null};
    if(type!=='complete')return null;
    let parsed;try{parsed=JSON.parse(payload)}catch{return {status:'invalid_response',reply:null}}
    const reply=answerFromGradio(parsed);
    return reply ? {status:'reply',reply,method:'gradio_public_space_api',model_verified:false,untrusted_external_content:true} : {status:'no_verified_reply',reply:null};
  }
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;if(bytes>256000)return {status:'response_too_large',reply:null};
      acc+=decoder.decode(value,{stream:true});
      for(let ix;(ix=acc.indexOf('\n'))!==-1;){
        const line=acc.slice(0,ix).replace(/\r$/,'');acc=acc.slice(ix+1);
        if(!line){const result=parseEvent();if(result)return result;}
        else if(line.startsWith('event:'))sseType=line.slice(6).trim();
        else if(line.startsWith('data:'))dataLines.push(line.slice(5).trimStart());
      }
    }
    // Some servers terminate the final SSE event without a blank line.
    if(acc.trim()){const line=acc.replace(/\r$/,'');if(line.startsWith('data:'))dataLines.push(line.slice(5).trimStart());if(line.startsWith('event:'))sseType=line.slice(6).trim();}
    return parseEvent()||{status:'no_verified_reply',reply:null};
  }catch(e){return {status:'unavailable',reply:null,reason:String(e.message||e).slice(0,160)}}
  finally{try{await reader.cancel()}catch{}}
}
module.exports={askGradioSpace,answerFromGradio,gradioBody};
