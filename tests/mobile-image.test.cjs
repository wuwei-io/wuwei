const{test}=require('node:test'),assert=require('node:assert/strict');
const api=require('../desktop/main/mobile-remote/wuwei-remote-history.cjs');
const messages=[{role:'assistant',content:[{type:'text',text:'Generated'},{type:'image',dataUrl:'data:image/png;base64,ORIGINAL'}]}];
const row=api.project(messages,false)[0],params={messageId:row.id,sourceKey:row.sourceKey,imageKey:row.imageKeys[0]};
test('HD image preserves original bytes and dimensions when already within limits',()=>{
 const result=api.fullImage(messages,params,()=>({isEmpty:()=>false,getSize:()=>({width:2048,height:1024})}));assert.equal(result.dataUrl,messages[0].content[1].dataUrl);assert.equal(result.width,2048);assert.equal(result.original,true);
});
test('oversized originals use a bounded high resolution rather than a history thumbnail',()=>{
 let resized;const image={isEmpty:()=>false,getSize:()=>({width:6000,height:4000}),resize:opts=>{resized=opts;return{getSize:()=>({width:opts.width,height:Math.round(opts.width*2/3)}),toJPEG:()=>Buffer.alloc(700000)}}};
 const result=api.fullImage(messages,params,()=>image);assert.equal(resized.width,2560);assert.equal(result.width,2560);assert.ok(result.dataUrl.length<1600000);assert.equal(result.original,false);
});
test('HD reads reject stale, cross-message, unknown-image and deleted references',()=>{
 for(const patch of [{messageId:'user-0'},{sourceKey:'stale'},{imageKey:'unknown'}])assert.throws(()=>api.fullImage(messages,{...params,...patch},()=>{throw Error('must not decode')}),/记录已变化/);
 assert.throws(()=>api.fullImage([{...messages[0],__wuweiDeleted:true}],params,()=>{}),/记录已变化/);
});
