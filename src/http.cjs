#!/usr/bin/env node
'use strict';
// Optional localhost-only remote MCP transport. Proxy through an authenticated HTTPS tunnel.
const http=require('node:http');
const crypto=require('node:crypto');
const {handle}=require('./protocol.cjs');
const token=process.env.GUEST_BRIDGE_HTTP_TOKEN;
if(!token||Buffer.byteLength(token)<32){console.error('Set GUEST_BRIDGE_HTTP_TOKEN to a random secret of at least 32 bytes');process.exit(1)}
const port=Number(process.env.GUEST_BRIDGE_HTTP_PORT||8427);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const allowedOrigins=(process.env.GUEST_BRIDGE_ALLOWED_ORIGINS||'').split(',').filter(Boolean).map(x=>x.trim());
const auth=(value)=>{
  if(typeof value!=='string'||!value.startsWith('Bearer '))return false;
  const given=Buffer.from(value.slice(7));const expected=Buffer.from(token);
  return given.length===expected.length&&crypto.timingSafeEqual(given,expected);
};
function rpcError(id,code,message){return {jsonrpc:'2.0',id,error:{code,message}}}
const server=http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const respond=(status,obj)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj))};
  if(req.url==='/healthz'&&req.method==='GET'){res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end('{"ok":true,"service":"guest-ai-bridge"}');return}
  if(req.url!=='/mcp'||req.method!=='POST'){respond(404,{error:'not found'});return}
  if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)) {respond(403,{error:'origin not authorized'});return}
  if(!auth(req.headers.authorization)){respond(401,{error:'unauthorized'});return}
  const accept=req.headers.accept||'';
  if(!accept.includes('application/json')||!accept.includes('text/event-stream')){respond(406,{error:'MCP requires Accept: application/json, text/event-stream'});return}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000){respond(413,{error:'oversized request'});return}}
  let body;try{body=JSON.parse(raw)}catch{respond(400,rpcError(null,-32700,'invalid JSON'));return}
  const revision=req.headers['mcp-protocol-version'];
  const method=req.headers['mcp-method'];const name=req.headers['mcp-name'];
  if(!revision||!['2026-07-28','2025-11-25','2025-06-18','2025-03-26'].includes(revision)){
    respond(400,rpcError(body?.id??null,-32020,'Missing or unsupported MCP-Protocol-Version header'));return;
  }
  if(revision==='2026-07-28'){
    const meta=body?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
    if(meta!==revision||method!==body?.method||(body?.method==='tools/call'&&name!==body.params?.name)){
      respond(400,rpcError(body?.id??null,-32020,'Header mismatch'));return;
    }
  }
  try{const output=await handle(body);if(output){respond(output.error?.code===-32601?404:200,output)}else{res.writeHead(202,headers);res.end()}}
  catch(e){respond(500,rpcError(body?.id??null,-32603,e.message))}
});
server.requestTimeout=90000;
server.listen(port,'127.0.0.1',()=>console.error(`Guest AI Bridge HTTP MCP: localhost:${port}/mcp; HTTPS/authenticated tunnel required for remote use`));
