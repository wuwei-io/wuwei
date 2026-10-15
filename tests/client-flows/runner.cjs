// Runs the actual App renderer with an in-memory IPC backend and blocked external network.
// No application main/preload, real accounts, tokens, databases or payment providers are used.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const evidence = path.resolve(process.env.WUWEI_QA_OUTPUT);
const profile = path.resolve(process.env.WUWEI_QA_PROFILE);
if (!process.env.WUWEI_QA_OUTPUT || !process.env.WUWEI_QA_PROFILE || profile === path.parse(profile).root) throw Error('Explicit QA output/profile paths required');
fs.mkdirSync(evidence, { recursive: true });
app.setPath('userData', profile);
const url = new URL(process.env.WUWEI_QA_RENDERER_URL || 'http://localhost:5173/');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('Only a local renderer is allowed');
const source = fs.readFileSync(path.join(repo, 'desktop/renderer/src/App.tsx'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(repo, 'desktop/preload/index.ts'), 'utf8');
const methods = [...new Set([...source.matchAll(/window\.wuwei\s*\.\s*([A-Za-z_][A-Za-z_0-9]*)/g), ...bridgeSource.matchAll(/^\s{2}([A-Za-z_][A-Za-z_0-9]*):/gm)].map(m => m[1]))];
ipcMain.on('qa:methods', event => { event.returnValue = methods; });
const states = new Map();
const results = [];
app.on('window-all-closed', () => {});
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const account = (balance = 100, remainingPct = 0, active = false) => ({ user: { id: 'qa-account', email: 'client-flow@example.invalid', name: 'QA 隔离用户', avatar: null }, coin: { balance }, membership: { tier: active ? 'pro_month' : 'free', weeklyQuota: { active, remainingPct, resetsAt: null } }, flags: [], trialEligible: false });
const model = (id, free, anon, selection, price) => ({ id, label: id, labelEn: id, free, anon, selection, price });
const provider = (id, anon, models) => ({ id, label: id, labelEn: id, kind: 'openai', baseUrl: 'https://qa.invalid/api/gateway/v1', hosted: true, custom: false, anon, sort: 0, models });
const catalog = [provider('wuwei-free', true, [model('openrouter-auto-free', true, true), model('glm-4.7-flash', true, true), model('nemotron-super-free', true, false)]), provider('wuwei-mimo', false, [model('mimo-v2.6-flash', false, false, { category: 'economy', recommended: true, defaultForNewUsers: true, rank: 1 }, { input: 87.23, output: 187.88, cache: 10 })]), provider('wuwei-claude', false, [model('claude-opus-4-8', false, false, { category: 'premium', rank: 2 }, { input: 3038.4, output: 15192, cache: 303.84 })])];
catalog.push({ ...provider('anthropic',false,[model('claude-opus-4-8',false,false)]),hosted:false,kind:'anthropic-apikey' });
const settings = (providerId = 'wuwei-free', model = 'nemotron-super-free') => ({ providerId, model, kind: 'openai', baseUrl: 'https://qa.invalid/api/gateway/v1', creds: {}, modelChoiceExplicit: true, theme: 'light', streamMode: 'instant', app: { teamEnabled: false, lang: 'zh' } });
function emit(state, channel, payload) { if (!state.win.isDestroyed()) state.win.webContents.send('qa:event', channel, payload); }
function ready(state) {
  emit(state, 'evt:ready', { backend: 'openai', model: state.settings.model, cwd: 'D:/QA', contextWindow: 128000 });
  emit(state, 'evt:account', { providerId: state.settings.providerId, model: state.settings.model });
}
ipcMain.handle('qa:api', async (event, method, args) => {
  const s = states.get(event.sender.id);
  if (!s) return null; // Ignore already-queued calls from a window being torn down.
  s.calls.push({ method, model: s.settings.model });
  switch (method) {
    case 'getSettings': { const value = { settings: clone(s.settings), backend: 'openai', model: s.settings.model }; if (s.settingsDelay) await delay(s.settingsDelay); return value; }
    case 'setSettings': s.settings = { ...s.settings, ...clone(args[0]) }; s.modelWrites.push(s.settings.model); ready(s); return true;
    case 'getAccount': return { providerId: s.settings.providerId, model: s.settings.model };
    case 'bootstrap': return { currentId: 'qa-session', sessions: [{ id: 'qa-session', title: '隔离流程测试', createdAt: Date.now(), updatedAt: Date.now() }], groups: [], messages: clone(s.historyMessages) };
    case 'newSession': emit(s, 'evt:session-loaded', { id: 'qa-new-session', messages: [] }); return true;
    case 'wuweiMe': { const value = clone(s.account); if (s.meDelay) await delay(s.meDelay); return value; }
    case 'wuweiCatalog': return clone(catalog);
    case 'imageCatalog': return clone(s.imageCatalog || []);
    case 'getModelPricing': return { providers: [] };
    case 'fetchModels': return [];
    case 'getAppVersion': return '1.7.49';
    case 'getEdition': return 'test';
    case 'checkConn': return { status: 'green', reason: 'Isolated stub' };
    case 'getAnnouncement': return { active: false, version: '' };
    case 'getMessages': return { messages: [], unread: 0 };
    case 'rememberList': return { accounts: [], last: null };
    case 'wuweiPasswordLogin': if (s.loginError) return { error: s.loginError }; s.account = account(100); return { me: clone(s.account) };
    case 'wuweiLogin': if (s.googleCancel) return null; s.account = account(100); return clone(s.account);
    case 'wuweiLogout': s.account = null; return true;
    case 'send':
      s.sent.push(s.settings.model);
      if (s.nextError) setTimeout(() => { emit(s, 'evt:error', { sid: 'qa-session', message: s.nextError }); emit(s, 'evt:tasks', { running: [] }); }, 20);
      else setTimeout(() => { emit(s, 'evt:done', { sid: 'qa-session' }); emit(s, 'evt:tasks', { running: [] }); }, 20);
      return true;
    case 'stop': emit(s, 'evt:stopped', { sid: 'qa-session' }); emit(s, 'evt:tasks', { running: [] }); return true;
    case 'payCreate': s.orders++; s.orderSkus.push(args[0]); return s.payError ? { error: s.payError } : { orderId: 'qa-order-' + s.orders, qr: 'https://qa.invalid/fake-payment-' + s.orders };
    case 'payStatus': if (s.paid) { s.account = account(500); return { status: 'paid', balance: 500 }; } return { status: 'pending' };
    case 'checkUpdate': return { available: false };
    case 'isRunning': return false;
    case 'getTools': return { tools: [], disabled: [], groups: [], total: 0 };
    case 'getMcp': return { config: '', status: [] };
    case 'brainGraph': return { nodes: [], edges: [] };
    case 'getMemory': case 'stopRulesGet': return '';
    case 'track': case 'rememberSet': case 'draftSet': return true;
    default: s.defaults.add(method); return [];
  }
});
async function boot(options = {}) {
  const partition = 'qa-client-flow-' + Date.now() + '-' + Math.random();
  const isolated = session.fromPartition(partition);
  const blocked = [];
  isolated.webRequest.onBeforeRequest((details, callback) => {
    let allow = /^(data:|blob:|devtools:)/.test(details.url);
    try { const u = new URL(details.url); allow ||= ['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol) && u.hostname === url.hostname && u.port === url.port; } catch {}
    if (!allow) blocked.push(details.url.split('?')[0]);
    callback({ cancel: !allow });
  });
  const win = new BrowserWindow({ width: 1200, height: 920, show: false, webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') } });
  // Existing flow fixtures represent a chat whose model has already been chosen.
  // Empty-chat/default tests explicitly supply historyMessages: [].
  const state = { win, account: account(), settings: settings(), historyMessages: [{ role: 'user', content: [{ type: 'text', text: '已有对话，沿用明确选择的模型' }] }], calls: [], modelWrites: [], sent: [], orders: 0, orderSkus: [], defaults: new Set(), errors: [], messages: [], blocked, ...options };
  states.set(win.webContents.id, state);
  win.webContents.on('console-message', event => { state.messages.push(event.message.slice(0, 500)); if (['error', 'warning'].includes(event.level) && !/ERR_BLOCKED_BY_CLIENT|favicon/.test(event.message)) state.errors.push(event.message.slice(0, 1000)); });
  const js = async code => { try { return await win.webContents.executeJavaScript(code, true); } catch (error) { throw Error(error.message + ' | expression=' + code.slice(0, 300) + ' | renderer=' + state.errors.join(';') + ' | defaults=' + [...state.defaults].join(',')); } };
  const wait = async (condition, timeout = 5000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await js(condition)) return; await delay(50); } throw Error('UI timeout: ' + condition + ' | errors=' + state.errors.join(';')); };
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  const fill = async (selector, value) => { await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing input');Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(60); };
  const send = async () => { await fill('.composer textarea', '隔离流程测试'); await click('.composer .send-btn'); await delay(120); };
  await win.loadURL(url.href);
  await wait('!!document.querySelector(".mq-select")');
  await delay(250); ready(state); await delay(100);
  await wait('document.querySelector(".mq-select")?.textContent.includes(' + JSON.stringify(state.settings.model) + ')');
  return { state, js, wait, click, fill, send, close: () => { states.delete(win.webContents.id); win.destroy(); } };
}
async function run(name, options, test) {
  let fixture;
  try { fixture = await boot(options); await test(fixture); const fatal = fixture.state.errors.filter(e => /renderer-fatal|Uncaught|Unhandled/.test(e)); assert.deepEqual(fatal, []); results.push({ name, passed: true, mockedOrders: fixture.state.orders, blockedExternalRequests: fixture.state.blocked.length }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, passed: false, error: error.message, messages: fixture?.state.messages.slice(-15), calls: fixture?.state.calls.slice(-15) }); console.log('FAIL ' + name + ': ' + error.message); if (fixture) fs.writeFileSync(path.join(evidence, 'failure-' + results.length + '.png'), (await fixture.state.win.webContents.capturePage()).toPNG()); }
  finally { fixture?.close(); }
}
app.whenReady().then(async () => {
  for(const loggedIn of [true,false]) await run('点击免费分类默认自动挑选，仍可手选其他模型，登录='+loggedIn,{account:loggedIn?account():null,settings:settings('wuwei-free','glm-4.7-flash')},async f=>{
    await f.click('.mq-select'); assert.equal(f.state.settings.model,'glm-4.7-flash');
    await f.click('.model-picker nav button:nth-child(1)'); await f.wait('!!document.querySelector(`[data-model-key="wuwei-free/openrouter-auto-free"].on:not(:disabled)`)');
    assert.equal(f.state.settings.model,'openrouter-auto-free'); assert.equal(await f.js('!!document.querySelector(".model-picker")'),true);
    if(loggedIn) assert.equal(f.state.settings.modelPreferences['qa-account'].modelId,'openrouter-auto-free');
    await f.click('[data-model-key="wuwei-free/glm-4.7-flash"]'); await f.wait('!document.querySelector(".model-picker")'); assert.equal(f.state.settings.model,'glm-4.7-flash');
    await f.click('.mq-select'); assert.equal(f.state.settings.model,'glm-4.7-flash'); await f.click('.model-picker nav button:nth-child(1)'); await f.wait('!!document.querySelector(`[data-model-key="wuwei-free/openrouter-auto-free"].on:not(:disabled)`)');
    assert.equal(f.state.sent.length,0); assert.equal(f.state.orders,0);
  });
  await run('从付费模型切到免费分类使用自动挑选，浏览其他分类不自动切换',{settings:settings('wuwei-mimo','mimo-v2.6-flash')},async f=>{
    await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(3)'); assert.equal(f.state.settings.model,'mimo-v2.6-flash');
    await f.click('.model-picker nav button:nth-child(1)'); await f.wait('!!document.querySelector(`[data-model-key="wuwei-free/openrouter-auto-free"].on:not(:disabled)`)'); assert.equal(f.state.settings.providerId,'wuwei-free'); assert.equal(f.state.settings.imageMode,false);
    await f.click('.model-picker nav button:nth-child(2)'); assert.equal(f.state.settings.model,'openrouter-auto-free'); assert.equal(f.state.sent.length,0); assert.equal(f.state.orders,0);
  });
  const imageOptions = (balance=100,remainingPct=0,active=false) => ({account:account(balance,remainingPct,active),settings:settings('wuwei-free','glm-4.7-flash'),imageCatalog:[{sku_id:'qa-image-two',model:'gpt-image-2',coins_per_image:36}]});
  const chooseImage = async f => {
    await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(4)'); await f.wait('!!document.querySelector(`[data-model-key="wuwei-image/qa-image-two"]`)'); await f.click('[data-model-key="wuwei-image/qa-image-two"]'); await f.wait('document.querySelector(".mq-select")?.textContent.includes("GPT Image 2")');
  };
  const imageResult = async (f,result,{name='platform_imagegen',isError=true,sid='qa-session',id='image-billing-test'}={}) => {
    emit(f.state,'evt:tool-start',{sid,id,name,input:{action:'generate',sku_id:'qa-image-two',prompt:'QA cube'}});
    emit(f.state,'evt:tool-end',{sid,id,result:typeof result==='string'?result:JSON.stringify(result),isError}); await delay(120);
  };
  await run('生图零币且无会员额度，发送前直接付款，不调用免费调度模型',imageOptions(0),async f=>{
    await chooseImage(f); await f.send(); await f.wait('!!document.querySelector(".trial-scan")'); assert.equal(f.state.sent.length,0); assert.equal(f.state.settings.imageMode,true); assert.equal(f.state.settings.imageSku,'qa-image-two'); assert.equal(f.state.orders,1); assert.equal(await f.js('!!document.querySelector(".freecap-modal")'),false);
  });
  for(const result of [{code:'IMAGE_ORDER_ERROR',billing_code:'INSUFFICIENT_BALANCE',billing_status:402,message:'Localized billing error'},{code:'IMAGE_ORDER_ERROR',message:'额度与无为币不足，请充值'},{code:'IMAGE_NOT_DELIVERED',order_id:'qa-original-image',reason:'Insufficient quota and coins. Add funds to continue.'}]) await run('生图余额不足直接付款，兼容旧主进程：'+JSON.stringify(result),imageOptions(0.5),async f=>{
    await chooseImage(f); await f.send(); await imageResult(f,result); await f.wait('!!document.querySelector(".trial-scan")'); assert.equal(f.state.orders,1); assert.equal(await f.js('!!document.querySelector(".freecap-modal")'),false); assert.deepEqual(f.state.sent,['glm-4.7-flash']); assert.equal(f.state.settings.imageMode,true);
    emit(f.state,'evt:tool-end',{sid:'qa-session',id:'image-billing-test',result:JSON.stringify(result),isError:true}); await delay(120); assert.equal(f.state.orders,1);
    await f.click('.pay-card .pay-x'); await f.wait('!document.querySelector(".pay-card")'); await delay(120); assert.equal(f.state.sent.length,1); assert.equal(f.state.settings.imageSku,'qa-image-two');
  });
  await run('生图会员仍有额度时零币放行，服务端拒绝才付款',imageOptions(0,50,true),async f=>{
    await chooseImage(f); await f.send(); assert.deepEqual(f.state.sent,['glm-4.7-flash']); assert.equal(f.state.orders,0);
    await imageResult(f,{code:'IMAGE_ORDER_ERROR',billing_code:'INSUFFICIENT_BALANCE'}); await f.wait('!!document.querySelector(".trial-scan")'); assert.equal(f.state.orders,1);
  });
  await run('生图普通错误、取消、成功结果和其他工具内容均不误弹付款',imageOptions(),async f=>{
    await chooseImage(f);
    for(const result of [{code:'IMAGE_ORDER_ERROR',billing_code:'PRICE_CHANGED'},{code:'IMAGE_ORDER_ERROR',billing_code:'UNKNOWN',message:'Request timed out'},{code:'IMAGE_NOT_DELIVERED',message:'Settlement pending'},'已取消生图，未下单。']) await imageResult(f,result);
    await imageResult(f,{code:'IMAGE_ORDER_ERROR',billing_code:'INSUFFICIENT_BALANCE'},{isError:false});
    await imageResult(f,'额度与无为币不足，请充值',{name:'read_file'});
    await imageResult(f,{code:'IMAGE_ORDER_ERROR',billing_code:'INSUFFICIENT_BALANCE'},{sid:'qa-background-session'});
    assert.equal(f.state.orders,0); assert.equal(await f.js('!!document.querySelector(".pay-card,.freecap-modal")'),false);
  });
  await run('切换模型后迟到的旧生图余额错误不弹付款',imageOptions(),async f=>{
    await chooseImage(f); emit(f.state,'evt:tool-start',{sid:'qa-session',id:'old-image',name:'platform_imagegen',input:{action:'generate'}}); await delay(80);
    await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(2)'); await f.click('[data-model-key="wuwei-mimo/mimo-v2.6-flash"]'); await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")');
    emit(f.state,'evt:tool-end',{sid:'qa-session',id:'old-image',result:JSON.stringify({code:'IMAGE_ORDER_ERROR',billing_code:'INSUFFICIENT_BALANCE'}),isError:true}); await delay(200); assert.equal(f.state.orders,0); assert.equal(await f.js('!!document.querySelector(".pay-card")'),false);
  });
  for (const [pid,modelId] of [['wuwei-claude','claude-opus-4-8'],['wuwei-free','nemotron-super-free']]) await run('游客旧配置不可用时等待免费自动模型就绪后重试：'+modelId, { account:null, settings:settings(pid,modelId) }, async f => {
    await f.send(); await f.wait('document.querySelector(".mq-select")?.textContent.includes("openrouter-auto-free")'); await delay(180); assert.deepEqual(f.state.sent,['openrouter-auto-free']); assert.equal(f.state.settings.providerId,'wuwei-free'); assert.equal(f.state.orders,0);
  });
  await run('免费自动模型上游不可用时换另一个可用免费模型，不再次选择失败模型', { settings:settings('wuwei-free','openrouter-auto-free') }, async f => {
    emit(f.state,'evt:error',{sid:'qa-session',message:'[[gw:upstream_error]] unavailable'}); await f.wait(`[...document.querySelectorAll('.err-fix button')].some(b=>/换用/.test(b.textContent))`); await f.js(`[...document.querySelectorAll('.err-fix button')].find(b=>/换用/.test(b.textContent)).click()`); await f.wait('document.querySelector(".mq-select")?.textContent.includes("glm-4.7-flash")'); await delay(150); assert.deepEqual(f.state.sent,['glm-4.7-flash']); assert.equal(f.state.orders,0);
  });
  await run('游客额度用尽的登录弹窗明确免费额度和付费扣币，不暗示顶级模型免费', { account:null, settings:settings('wuwei-free','openrouter-auto-free'), nextError:'[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    await f.send(); await f.wait('document.body.textContent.includes("免费模型有每日额度，付费模型按用量消耗无为币")'); assert.equal(await f.js('document.body.textContent.includes("免费使用更多模型")'),false); assert.equal(f.state.orders,0);
  });
  await run('员工模型配置复用统一选择与顶级确认，确认前不写入员工草稿', {}, async f => {
    await f.js(`(async()=>{
      const main=await(await fetch('/src/main.tsx')).text();const paths=[...main.matchAll(/from "([^"]+)"/g)].map(m=>m[1]);
      const React=(await import(paths.find(p=>/\\/react\\.js\\?/.test(p)))).default;const {createRoot}=(await import(paths.find(p=>p.includes('react-dom_client.js')))).default;
      const {EmployeeEditModal}=await import('/src/team/AppStore.tsx');const host=document.createElement('div');host.id='qa-employee';document.body.append(host);const root=createRoot(host);
      const base={providerId:'wuwei-qa',rank:1,free:false,needsLogin:true,recommended:false,defaultForNewUsers:false};
      const premium={...base,key:'wuwei-qa/premium',modelId:'premium',label:'QA Premium',labelEn:'QA Premium',category:'premium',price:{input:1000,output:2000,cache:100}};
      const value={...base,key:'wuwei-qa/value',modelId:'value',label:'QA Value',labelEn:'QA Value',category:'economy',recommended:true,defaultForNewUsers:true,price:{input:10,output:20,cache:1}};
      root.render(React.createElement(EmployeeEditModal,{en:false,loggedIn:true,providers:[{id:'wuwei-qa',label:'QA',models:['premium','value'],choices:[premium,value]}],employee:{id:'qa-employee',name:'QA Employee',persona:'QA Persona'},onClose:()=>{}}));
      window.__qaEmployeeDispose=()=>{root.unmount();host.remove()};
    })()`);
    try {
      await f.wait('!!document.querySelector("#qa-employee [data-testid=employee-model-picker]")'); await f.click('#qa-employee [data-testid=employee-model-picker]'); await f.click('#qa-employee .model-picker nav button:nth-child(3)'); await f.click('[data-model-key="wuwei-qa/premium"]'); await f.wait('!!document.querySelector("#qa-employee [data-action=confirm-premium]")');
      assert.equal(await f.js('document.querySelector("#qa-employee [data-testid=employee-model-picker]").textContent'),'跟随当前会话');
      await f.click('#qa-employee [data-action=choose-value]'); await f.wait('document.querySelector("#qa-employee [data-testid=employee-model-picker]")?.textContent.includes("QA Value")'); assert.equal(f.state.modelWrites.length,0); assert.equal(f.state.sent.length,0); assert.equal(f.state.orders,0);
    } finally { await f.js('window.__qaEmployeeDispose?.()'); }
  });
  await run('顶级确认期间价格变化须重新确认，下架时撤销确认且不选择模型', {}, async f => {
    await f.js(`(async()=>{
      const main=await(await fetch('/src/main.tsx')).text();const paths=[...main.matchAll(/from "([^"]+)"/g)].map(m=>m[1]);const React=(await import(paths.find(p=>/\\/react\\.js\\?/.test(p)))).default;const {createRoot}=(await import(paths.find(p=>p.includes('react-dom_client.js')))).default;
      const {ModelPicker}=await import('/src/components/ModelPicker.tsx');const host=document.createElement('div');host.id='qa-price';document.body.append(host);const root=createRoot(host);const chosen=[];
      const base={key:'qa/premium',providerId:'qa',modelId:'premium',label:'Premium',labelEn:'Premium',category:'premium',rank:1,free:false,needsLogin:true,recommended:false,defaultForNewUsers:false};
      const render=(price,removed=false)=>root.render(React.createElement(ModelPicker,{choices:removed?[]:[{...base,price:{input:price,output:price,cache:0}}],selectedKey:'',loggedIn:true,lang:'zh',loading:false,initialCategory:'premium',onChoose:async c=>{chosen.push(c.price.input)},onClose:()=>{},onConnections:()=>{},onRequireLogin:()=>{}}));
      window.__qaPrice={render,chosen,dispose:()=>{root.unmount();host.remove()}};render(1000);
    })()`);
    try {
      await f.wait('!!document.querySelector("#qa-price [data-model-key]")'); await f.click('#qa-price [data-model-key]'); await f.wait('!!document.querySelector("#qa-price .model-picker-confirm")'); await f.js('window.__qaPrice.render(2000)'); await f.wait('document.querySelector("#qa-price .model-picker-confirm-price")?.textContent.includes("2,000")'); assert.equal(await f.js('window.__qaPrice.chosen.length'),0);
      await f.js('window.__qaPrice.render(2000,true)'); await f.wait('!document.querySelector("#qa-price .model-picker-confirm")'); assert.equal(await f.js('window.__qaPrice.chosen.length'),0); assert.equal(f.state.orders,0);
    } finally { await f.js('window.__qaPrice?.dispose()'); }
  });
  const openSettingsModel = async f => { await f.click('.mq-select'); await f.click('.model-picker footer button'); await f.wait('!!document.querySelector(".settings")'); await f.click('[data-testid=settings-tab-model]'); await f.wait('!!document.querySelector("[data-testid=settings-provider]")'); };
  const select = async (f, selector, value) => { await f.js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}));})()`); await delay(80); };
  await run('设置页正确识别后台新增的高性价比提供商，选择顶级平台仍须统一确认', { settings: settings('wuwei-mimo','mimo-v2.6-flash') }, async f => {
    await openSettingsModel(f); assert.equal(await f.js('document.querySelector("[data-testid=settings-provider]").value'), 'wuwei-mimo');
    await select(f,'[data-testid=settings-provider]','wuwei-claude'); await f.wait('!!document.querySelector(".model-picker")'); assert.equal(await f.js('!!document.querySelector(".settings")'),false); assert.equal(f.state.modelWrites.length,0);
    await f.click('[data-model-key="wuwei-claude/claude-opus-4-8"]'); await f.wait('!!document.querySelector("[data-action=confirm-premium]")'); assert.equal(f.state.settings.model,'mimo-v2.6-flash');
    await f.click('[data-action=confirm-premium]'); await f.wait('!document.querySelector(".model-picker")'); assert.equal(f.state.settings.model,'claude-opus-4-8'); assert.equal(f.state.orders,0); assert.equal(f.state.sent.length,0);
  });
  await run('设置页当前顶级模型的模型按钮也不能绕过确认', { settings: settings('wuwei-claude','claude-opus-4-8') }, async f => {
    await openSettingsModel(f); await f.click('.settings .mlm-pick'); await f.wait('!!document.querySelector(".model-picker")'); assert.equal(f.state.modelWrites.length,0);
    await f.click('[data-model-key="wuwei-claude/claude-opus-4-8"]'); await f.wait('!!document.querySelector("[data-action=choose-value]")'); await f.click('[data-action=choose-value]'); await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); assert.equal(f.state.orders,0);
  });
  await run('配置缺少模型时设置页不默认带出 Claude，保存进入统一选择', { settings: settings('wuwei-claude','claude-opus-4-8') }, async f => {
    f.state.settings.model=undefined; await openSettingsModel(f); assert.equal(await f.js('document.querySelector("[data-testid=settings-model]").value'),''); await f.click('[data-testid=settings-save]'); await f.wait('!!document.querySelector(".model-picker")'); assert.equal(f.state.modelWrites.length,0); assert.equal(f.state.orders,0);
  });
  await run('自带订阅没有保存模型时必须主动选择，不默选列表首个顶级模型', {}, async f => {
    await openSettingsModel(f); await select(f,'[data-testid=settings-provider]','anthropic'); assert.equal(await f.js('document.querySelector("[data-testid=settings-model]").value'),''); await f.click('[data-testid=settings-save]'); await f.wait('document.querySelector(".settings [role=alert]")?.textContent.includes("请先选择模型")'); assert.equal(f.state.modelWrites.length,0);
  });
  await run('启动的旧游客登录结果不能覆盖刚刚完成的邮箱登录', { account:null, meDelay:1200, settings:settings('wuwei-free','glm-4.7-flash'), historyMessages:[] }, async f => {
    await f.click('.mq-select'); await f.click('[data-model-key="wuwei-free/nemotron-super-free"]'); await f.wait('!!document.querySelector("input[type=password]")'); await f.fill('input[placeholder="邮箱"]','client-flow@example.invalid'); await f.fill('input[type=password]','fake-password'); await f.js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='登录').click()`); await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); await delay(1300); assert.equal(f.state.settings.model,'mimo-v2.6-flash'); assert.equal(await f.js('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'),true);
  });
  await run('启动的旧登录结果不能覆盖已经退出的账号', { meDelay:1200, historyMessages:[] }, async f => {
    f.state.account=null; emit(f.state,'evt:wuwei-me',null); await f.wait('document.querySelector(".mq-select")?.textContent.includes("openrouter-auto-free")'); await delay(1300); assert.equal(await f.js('document.querySelector(".mq-select")?.textContent.includes("openrouter-auto-free")'),true);
  });
  for (const balance of [100,0]) await run('上游不可用切换免费模型时同步切换平台并正确重试，余额='+balance, { account:account(balance), settings:settings('wuwei-claude','claude-opus-4-8') }, async f => {
    emit(f.state,'evt:error',{sid:'qa-session',message:'[[gw:upstream_error]] unavailable'}); await f.wait(`[...document.querySelectorAll('.err-fix button')].some(b=>/换用/.test(b.textContent))`);
    await f.js(`[...document.querySelectorAll('.err-fix button')].find(b=>/换用/.test(b.textContent)).click()`); await f.wait('document.querySelector(".mq-select")?.textContent.includes("openrouter-auto-free")'); await delay(200);
    assert.equal(f.state.settings.providerId,'wuwei-free'); assert.deepEqual(f.state.sent,['openrouter-auto-free']); assert.equal(f.state.orders,0);
  });
  await run('记住的模型已下架时回退高性价比推荐，不沿用顶级平台首个模型', { historyMessages:[], settings:{...settings('wuwei-claude','claude-opus-4-8'),modelPreferences:{'qa-account':{providerId:'retired-provider',modelId:'retired-model'}}} }, async f => {
    await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); assert.equal(f.state.modelWrites.includes('claude-opus-4-8'),false); assert.equal(f.state.orders,0);
  });
  await run('启动登录态返回较慢，不按游客默认覆盖上次明确选择', { settings: settings('wuwei-claude', 'claude-opus-4-8'), historyMessages: [], meDelay: 750 }, async f => {
    await delay(650); assert.equal(f.state.settings.model, 'claude-opus-4-8'); assert.equal(f.state.modelWrites.includes('openrouter-auto-free'), false);
    assert.equal(f.state.settings.modelPreferences['qa-account'].modelId, 'claude-opus-4-8');
  });
  await run('首次登录未主动选择：旧的非显式顶级默认改为高性价比推荐', { settings: { ...settings('wuwei-claude', 'claude-opus-4-8'), modelChoiceExplicit: false }, historyMessages: [] }, async f => {
    await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")');
    assert.equal(f.state.settings.providerId, 'wuwei-mimo'); assert.equal(f.state.settings.modelChoiceExplicit, false);
    assert.equal(f.state.sent.length, 0); assert.equal(f.state.orders, 0);
    await f.click('.mq-select'); await f.wait('document.querySelector(".model-picker nav button.on")?.textContent.includes("高性价比")');
  });
  await run('零币账号首次登录默认推荐模型，发送时再引导充值且移除价格提示条', { account: account(0), settings: { ...settings('wuwei-claude', 'claude-opus-4-8'), modelChoiceExplicit: false }, historyMessages: [] }, async f => {
    await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")');
    assert.equal(f.state.orders, 0); assert.equal(f.state.sent.length, 0);
    await f.send(); await f.wait('!!document.querySelector(".trial-plans")'); assert.equal(f.state.sent.length, 0); assert.equal(await f.js('!!document.querySelector(".trial-anchor")'), false);
  });
  await run('首次安装的空对话不再受旧 explicit 标记影响', { settings: { ...settings('wuwei-free', 'glm-4.7-flash'), modelChoiceExplicit: undefined }, historyMessages: [] }, async f => {
    await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); assert.equal(f.state.sent.length, 0);
  });
  await run('手动确认顶级模型后，刷新、新对话及重新登录均记住选择', { historyMessages: [] }, async f => {
    await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(3)'); await f.click('[data-model-key="wuwei-claude/claude-opus-4-8"]'); await f.wait('!!document.querySelector("[data-action=confirm-premium]")');
    assert.equal(f.state.settings.model, 'mimo-v2.6-flash'); await f.click('[data-action=confirm-premium]'); await f.wait('document.querySelector(".mq-select")?.textContent.includes("claude-opus-4-8")');
    emit(f.state, 'evt:wuwei-me', account(200)); await f.click('.mq-select'); await delay(180); assert.equal(f.state.settings.model, 'claude-opus-4-8'); await f.click('.model-picker-header button');
    assert.equal(f.state.settings.modelPreferences['qa-account'].modelId, 'claude-opus-4-8');
    emit(f.state, 'evt:wuwei-me', null); await f.wait('document.querySelector(".mq-select")?.textContent.includes("openrouter-auto-free")'); emit(f.state, 'evt:wuwei-me', account(200)); await f.wait('document.querySelector(".mq-select")?.textContent.includes("claude-opus-4-8")');
    await f.click('.new-session'); await delay(180); assert.equal(f.state.settings.model, 'claude-opus-4-8');
    assert.equal(f.state.sent.length, 0); assert.equal(f.state.orders, 0);
  });
  await run('新建对话不继承从未主动选择过的顶级默认，已有对话绑定保留', { settings: { ...settings('wuwei-claude', 'claude-opus-4-8'), modelChoiceExplicit: false } }, async f => {
    assert.equal(f.state.settings.model, 'claude-opus-4-8'); await f.click('.new-session'); await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")');
    assert.equal(f.state.sent.length, 0); assert.equal(f.state.orders, 0);
  });
  await run('默认配置尚在读取时立即发送，不使用从未主动选择的顶级模型', { settings: { ...settings('wuwei-claude', 'claude-opus-4-8'), modelChoiceExplicit: false } }, async f => {
    f.state.settingsDelay = 300; await f.click('.new-session'); await delay(60); await f.send(); await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); await delay(150);
    assert.deepEqual(f.state.sent, ['mimo-v2.6-flash']); assert.equal(f.state.modelWrites.includes('claude-opus-4-8'), false);
  });
  await run('读取默认配置期间手动确认顶级模型，迟到的自动默认不覆盖明确选择', { settings: { ...settings('wuwei-claude', 'claude-opus-4-8'), modelChoiceExplicit: false } }, async f => {
    f.state.settingsDelay = 500; await f.click('.new-session'); await delay(60); await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(3)'); await f.click('[data-model-key="wuwei-claude/claude-opus-4-8"]'); await f.wait('!!document.querySelector("[data-action=confirm-premium]")'); await f.click('[data-action=confirm-premium]'); await f.wait('!document.querySelector(".model-picker")');
    assert.equal(f.state.settings.model, 'claude-opus-4-8'); assert.equal(f.state.modelWrites.includes('mimo-v2.6-flash'), false); assert.equal(f.state.sent.length, 0);
  });
  for (const google of [false, true]) await run((google ? 'Google' : '邮箱') + '登录空对话后默认高性价比，不保留游客模型', { account: null, settings: settings('wuwei-free', 'glm-4.7-flash'), historyMessages: [] }, async f => {
    await f.click('.mq-select'); await f.click('[data-model-key="wuwei-free/nemotron-super-free"]'); await f.wait('!!document.querySelector("input[type=password]")');
    if (google) await f.js(`[...document.querySelectorAll('button')].find(b=>/Google/.test(b.textContent)&&/登录/.test(b.textContent)).click()`);
    else { await f.fill('input[placeholder="邮箱"]', 'client-flow@example.invalid'); await f.fill('input[type=password]', 'fake-test-password'); await f.js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='登录').click()`); }
    await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); assert.equal(f.state.sent.length, 0); assert.equal(f.state.orders, 0);
  });
  await run('新用户未登录默认免费自动挑选，首次登录无个人偏好', { account: null, settings: { ...settings('wuwei-free', 'glm-4.7-flash'), modelChoiceExplicit: false }, historyMessages: [] }, async f => {
    await f.wait('document.querySelector(".mq-select")?.textContent.includes("openrouter-auto-free")');
    assert.equal(f.state.settings.modelPreferences, undefined); assert.equal(f.state.orders, 0); assert.equal(f.state.sent.length, 0);
  });
  await run('重启恢复本账号明确选择的模型，包含原有显式付费选择', { settings: settings('wuwei-claude', 'claude-opus-4-8'), historyMessages: [] }, async f => {
    assert.equal(f.state.settings.model, 'claude-opus-4-8'); assert.equal(f.state.settings.modelPreferences['qa-account'].modelId, 'claude-opus-4-8'); assert.equal(f.state.sent.length, 0);
  });
  await run('账号间模型偏好隔离，首次登录账号不继承别人的顶级模型', { settings: { ...settings('wuwei-claude', 'claude-opus-4-8'), modelPreferences: { 'other-account': { providerId: 'wuwei-claude', modelId: 'claude-opus-4-8' } } }, historyMessages: [] }, async f => {
    await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); assert.equal(f.state.settings.modelPreferences['qa-account'], undefined);
  });
  await run('登录后主动选择免费模型，下次登录仍恢复该免费模型', { historyMessages: [] }, async f => {
    await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(1)'); await f.wait('!!document.querySelector(`[data-model-key="wuwei-free/nemotron-super-free"]:not(:disabled)`)'); await f.click('[data-model-key="wuwei-free/nemotron-super-free"]'); await f.wait('!document.querySelector(".model-picker")');
    assert.equal(f.state.settings.modelPreferences['qa-account'].modelId, 'nemotron-super-free');
    emit(f.state, 'evt:wuwei-me', null); await f.wait('document.querySelector(".mq-select")?.textContent.includes("openrouter-auto-free")'); emit(f.state, 'evt:wuwei-me', account()); await f.wait('document.querySelector(".mq-select")?.textContent.includes("nemotron-super-free")'); assert.equal(f.state.sent.length, 0);
  });
  await run('未登录点击受限免费模型直接登录，取消不切换', { account: null, settings: settings('wuwei-free', 'glm-4.7-flash') }, async f => {
    await f.click('.mq-select'); await f.wait('!!document.querySelector(`[data-model-key="wuwei-free/nemotron-super-free"]`)');
    await f.click('[data-model-key="wuwei-free/nemotron-super-free"]'); await f.wait('!!document.querySelector("input[type=password]")'); assert.equal(f.state.settings.model, 'glm-4.7-flash'); assert.equal(f.state.orders, 0); await f.click('[style*="width: 340px"] button[title="关闭"]'); await f.wait('!document.querySelector("input[type=password]")'); assert.equal(f.state.settings.model, 'glm-4.7-flash');
  });
  await run('免费用完有币，推荐入口落到高性价比', { nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    await f.send(); await f.wait('!!document.querySelector(".freecap-modal")'); assert.equal(f.state.orders, 0); await f.click('.freecap-primary'); await f.wait('document.querySelector(".model-picker nav button.on")?.textContent.includes("高性价比")'); assert.equal(f.state.settings.model, 'nemotron-super-free');
  });
  await run('免费用完没币，直接付款页', { account: account(0), nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    await f.send(); await f.wait('!!document.querySelector(".pay-card")'); await f.wait('!!document.querySelector(".pay-card svg")'); assert.equal(await f.js('!!document.querySelector(".freecap-modal")'), false); await delay(550); assert.equal(f.state.orders, 1);
  });
  await run('顶级模型确认前不切换，改用推荐模型', {}, async f => {
    await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(3)'); await f.click('[data-model-key="wuwei-claude/claude-opus-4-8"]'); await f.wait('!!document.querySelector("[data-action=choose-value]")'); assert.equal(f.state.settings.model, 'nemotron-super-free'); await f.click('[data-action="choose-value"]'); await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); assert.equal(f.state.settings.model, 'mimo-v2.6-flash'); assert.equal(f.state.sent.length, 0);
  });
  const gatedLogin = async f => { await f.click('.mq-select'); await f.click('[data-model-key="wuwei-free/nemotron-super-free"]'); await f.wait('!!document.querySelector("input[type=password]")'); };
  const loginButton = f => f.js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='登录').click()`);
  const googleButton = f => f.js(`[...document.querySelectorAll('button')].find(b=>/Google/.test(b.textContent)&&/登录/.test(b.textContent)).click()`);
  const payReady = f => f.wait('!!document.querySelector(".trial-scan")');
  const closePay = f => f.click('.pay-card .pay-x');
  const gatewayError = (f, message) => emit(f.state, 'evt:error', { sid: 'qa-session', message });
  await run('游客可直接使用免登录模型', { account: null, settings: settings('wuwei-free', 'glm-4.7-flash') }, async f => {
    await f.send(); assert.deepEqual(f.state.sent, ['glm-4.7-flash']); assert.equal(await f.js('!!document.querySelector("input[type=password]")'), false); assert.equal(f.state.orders, 0);
  });
  await run('邮箱空值校验、错误密码、成功登录及模型解锁', { account: null, settings: settings('wuwei-free', 'glm-4.7-flash'), loginError: 'Invalid login credentials' }, async f => {
    await gatedLogin(f); await loginButton(f); await delay(80); assert.equal(f.state.calls.filter(c => c.method === 'wuweiPasswordLogin').length, 0);
    await f.fill('input[placeholder="邮箱"]', 'client-flow@example.invalid'); await f.fill('input[type=password]', 'fake-test-password'); await loginButton(f); await f.wait('document.body.textContent.includes("邮箱或密码不正确")'); assert.equal(f.state.account, null);
    f.state.loginError = null; await loginButton(f); await f.wait('!document.querySelector("input[type=password]")'); await f.click('.mq-select'); await f.wait('!!document.querySelector(`[data-model-key="wuwei-free/nemotron-super-free"]`)'); assert.equal(await f.js('document.querySelector(`[data-model-key="wuwei-free/nemotron-super-free"]`).classList.contains("model-picker-locked")'), false); assert.equal(f.state.orders, 0); assert.equal(f.state.sent.length, 0);
  });
  await run('Google 登录取消与回调成功（隔离回调）', { account: null, settings: settings('wuwei-free', 'glm-4.7-flash'), googleCancel: true }, async f => {
    await gatedLogin(f); await googleButton(f); await f.wait('document.body.textContent.includes("Google 登录未完成")'); assert.equal(f.state.account, null);
    f.state.googleCancel = false; await googleButton(f); await f.wait('!document.querySelector("input[type=password]")'); assert.ok(f.state.account); assert.equal(f.state.settings.model, 'glm-4.7-flash'); assert.equal(f.state.sent.length, 0);
  });
  await run('登录状态失效时重新登录，不引导配置模型密钥', { nextError: '[[gw:invalid_token]] 登录状态已过期，请重新登录后重试。' }, async f => {
    await f.send(); await f.wait('!!document.querySelector("input[type=password]")'); assert.equal(f.state.orders, 0);
  });
  await run('免费额度用完，已有会员额度继续使用', { account: account(0, 50, true), nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    await f.send(); await f.wait('document.querySelector(".freecap-modal")?.textContent.includes("会员额度仍可使用")'); assert.equal(f.state.orders, 0);
  });
  await run('免费额度用完按最新余额分流：余额刚耗尽', { nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    f.state.account = account(0); await f.send(); await payReady(f); assert.equal(await f.js('!!document.querySelector(".freecap-modal")'), false); assert.equal(f.state.orders, 1);
  });
  await run('免费额度用完按最新余额分流：刚充值到账', { account: account(0), nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    f.state.account = account(100); await f.send(); await f.wait('document.querySelector(".freecap-modal")?.textContent.includes("100 无为币")'); assert.equal(f.state.orders, 0);
  });
  await run('余额刷新超时使用已有余额，迟到结果不覆盖当前提示', { nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    f.state.meDelay = 3400; f.state.account = account(0); await f.send(); await f.wait('!!document.querySelector(".freecap-modal")', 4500); await delay(500); assert.equal(await f.js('!!document.querySelector(".pay-card")'), false); assert.equal(f.state.orders, 0);
  });
  await run('退出再登录同一账号，不弹出上一次请求的旧额度提示', { nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    f.state.meDelay = 600; await f.send(); emit(f.state, 'evt:wuwei-me', null); await delay(100); emit(f.state, 'evt:wuwei-me', account(500)); await delay(750); assert.equal(await f.js('!!document.querySelector(".freecap-modal,.pay-card")'), false);
  });
  await run('免费额度提示关闭后立即重试，仍可看到提示', { nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    await f.send(); await f.wait('!!document.querySelector(".freecap-modal")'); await f.click('.freecap-ghost'); await f.wait('!document.querySelector(".freecap-modal")'); await f.send(); await f.wait('!!document.querySelector(".freecap-modal")', 1500);
  });
  await run('免费零余额重复错误仅生成一个付款单，关闭后重试可重新付款', { account: account(0), nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    await f.send(); gatewayError(f, f.state.nextError); gatewayError(f, f.state.nextError); await payReady(f); assert.equal(f.state.orders, 1); await closePay(f); await f.wait('!document.querySelector(".pay-card")'); await f.send(); await payReady(f); assert.equal(f.state.orders, 2);
  });
  await run('优先用付费模型且余额为零，直接付款不切回免费', { account: account(0), settings: settings('wuwei-claude', 'claude-opus-4-8') }, async f => {
    await f.send(); await payReady(f); assert.equal(f.state.sent.length, 0); assert.equal(f.state.settings.model, 'claude-opus-4-8'); assert.equal(await f.js('!!document.querySelector(".freecap-modal")'), false);
  });
  await run('高性价比付费模型余额为零，直接付款而不发出付费请求', { account: account(0), settings: settings('wuwei-mimo', 'mimo-v2.6-flash'), nextError: '[[gw:insufficient_balance]] not enough coins' }, async f => {
    await f.send(); await payReady(f); assert.deepEqual(f.state.sent, []); assert.equal(f.state.settings.model, 'mimo-v2.6-flash');
  });
  await run('余额尚有少量但不足支付请求，提示余额不足而不是余额用完', { account: account(0.125), settings: settings('wuwei-claude', 'claude-opus-4-8'), nextError: '[[gw:insufficient_balance]] not enough coins' }, async f => {
    await f.send(); await payReady(f); assert.equal(await f.js('document.querySelector(".pay-top h2").textContent.includes("余额不足")'), true);
  });
  await run('付费会员仍有额度时，零币不会提前拦截', { account: account(0, 50, true), settings: settings('wuwei-claude', 'claude-opus-4-8') }, async f => {
    await f.send(); assert.deepEqual(f.state.sent, ['claude-opus-4-8']); assert.equal(f.state.orders, 0);
  });
  await run('上游限流、超时和付费每日上限不误弹充值', {}, async f => {
    gatewayError(f, '[[gw:upstream_rate_limited]] 429'); await delay(150); gatewayError(f, 'Request timed out'); await delay(150);
    f.state.settings = settings('wuwei-claude', 'claude-opus-4-8'); ready(f.state); await delay(120); gatewayError(f, '[[gw:daily_cap_reached]] daily spend cap'); await delay(150); assert.equal(await f.js('!!document.querySelector(".pay-card,.freecap-modal")'), false); assert.equal(f.state.orders, 0);
  });
  await run('付款创建失败可重试，支付成功后返回结果并刷新余额', { account: account(0), nextError: '[[gw:free_daily_cap_reached]] exhausted', payError: 'service_unavailable' }, async f => {
    await f.send(); await f.wait('!!document.querySelector(".trial-msg.err button")'); f.state.payError = null; await f.click('.trial-msg.err button'); await payReady(f); assert.equal(f.state.orders, 2); f.state.paid = true; await f.wait('!!document.querySelector(".payres-card")', 4500); assert.equal(f.state.account.coin.balance, 500); assert.equal(await f.js('!!document.querySelector(".trial-plans")'), false);
  });
  await run('付款页登录失效直接返回登录表单', { account: account(0), nextError: '[[gw:free_daily_cap_reached]] exhausted', payError: 'not_logged_in' }, async f => {
    await f.send(); await f.wait('!!document.querySelector("input[type=password]")'); assert.equal(await f.js('!!document.querySelector(".trial-plans")'), false);
  });
  await run('快速切换套餐防抖，只为最后一个选项创建订单', { account: account(0), nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    await f.send(); await f.wait('document.querySelectorAll(".trial-plan-opt").length>1'); await f.js('(()=>{const rows=document.querySelectorAll(".trial-plan-opt");rows[1].click();rows[0].click();rows[1].click()})()'); await payReady(f); assert.equal(f.state.orders, 1);
  });
  await run('付款页关闭后迟到的余额刷新不重新打开弹窗', { account: account(0), settings: settings('wuwei-claude', 'claude-opus-4-8') }, async f => {
    f.state.meDelay = 700; await f.send(); await f.wait('!!document.querySelector(".trial-plans")'); await closePay(f); await delay(850); assert.equal(await f.js('!!document.querySelector(".pay-card")'), false); assert.equal(f.state.orders, 0);
  });
  await run('确认选顶级模型后提醒可关闭且同模型不反复出现', {}, async f => {
    await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(3)'); await f.click('[data-model-key="wuwei-claude/claude-opus-4-8"]'); await f.wait('!!document.querySelector("[data-action=confirm-premium]")'); await f.click('[data-action="confirm-premium"]'); await f.wait('!!document.querySelector(".premium-model-current")'); assert.equal(f.state.settings.model, 'claude-opus-4-8'); assert.equal(f.state.sent.length, 0); await f.click('.premium-model-dismiss'); ready(f.state); await delay(150); assert.equal(await f.js('!!document.querySelector(".premium-model-current")'), false);
  });
  await run('执行中的顶级任务可停止并切至推荐模型，不自动续费发送', { settings: settings('wuwei-claude', 'claude-opus-4-8') }, async f => {
    emit(f.state, 'evt:tasks', { running: ['qa-session'] }); await f.wait('document.querySelector(".premium-model-current")?.textContent.includes("停止并改用")'); await f.click('.premium-model-current button:not(.premium-model-dismiss)'); await f.wait('document.querySelector(".mq-select")?.textContent.includes("mimo-v2.6-flash")'); const calls = f.state.calls.map(c => c.method); assert.ok(calls.lastIndexOf('stop') < calls.lastIndexOf('setSettings')); assert.ok(calls.includes('stop')); assert.equal(f.state.sent.length, 0);
  });
  await run('游客选择顶级模型先登录，不越过登录显示付费确认', { account: null, settings: settings('wuwei-free', 'glm-4.7-flash') }, async f => {
    await f.click('.mq-select'); await f.click('.model-picker nav button:nth-child(3)'); await f.click('[data-model-key="wuwei-claude/claude-opus-4-8"]'); await f.wait('!!document.querySelector("input[type=password]")'); assert.equal(await f.js('!!document.querySelector(".model-picker-confirm")'), false); assert.equal(f.state.settings.model, 'glm-4.7-flash'); assert.equal(f.state.orders, 0);
  });
  await run('搜索中的顶级模型也须确认，返回和关闭都不切换', {}, async f => {
    await f.click('.mq-select'); await f.fill('.model-picker-search', 'claude-opus'); await f.click('[data-model-key="wuwei-claude/claude-opus-4-8"]'); await f.wait('!!document.querySelector(".model-picker-confirm")'); assert.equal(f.state.settings.model, 'nemotron-super-free'); await f.click('.model-picker-back-action'); await f.wait('!document.querySelector(".model-picker-confirm")'); assert.equal(f.state.settings.model, 'nemotron-super-free'); await f.click('.model-picker-header button'); assert.equal(f.state.sent.length, 0);
  });
  await run('切换会话后不显示旧请求的额度提示', { nextError: '[[gw:free_daily_cap_reached]] exhausted' }, async f => {
    f.state.meDelay = 500; await f.send(); emit(f.state, 'evt:session-loaded', { id: 'qa-other-session', messages: [] }); await delay(650); assert.equal(await f.js('!!document.querySelector(".freecap-modal,.pay-card")'), false);
  });
  await run('顶级提醒十秒自动关闭，任务状态变化不会重新出现', { settings: settings('wuwei-claude', 'claude-opus-4-8') }, async f => {
    await f.wait('!!document.querySelector(".premium-model-current")'); await delay(10_100); assert.equal(await f.js('!!document.querySelector(".premium-model-current")'), false); ready(f.state); emit(f.state, 'evt:tasks', { running: ['qa-session'] }); await delay(120); assert.equal(await f.js('!!document.querySelector(".premium-model-current")'), false); assert.equal(f.state.sent.length, 0);
  });
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ renderer: url.href, backend: 'isolated in-memory IPC', realPayments: 0, results }, null, 2));
  app.exit(results.every(r => r.passed) ? 0 : 1);
}).catch(error => { console.error(error.stack); app.exit(1); });
