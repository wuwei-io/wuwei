const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=process.env.FULL_UI_ROOT,repo=process.env.FULL_UI_REPO,evidence=process.env.FULL_UI_EVIDENCE;
if(!root || path.relative(root,os.homedir()).startsWith('..'))throw Error('Profile isolation failed');
app.setPath('userData',path.join(root,'electron-userData'));
const team=path.join(os.homedir(),'.wuwei-test','team');
const original=fs.existsSync(path.join(team,'employees.json'))?JSON.parse(fs.readFileSync(path.join(team,'employees.json'),'utf8')):[];
if(process.env.FULL_UI_FRESH==='1' || process.env.FULL_UI_EXISTING_OFF==='1') globalThis.fetch=async()=>{throw Error('Network disabled in isolated first-run acceptance');};
app.on('browser-window-created',(_event,window)=>{
  window.hide();
  window.once('ready-to-show',()=>window.hide());
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function check(ok,message){assert.ok(ok,message);console.log('PASS '+message);}
async function testApp(){
  let win;
  for(let i=0;i<100;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app://bundle'));if(win)break;await delay(100);}
  check(win,'actual application window loaded');
  const js=code=>Promise.race([win.webContents.executeJavaScript(code,true),delay(6000).then(()=>{throw Error('Renderer execution timed out: '+code)})]);
  async function wait(code){for(let i=0;i<100;i++){if(await js(code))return;await delay(100);}throw Error('UI wait failed: '+code);}
  const click=selector=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const textClick=(selector,text)=>js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  const input=(selector,value)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const shot=async name=>fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(await js(`({title:document.querySelector('.tb-title-txt')?.textContent,departments:[...document.querySelectorAll('.tool-dept-nm')].map(e=>e.textContent),teammates:[...document.querySelectorAll('.tool-sub-nm')].map(e=>e.textContent),departmentInputs:[...document.querySelectorAll('.dept-card-row input')].map(e=>e.value)})`),null,2));
  if(process.env.FULL_UI_FRESH==='1'){
    await wait(`!!window.wuwei?.getSettings`);
    let settings;
    for(let i=0;i<100;i++){settings=await js(`window.wuwei.getSettings().then(r=>r.settings)`);if(settings?.providerId==='wuwei-free')break;await delay(100);}
    check(settings?.providerId==='wuwei-free' && settings.kind==='openai' && settings.model==='glm-4.7-flash' && settings.baseUrl==='https://gw.wuweiai.io/api/gateway/v1','a completely missing config initializes the actual free gateway, not just the UI label');
    check(settings.app.teamEnabled===true,'fresh company is enabled without a toggle or seeded fixture');
    await wait(`document.querySelectorAll('.tool-sub-nm').length===6 && document.querySelectorAll('.tool-dept-nm').length===4`);
    check(JSON.parse(fs.readFileSync(path.join(team,'employees.json'),'utf8')).length===6,'actual first boot installs the default team');
    check(JSON.parse(fs.readFileSync(path.join(team,'config.json'),'utf8')).departments.length===4,'actual first boot creates the four default departments');
    await shot('new-user-default-team');
    await js(`[...document.querySelectorAll('.sidebar-top button')].find(b=>b.textContent.trim()==='«').click()`);await wait(`!!document.querySelector('.toolbar-min')`);
    check(await js(`document.querySelectorAll('.toolbar-min button').length===1 && !document.querySelector('.toolbar-min svg')`),'collapsed sidebar contains only its expand button, no search icon');
    await click('.toolbar-min button');await wait(`!!document.querySelector('.sidebar-top')`);
    check(await js(`!!document.querySelector('.sidebar-top button svg')`),'expanded sidebar retains its controls');
    app.exit(0);return;
  }
  if(process.env.FULL_UI_EXISTING_OFF==='1') {
    await wait(`!!window.wuwei?.getSettings`);
    const settings=(await js(`window.wuwei.getSettings()`)).settings;
    check(settings.app.teamEnabled===false,'existing explicit off stays off in the actual desktop');
    check(await js(`document.querySelectorAll('.tool-sub-nm').length===0`),'existing off does not show company teammates');
    check(!fs.existsSync(path.join(team,'employees.json')),'existing off does not seed a new team');
    app.exit(0);return;
  }
  await wait(`document.querySelectorAll('.tool-sub-nm').length===6`);
  // A fresh renderer detects the system language; exercise the actual language switch.
  await js(`document.querySelector('.tool-item-main').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:100}))`);
  await wait(`!!document.querySelector('.team-cm')`);
  await js(`[...document.querySelectorAll('.team-cm-item')].find(b=>['Settings','设置'].includes(b.textContent)).click()`);
  await wait(`!!document.querySelector('.set-tabs')`);
  await click('.set-tabs button');await wait(`[...document.querySelectorAll('.theme-opt')].some(b=>b.textContent==='English')`);
  await textClick('.theme-opt','English');await delay(100);
  await click('.set-win-btn[title="Close"]');await wait(`!document.querySelector('.settings-overlay')`);
  await wait(`document.querySelector('.tool-sub-item[title="Chat with Ben"]')!==null`);
  check(await js(`['Ben','Wendy','Cody','Dana','Mia','Ivy'].every(n=>[...document.querySelectorAll('.tool-sub-nm')].some(e=>e.textContent===n))`),'actual English sidebar has six localized teammates');
  check(await js(`JSON.stringify([...document.querySelectorAll('.tool-dept-nm')].map(e=>e.textContent))===JSON.stringify(['CEO Office','Engineering','Design','General Affairs'])`),'actual four English departments, no test department or unassigned people');
  const departments=JSON.parse(fs.readFileSync(path.join(team,'config.json'),'utf8')).departments;
  await shot('full-english-sidebar');
  await click('.tool-sub-item[title="Chat with Ben"]');
  await wait(`document.querySelector('.tb-title-txt')?.textContent==='Ben'`);
  await click('.tool-item-main');await wait(`document.querySelectorAll('.tc-emp-nm b').length===6`);
  await textClick('.team-seg button','Groups');await wait(`document.querySelector('.tb-title-txt')?.textContent==='Groups'`);
  check(await js(`!document.querySelector('.titlebar').textContent.includes('小笨')`),'group list title follows page after opening CEO chat');
  await shot('full-english-groups-title');
  await textClick('.team-seg button','Teammates');await wait(`document.querySelectorAll('.tc-emp-nm b').length===6`);
  await click('.tc-add');await wait(`!!document.querySelector('.tc-app-nm')`);
  check(await js(`document.querySelector('.tc-app-nm').textContent==='Wuwei One-Person Company' && !/[\u4e00-\u9fff]/.test(document.querySelector('.tc-app-desc').textContent)`),'actual English team pack');
  await click('.tc-modal-x');await click('.tc-emp-edit');await wait(`!!document.querySelector('.tc-modal input.tc-input')`);
  check(await js(`document.querySelector('.tc-modal input.tc-input').value==='Ben'`),'actual English teammate edit dialog');
  await textClick('.tc-modal button','Save');await wait(`!document.querySelector('.tc-modal')`);
  const after=JSON.parse(fs.readFileSync(path.join(team,'employees.json'),'utf8'));
  for(const before of original)for(const field of ['id','name','title','blurb','persona','fromApp'])assert.equal(after.find(e=>e.id===before.id)[field],before[field]);
  console.log('PASS actual unchanged Save through IPC preserves original stored teammate fields');
  await click('.tc-emp-edit');await wait(`!!document.querySelector('.tc-modal input.tc-input')`);
  await input('.tc-modal input.tc-input','Custom Ben');await delay(100);
  await textClick('.tc-modal button','Save');await wait(`!document.querySelector('.tc-modal')`);
  check(JSON.parse(fs.readFileSync(path.join(team,'employees.json'),'utf8')).find(e=>e.id==='wj-ceo').name==='Custom Ben','actual edited Save persists custom name with stable ID');
  // Open the real company settings from its context menu; inspect localized department controls.
  await js(`document.querySelector('.tool-item-main').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:100}))`);
  await wait(`!!document.querySelector('.team-ctx') || [...document.querySelectorAll('button')].some(b=>b.textContent==='Settings')`);
  await textClick('button','Settings');await wait(`document.querySelectorAll('.dept-card').length===4`);
  check(await js(`JSON.stringify([...document.querySelectorAll('.dept-card-row input')].map(e=>e.value))===JSON.stringify(['CEO Office','Engineering','Design','General Affairs'])`),'actual English department edit controls');
  await js(`document.querySelector('.dept-card-row input').focus();document.querySelector('.dept-card-row input').blur()`);await delay(150);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(team,'config.json'),'utf8')).departments,departments);
  console.log('PASS unchanged English department blur preserves canonical names, heads and members');
  check(await js(`JSON.stringify([...document.querySelectorAll('.dept-card')].map(c=>c.querySelectorAll('.dept-members .dept-chip').length))===JSON.stringify([1,1,2,2])`),'department cards show only assigned members');
  await js(`document.querySelector('.dept-card .dept-card-row:nth-of-type(3) button').click()`);
  await wait(`!!document.querySelector('.dept-add-members')`);
  await js(`[...document.querySelectorAll('.dept-add-members .dept-chip')].find(b=>b.textContent.includes('Dana')).click()`);
  await wait(`document.querySelector('.dept-card .dept-members').textContent.includes('Dana')`);
  check(!JSON.parse(fs.readFileSync(path.join(team,'config.json'),'utf8')).departments[3].memberIds.includes('wj-data'),'adding moves a teammate out of the previous department');
  await js(`[...document.querySelector('.dept-card .dept-members').querySelectorAll('button')].find(b=>b.textContent.includes('Dana')).click()`);
  await wait(`!document.querySelector('.dept-card .dept-members').textContent.includes('Dana')`);
  await js(`document.querySelectorAll('.dept-card')[3].querySelector('.dept-card-row:nth-of-type(3) button').click()`);
  await wait(`!!document.querySelector('.dept-add-members')`);
  await js(`[...document.querySelectorAll('.dept-add-members .dept-chip')].find(b=>b.textContent.includes('Dana')).click()`);
  await wait(`document.querySelectorAll('.dept-card')[3].querySelector('.dept-members').textContent.includes('Dana')`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(team,'config.json'),'utf8')).departments,departments);
  console.log('PASS actual department Add, move, Remove and restore through React and IPC');
  await shot('full-english-department-settings');
  // First settings tab is General. Use the actual language buttons rather than changing fixture data.
  await click('.set-tabs button');await wait(`[...document.querySelectorAll('.theme-opt')].some(b=>b.textContent==='中文')`);
  await textClick('.theme-opt','中文');await delay(200);
  await click('.set-win-btn[title="关闭"]');await wait(`!document.querySelector('.settings-overlay')`);
  check(await js(`['CEO办公室','技术部','设计部','综合部'].every(n=>[...document.querySelectorAll('.tool-dept-nm')].some(e=>e.textContent===n))`),'actual switch back shows four Chinese departments');
  check(await js(`[...document.querySelectorAll('.tool-sub-nm')].some(e=>e.textContent==='小文') && [...document.querySelectorAll('.tool-sub-nm')].some(e=>e.textContent==='Custom Ben')`),'actual Chinese sidebar preserves custom teammate edits');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(team,'config.json'),'utf8')).departments,departments);
  await shot('full-chinese-custom');
  console.log('PASS member and department references stay unchanged across language switches and profile saves');
  app.exit(0);
}
require(path.join(repo,'out/main/index.cjs'));
app.whenReady().then(testApp).catch(e=>{console.error(e.stack);app.exit(1)});
