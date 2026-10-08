const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=process.env.IMAGE_PICKER_ROOT,repo=process.env.IMAGE_PICKER_REPO,evidence=process.env.IMAGE_PICKER_EVIDENCE;
if(!root || !path.resolve(os.homedir()).startsWith(path.resolve(root)+path.sep))throw Error('Profile isolation failed');
app.setPath('userData',path.join(root,'electron-userData'));
app.on('browser-window-created',(_,win)=>{win.hide();win.once('ready-to-show',()=>win.hide());});
const id='abcdef12-3456-7890-abcd-1234567890ab';
const base={price_version:id,size:'1024x1024',authorization_ceiling:120,max_prompt_bytes:1000,max_count:1};
const catalog=[
 {...base,sku_id:'openai-gpt-image-1-medium',model:'gpt-image-1',quality:'medium',coins_per_image:29},
 {...base,sku_id:'nano-banana-2',model:'google/gemini-3.1-flash-image-preview',quality:'default',coins_per_image:46},
 {...base,sku_id:'openai-gpt-image-2-medium',model:'gpt-image-2',quality:'medium',coins_per_image:36},
 {...base,sku_id:'gemini-2-5-flash-image',model:'google/gemini-2.5-flash-image',quality:'default',coins_per_image:26},
 {...base,sku_id:'openai-gpt-image-1-low',model:'gpt-image-1',quality:'low',coins_per_image:8},
];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1sAAAAASUVORK5CYII=','base64');
const calls=[];let unavailable=false,orderCount=0,interruptNext=false,assetFailure=false;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(String(input)),body=options.body?JSON.parse(options.body):null;
 if(!['wuweiai.io','gw.wuweiai.io'].includes(url.hostname))throw Error('No external network in isolated UI acceptance');
 calls.push({path:url.pathname,method:options.method||'GET',body});
 if(url.pathname==='/api/images/catalog')return Response.json(unavailable?[]:catalog);
 if(url.pathname==='/api/images/quote') {
  const sku=catalog.find(row=>row.sku_id===body.sku_id);
  return Response.json({sku_id:sku.sku_id,price_version:sku.price_version,estimated_coins:sku.coins_per_image,authorization_ceiling:120});
 }
 if(url.pathname==='/api/images/orders'&&options.method==='POST') {
  orderCount++;
  if(interruptNext){interruptNext=false;assetFailure=true;throw new TypeError('Connection interrupted after submission');}
  return Response.json({order_id:id,status:'settled',reserved_coins:8,unit_price_coins:8});
 }
 if(url.pathname==='/api/images/orders')return Response.json({order_id:id,status:'settled'});
 if(url.pathname.endsWith('/asset')) {
  if(assetFailure){assetFailure=false;return new Response(new ReadableStream({start(c){c.error(new TypeError('terminated'));}}),{headers:{'Content-Type':'image/png'}});}
  return new Response(png,{headers:{'Content-Type':'image/png'}});
 }
 if(url.pathname.startsWith('/api/images/orders/'))return Response.json({order_id:id,status:'settled',charged_coins:29,actual_coins:29});
 if(url.pathname==='/api/me')return Response.json({user:{id,email:'image-ui@example.invalid',name:'UI fixture',avatar:null},coin:{balance:500},membership:{tier:'free'},flags:[]});
 if(url.pathname==='/api/catalog')return Response.json({providers:[]});
 if(url.pathname.includes('/chat/completions')){console.error(new Error('Unexpected text-model call').stack);throw Error('Image mode must never call a text model');}
 return Response.json({ok:true,messages:[],threads:[],unread:0});
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function test(){
 let win;for(let n=0;n<100;n++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('app://'));if(win)break;await delay(100);}
 assert.ok(win);const js=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(error){throw Error('Renderer script failed: '+code+'; '+error.message);}};
 const wait=async(code)=>{for(let n=0;n<150;n++){if(await js(code))return;await delay(100);}throw Error('UI timeout: '+code+'; '+await js('JSON.stringify(window.pickerEvents||[])'));};
 await wait('!!window.wuwei?.getSettings && !!document.querySelector(".mq-mod")');
 await wait('!!document.querySelector(".acct-av:not(.off)")');
 await js(`window.pickerEvents=[];window.wuwei.onEvent((c,p)=>{if(['evt:tool-end','evt:error','evt:done','evt:stopped'].includes(c))window.pickerEvents.push({c,result:p.result,message:p.message,image:!!p.image});});void 0;`);
 const setLang=async language=>{
  win.webContents.send('evt:tray-settings');await wait('!!document.querySelector(".set-tabs")');
  await js('document.querySelector(".set-tabs button").click()');
  const label=language==='en'?'English':'中文';
  await wait(`[...document.querySelectorAll('.theme-opt')].some(b=>b.textContent===${JSON.stringify(label)})`);
  await js(`[...document.querySelectorAll('.theme-opt')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
  await js(`document.querySelector('.set-win-btn[title=${language==='en'?'"Close"':'"关闭"'}]').click()`);
  await wait('!document.querySelector(".settings-overlay")');
 };
 await setLang('en');
 await js('document.querySelector(".mq-mod").click()');await wait('!!document.querySelector("[data-image-sku]")');
 const menu=await js(`Array.from(document.querySelectorAll('[data-image-sku]'),b=>b.textContent.trim().replace(/(?:≈|From ).*/,'').replace('✓','').trim())`);
 assert.deepEqual(menu,['GPT Image 2','Nano Banana 2','Nano Banana','GPT Image 1']);
 await js(`document.querySelector('[data-image-sku="openai-gpt-image-1-low"]').click()`);
 await wait('!!document.querySelector(".conn-green")');
 assert.equal((await js('window.wuwei.checkConn()')).status,'green');
 const sid=(await js('window.wuwei.bootstrap()')).currentId;
 process.env.WUWEI_LANG='zh'; // Deliberately mismatch producer language: UI must still show English.
 await js(`window.wuwei.send(${JSON.stringify(sid)},'A blue cube')`);await wait('!!document.querySelector(".tool-decision")');
 const english=await js('document.querySelector(".tool-decision").textContent');
 assert.match(english,/Image cost confirmation/);assert.match(english,/Low quality.*hold 8/);assert.match(english,/Medium quality.*hold 29/);assert.doesNotMatch(english,/[\u4e00-\u9fff]/);
 assert.equal(orderCount,0);
 await js('document.querySelector("[data-decision-value=cancel_image]").click()');await wait('!document.querySelector(".tool-decision")');await delay(100);assert.equal(orderCount,0);
 console.log('PASS real grouped picker order, low-price default, selected-image green light and English quality/fee dialog despite Chinese producer text; cancellation has zero orders');
 await setLang('zh');
 await js(`window.wuwei.send(${JSON.stringify(sid)},'A blue cube')`);await wait('!!document.querySelector(".tool-decision")');
 const chinese=await js('document.querySelector(".tool-decision").textContent');assert.match(chinese,/生图费用确认/);assert.match(chinese,/低画质生成.*预计 8/);assert.match(chinese,/中画质生成.*预计 29/);
 await js(`document.querySelector('[data-decision-value="generate_image:openai-gpt-image-1-medium"]').click()`);
 await wait('!document.querySelector(".tool-decision") && !!document.querySelector(".stream img")');
 const paid=calls.filter(c=>c.path==='/api/images/orders'&&c.method==='POST');assert.equal(paid.length,1);assert.equal(paid[0].body.sku_id,'openai-gpt-image-1-medium');
 console.log('PASS actual Chinese quality choice submits the displayed 29-coin medium SKU once and displays the inline image');
 await delay(200);interruptNext=true;
 await js(`window.wuwei.send(${JSON.stringify(sid)},'Another blue cube')`);await wait('!!document.querySelector(".tool-decision")');
 await js('document.querySelector("[data-decision-value=generate_image]").click()');
 await wait('!document.querySelector(".tool-decision")');
 await wait('window.pickerEvents.filter(e=>e.c==="evt:tool-end" && e.image).length===2 && !!document.querySelector(".stream img")');
 assert.equal(orderCount,2);assert.equal(calls.filter(c=>c.path==='/api/images/orders'&&c.method==='POST').length,2);
 assert.ok(calls.some(c=>c.path==='/api/images/orders'&&c.method==='GET'));
 console.log('PASS interrupted generation response and asset stream recover the original order and display without duplicate paid POST');
 unavailable=true;const bad=await js('window.wuwei.checkConn()');assert.equal(bad.status,'yellow');
 await js('document.querySelector(".conn-light").click()');await wait('!!document.querySelector(".conn-pop")');
 await js(`[...document.querySelectorAll('.conn-pop-actions button')].find(b=>b.textContent==='重新检测').click()`);await wait('!!document.querySelector(".conn-yellow")');
 assert.equal(calls.filter(c=>c.path.includes('/chat/completions')).length,0);
 fs.writeFileSync(path.join(evidence,'desktop-ui.json'),JSON.stringify({menu,english,chinese,paidRequests:orderCount,qualitySku:paid[0].body.sku_id,imageServiceUnavailable:'yellow',chatRequests:0,productionRequests:0},null,2));
 console.log('PASS unavailable image model becomes yellow; all image health checks bypass chat models and paid orders');
 app.exit(0);
}
require(path.join(repo,'out/main/index.cjs'));
app.whenReady().then(test).catch(error=>{console.error(error.stack);app.exit(1);});
