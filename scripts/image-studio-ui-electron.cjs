const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.STUDIO_UI_ROOT,repo=process.env.STUDIO_UI_REPO,evidence=process.env.STUDIO_UI_EVIDENCE;
if(!root||!path.resolve(os.homedir()).startsWith(path.resolve(root)+path.sep))throw Error('Profile isolation failed');
app.setPath('userData',path.join(root,'electron-userData'));
app.on('browser-window-created',(_,win)=>{win.hide();win.once('ready-to-show',()=>win.hide());});
const id='abcdef12-3456-7890-abcd-1234567890ab';
const base={price_version:id,size:'1024x1024',authorization_ceiling:120,max_prompt_bytes:1000,max_count:1};
const catalog=[
 {...base,sku_id:'openai-gpt-image-2-medium',model:'gpt-image-2',quality:'medium',coins_per_image:36},
 {...base,sku_id:'nano-banana-2',model:'google/gemini-3.1-flash-image-preview',size:'native',quality:'default',coins_per_image:46},
 {...base,sku_id:'openai-gpt-image-1-low',model:'gpt-image-1',quality:'low',coins_per_image:8},
 {...base,sku_id:'openai-gpt-image-1-medium',model:'gpt-image-1',quality:'medium',coins_per_image:29}
];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1sAAAAASUVORK5CYII=','base64');
const calls=[],checks=[],errors=[];let failQuotes=false,delayQuotes=false,quoteStarted=0,quoteReleased=0,holdGeneration=false,releaseGeneration;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
globalThis.fetch=async(input,options={})=>{
 const url=new URL(String(input)),body=options.body?JSON.parse(options.body):null;
 if(!['wuweiai.io','gw.wuweiai.io'].includes(url.hostname))throw Error('External network blocked');
 const purpose=new Headers(options.headers).get('X-Wuwei-Request-Purpose');
 calls.push({path:url.pathname,method:options.method||'GET',body,purpose});
 if(url.pathname==='/api/images/catalog')return Response.json(catalog);
 if(url.pathname==='/api/images/quote'){
  const sku=catalog.find(row=>row.sku_id===body.sku_id);quoteStarted++;
  if(delayQuotes&&body.prompt==='Delayed draft'){await delay(1800);quoteReleased++;}
  if(failQuotes)return Response.json({code:'TEMPORARY'},{status:503});
  return Response.json({sku_id:sku.sku_id,price_version:sku.price_version,estimated_coins:sku.coins_per_image,authorization_ceiling:120});
 }
 if(url.pathname==='/api/images/orders'&&options.method==='POST'){if(holdGeneration)await new Promise(resolve=>{releaseGeneration=resolve;});return Response.json({order_id:id,status:'settled',reserved_coins:29,unit_price_coins:29});}
 if(url.pathname.endsWith('/asset'))return new Response(png,{headers:{'Content-Type':'image/png'}});
 if(url.pathname.startsWith('/api/images/orders/'))return Response.json({order_id:id,status:'settled',charged_coins:29,actual_coins:29});
 if(url.pathname==='/api/me')return Response.json({user:{id,email:'studio-ui@example.invalid',name:'UI fixture',avatar:null},coin:{balance:500},membership:{tier:'free'},flags:[]});
 if(url.pathname==='/api/catalog')return Response.json({providers:[{id:'wuwei-free',label:'Free',labelEn:'Free',kind:'openai',baseUrl:'https://gw.wuweiai.io/api/gateway/v1',hosted:true,anon:true,sort:0,models:[{id:'glm-4.7-flash',label:'GLM Flash',free:true,anon:true}]}]});
 if(url.pathname.includes('/chat/completions')){
  if(purpose==='model_check')return Response.json({choices:[{message:{content:'pong'}}]});
  throw Error('Unexpected task text model request');
 }
 return Response.json({active:false,ok:true,messages:[],threads:[],unread:0});
};
async function test(){
 let win;for(let n=0;n<100;n++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('app://'));if(win)break;await delay(100);}
 assert.ok(win);win.setContentSize(1440,960);win.webContents.setBackgroundThrottling(false);
 win.webContents.on('console-message',e=>{if(e.level==='error'&&!/Content Security Policy|ERR_|Failed to load resource/.test(e.message))errors.push(e.message);});
 const js=async code=>{fs.writeFileSync(path.join(evidence,'last-operation.txt'),code);let timer;try{return await Promise.race([win.webContents.executeJavaScript(code,true),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Renderer operation stalled: '+code)),12000);})]);}finally{clearTimeout(timer);}};
 async function wait(code,max=16000){const end=Date.now()+max;while(Date.now()<end){if(await js(code))return;await delay(70);}throw Error('UI timeout: '+code+'\n'+await js('document.body.innerText.slice(-2500)'));}
 function check(name,value){assert.ok(value,name);checks.push(name);fs.writeFileSync(path.join(evidence,'progress.json'),JSON.stringify(checks));console.log('PASS '+name);}
 const shot=async name=>{
  await js('document.fonts.ready');
  // Chromium may suspend surface capture after resizing an invisible native
  // window. A transparent, inactive window lets it paint without appearing.
  win.setOpacity(0);win.showInactive();await delay(250);
  let timer;try{const image=await Promise.race([win.webContents.capturePage(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Screenshot timeout: '+name)),10000);})]);fs.writeFileSync(path.join(evidence,name+'.png'),image.toPNG());}
  finally{clearTimeout(timer);win.hide();}
 };
 const type=value=>js(`(()=>{const e=document.querySelector('.studio-prompt-area textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const click=async selector=>{await wait(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);return js(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const waitReady=()=>wait(`!document.querySelector('.studio-generate').disabled`);
 await wait(`!!document.querySelector('.studio-card')&&!!document.querySelector('.acct-av:not(.off)')`);
 await wait(`!document.querySelector('.wsplash')`);await js(`document.querySelector('.announce-primary')?.click();void 0`);
 check('light studio replaces composer and keeps sidebar',await js(`!!document.querySelector('.studio-hero')&&!!document.querySelector('.sidebar')&&!document.querySelector('.composer>.input-wrap')&&getComputedStyle(document.querySelector('.studio-card')).backgroundColor==='rgb(255, 255, 255)'`));
 await shot('01-light-workspace');
 await click('[data-studio-model]');await wait(`!!document.querySelector('.studio-model-popover')`);await shot('02-model-menu');
 check('live catalogue groups models by provider',await js(`document.querySelectorAll('.studio-model-menu nav button').length===2&&document.querySelectorAll('[data-studio-sku]').length===2`));
 const low='[data-studio-sku=openai-gpt-image-1-low]';
 await click(low);await wait(`document.querySelector('[data-studio-model]').textContent.includes('GPT Image 1')`);
 await click('[data-studio-parameters]');await click('[data-studio-quality=medium]');await wait(`document.querySelector('[data-studio-quality=medium]').classList.contains('active')`);
 check('quality selects actual 29-coin medium SKU',(await js('window.wuwei.getSettings()')).settings.imageSku==='openai-gpt-image-1-medium');
 check('one through four images can be selected',await js(`document.querySelectorAll('[data-studio-count]').length===4&&[...document.querySelectorAll('[data-studio-count]')].every(b=>!b.disabled)`));
 await shot('03-live-parameters');
 await type('A celadon teacup on a cool gray background.');await waitReady();
 check('preflight quotes never create orders',calls.some(c=>c.path==='/api/images/quote'&&c.body.sku_id==='openai-gpt-image-1-medium')&&!calls.some(c=>c.path==='/api/images/orders'&&c.method==='POST'));
 await click('[data-studio-model]');await js(`[...document.querySelectorAll('.studio-model-menu nav button')].find(b=>b.textContent.includes('Google')).click()`);await click('[data-studio-sku=nano-banana-2]');
 await wait(`document.querySelector('[data-studio-model]').textContent.includes('Nano Banana 2')&&!document.querySelector('.studio-generate').disabled`);
 check('Google stays Auto and model switching preserves draft',await js(`document.querySelector('[data-studio-parameters]').textContent.includes('自动')&&document.querySelector('.studio-prompt-area textarea').value.includes('celadon')&&document.querySelector('.studio-generate-cost').textContent==='46'`));
 await click('.studio-reference-add');check('unavailable references are explicitly explained',await js(`document.querySelector('.studio-reference-add').getAttribute('aria-disabled')==='true'&&document.querySelector('#studio-reference-note').textContent.includes('仅开放文字生图')`));
 await click('.image-studio-header>div:last-child button:last-child');await wait(`!!document.querySelector('.composer>.input-wrap textarea')`);
 check('return to chat preserves draft',await js(`document.querySelector('.composer>.input-wrap textarea').value.includes('celadon')`));
 await click('.studio-mode-nav button:nth-child(2)');await wait(`!!document.querySelector('.studio-card')`);
 await click('[data-studio-model]');await js(`[...document.querySelectorAll('.studio-model-menu nav button')].find(b=>b.textContent.includes('OpenAI')).click()`);await click(low);await click('[data-studio-parameters]');await click('[data-studio-quality=medium]');await wait(`document.querySelector('[data-studio-quality=medium]').classList.contains('active')`);await click('[data-studio-parameters]');
 delayQuotes=true;const before=quoteStarted;await type('Delayed draft');for(let n=0;n<50&&quoteStarted===before;n++)await delay(50);
 await type('Newest draft');await waitReady();await delay(1900);
 check('late quote cannot restore obsolete draft',quoteReleased>0&&await js(`document.querySelector('.studio-prompt-area textarea').value==='Newest draft'&&!document.querySelector('.studio-generate').disabled`));delayQuotes=false;
 failQuotes=true;await type('Quote unavailable');await wait(`!!document.querySelector('.studio-error')`);
 check('quote failure blocks generation and exposes retry',await js(`document.querySelector('.studio-generate').disabled&&!!document.querySelector('.studio-error button')`));
 failQuotes=false;await click('.studio-error button');await waitReady();
 await type('茶'.repeat(334));await wait(`!!document.querySelector('.studio-inline-error')`);check('UTF8 length guarded before generating',await js(`document.querySelector('.studio-generate').disabled`));
 await type('A celadon teacup, soft side lighting.');await waitReady();
 check('inline cost shows the estimate without the authorization ceiling',await js(`document.querySelector('.studio-footnote').textContent.includes('29')&&!document.querySelector('.studio-footnote').textContent.includes('120')`));await shot('04-ready-direct');
 holdGeneration=true;
 await js(`document.querySelector('.studio-generate').click();document.querySelector('.studio-generate').click()`);
 for(let n=0;n<100&&!releaseGeneration;n++)await delay(50);assert.ok(releaseGeneration);
 await click('.studio-mode-nav button:first-child');await wait(`!!document.querySelector('.composer>.input-wrap textarea')`);
 const runningDuringNavigation=await js(`(async()=>window.wuwei.isRunning((await window.wuwei.bootstrap()).currentId))()`);
 check('navigation to chat keeps the original image request running',runningDuringNavigation);
 await click('.studio-mode-nav button:nth-child(2)');await wait(`!!document.querySelector('.studio-card')`);
 check('return to studio retains the selected SKU',(await js('window.wuwei.getSettings()')).settings.imageSku==='openai-gpt-image-1-medium');
 check('return to studio retains the running state',await js(`!!document.querySelector('.studio-stop')`));
 releaseGeneration();holdGeneration=false;

 await wait(`!!document.querySelector('.stream img')&&!document.querySelector('.studio-stop')`);
 let paid=calls.filter(c=>c.path==='/api/images/orders'&&c.method==='POST');
 check('double click generates one matching SKU without fee dialog',paid.length===1&&paid[0].body.sku_id==='openai-gpt-image-1-medium'&&paid[0].body.authorized_budget===120&&await js(`!document.querySelector('.tool-decision')&&!document.querySelector('.stream').classList.contains('image-studio-stream-hidden')`));await shot('05-generated-result');
 check('navigation delivers the original image with no failure text',await js(`!document.querySelector('.stream').textContent.includes('未完成结算')&&!!document.querySelector('.stream img')`));
 // Simulate a price change between the displayed quote and the click.
 await type('Changed price fixture');await waitReady();catalog.find(s=>s.sku_id==='openai-gpt-image-1-medium').coins_per_image=30;
 await click('.studio-generate');await wait(`!document.querySelector('.studio-stop')&&document.querySelector('.stream').textContent.includes('报价已变化')`);
 check('changed quote creates no order and no second confirmation',calls.filter(c=>c.path==='/api/images/orders'&&c.method==='POST').length===1&&await js(`!document.querySelector('.tool-decision')`));
 // The legacy tool route has no trusted click grant and still asks explicitly.
 const sid=(await js('window.wuwei.bootstrap()')).currentId;
 await js(`window.wuwei.send(${JSON.stringify(sid)},'Legacy tool fixture');void 0`);await wait(`!!document.querySelector('.tool-decision')`);
 await click('[data-decision-value=cancel_image]');await wait(`!document.querySelector('.tool-decision')&&!document.querySelector('.studio-stop')`);
 check('untrusted legacy request retains decision and cancellation costs nothing',calls.filter(c=>c.path==='/api/images/orders'&&c.method==='POST').length===1);
 for(const [w,h] of [[1280,800],[1080,760]]){
  win.setContentSize(w,h);await delay(100);await click('.image-studio-header>div:last-child button:first-child');await wait(`!!document.querySelector('.studio-hero')`);
  for(const selector of ['[data-studio-model]','[data-studio-parameters]']){await click(selector);await delay(80);check(`popover fits ${w}x${h} ${selector}`,await js(`(()=>{const r=document.querySelector('.studio-popover').getBoundingClientRect(),m=document.querySelector('.main').getBoundingClientRect();return r.left>=m.left&&r.right<=m.right&&r.top>=0&&r.bottom<=innerHeight;})()`));await click(selector);}
  check(`toolbar fits ${w}x${h}`,await js(`document.querySelector('.studio-options').getBoundingClientRect().right<=document.querySelector('.studio-generate').getBoundingClientRect().left`));if(w===1280)await shot('05-compact-layout');
  await click('.image-studio-header>div:last-child button:first-child');
 }
 check('no task text model or production requests',!calls.some(c=>c.path.includes('/chat/completions')&&c.purpose!=='model_check'));check('no renderer errors',!errors.length);
 fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({status:'passed',checks,paidRequests:paid.length,productionRequests:0,textModelTaskRequests:0,modelChecks:calls.filter(c=>c.purpose==='model_check').length,errors},null,2));app.exit(0);
}
require(path.join(repo,'out/main/index.cjs'));
app.whenReady().then(test).catch(error=>{fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({status:'failed',checks,error:error.stack,errors},null,2));console.error(error.stack);app.exit(1);});
