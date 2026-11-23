'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ROOT,ensureRoot}=require('./state.cjs');
function localToken(){
 const injected=process.env.GUEST_BRIDGE_PROXY_TOKEN;
 if(injected){if(Buffer.byteLength(injected)<32)throw Error('GUEST_BRIDGE_PROXY_TOKEN must contain at least 32 bytes');return injected}
 ensureRoot();const f=path.join(ROOT,'proxy-token');
 try{const value=fs.readFileSync(f,'utf8').trim();if(value.length<32)throw Error('Existing local proxy token is too short');return value}
 catch(e){if(e.code!=='ENOENT')throw e}
 const token=crypto.randomBytes(32).toString('hex');
 try{fs.writeFileSync(f,token+'\n',{mode:0o600,flag:'wx'})}
 catch(e){if(e.code!=='EEXIST')throw e;return fs.readFileSync(f,'utf8').trim()}
 return token;
}
module.exports={localToken};
