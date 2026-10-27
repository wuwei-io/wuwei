const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.STUDIO_UI_ROOT,repo=process.env.STUDIO_UI_REPO,evidence=process.env.STUDIO_UI_EVIDENCE;
if(!root||!path.resolve(os.homedir()).startsWith(path.resolve(root)+path.sep))throw Error('Profile isolation failed');
app.setPath('userData',path.join(root,'electron-userData'));
app.on('browser-window-created',(_,win)=>{win.hide();win.once('ready-to-show',()=>win.hide());});
const id='abcdef12-3456-7890-abcd-1234567890ab';
const base={price_version:id,size:'1024x1024',authorization_ceiling:120,max_prompt_bytes:1000,max_count:1};
const catalog=require(path.join(repo,process.env.STUDIO_MEDIA_CATALOGUE==='true'?'scripts/fixtures/image-media-specifications.json':'scripts/fixtures/image-studio-specifications.json')).map(row=>({...base,...row,sku_id:row.sku,coins_per_image:row.sale,authorization_ceiling:row.ceiling}));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1sAAAAASUVORK5CYII=','base64');
const orders=new Map(),orderKeys=new Map();let created=0,holdOrderNumber=0,releaseOrder,pendingOrderNumber=0;
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
  return Response.json({sku_id:sku.sku_id,price_version:sku.price_version,estimated_coins:sku.coins_per_image,authorization_ceiling:sku.authorization_ceiling});
 }
 if(url.pathname==='/api/images/orders'&&options.method==='POST') {
  const key=new Headers(options.headers).get('Idempotency-Key');
  if(orderKeys.has(key))return Response.json(orderKeys.get(key));
  created++;const orderId='abcdef12-3456-7890-abcd-'+String(created).padStart(12,'0');
  const sku=catalog.find(s=>s.sku_id===body.sku_id),unknown=created===pendingOrderNumber;
  const order={order_id:orderId,status:unknown?'unknown':'settled',reserved_coins:sku.coins_per_image,unit_price_coins:sku.coins_per_image,charged_coins:unknown?0:sku.coins_per_image,actual_coins:unknown?null:sku.coins_per_image,error_code:unknown?'PROVIDER_OUTCOME_UNKNOWN':null};
  orders.set(orderId,order);orderKeys.set(key,order);
  if(created===holdOrderNumber)await new Promise(resolve=>releaseOrder=resolve);
  return Response.json(order);
 }
 if(url.pathname.endsWith('/settle'))return Response.json({code:'USAGE_RECONCILIATION_REQUIRED'},{status:409});
 if(url.pathname.endsWith('/asset'))return new Response(png,{headers:{'Content-Type':'image/png'}});
 if(url.pathname.startsWith('/api/images/orders/'))return Response.json(orders.get(url.pathname.split('/').at(-1)));
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
 await type('A celadon teacup, soft side lighting.');await waitReady();
 await click('[data-studio-parameters]');
 check('ten aspect ratios and all four batch counts are interactive',await js(`document.querySelectorAll('[data-studio-ratio]').length===10&&document.querySelectorAll('[data-studio-count]').length===4&&[...document.querySelectorAll('[data-studio-count]')].every(b=>!b.disabled)`));
 check('GPT supports low, standard and high quality',await js(`document.querySelectorAll('[data-studio-quality]').length===3`));
 check('4K square is correctly unavailable under the vendor pixel limit',await js(`document.querySelector('[data-studio-resolution="4K"]').disabled`));
 await delay(1100);
 await js(`window.__studioStable={document:document,origin:performance.timeOrigin,sidebar:document.querySelector('.sidebar'),header:document.querySelector('.image-studio-header'),card:document.querySelector('.studio-card'),panel:document.querySelector('.studio-parameter-popover'),prompt:document.querySelector('.studio-prompt-area textarea'),draft:document.querySelector('.studio-prompt-area textarea').value,events:[]};window.__studioStable.off=window.wuwei.onEvent(ch=>window.__studioStable.events.push(ch));void 0;`);
 await click('[data-studio-ratio="16:9"]');await click('[data-studio-resolution="2K"]');await click('[data-studio-quality="high"]');await click('[data-studio-count="3"]');await waitReady();
 const localUpdate=await js(`(()=>{const s=window.__studioStable;s.off();return{sameDocument:document===s.document&&performance.timeOrigin===s.origin,sameSidebar:document.querySelector('.sidebar')===s.sidebar,sameHeader:document.querySelector('.image-studio-header')===s.header,sameCard:document.querySelector('.studio-card')===s.card,samePanel:document.querySelector('.studio-parameter-popover')===s.panel,samePrompt:document.querySelector('.studio-prompt-area textarea')===s.prompt,draftPreserved:document.querySelector('.studio-prompt-area textarea').value===s.draft,globalReadyEvents:s.events.filter(ch=>ch==='evt:ready').length,accountEvents:s.events.filter(ch=>ch==='evt:account'||ch==='evt:wuwei-me').length}})()`);
 fs.writeFileSync(path.join(evidence,'local-update.json'),JSON.stringify(localUpdate,null,2));
 if(process.env.STUDIO_ALLOW_GLOBAL_REFRESH_BASELINE!=='true')check('settings change locally without provider initialization, account refresh, remount or page reload',localUpdate.sameDocument&&localUpdate.sameSidebar&&localUpdate.sameHeader&&localUpdate.sameCard&&localUpdate.samePanel&&localUpdate.samePrompt&&localUpdate.draftPreserved&&localUpdate.globalReadyEvents===0&&localUpdate.accountEvents===0);
 const selected=catalog.find(row=>row.model==='gpt-image-2'&&row.aspect_ratio==='16:9'&&row.resolution==='2K'&&row.quality==='high');
 check('ratio, resolution and quality select the real billing specification',(await js('window.wuwei.getSettings()')).settings.imageSku===selected.sku_id);
 if(process.env.STUDIO_ALLOW_GLOBAL_REFRESH_BASELINE!=='true'){
  const unchanged=await js(`(async()=>{const before=JSON.stringify((await window.wuwei.getSettings()).settings),sid=(await window.wuwei.bootstrap()).currentId;let invalid=false,wrongSession=false;try{await window.wuwei.selectImageSku({sku_id:'nonexistent-image-sku',sid})}catch{invalid=true;}try{await window.wuwei.selectImageSku({sku_id:${JSON.stringify(selected.sku_id)},sid:'stale-session'})}catch{wrongSession=true;}return invalid&&wrongSession&&JSON.stringify((await window.wuwei.getSettings()).settings)===before;})()`);
  check('invalid specifications and stale-session selections cannot write settings',unchanged);
 }
 check('batch quote displays its total estimate without the authorization ceiling',await js(`document.querySelector('.studio-generate-cost').textContent.trim()==='${selected.coins_per_image*3}'&&!document.querySelector('.studio-footnote').textContent.includes('最高')`));
 for(const [w,h]of [[1440,960],[1280,720],[1080,640],[1280,600]]){
  win.setContentSize(w,h);await delay(150);
  check(`entire settings sheet fits without a scrollbar at ${w}x${h}`,await js(`(()=>{const e=document.querySelector('.studio-parameter-popover'),r=e.getBoundingClientRect(),top=document.querySelector('.image-studio-header').getBoundingClientRect().bottom;return e.scrollHeight<=e.clientHeight+1&&getComputedStyle(e).overflowY==='visible'&&r.top>=top&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()`));
  await shot(`settings-gpt-${w}x${h}`);
 }
 win.setContentSize(1440,960);await delay(100);await click('[data-studio-parameters]');
 holdOrderNumber=2;
 await click('.studio-generate');
 for(let n=0;n<120&&!releaseOrder;n++)await delay(50);assert.ok(releaseOrder);
 check('batch delivers the first image while the next request is running',await js(`document.querySelectorAll('.studio-art-open img').length===1&&!!document.querySelector('.studio-stop')`));
 await click('.studio-mode-nav button:first-child');await wait(`!!document.querySelector('.composer>.input-wrap textarea')`);
 await click('.studio-mode-nav button:nth-child(2)');await wait(`!!document.querySelector('.studio-card')`);
 check('navigation preserves both selected specification and batch count',await js(`document.querySelector('.studio-parameters-control').textContent.includes('3 张')`));
 releaseOrder();
 await wait(`!document.querySelector('.studio-stop')&&document.querySelectorAll('.studio-art-open img').length===3`);
 const posts=calls.filter(c=>c.path==='/api/images/orders'&&c.method==='POST');
 check('one batch click creates exactly three individually accounted matching orders',posts.length===3&&posts.every(p=>p.body.sku_id===selected.sku_id&&p.body.count===1&&p.body.authorized_budget===selected.authorization_ceiling)&&orderKeys.size===3);
 check('batch completion needs no text model or repeated confirmation',await js(`!document.querySelector('.tool-decision')&&document.querySelector('.studio-batch-status').textContent.includes('已完成')`));
 await type('Nano Banana 4K vertical poster');
 await click('[data-studio-model]');await js(`[...document.querySelectorAll('.studio-model-menu nav button')].find(b=>b.textContent.includes('Google')).click()`);await click('[data-studio-sku="nano-banana-2"]');
 await click('[data-studio-parameters]');await click('[data-studio-ratio="9:16"]');await click('[data-studio-resolution="0.5K"]');await click('[data-studio-count="1"]');await waitReady();
 check('Nano Banana has all four native resolution tiers',await js(`document.querySelectorAll('[data-studio-resolution]').length===4&&[...document.querySelectorAll('[data-studio-resolution]')].every(b=>!b.disabled)`));
 check('Nano Banana avoids unsupported artificial quality settings',await js(`document.querySelectorAll('[data-studio-quality]').length===0`));
 check('0.5K selects a distinct native-priced specification',(await js('window.wuwei.getSettings()')).settings.imageSku===catalog.find(row=>row.model.includes('gemini')&&row.aspect_ratio==='9:16'&&row.resolution==='0.5K').sku_id);
 await click('[data-studio-resolution="4K"]');await click('[data-studio-count="4"]');await waitReady();await shot('settings-nano-banana-4k');
 check('four-image 4K total updates before generation',await js(`document.querySelector('.studio-generate-cost').textContent.trim()==='408'`));
 await click('[data-studio-parameters]');pendingOrderNumber=created+2;
 await click('.studio-generate');
 await wait(`!document.querySelector('.studio-stop')&&document.querySelectorAll('.studio-batch').length===2&&document.querySelectorAll('.studio-batch-status')[1].textContent.includes('1 / 4')`);
 check('an uncertain second image stops the batch and preserves all completed images',created===5&&await js(`document.querySelectorAll('.studio-art-open img').length===4`));
 check('original-order recovery does not send another generation request',calls.filter(c=>c.path.endsWith('/settle')).length===1&&calls.filter(c=>c.path==='/api/images/orders'&&c.method==='POST').length===5);

 await shot('gallery-partial-results');
 check('gallery has four completed cards and separates the uncertain original and unsubmitted remainder',await js(`document.querySelectorAll('.studio-art-open').length===4&&document.querySelectorAll('.studio-art-placeholder.pending').length===1&&document.querySelectorAll('.studio-art-placeholder.unattempted').length===2`));
 await js(`document.querySelector('.studio-art-bottom button[aria-label="收藏"]').click()`);
 await click('.studio-gallery-tools button[aria-label="只看收藏"]');
 check('favorites filter is scoped to this conversation',await js(`document.querySelectorAll('.studio-art-open').length===1`));
 await click('.studio-gallery-tools button[aria-label="只看收藏"]');
 await js(`document.querySelector('.studio-art-open').click()`);await wait(`!!document.querySelector('.studio-viewer')`);
 check('viewer shows the original pixel dimensions and actual stored charge',await js(`document.querySelector('.studio-viewer').textContent.includes('1 × 1 px')&&document.querySelector('.studio-viewer dd').textContent!=='999'&&document.querySelector('.studio-viewer-original').src===document.querySelector('.studio-art-open img').src`));
 check('saved artwork uses a solid heart, explicit saved text and a clear remove action',await js(`(()=>{const b=document.querySelector('.studio-viewer [data-studio-favorite]'),icon=b.querySelector('svg');return b.getAttribute('aria-pressed')==='true'&&b.textContent==='已收藏'&&b.getAttribute('aria-label')==='取消收藏'&&getComputedStyle(b).color==='rgb(255, 255, 255)'&&getComputedStyle(icon).fill==='rgb(255, 255, 255)'})()`));
 await shot('favorite-saved');await click('.studio-viewer [data-studio-favorite]');
 check('removing a favorite immediately restores the outline state in viewer and card',await js(`document.querySelector('.studio-viewer [data-studio-favorite]').textContent==='收藏'&&document.querySelector('.studio-art-bottom [data-studio-favorite]').getAttribute('aria-pressed')==='false'`));
 await shot('favorite-unsaved');await click('.studio-viewer [data-studio-favorite]');
 check('favorite labels preserve the conversation storage note',await js(`document.querySelector('.studio-batch-foot>span').textContent.includes('作品与生成参数保存在当前会话')`));
 check('viewer moves keyboard focus inside the dialog',await js(`document.activeElement.closest('.studio-viewer')!==null`));
 await shot('gallery-original-details');
 await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
 check('arrow key switches to the next original',await js(`document.querySelector('.studio-viewer>header small').textContent==='2 / 4'`));
 const downloads=[],finishedDownloads=[];win.webContents.session.on('will-download',(_event,item)=>{const file=path.join(evidence,'owned-fixture-original-'+downloads.length+'.png');item.setSavePath(file);downloads.push(item);item.once('done',(_event,state)=>finishedDownloads.push({file,state}));});
 await click('.studio-viewer-actions .primary');for(let n=0;n<50&&finishedDownloads.length<1;n++)await delay(50);
 check('download preserves the exact independent original PNG bytes',finishedDownloads.length===1&&finishedDownloads[0].state==='completed'&&fs.readFileSync(finishedDownloads[0].file).equals(png));
 await js(`document.querySelector('.studio-viewer-prompt>button').click()`);await wait(`!document.querySelector('.studio-viewer')&&document.querySelector('.studio-parameters-control').textContent.includes('1 张')`);
 check('reuse restores the original prompt, actual SKU and single-image count without a paid request',created===5&&await js(`document.querySelector('.studio-prompt-area textarea').value==='A celadon teacup, soft side lighting.'&&document.querySelector('.studio-parameters-control').textContent.includes('1 张')`));
 await js(`document.querySelector('.studio-batch-foot button').click()`);for(let n=0;n<70&&finishedDownloads.length<4;n++)await delay(50);
 check('batch download exports every completed original without creating an order',finishedDownloads.length===4&&finishedDownloads.every(item=>item.state==='completed'&&fs.readFileSync(item.file).equals(png))&&created===5);
 await js(`(()=>{const e=document.querySelector('.studio-gallery-tools input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'no match fixture');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 check('search changes only gallery records',await js(`document.querySelectorAll('.studio-batch').length===0&&!!document.querySelector('.studio-card')&&!!document.querySelector('.sidebar')`));
 await js(`(()=>{const e=document.querySelector('.studio-gallery-tools input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const beforeRecovery=created;
 await js(`document.querySelector('.studio-art-placeholder.pending button').click()`);await delay(250);
 check('checking an uncertain order submits no new paid generation',created===beforeRecovery&&await js(`!!document.querySelector('.studio-art-placeholder.pending')`));
 const sid=(await js('window.wuwei.bootstrap()')).currentId;
 check('recovery IPC rejects a forged tool and stale conversation',await js(`(async()=>{let a=false,b=false;try{await window.wuwei.imageRecover({sid:${JSON.stringify(sid)},tool_id:'forged'})}catch{a=true}try{await window.wuwei.imageRecover({sid:'stale',tool_id:'forged'})}catch{b=true}return a&&b})()`));
 await click('[data-studio-model]');
 check('model menu uses four native brand groups and prices only verified SKUs',await js(`document.querySelectorAll('.studio-model-menu nav button').length===4&&document.querySelectorAll('.studio-model-list [data-studio-sku]').length===${process.env.STUDIO_MEDIA_CATALOGUE==='true'?3:1}&&document.querySelectorAll('.studio-model-list .is-unavailable').length===0`));
 await js(`(()=>{const e=document.querySelector('.studio-model-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Seedream');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 check('model search spans brands and never selects an unverified route',await js(`document.querySelectorAll('.studio-v2-model').length===${new Set(catalog.filter(row=>/seedream/.test(row.model)).map(row=>row.model)).size}&&[...document.querySelectorAll('.studio-v2-model')].every(e=>!e.disabled)&&!!document.querySelector('.studio-model-crown')`));

 if(process.env.STUDIO_MEDIA_CATALOGUE==='true'){
  check('premium model has a crown and is locked for a non-member',await js(`!!document.querySelector('.studio-v2-model:disabled .studio-model-crown')`));
  check('generation timing is explicitly a single provider trial',await js(`document.querySelector('.studio-model-list').textContent.includes('试测')`));
  await js(`[...document.querySelectorAll('.studio-v2-model')].find(e=>e.textContent.includes('Seedream 5.0 Flash')).click()`);await waitReady();await click('[data-studio-parameters]');
  check('Seedream exposes all seventeen actual aspect ratios',await js(`document.querySelectorAll('[data-studio-ratio]').length===17`));
  for(const [w,h]of [[1280,720],[1080,640],[1280,600]]){win.setContentSize(w,h);await delay(150);check(`17 ratios fit without scrollbars at ${w}x${h}`,await js(`(()=>{const e=document.querySelector('.studio-parameter-popover'),r=e.getBoundingClientRect();return e.scrollHeight<=e.clientHeight+1&&r.top>=document.querySelector('.image-studio-header').getBoundingClientRect().bottom&&r.bottom<=innerHeight})()`));await shot('seedream-17-ratios-'+w+'x'+h);}
  win.setContentSize(1440,960);await click('[data-studio-parameters]');await click('[data-studio-model]');await js(`[...document.querySelectorAll('.studio-model-menu nav button')].find(e=>e.textContent.includes('OpenAI')).click()`);
  await js(`[...document.querySelectorAll('.studio-v2-model')].find(e=>e.textContent.includes('Flare')).click()`);await waitReady();await click('[data-studio-parameters]');
  check('GPT Image 2.5 exposes five real quality levels',await js(`document.querySelectorAll('[data-studio-quality]').length===5`));await click('[data-studio-quality="max"]');await waitReady();
  check('maximum quality changes the actual SKU and estimate locally',await js(`document.querySelector('[data-studio-quality="max"]').getAttribute('aria-pressed')==='true'&&document.querySelector('.studio-parameters-control').textContent.includes('极致')`));
  await shot('openai-2p5-max-quality');await click('[data-studio-parameters]');await click('[data-studio-model]');
 }
 await shot('gallery-model-directory');
 await click('[data-studio-model]');
 for(const [w,h]of [[1440,980],[1280,800],[1080,760],[980,680]]){
  win.setContentSize(w,h);await delay(100);
  check(`gallery and composer align at ${w}x${h}`,await js(`(()=>{const a=document.querySelector('.studio-gallery').getBoundingClientRect(),b=document.querySelector('.studio-card').getBoundingClientRect();return Math.abs(a.left-b.left)<2&&Math.abs(a.right-b.right)<2&&document.documentElement.scrollWidth<=innerWidth})()`));
  if(w===1280){await js(`document.querySelector('.studio-gallery-stream').scrollTop=0`);await shot('gallery-1280');}
 }
 check('no renderer errors or task text-model calls',errors.length===0&&!calls.some(c=>c.path.includes('/chat/completions')&&c.purpose!=='model_check'));
 fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({status:'passed',checks,catalogueSpecifications:catalog.length,mockedGenerationOrders:created,productionRequests:0,textModelTaskRequests:0,errors},null,2));app.exit(0);
}
require(path.join(repo,'out/main/index.cjs'));
app.whenReady().then(test).catch(error=>{fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify({status:'failed',checks,error:error.stack,errors},null,2));console.error(error.stack);app.exit(1);});
