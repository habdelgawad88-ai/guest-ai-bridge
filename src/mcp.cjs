#!/usr/bin/env node
'use strict';
const readline=require('node:readline');
const { handle }=require('./protocol.cjs');
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
const personal=process.env.GUEST_BRIDGE_PERSONAL==='1';
const exposed=new Set(['guest_auto','guest_providers','guest_usage','guest_models','guest_select_model']);
require('./auto-add.cjs').startPeriodicDiscovery();
rl.on('line',async line=>{
  let r;try{r=JSON.parse(line)}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');return}
  try{
    if(personal&&r.method==='tools/call'&&!exposed.has(r.params?.name)){
      if(r.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32602,message:'Tool not exposed by personal profile'}})+'\n');
      return;
    }
    const reply=await handle(r);
    if(personal&&r.method==='tools/list'&&Array.isArray(reply?.result?.tools))reply.result.tools=reply.result.tools.filter(x=>exposed.has(x.name));
    if(reply)process.stdout.write(JSON.stringify(reply)+'\n');
  }
  catch(e){process.stderr.write('Bridge handler error: '+e.message+'\n')}
});
