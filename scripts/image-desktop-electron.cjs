const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=process.env.IMAGE_UI_ROOT,repo=process.env.IMAGE_UI_REPO,sku=process.env.IMAGE_UI_SKU;
if(!root || path.relative(root,os.homedir()).startsWith('..'))throw Error('Profile isolation failed');
app.setPath('userData',path.join(root,'electron-userData'));
app.on('browser-window-created',(_event,window)=>{window.hide();window.once('ready-to-show',()=>window.hide());});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function test(){
 let win;for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app://bundle'));if(win)break;await delay(100);}
 assert.ok(win,'Actual app window');
 const js=code=>win.webContents.executeJavaScript(code,true);
 async function wait(code,max=150000){const end=Date.now()+max;while(Date.now()<end){if(await js(code))return;await delay(200);}throw Error('UI timeout: '+code+'; '+await js('JSON.stringify(window.imageEvents)'));}
 await wait('!!window.wuwei?.bootstrap');
 await js(`window.imageEvents=[];window.wuwei.onEvent((channel,p)=>{if(['evt:decision-request','evt:decision-resolved','evt:tool-start','evt:tool-end','evt:done','evt:stopped','evt:error','evt:permission-request'].includes(channel))window.imageEvents.push({channel,...p,image:p.image?true:undefined});});window.dispatchEvent(new Event('focus'));void 0;`);
 const sid=(await js('window.wuwei.bootstrap()')).currentId;
 const send=message=>js(`window.wuwei.send(${JSON.stringify(sid)},${JSON.stringify(message)})`);
 const catalog=await js('window.wuwei.imageCatalog()');
 assert.ok(catalog.some(row=>row.sku_id===sku),'Deployed reviewed SKU must be available');
 await wait('!!document.querySelector(".acct-av:not(.off)")');
 await wait('!!document.querySelector(".mq-prov")');
 await js('document.querySelector(".mq-prov").click()');
 await wait('!!document.querySelector(".mq-menu-prov")');
 assert.match(await js('document.querySelector(".mq-menu-prov .mq-item").textContent'),/Free trial|免费体验/);
 await js('[...document.querySelectorAll(".mq-menu-prov .mq-item")].find(b=>/Image models|生图模型/.test(b.textContent)).click()');
 await wait('/Image models|生图模型/.test(document.querySelector(".mq-prov").textContent)');
 await js('document.querySelector(".mq-mod").click()');
 await wait('!!document.querySelector(".mq-menu:not(.mq-menu-prov)")');
 const label=await js(`document.querySelector('[data-image-sku="${sku}"]').textContent.trim().replace(/≈.*/,"").replace(/✓/,"").trim()`);
 await js(`document.querySelector('[data-image-sku="${sku}"]').click()`);
 await wait(`document.querySelector(".mq-mod").textContent.includes(${JSON.stringify(label)})`);
 const selected=(await js('window.wuwei.getSettings()')).settings;
 assert.equal(selected.imageMode,true);assert.equal(selected.imageSku,sku);assert.equal(selected.model,'glm-4.7-flash');
 console.log('PASS actual image platform and SKU picker; image SKU is not a text model');
 await send('One small blue ceramic cube on a white background, studio photograph.');
 await wait('!!document.querySelector(".tool-decision")');
 const question=await js('document.querySelector(".tool-decision").textContent');
 assert.match(question,/Estimated hold:|预计预占/);
 // Human cancellation through the actual React control, not an injected hook.
 await js('document.querySelector("[data-decision-value=cancel_image]").click()');
 await wait('!document.querySelector(".tool-decision")');
 await wait('window.imageEvents.some(e=>e.channel==="evt:done")');
 assert.ok(await js('window.imageEvents.some(e=>e.channel==="evt:tool-end"&&!e.isError&&/cancelled|已取消/.test(e.result))'));
 assert.equal(fs.existsSync(path.join(os.homedir(),'.wuwei-test','image-orders')),false);
 console.log('PASS actual desktop model → generate → cost dialog → Cancel, no paid order');
 if(process.env.IMAGE_UI_CANCEL_ONLY==='1') {
   await js('window.imageEvents=[]');
   await send('One small blue ceramic cube on a white background.');
   await wait('!!document.querySelector(".tool-decision")');
   await js(`window.wuwei.stop(${JSON.stringify(sid)})`);
   await wait('!document.querySelector(".tool-decision")');
   await wait('window.imageEvents.some(e=>e.channel==="evt:stopped")');
   assert.equal(fs.existsSync(path.join(os.homedir(),'.wuwei-test','image-orders')),false);
   console.log('PASS Stop aborts the actual fee dialog without a paid order');
   app.exit(0);return;
 }
 await js('window.imageEvents=[]');
 await send('One small blue ceramic cube on a white background, studio photograph.');
 await wait('!!document.querySelector(".tool-decision")');
 // This button submits a stable value via real preload and IPC.
 await js('document.querySelector("[data-decision-value=generate_image]").click()');
 await wait('!document.querySelector(".tool-decision")');
 await wait('window.imageEvents.some(e=>e.channel==="evt:tool-end"&&e.image)',240000);
 await wait('window.imageEvents.some(e=>e.channel==="evt:done")',120000);
 const events=await js('window.imageEvents');
 assert.equal(events.filter(e=>e.channel==='evt:tool-start'&&e.name==='send_image').length,0,'Already displayed images must not be sent again');
 const output=events.find(e=>e.channel==='evt:tool-end'&&e.image);assert.ok(!output.isError,output.result);
 const details=JSON.parse(output.result);assert.equal(details.displayed,true);assert.ok(details.order_id);assert.ok(details.charged_coins>0);
 await wait('Array.from(document.images).some(i=>i.src.startsWith("data:image/")&&i.complete&&i.naturalWidth===1024)');
 const requireRepo=require('node:module').createRequire(path.join(repo,'package.json'));
 const {info}=await requireRepo('sharp')(fs.readFileSync(details.path)).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,1024);assert.equal(info.height,1024);
 const receipts=fs.readdirSync(path.join(os.homedir(),'.wuwei-test','image-orders')).filter(n=>n.endsWith('.json'));assert.equal(receipts.length,1);
 const report={sku,order_id:details.order_id,charged_coins:details.charged_coins,width:info.width,height:info.height,desktop_human_confirmation:true,desktop_cancel_no_order:true,paid_attempts:receipts.length,inline_image_loaded:true,redundant_send_image:false};
 fs.writeFileSync(path.join(process.env.IMAGE_UI_EVIDENCE,'desktop-image-'+sku+'.json'),JSON.stringify(report,null,2));
 console.log('PASS actual desktop paid order, real wallet settlement and loaded inline image '+JSON.stringify(report));
 app.exit(0);
}
app.whenReady().then(async()=>{await delay(500);await test();}).catch(error=>{console.error(error);app.exit(1);});
require(path.join(repo,'out/main/index.cjs'));
