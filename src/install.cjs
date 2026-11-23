'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const MCP=path.resolve(__dirname,'mcp.cjs');
const MCP_PERSONAL=path.resolve(__dirname,'mcp-personal.cjs');
function installAgent(client,{spawn=spawnSync,mcpScript=null}={}){
  const supported={
    codex:{command:'codex',args:['mcp','add','guest-ai-bridge','--','node',MCP]},
    claude:{command:'claude',args:['mcp','add','--transport','stdio','--scope','user','guest-ai-bridge','--','node',MCP_PERSONAL]}
  };
  if(!supported[client])return {status:'manual_config',client,message:'This client requires version-specific MCP registration; use examples/mcpServers.example.json.',mcp_script:MCP};
  const item=supported[client];
  if(mcpScript){item.args[item.args.length-1]=path.resolve(mcpScript)}
  let out;
  try{out=spawn(item.command,item.args,{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']})}
  catch(e){return {status:'not_installed',client,error:String(e.message||e),command:[item.command,...item.args]}}
  if(out.error?.code==='ENOENT')return {status:'cli_not_found',client,command:[item.command,...item.args]};
  if(out.error)return {status:'error',client,error:String(out.error.message||out.error).slice(0,300),command:[item.command,...item.args]};
  return {status:out.status===0?'registered':'registration_failed',client,exit_code:out.status,
    stdout:(out.stdout||'').slice(0,600),stderr:(out.stderr||'').slice(0,600),command:[item.command,...item.args]};
}
module.exports={installAgent};
