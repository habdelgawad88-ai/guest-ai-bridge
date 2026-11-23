'use strict';
const {discover}=require('./discovery.cjs');
// Exploratory survey only. Never sends a prompt to a newly found site.
async function guestScan({query='free AI chat without login',max_sites=3,search_web=true}={},deps={}) {
  const limit=Math.max(1,Math.min(6,Number(max_sites)||3));
  const discoverFn=deps.discover||discover;
  const inspectFn=deps.inspect||require('./bridge.cjs').guestInspect;
  const sites=await discoverFn({query,max_results:100,search_web});
  const excluded=/github\.com|docs\./i;
  const candidates=(sites.candidates||[]).filter(x=>{
    try{const u=new URL(x.url);return u.protocol==='https:'&&!excluded.test(u.hostname)&&(/chat|ai|model|playground|inference/i.test(x.name+' '+u.hostname))}catch{return false}
  }).slice(0,limit);
  const results=[];
  for(const candidate of candidates){
    try{
      const result=await inspectFn({url:candidate.url});
      const status=result.status;
      results.push({name:candidate.name,url:candidate.url,status,editor_count:result.chat_editors_found??0,
        guest_chat_technically_plausible:status==='inspected'&&(result.chat_editors_found||0)>0,
        ready_for_automated_inference:false,reason:'Automation permission, identity and quota not established by webpage inspection'});
    }catch(e){results.push({name:candidate.name,url:candidate.url,status:'inspection_error',reason:String(e.message||e).slice(0,170),ready_for_automated_inference:false})}
  }
  return {status:'survey_complete',checked:results.length,results,
    note:'Automatic browser reconnaissance only. Human-verification pages are skipped; no prompt submitted; unidentified sites cannot be promoted into automated inference without published permission and an adapter.'};
}
module.exports={guestScan};
