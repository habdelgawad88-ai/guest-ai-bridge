#!/usr/bin/env node
'use strict';
// Optional localhost-only OpenAI-compatible API. This proxy never uses a paid model.
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {ROOT,ensureRoot}=require('./state.cjs');
const {guestAuto}=require('./router.cjs');
const {localToken}=require('./proxy-token.cjs');
const PORT=Number(process.env.GUEST_BRIDGE_PROXY_PORT||8843);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw Error('Invalid proxy port');
function parseOpenAIChat(data){
 if(data?.model!=='guest-auto')throw Error('Only guest-auto is available, never a paid remote model');
 if(!Array.isArray(data.messages)||!data.messages.length||data.messages.length>20)throw Error('messages must be an array of 1–20 text messages');
 if(data.tools?.length||data.tool_choice&&data.tool_choice!=='none')throw Error('Tool calling is not supported by the free-only proxy');
 if(data.response_format&&data.response_format.type!=='text')throw Error('Structured output mode is unsupported');
 const msgs=[];let system=[];
 for(const m of data.messages){
   if(!m||!['system','developer','user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim())throw Error('Only plain text system/developer/user/assistant messages are supported');
   if(['system','developer'].includes(m.role))system.push(m.content);
   else msgs.push({role:m.role,content:m.content});
 }
 if(!msgs.length||msgs.at(-1).role!=='user')throw Error('Final message must have the user role');
 if(system.join('\n').length>3000||msgs.length>13)throw Error('Exceeds stateless context limits');
 return {message:msgs.at(-1).content,history:msgs.slice(0,-1),system_prompt:system.join('\n'),
   task_type:'auto',discover_sites:false,search_web:false,max_attempts:3};
}
const token=localToken();
const auth=x=>{
 if(typeof x!=='string'||!x.startsWith('Bearer '))return false;
 const got=Buffer.from(x.slice(7)),expect=Buffer.from(token);
 return got.length===expect.length&&crypto.timingSafeEqual(got,expect);
};
const app=http.createServer(async(req,res)=>{
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 function json(status,body){res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(body))}
 if(req.url==='/healthz'&&req.method==='GET'){json(200,{status:'ok'});return}
 if(!auth(req.headers.authorization)){json(401,{error:{message:'Invalid local proxy token',type:'authentication_error'}});return}
 if(req.url==='/v1/models'&&req.method==='GET'){json(200,{object:'list',data:[{id:'guest-auto',object:'model',owned_by:'guest-ai-bridge',created:0}]});return}
 if(req.url!=='/v1/chat/completions'||req.method!=='POST'){json(404,{error:{message:'Not found'}});return}
 let body='';
 for await(const chunk of req){body+=chunk;if(body.length>45000){json(413,{error:{message:'Request too large'}});return}}
 let data,params;
 try{data=JSON.parse(body);params=parseOpenAIChat(data)}catch(e){json(400,{error:{message:e.message,type:'invalid_request_error'}});return}
 try{
   const result=await guestAuto(params);if(result.status!=='reply'){
     json(503,{error:{type:'all_free_providers_unavailable',message:'No permitted anonymous provider produced a response',attempts:result.attempts||[]}});return;
   }
   const id='chatcmpl-guest-'+crypto.randomBytes(8).toString('hex');const created=Math.floor(Date.now()/1000);
   const usage=result.source_result?.usage||{};
   if(data.stream===true){
     res.writeHead(200,{...headers,'Content-Type':'text/event-stream','Connection':'keep-alive'});
     res.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',created,model:'guest-auto',choices:[{index:0,delta:{role:'assistant',content:result.reply},finish_reason:null}]})+'\n\n');
     res.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',created,model:'guest-auto',choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\n');
     res.end('data: [DONE]\n\n');return;
   }
   json(200,{id,object:'chat.completion',created,model:'guest-auto',choices:[{index:0,message:{role:'assistant',content:result.reply},finish_reason:'stop'}],
     usage:{prompt_tokens:usage.prompt_tokens??0,completion_tokens:usage.completion_tokens??0,total_tokens:usage.total_tokens??0},
     guest_bridge:{selected_provider:result.provider_id,upstream_model:result.model,attempts:result.attempts}});
 }catch(e){json(500,{error:{type:'proxy_error',message:String(e.message||e).slice(0,220)}})}
});
app.requestTimeout=90000;
app.listen(PORT,'127.0.0.1',()=>console.error('Guest AI Bridge free-only OpenAI compatibility: http://127.0.0.1:'+PORT+'/v1 (loopback, bearer token in ~/.guest-ai-bridge/proxy-token)'));
module.exports={parseOpenAIChat,localToken};
