'use strict';
const { publicDnsVerified }=require('./safety.cjs');
function robotsRules(text, agent='GuestAIBridge') {
  const groups=[]; let names=[],rules=[],inRules=false;
  function flush(){if(names.length)groups.push({names:[...names],rules:[...rules]});names=[];rules=[];inRules=false;}
  for(let raw of text.split(/\r?\n/)) {
    raw=raw.replace(/#.*$/,'').trim();if(!raw)continue;
    let m=/^([\w-]+)\s*:\s*(.*)$/.exec(raw);if(!m)continue;
    const key=m[1].toLowerCase(),val=m[2].trim();
    if(key==='user-agent') {if(inRules)flush();names.push(val.toLowerCase());}
    else if(names.length&&['allow','disallow'].includes(key)){rules.push({key,path:val});inRules=true;}
  }
  flush();
  const target=agent.toLowerCase(),specific=groups.filter(g=>g.names.some(n=>n!=='*'&&target.includes(n)));
  const relevant=specific.length?specific:groups.filter(g=>g.names.includes('*'));
  return relevant.flatMap(g=>g.rules);
}
function robotsPathAllowed(text, urlPath, agent='GuestAIBridge') {
  const rules=robotsRules(text,agent); let match={len:0,allowed:true};
  for(const r of rules) {
    if(!r.path)continue;
    const esc=r.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\$$/,'$');
    const pattern=new RegExp('^'+esc);if(!pattern.test(urlPath))continue;
    const len=r.path.replace(/[\*$]/g,'').length;
    if(len>match.len || (len===match.len&&r.key==='allow'))match={len,allowed:r.key==='allow'};
  }
  return match.allowed;
}
async function robotsAllowed(target) {
  const u=await publicDnsVerified(target);
  const robotsUrl=u.origin+'/robots.txt';
  let r;
  try{r=await fetch(robotsUrl,{signal:AbortSignal.timeout(7000),redirect:'error',headers:{'User-Agent':'GuestAIBridge/0.1'}})}
  catch(e){return {allowed:false,reason:'Could not verify robots.txt: '+e.message};}
  if(r.status===404||r.status===410)return {allowed:true,reason:'No robots.txt rules supplied'};
  if(!r.ok)return {allowed:false,reason:'Cannot verify robots.txt: HTTP '+r.status};
  const text=(await r.text()).slice(0,100000);
  return {allowed:robotsPathAllowed(text,u.pathname),reason:'robots.txt checked',robots_url:robotsUrl};
}
module.exports={robotsRules,robotsPathAllowed,robotsAllowed};
