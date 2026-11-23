'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {askAnonymousOpenAI}=require('../src/api.cjs');
const {policy}=require('../src/state.cjs');
const kilo=policy().providers.find(p=>p.id==='kilo-free');
function mockResponse(finish_reason){
  return {status:200,ok:true,headers:{get(name){return name==='content-type'?'application/json':null}},
    text:async()=>JSON.stringify({model:'kilo-auto/free',choices:[{finish_reason,message:{content:'partial or complete response'}}]})};
}
test('HTTP 200 with an incomplete completion never becomes a verified reply',async()=>{
  for(const reason of ['length','content_filter','tool_calls']){
    const response=await askAnonymousOpenAI(kilo,'Write a public example',{dnsFn:async url=>new URL(url),fetchFn:async()=>mockResponse(reason)});
    assert.equal(response.status,'incomplete_response',reason);
    assert.equal(response.reply,null,reason);
    assert.equal(response.finish_reason,reason);
  }
});
test('a completed text response remains usable',async()=>{
  const response=await askAnonymousOpenAI(kilo,'Write a public example',{dnsFn:async url=>new URL(url),fetchFn:async()=>mockResponse('stop')});
  assert.equal(response.status,'reply');
  assert.equal(response.reply,'partial or complete response');
});
