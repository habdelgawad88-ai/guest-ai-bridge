'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {browserRouteHostAllowed} = require('./safety.cjs');
const ROOT = process.env.GUEST_BRIDGE_STATE_DIR || path.join(os.homedir(), '.guest-ai-bridge');
const POLICY_FILE = process.env.GUEST_BRIDGE_POLICY || path.join(ROOT, 'providers.json');
const EXAMPLE = path.join(__dirname, '..', 'config', 'providers.example.json');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function ensureRoot() { fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 }); }
function policy() {
  // Always supply newly documented, audited no-key API adapters without asking for
  // configuration edits. An existing user's explicit provider settings take precedence.
  const builtins=JSON.parse(fs.readFileSync(EXAMPLE,'utf8'));
  if(!Array.isArray(builtins.providers))throw Error('Invalid built-in provider registry');
  if(!fs.existsSync(POLICY_FILE))return {...builtins,source:EXAMPLE};
  const conf=JSON.parse(fs.readFileSync(POLICY_FILE,'utf8'));
  if(!Array.isArray(conf.providers))throw Error('Bad provider config');
  const existing=new Set(conf.providers.map(p=>p.id));
  const added=builtins.providers.filter(p=>((p.transport==='openai_compatible'&&p.free_only&&p.automation_authorized)||(p.transport==='gradio_space'&&!p.enabled))&&!existing.has(p.id));
  return {...conf,providers:[...conf.providers,...added],source:POLICY_FILE,auto_included_builtin_providers:added.map(p=>p.id)};
}
function listProviders() {
  return policy().providers.map(({id, display_name, url, enabled, automation_authorized, policy_reviewed, hard_blocked, daily_max, transport, model, capabilities, free_only, notes}) => ({id,display_name,url,enabled:!!enabled,automation_authorized:!!automation_authorized,policy_reviewed:!!policy_reviewed,hard_blocked:!!hard_blocked,daily_max,transport:transport||'browser',model:model||null,capabilities:capabilities||[],free_only:!!free_only,notes}));
}
function getProvider(id) {
  const found = policy().providers.find(p => p.id === id);
  if (!found) throw new Error('Unknown provider. Discover/inspect candidates first; add a provider by editing the local policy file.');
  return found;
}
function authorization(p) {
  if (p.transport==='browser' && !browserRouteHostAllowed(p.url)) throw new Error('Browser automation forbidden for this site; use the official API if permitted');
  if (p.hard_blocked) throw new Error('Provider forbids browser automation or mandates a developer API');
  if(p.auto_discovered){
    const verified=Date.parse(p.auto_verified_at||'');
    if(!Number.isFinite(verified)||Date.now()-verified>7*24*3600*1000||verified>Date.now()+60000)
      throw new Error('Auto-discovered route verification is stale; requires reverification before use');
  }
  if (!p.enabled || !p.automation_authorized || !p.policy_reviewed || !p.policy_evidence || !p.policy_reviewed_at)
    throw new Error('Provider disabled or missing documented automation permission; no login/confirmation attempt will be made');
  if (!/^https:\/\//.test(p.policy_evidence)) throw new Error('Provider policy evidence must be an HTTPS URL');
  if (!Number.isSafeInteger(p.daily_max) || p.daily_max < 1 || p.daily_max > 100) throw new Error('Invalid daily cap');
}
function safeWrite(file, obj) {
  const temp = file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp, JSON.stringify(obj,null,2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
async function withLock(file, fn) {
  ensureRoot();let lock = file + '.lock', fd;
  for (let i=0;i<20;i++) {
    try { fd = fs.openSync(lock,'wx',0o600); break; }
    catch(e) { if(e.code!=='EEXIST')throw e;try{if(Date.now()-fs.statSync(lock).mtimeMs>30000)fs.unlinkSync(lock)}catch{};await sleep(100); }
  }
  if(fd === undefined)throw Error('Usage accounting busy');
  try{return await fn();}finally{fs.closeSync(fd);try{fs.unlinkSync(lock)}catch{}}
}
async function reserve(p) {
  authorization(p);
  const file = path.join(ROOT, 'usage.json');
  return withLock(file, async () => {
    const data = fs.existsSync(file)?JSON.parse(fs.readFileSync(file, 'utf8')):{};
    const now=Date.now(), today=new Date(now).toISOString().slice(0,10), e=data[p.id] || {};
    const count=e.day===today?(e.count||0):0;
    if (count >= p.daily_max) throw new Error('Local daily quota exhausted; no rotation or bypass supported');
    const waitMs=(p.min_interval_seconds||120)*1000-(now-(e.last_ms||0));
    if(waitMs>0)throw new Error(`Rate limited locally: retry no sooner than ${Math.ceil(waitMs/1000)} seconds`);
    data[p.id] = { day:today,count:count+1,last_ms:now };
    safeWrite(file,data);
    return { consumed_for_day:count+1,remaining_local:p.daily_max-(count+1),day_utc:today };
  });
}
function quotaSnapshot(p, current=usage(), now=Date.now()) {
  const e=current[p.id]||{};
  const today=new Date(now).toISOString().slice(0,10);
  const used=e.day===today?(e.count||0):0;
  const remaining=Math.max(0,(p.daily_max||0)-used);
  if(!remaining)return {available:false,remaining,reason:'Local daily quota exhausted'};
  const waitMs=(p.min_interval_seconds||120)*1000-(now-(e.last_ms||0));
  if(waitMs>0)return {available:false,remaining,reason:'Local request spacing limit',available_at:new Date(now+waitMs).toISOString()};
  return {available:true,remaining};
}
function health() {
  const file=path.join(ROOT,'health.json');
  try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return {}}
}
async function recordOutcome(id,status,elapsedMs) {
  if(!/^[a-z0-9_-]{2,60}$/.test(id))throw Error('Invalid provider id');
  const file=path.join(ROOT,'health.json');
  return withLock(file,async()=>{
    const data=health();const h=data[id]||{};const now=Date.now();
    const success=status==='reply';
    h.success=(h.success||0)+(success?1:0);
    h.failure=(h.failure||0)+(success?0:1);
    h.last_status=status;h.last_attempt_ms=now;
    if(success){
      h.last_success_ms=now;h.blocked_until_ms=0;
      if(Number.isFinite(elapsedMs)&&elapsedMs>=0){h.ewma_latency_ms=Math.round(h.ewma_latency_ms ? (0.65*h.ewma_latency_ms+0.35*elapsedMs):elapsedMs);}
    } else {
      h.last_failure_ms=now;
      const delayMs=['verification_required','login_required','authorization_blocked','payment_required'].includes(status)?24*60*60*1000:
        (status==='rate_limited'?15*60*1000:status==='no_verified_reply'?3*60*1000:60*1000);
      h.blocked_until_ms=now+delayMs;
    }
    // Store aggregate status/latency only; NEVER retain prompts or model replies.
    data[id]=h;safeWrite(file,data);return h;
  });
}
function usage() {
  const file = path.join(ROOT,'usage.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')):{};
}
module.exports = { ROOT, POLICY_FILE, EXAMPLE, ensureRoot, policy, listProviders, getProvider, authorization, reserve, usage, quotaSnapshot, health, recordOutcome };
