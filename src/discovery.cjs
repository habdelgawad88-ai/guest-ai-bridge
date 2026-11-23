'use strict';
const { safeHttpsUrl } = require('./safety.cjs');
const { ROOT, ensureRoot } = require('./state.cjs');
const fs = require('node:fs');
const path = require('node:path');
const DIRECTORY='https://www.linkmap.in/browse/ai-chatbots';
const CURATED=[
  {name:'Kilo Gateway anonymous free API',url:'https://kilo.ai/docs/gateway/authentication',source:'documented_official_api',note:'Free models permit anonymous API calls, no signup. Tested HTTP 200 from VPS Nov 2026'},
  {name:'Vireonix anonymous free API',url:'https://vireonix.ai/docs',source:'documented_official_api',note:'Auto no-key chat API. Tested HTTP 200 from VPS Nov 2026'},
  {name:'JarvisClaw free API',url:'https://jarvisclaw.ai/en/free-llm-api',source:'documented_official_api',note:'Anonymous API explicitly documented; live synthetic API reply verified Nov 2026'},
  {name:'UsingOpen',url:'https://usingopen.com/',source:'curated',note:'Guest reply observed Nov 2026, daily quota 10; automation permission unverified'},
  {name:'Duck.ai',url:'https://duck.ai/',source:'curated',note:'Guest chat UI, daily quota; prior live error'},
  {name:'Gemini guest',url:'https://gemini.google.com/',source:'curated',note:'Guest reply observed, but /app/ is disallowed by robots; do not automate'},
  {name:'Z.ai',url:'https://chat.z.ai/',source:'curated',note:'Slider verification observed, not eligible'},
  {name:'Qwen',url:'https://chat.qwen.ai/',source:'curated',note:'Age confirmation observed; no reply verified'}
];
const TIMEOUT=7000;
function decode(s) {return s.replace(/&amp;/g,'&').replace(/&#\d+;/g,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function parseDirectory(html) {
  const re=/<a\s+[^>]*href="(https:\/\/[^\"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const out=[],seen=new Set();let m;
  while ((m=re.exec(html))) {
    try {
      const u=safeHttpsUrl(m[1]); if(seen.has(u.hostname)||/linkmap\.in$/.test(u.hostname))continue;
      const name=decode(m[2]).slice(0,120);
      if(!name)continue;
      seen.add(u.hostname);
      out.push({name,url:u.toString(),source:'linkmap_directory',eligibility:'unverified'});
    } catch {}
  }
  return out;
}
function parseRss(xml) {
  const out=[];
  for(const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const title=/<title>([\s\S]*?)<\/title>/i.exec(m[1]);const link=/<link>([\s\S]*?)<\/link>/i.exec(m[1]);
    if(!link)continue;
    try{out.push({name:decode(title?.[1]||'').slice(0,120),url:safeHttpsUrl(decode(link[1])).toString(),source:'bing_rss',eligibility:'unverified'});}catch{}
  }
  return out;
}
async function download(url) {
  const r = await fetch(url,{signal:AbortSignal.timeout(TIMEOUT),headers:{'User-Agent':'GuestAIBridge/0.1 (guest-site-discovery; no crawler bypass)','Accept':'text/html, application/rss+xml, application/xml;q=0.7'}});
  if(!r.ok)throw Error('HTTP '+r.status+' fetching discovery source');
  const t=await r.text();if(t.length>2000000)throw Error('Oversized discovery source');return t;
}
async function discover({query='',max_results=30,search_web=false,refresh=false}={}) {
  max_results=Math.max(1,Math.min(100,Number(max_results)||30));
  if(typeof query!=='string'||query.length>100)throw Error('Query too long');
  ensureRoot();const cachePath=path.join(ROOT,'directory-cache.json');let fromCache=false;
  let directory=[]; let status='fresh';
  if(!refresh&&fs.existsSync(cachePath)&&Date.now()-fs.statSync(cachePath).mtimeMs<6*3600*1000) {
    try{directory=JSON.parse(fs.readFileSync(cachePath,'utf8'));fromCache=true;status='cached'}catch{}
  }
  if(!directory.length) {
    try {directory=parseDirectory(await download(DIRECTORY));fs.writeFileSync(cachePath,JSON.stringify(directory),{mode:0o600});}
    catch(e) {status='directory_error:'+e.message; directory=[];}
  }
  let results=[...CURATED,...directory],searchStatus='not_requested';
  if(search_web) {
    const rss='https://www.bing.com/search?format=rss&q='+encodeURIComponent(query||'free AI chatbot without login');
    const cacheFile=path.join(ROOT,'search-cache.json');let old={};try{old=JSON.parse(fs.readFileSync(cacheFile,'utf8'))}catch{}
    const key=query||'free AI chatbot without login';
    if(old.key===key&&Date.now()-old.at<24*3600*1000){results.push(...old.results);searchStatus='cached'}
    else{
      try{const found=parseRss(await download(rss));results.push(...found);fs.writeFileSync(cacheFile,JSON.stringify({key,at:Date.now(),results:found}),{mode:0o600});searchStatus='fresh'}
      catch(e){searchStatus='search_unavailable:'+e.message}
    }
  }
  const seen=new Set(); results=results.filter(v=>{let h;try{h=new URL(v.url).hostname}catch{return false};if(seen.has(h))return false;seen.add(h);return true});
  if(query) {const k=query.toLowerCase();results.sort((a,b)=>Number(b.name.toLowerCase().includes(k))-Number(a.name.toLowerCase().includes(k)));}
  return {total_candidates:results.length,shown:Math.min(max_results,results.length),directory_status:status,from_cache:fromCache,search_status:searchStatus,warning:'Discovery is not permission to automate: only already-audited no-key API adapters run automatically; new sites remain inspection candidates.',candidates:results.slice(0,max_results)};
}
module.exports = { discover, parseDirectory, parseRss, decode };
