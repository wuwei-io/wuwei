// Deliberately imports NO application main/preload modules.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = process.env.TEAM_UI_TEMP_ROOT;
function within(p) { const rel = path.relative(root, p); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }
if (!root || !within(os.homedir())) throw new Error('HOME isolation failed; refusing renderer');
app.setPath('userData', path.join(root, 'electron-userData'));
if (!within(app.getPath('userData'))) throw new Error('userData isolation failed');
console.log(JSON.stringify({ probe: true, home: os.homedir(), userData: app.getPath('userData'), applicationMainImported: false }));
const evidence = process.env.TEAM_UI_EVIDENCE;
function check(ok, message) { if (!ok) throw new Error(message); console.log('PASS ' + message); }
app.whenReady().then(async () => {
 session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('data:') && !details.url.startsWith('devtools:') }));
 const win = new BrowserWindow({ width: 1280, height: 1000, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
 await win.loadFile(process.env.TEAM_UI_HTML);
 const js = code => win.webContents.executeJavaScript(code, true);
 const wait = () => new Promise(r => setTimeout(r, 250));
 const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const shot = async name => fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
 await wait();
 check(await js(`document.querySelectorAll('.tc-emp-nm b').length === 6 && ['Ben','Wendy','Cody','Dana','Mia','Ivy'].every(n => [...document.querySelectorAll('.tc-emp-nm b')].some(e=>e.textContent===n))`), 'six English employee cards');
 check(await js(`document.querySelector('#fixture-sidebar').textContent.includes('Wendy') && [...document.querySelector('#fixture-selector').options].some(o=>o.text==='Wendy'&&o.value==='wj-copy')`), 'fixture sidebar and selector labels/IDs (not full App sidebar)');
 await shot('english-cards');
 await click('.tc-add'); await wait();
 check(await js(`document.querySelector('.tc-app-nm').textContent === 'Wuwei One-Person Company' && !/[\u4e00-\u9fff]/.test(document.querySelector('.tc-app-desc').textContent + document.querySelector('.tc-roster').textContent)`), 'English team pack description and roster');
 await shot('english-pack');
 await js(`document.querySelector('.tc-modal-mask').click()`); await wait();
 await click('.tc-emp-edit'); await wait();
 check(await js(`document.querySelector('.tc-modal input.tc-input').value === 'Ben' && !/[\u4e00-\u9fff]/.test(document.querySelector('.tc-modal textarea').value)`), 'English actual edit modal');
 await shot('english-editor');
 await js(`[...document.querySelectorAll('.tc-modal button')].find(b=>b.textContent==='Save').click()`); await wait();
 check(await js(`harness.employees()[0].name === harness.original[0].name && harness.employees()[0].persona === harness.original[0].persona && harness.saves.length===1`), 'unchanged Save preserves canonical name and persona');
 await click('.tc-emp-edit'); await wait();
 await js(`(()=>{ const i=document.querySelector('.tc-modal input.tc-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Custom Ben'); i.dispatchEvent(new Event('input',{bubbles:true})); })()`); await wait();
 await js(`[...document.querySelectorAll('.tc-modal button')].find(b=>b.textContent==='Save').click()`); await wait();
 check(await js(`harness.employees()[0].name==='Custom Ben' && harness.employees()[0].id==='wj-ceo'`), 'edited Save persists custom value with stable ID');
 check(await js(`harness.resolve('Wendy')==='wj-copy' && harness.resolve('小文')==='wj-copy' && harness.resolve('Ben')===undefined`), 'English/Chinese resolver aliases and renamed alias rejection (no model tool invocation)');
 await click('#language'); await wait();
 check(await js(`[...document.querySelectorAll('.tc-emp-nm b')].some(e=>e.textContent==='小文') && [...document.querySelectorAll('.tc-emp-nm b')].some(e=>e.textContent==='Custom Ben')`), 'Chinese switch preserves custom name');
 await shot('chinese-custom');
 await click('.tc-emp-edit'); await wait();
 await click('#language'); await wait();
 check(await js(`document.querySelector('.tc-modal input.tc-input').value==='Custom Ben'`), 'language switch with open editor preserves custom draft');
 win.destroy(); app.exit(0);
}).catch(e => { console.error(e.stack); app.exit(1); });
