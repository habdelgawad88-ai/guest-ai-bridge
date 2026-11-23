'use strict';
const fs=require('node:fs');
const {ROOT,POLICY_FILE,policy,ensureRoot}=require('./state.cjs');
const {safeHttpsUrl,browserRouteHostAllowed}=require('./safety.cjs');
function addBrowserRoute(args){
 const values={};let approval=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--approve'){approval=true;continue;}
  const k=args[i].replace(/^--/,'');
  if(!['id','url','permission-url','editor','send','reply'].includes(k)||args[i]!==`--${k}`||values[k]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Unknown/missing browser-add option '+args[i]);
  values[k]=args[++i];
 }
 const required=['id','url','permission-url','editor','send','reply'];
 const missing=required.filter(k=>!values[k]);
 if(missing.length)throw Error('Missing: '+missing.join(', '));
 if(!approval)throw Error('Explicit site permission confirmation required: read the operator policy first, then pass --approve');
 if(!/^[a-z][a-z0-9_-]{2,59}$/.test(values.id))throw Error('Invalid browser route id');
 const target=safeHttpsUrl(values.url),evidence=safeHttpsUrl(values['permission-url']);
 if(!browserRouteHostAllowed(target.toString()))throw Error('Browser chat site prohibited by current terms');
 for(const k of ['editor','send','reply']){
  if(values[k].length>240||!values[k].trim())throw Error('Invalid CSS selector: '+k);
 }
 // Configuration does not authorize the site; the user must actually have
 // affirmative operator permission. DNS, robots, and redirects are rechecked on each call.
 const conf=policy();
 if(conf.providers.some(p=>p.id===values.id))throw Error('A route with this ID already exists; no overwrite');
 const provider={id:values.id,display_name:values.id+' (user-approved browser chat)',url:target.toString(),transport:'browser',adapter:'generic',editor_selector:values.editor,send_selector:values.send,assistant_selector:values.reply,enabled:true,automation_authorized:true,policy_reviewed:true,policy_evidence:evidence.toString(),policy_reviewed_at:new Date().toISOString().slice(0,10),free_only:true,daily_max:3,min_interval_seconds:120,timeout_seconds:55,max_prompt_chars:2000,capabilities:['general','writing','reasoning'],priority:-10,notes:'Locally approved browser UI adapter; operator permission asserted by installer, not independently certified. HTTPS, robots, and exact reply DOM required.'};
 ensureRoot();
 if(fs.existsSync(POLICY_FILE)&&fs.lstatSync(POLICY_FILE).isSymbolicLink())throw Error('Policy path cannot be a symlink');
 const data={...conf,providers:[...conf.providers,provider]};delete data.source;delete data.auto_included_builtin_providers;
 const before=fs.existsSync(POLICY_FILE)?POLICY_FILE+'.before-browser-'+Date.now()+'.bak':null;
 if(before){fs.copyFileSync(POLICY_FILE,before,fs.constants.COPYFILE_EXCL);fs.chmodSync(before,0o600)}
 const tmp=POLICY_FILE+'.new-'+process.pid;
 try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,POLICY_FILE)}
 catch(e){try{fs.rmSync(tmp,{force:true})}catch{};throw e}
 return {id:provider.id,url:provider.url,enabled:true,policy:POLICY_FILE,backup:before,warning:'Enable only where website owner explicitly permits automated chat. Check terms and quota regularly.'};
}
module.exports={addBrowserRoute};
