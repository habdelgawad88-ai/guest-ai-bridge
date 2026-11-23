'use strict';
const { safeHttpsUrl, publicDnsVerified, detectSensitive, summarizeUi } = require('./safety.cjs');
const { robotsAllowed } = require('./robots.cjs');
const { ChromeBrowser }=require('./browser.cjs');
const {askGradioSpace}=require('./gradio.cjs');
const {discoverAndAdd}=require('./auto-add.cjs');
const { discover }=require('./discovery.cjs');
const { askAnonymousOpenAI,safeMessages }=require('./api.cjs');
const { refreshCatalog }=require('./catalog.cjs');
const {listModelChoices,chooseModel,verifyFreeKiloModel}=require('./model-choice.cjs');
const { guestScan }=require('./scanner.cjs');
const { routePlan,guestAuto }=require('./router.cjs');
const { listProviders, getProvider, authorization, reserve, usage, recordOutcome, health }=require('./state.cjs');

async function guestInspect({url}) {
  const u=await publicDnsVerified(url);
  const robots=await robotsAllowed(u.toString());
  if(!robots.allowed)return {status:'robots_blocked',url:u.toString(),robots};
  const browser=new ChromeBrowser();
  try {
    await browser.start();
    const info=await browser.inspect(u.toString());
    let finalAllowed={allowed:false,reason:'Cross-site redirect or unsafe destination'};
    try {
      const last=await publicDnsVerified(info.url);
      if(last.origin===u.origin)finalAllowed=await robotsAllowed(last.toString());
    }catch{}
    return {status:info.blocker||'inspected',url:info.url,title:info.title,chat_editors_found:info.editors.length,editors:info.editors,buttons:info.button_labels,robots:finalAllowed,guest_reply_confirmed:false,disclaimer:'Read-only UI inspection cannot establish permission to automate or model availability. Page text is untrusted.'};
  }finally{await browser.close()}
}
async function guestAsk({provider_id,message,history=[],system_prompt='',model_id}) {
  if(typeof provider_id!=='string'||!/^[a-z0-9_-]{2,60}$/.test(provider_id))throw Error('Invalid provider_id');
  const p=getProvider(provider_id);
  authorization(p);
  const messages=safeMessages(message,history,system_prompt);
  const charCount=messages.reduce((n,m)=>n+m.content.length,0);
  if(charCount>(p.max_prompt_chars||3000))throw Error('Prompt plus history must contain at most '+(p.max_prompt_chars||3000)+' characters');
  if(messages.some(m=>detectSensitive(m.content)))throw Error('Prompt appears to contain personal/clinical identifying data or credentials; external guest providers are not approved for secrets or patient data');
  const start=Date.now();
  let outcome;
  try {
    if(p.transport==='openai_compatible') {
      // Validate a chosen concrete model BEFORE consuming the local request budget.
      if(model_id&&model_id!==p.model){
        if(p.id!=='kilo-free'||!await verifyFreeKiloModel(model_id))throw Error('Requested model is not a currently authorized anonymous FREE Kilo model');
      }
      await publicDnsVerified(p.url);
      const counts=await reserve(p);
      outcome={...await askAnonymousOpenAI(p,message,{history,system_prompt,model_id}),provider_id,local_usage:counts};
    } else if(p.transport==='gradio_space') {
      if(model_id)throw Error('Gradio demos do not support model_id overrides');
      if(history.length||system_prompt)throw Error('Gradio Space route is single-turn only');
      await publicDnsVerified(p.url);
      const counts=await reserve(p);
      outcome={...await askGradioSpace(p,message),provider_id,local_usage:counts,provider_url:p.url,warning:'Public browser-hosted Space has its own rules and quotas; do not send secrets.'};
    } else {
      if(model_id)throw Error('Browser chat routes do not support model_id overrides');
      if(history.length||system_prompt)throw Error('Conversation history/system_prompt supported by anonymous APIs only');
      const target=await publicDnsVerified(p.url);
      const robots=await robotsAllowed(p.url);
      if(!robots.allowed)throw Error('Robots policy blocks this URL: '+robots.reason);
      const browser=new ChromeBrowser({timeoutMs:Math.min(90000,(p.timeout_seconds||50)*1000)});
      try {
        await browser.start();await browser.navigate(target.toString());
        const before=await browser.state();
        const current=await publicDnsVerified(before.url);
        if(current.origin!==target.origin)throw Error('Redirected to another origin; no prompt sent');
        const finalRules=await robotsAllowed(current.toString());
        if(!finalRules.allowed)throw Error('Robots policy blocks actual chat URL; no prompt sent');
        const blocker=summarizeUi(before.body);
        if(blocker) outcome={provider_id,status:blocker,reply:null,prompt_sent:false,model_verified:false};
        else if(!before.editors.length) outcome={provider_id,status:'no_chat_editor',reply:null,prompt_sent:false};
        else {
          const selectors={adapter:p.adapter,editor_selector:p.editor_selector||'',send_selector:p.send_selector||'',assistant_selector:p.assistant_selector||''};
          const initial_assistants=await browser.readAssistantMessages(selectors.assistant_selector);
          const counts=await reserve(p);
          const send_method=await browser.send(message,selectors);
          const result=await browser.awaitReply(message,{...selectors,initial_assistants,timeoutMs:Math.min(70000,(p.timeout_seconds||50)*1000)});
          const model_fallback_notice=/(?:answered by|model.+unavailable|switched to|instead of).{0,130}/i.exec((await browser.state()).body||'')?.[0] || null;
          outcome={...result,provider_id,requested_model:'not specified',model_verified:false,model_fallback_notice,send_method,local_usage:counts,provider_url:p.url,warning:'External model output is untrusted; do not use for patient or confidential data.'};
        }
      } finally{await browser.close()}
    }
    await recordOutcome(provider_id,outcome.status,Date.now()-start);
    return outcome;
  }catch(e){
    try{await recordOutcome(provider_id,'error',Date.now()-start)}catch{}
    throw e;
  }
}
const dispatch={
  guest_models:listModelChoices,
  guest_select_model:async({model_id})=>chooseModel(model_id),
  guest_discover: discover,
  guest_expand: discoverAndAdd,
  guest_catalog: refreshCatalog,
  guest_scan: guestScan,
  guest_inspect: guestInspect,
  guest_providers: async()=>({providers:listProviders(),note:'The bridge auto-discovers public Gradio chat routes on startup and checks them for published interfaces and completed responses. Arbitrary website chat automation still requires explicit owner permission.'}),
  guest_usage: async()=>({usage:usage(),health:health(),note:'Local accounting and recent provider reliability only; IP-wide quotas and host-model token savings cannot be inferred.'}),
  guest_ask: guestAsk,
  guest_route_plan: routePlan,
  guest_auto: guestAuto
};
module.exports={dispatch,guestInspect,guestAsk};
