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
const billingProviders=JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/billing-model-catalog.json'),'utf8'));
const billingModelCatalog=[...catalog.filter(p=>!billingProviders.some(b=>b.id===p.id)),...billingProviders];
const settings = (providerId = 'wuwei-free', model = 'nemotron-super-free') => ({ providerId, model, kind: 'openai', baseUrl: 'https://qa.invalid/api/gateway/v1', creds: {}, modelChoiceExplicit: true, theme: 'light', streamMode: 'instant', app: { teamEnabled: false, lang: 'zh' } });
function emit(state, channel, payload) {
  if(channel==='evt:tasks')state.running=[...(payload.running??[])];
  if(channel==='evt:background-queue'){
    const tasks=new Map((state.backgroundTasks??[]).map(task=>[task.taskId,task]));
    if(payload.finished)tasks.delete(payload.taskId);else tasks.set(payload.taskId,clone(payload));
    state.backgroundTasks=[...tasks.values()];
  }
  if (!state.win.isDestroyed()) state.win.webContents.send('qa:event', channel, payload);
}
function ready(state) {
  emit(state, 'evt:ready', { backend: 'openai', model: state.settings.model, cwd: 'D:/QA', contextWindow: 128000 });
  emit(state, 'evt:account', { providerId: state.settings.providerId, model: state.settings.model });
}
ipcMain.handle('qa:api', async (event, method, args) => {
  const s = states.get(event.sender.id);
  if (!s) return null; // Ignore already-queued calls from a window being torn down.
  s.calls.push({ method, model: s.settings.model });
  switch (method) {
    case 'backgroundTasks': {emit(s,'evt:tasks',{running:s.running??[]});const snapshot=clone(s.backgroundTasks??[]);if(s.backgroundDelay)await delay(s.backgroundDelay);return snapshot;}
    case 'team.state': return {employees:clone(s.teamEmployees??[]),departments:[],apps:[]};
    case 'team.rooms': return {rooms:clone(s.teamRooms??[])};
    case 'team.roomMessages': return {messages:[],running:true};
    case 'team.roomProgress': return {progress:[]};
    case 'team.sopTree': return {tree:[]};
    case 'team.scheduleList': return {schedules:[]};
    case 'getSettings': { const value = { settings: clone(s.settings), systemLanguage:s.systemLanguage, backend: 'openai', model: s.settings.model }; if (s.settingsDelay) await delay(s.settingsDelay); return value; }
    case 'setSettings': s.settings = { ...s.settings, ...clone(args[0]) }; s.modelWrites.push(s.settings.model); ready(s); return true;
    case 'getAccount': return { providerId: s.settings.providerId, model: s.settings.model };
    case 'bootstrap': return { currentId: 'qa-session', sessions: clone(s.sessions??[{ id: 'qa-session', title: '隔离流程测试', createdAt: Date.now(), updatedAt: Date.now() }]), groups: [], messages: clone(s.historyMessages) };
    case 'switchSession': s.switchedSession=args[0];return true;
    case 'deleteSession': s.deletedSession=args[0];return true;
    case 'newSession': emit(s, 'evt:session-loaded', { id: 'qa-new-session', messages: [] }); return true;
    case 'wuweiMe': { if (s.meError) throw Error(s.meError); const value = clone(s.account); if (s.meDelay) await delay(s.meDelay); return value; }
    case 'wuweiCatalog': return clone(s.modelCatalog||(s.account?.flags?.includes('billing_v2')?billingModelCatalog:catalog));
    case 'imageCatalog': return clone(s.imageCatalog || []);
    case 'supportThread': return {messages:[],unread:0};
    case 'getModelPricing': return { providers: [] };
    case 'fetchModels': return [];
    case 'getAppVersion': return '1.7.49';
    case 'getEdition': return 'test';
    case 'setAppSettings': if(args[0]?.lang)s.appLanguage=args[0].lang;return true;
    case 'translateBatch': return args[0].map(text=>text==='中文会话标题'?'English preview conversation':text==='已有对话，沿用明确选择的模型'?'Existing conversation, keep the chosen model':'English preview text');
    case 'respondPermission': s.permissionReplies.push(clone(args)); return true;
    case 'respondDecision': s.decisionReplies.push(clone(args)); return true;
    case 'checkConn': return { status: 'green', reason: 'Isolated stub' };
    case 'getAnnouncement': { if(s.announcementDelay)await delay(s.announcementDelay);return clone(s.announcement??{active:false,version:''}); }
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
    case 'billingRequest': {
      const req=clone(args[0]);(s.billingCalls??=[]).push(req);
      const products=JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/billing-products.json'),'utf8'));
      if(req.action==='catalog'){if(s.billingDelay)await delay(s.billingDelay);return {...(s.backgroundPolicy?{backgroundPolicy:s.backgroundPolicy}:{}),version:'qa-v2',trial:{...(s.miniTrial??{enabled:false,eligible:false}),...((s.billingPaid&&!s.miniTrial?.repeatAllowed)||s.quoteError==='TRIAL_USED'?{eligible:false}:{})},products,member:!!s.billingMember,checkoutReady:true,channels:{alipay:true,paddle:!s.cryptoOnly,crypto:true}};}
      if(req.action==='quote'){
        if(s.quoteDelay)await delay(s.quoteDelay);
        if(s.quoteError)return {error:typeof s.quoteError==='string'?s.quoteError:'network'};
        const p=products.find(p=>p.sku===req.sku);return {catalogVersion:'qa-v2',...p,currency:req.currency,amountMinor:req.currency==='USD'?p.usdMinor:p.cnyMinor,creditsPerGrant:p.kind==='pack'&&s.billingMember?p.memberCredits:p.credits,grantCount:p.period==='annual'?12:1,expiryMonths:p.period==='trial'?0:p.kind==='pack'?6:1,...(p.period==='trial'?{durationDays:1,expiryDays:1}:{}),memberBonus:p.kind==='pack'&&!!s.billingMember,autoRenew:false};
      }
      if(req.action==='create-order'){
        if(s.createError)return {error:typeof s.createError==='string'?s.createError:'network'};
        s.orders++;s.billingOrder={id:'qa-billing-order-'+s.orders,sku:req.sku,currency:req.currency,amountMinor:req.expected.amountMinor,channel:req.channel,status:'pending',expiresAt:new Date(Date.now()+600000).toISOString(),...(req.channel==='alipay'?{qr:'https://qa.invalid/qr'}:req.channel==='paddle'?{checkoutUrl:'https://wuweiai.io/en/billing-checkout?order=qa'}:{crypto:{network:'Solana',currency:'USDT',address:'qa-isolated-address',amount:'40.0001'}})};return clone(s.billingOrder);
      }
      if(req.action==='order'){if(s.billingPaid){s.billingOrder={...s.billingOrder,status:'paid',...(s.billingRefundRequired?{refundRequired:true}:{}),creditsGranted:s.billingRefundRequired?0:s.billingOrder.sku==='v2_plan_mini_day'?100:2000,balance:3578.362704};}return clone(s.billingOrder);}
      if(req.action==='ledger')return {balance:1578.362704,total:req.type==='model_check'?1:101,limit:req.limit||50,offset:req.offset||0,hasMore:(req.offset||0)+(req.limit||50)<(req.type==='model_check'?1:101),records:req.type==='model_check'?[{id:'check-only',type:'model_check',source:'free_model',description:'免费模型 glm-4.7-flash',createdAt:'2026-10-24T00:00:00Z',amount:0,balanceAfter:1578.362704,model:'glm-4.7-flash'}]:[{id:'record-'+(req.offset||0),type:'spend',source:'model_usage',description:'无为托管模型调用',createdAt:'2026-10-20T15:14:12Z',amount:-0.03039,balanceAfter:1578.362704,model:'mimo-v2.6-flash',parameters:{turn_kind:'tool_cont',input_tokens:100}},{id:'free-record',type:'spend',source:'free_model',description:'免费模型 glm-4.7-flash',createdAt:'2026-10-20T15:05:49Z',amount:0,balanceAfter:1578.362704,model:'glm-4.7-flash'}]};
      return {error:'unknown_action'};
    }
    case 'payCreate': s.orders++; s.orderSkus.push(args[0]); return s.payError ? { error: s.payError } : { orderId: 'qa-order-' + s.orders, qr: 'https://qa.invalid/fake-payment-' + s.orders };
    case 'payStatus': if (s.paid) { s.account = account(500); return { status: 'paid', balance: 500 }; } return { status: 'pending' };
    case 'openExternal': (s.externalURLs??=[]).push(args[0]);return true;
    case 'checkUpdate': return { available: false };
    case 'isRunning': return false;
    case 'getTools': {
      const pack=JSON.parse(fs.readFileSync(path.join(repo,'src/localization/locales/zh.json'),'utf8')).messages;
      const entries=s.allToolMessages?JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/builtin-tool-messages.json'),'utf8')):[];
      const tools=entries.map(row=>({name:row.name,description:pack[row.descriptionKey],readOnly:true,inputSchema:{type:'object',properties:Object.fromEntries(Object.entries(row.parameters).map(([name,key])=>[name,{type:'string',description:pack[key]}]))}}));
      return {tools,disabled:[],groups:[{source:'内置工具',kind:'builtin',tools}],total:tools.length};
    }
    case 'getMcp': return { config: '', status: [] };
    case 'brainGraph': return { nodes: [], edges: [] };
    case 'brainStats': return {nodes:0,edges:0,embedded:0};
    case 'brainDocStats': return {chunks:0,files:0,dir:'',builtAt:0};
    case 'brainEmbedReady': return false;
    case 'brainDocProgress': return {building:false,phase:'idle',files:0,total:0,done:0};
    case 'brainConceptProgress': return {running:false,phase:'idle',total:0,done:0,created:0,skipped:0};
    case 'secretsList': return {entries:[],available:true};
    case 'getMemory': case 'stopRulesGet': return '';
    case 'track': (s.tracked??=[]).push({event:args[0],props:clone(args[1]??{})});return true;
    case 'rememberSet': case 'draftSet': return true;
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
  const win = new BrowserWindow({ width: 1200, height: 920, show: false, webPreferences: { partition, additionalArguments: ['--qa-lang='+(options.lang||'zh'),'--qa-system-lang='+(options.systemLanguage||'')], offscreen: options.offscreen??!!process.env.WUWEI_QA_FILTER, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') } });
  // Existing flow fixtures represent a chat whose model has already been chosen.
  // Empty-chat/default tests explicitly supply historyMessages: [].
  const state = { win, account: account(), settings: settings(), historyMessages: [{ role: 'user', content: [{ type: 'text', text: '已有对话，沿用明确选择的模型' }] }], calls: [], modelWrites: [], sent: [], orders: 0, orderSkus: [], permissionReplies: [], decisionReplies: [], defaults: new Set(), errors: [], messages: [], blocked, ...options };
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
  if (process.env.WUWEI_QA_FILTER && !name.includes(process.env.WUWEI_QA_FILTER)) return;
  if (process.env.WUWEI_QA_COMPONENT_ONLY==='1'&&!options.developmentOnly) return;
  if (process.env.WUWEI_QA_BUILT_RENDERER==='1'&&options.developmentOnly) {results.push({name,skipped:true,reason:'Requires Vite component injection; run separately in development mode'});console.log('SKIP '+name+' (Vite component injection)');return;}
  let fixture;
  try { fixture = await boot(options); await test(fixture); const fatal = fixture.state.errors.filter(e => /renderer-fatal|Uncaught|Unhandled/.test(e)); assert.deepEqual(fatal, []); results.push({ name, passed: true, mockedOrders: fixture.state.orders, blockedExternalRequests: fixture.state.blocked.length }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, passed: false, error: error.message, stack:error.stack, messages: fixture?.state.messages.slice(-15), calls: fixture?.state.calls.slice(-15) }); console.log('FAIL ' + name + ': ' + error.message); if (fixture) fs.writeFileSync(path.join(evidence, 'failure-' + results.length + '.png'), (await fixture.state.win.webContents.capturePage()).toPNG()); }
  finally { fixture?.close(); }
}
// Offscreen windows expose their completed frame through paint; capturePage can
// fail before the first compositor surface exists, especially after resizing.
async function captureBillingFrame(f){
  const contents=f.state.win.webContents;
  await f.js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  await delay(100);
  if(!contents.isOffscreen())return (await contents.capturePage()).toPNG();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{contents.removeListener('paint',paint);reject(Error('Timed out waiting for billing screenshot frame'));},5000);
    let frames=0;
    const paint=(_event,_dirty,image)=>{if(image.isEmpty())return;if(++frames<2){setImmediate(()=>contents.invalidate());return;}clearTimeout(timer);contents.removeListener('paint',paint);resolve(image.toPNG());};
    contents.on('paint',paint);contents.invalidate();
  });
}
async function billingHeaderAligned(f){
  const geometry=await f.js(`(()=>{const bar=document.querySelector('.billing-top').getBoundingClientRect();return Array.from(document.querySelectorAll('#billing-title,.billing-top>div>button:not(.billing-close),.billing-top .billing-close svg')).map(el=>{const r=el.getBoundingClientRect();return{delta:Math.abs((r.top+r.bottom)/2-(bar.top+bar.bottom)/2),inside:r.top>=bar.top&&r.bottom<=bar.bottom}})})()`);
  assert.ok(geometry.length>=3);for(const item of geometry){assert.ok(item.delta<1.1,JSON.stringify(geometry));assert.equal(item.inside,true);}
  const inset=await f.js(`(()=>{const bar=document.querySelector('.billing-top').getBoundingClientRect(),icon=document.querySelector('.billing-top .billing-close svg').getBoundingClientRect();return {top:icon.top-bar.top,right:bar.right-icon.right}})()`);
  assert.ok(Math.abs(inset.top-inset.right)<1.1,JSON.stringify(inset));assert.ok(inset.right>=12&&inset.right<=18,JSON.stringify(inset));
}
app.whenReady().then(async () => {
  for(const lostEvents of [false,true])await run('发布关键：任务实时同步：停止移除、排队转运行、快照补偿 '+(lostEvents?'missed-events':'live-events'),{
    account:account(),running:['first-chat','qa-session'],sessions:[{id:'first-chat',title:'先执行的任务'},{id:'qa-session',title:'后执行的任务'}],
    backgroundTasks:[{taskId:'first-task',sid:'first-chat',accountId:'qa-account',queued:false,limit:1,tier:'free'},{taskId:'second-task',sid:'qa-session',accountId:'qa-account',queued:true,limit:1,tier:'free'}],
  },async f=>{
    await f.wait('!!document.querySelector(".background-queue-notice")');
    await f.click('.foot-status .fs-clickable');await f.wait('document.querySelectorAll(".tp-item").length===2');
    assert.equal(await f.js('document.querySelectorAll(".tp-group.is-queued .tp-item").length'),1);
    const second={taskId:'second-task',sid:'qa-session',accountId:'qa-account',queued:false,limit:1,tier:'free'};
    if(lostEvents){f.state.running=['qa-session'];f.state.backgroundTasks=[second];}
    else{
      emit(f.state,'evt:tasks',{running:['qa-session']});
      emit(f.state,'evt:background-queue',{taskId:'first-task',sid:'first-chat',accountId:'qa-account',queued:false,finished:true});
      emit(f.state,'evt:background-queue',second);
    }
    await f.wait('document.querySelectorAll(".tp-item").length===1 && !document.querySelector(".tp-group.is-queued") && !!document.querySelector(".send-btn.stop")',6000);
    assert.equal(await f.js('!!document.querySelector(".background-queue-notice")'),false);
    fs.writeFileSync(path.join(evidence,'task-sync-running-'+(lostEvents?'snapshot':'event')+'.png'),await captureBillingFrame(f));
    // A stale snapshot started before completion must not bring the row back.
    f.state.backgroundDelay=700;
    await f.js('window.dispatchEvent(new Event("focus"))');await delay(50);
    emit(f.state,'evt:tasks',{running:[]});emit(f.state,'evt:background-queue',{...second,finished:true});
    await f.wait('!document.querySelector(".task-center") && !document.querySelector(".send-btn.stop")');
    await delay(800);
    assert.equal(await f.js('!!document.querySelector(".task-center,.thinking,.background-queue-notice")'),false);
    assert.equal(await f.js('document.querySelector(".foot-status").textContent.includes("排队")'),false);
    fs.writeFileSync(path.join(evidence,'task-sync-completed-'+(lostEvents?'snapshot':'event')+'.png'),await captureBillingFrame(f));
    assert.equal(f.state.sent.length,0);assert.equal(f.state.orders,0);
  });
  for(const lang of ['zh','en'])await run('发布关键：支付品牌与核心权益排序加粗 '+lang,{
    account:{...account(),flags:['billing_v2']},lang,settings:{...settings(),app:{teamEnabled:false,lang}},
    modelCatalog:JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/billing-full-model-catalog.json'),'utf8')),
    imageCatalog:[{sku_id:'test-image',model:'gpt-image-1',quality:'low',coins_per_image:8}],
    backgroundPolicy:{enabled:true,version:'qa-v1',free:1,plans:{Pro:2,Plus:4,Max:8}},
  },async f=>{
    // Exercise the real split selector and card view, with no order creation.
    await f.click('.acct-btn');await f.click('[data-account-upgrade]');
    await f.wait('!!document.querySelector(".billing-selector-benefits .billing-background-feature")');
    await f.click('[data-period=annual]');
    const inspect=()=>f.js('(()=>{const rows=[...document.querySelectorAll(".billing-selector-benefits li")];return rows.map(e=>({kind:e.dataset.usageKind || (e.classList.contains("billing-value-feature")?"value":e.classList.contains("billing-background-feature")?"parallel":"common"),weight:Number(getComputedStyle(e.querySelector("strong")||e).fontWeight),text:e.textContent}))})()');
    let rows=await inspect();assert.deepEqual(rows.slice(0,5).map(r=>r.kind),['tasks','tokens','images','value','parallel']);
    assert.ok(rows.slice(0,5).every(r=>r.weight>=600));assert.ok(rows.slice(5).every(r=>r.weight<600));
    assert.match(rows[3].text,/20/);assert.match(rows[4].text,/4/);
    assert.equal(await f.js('getComputedStyle(document.querySelector(".billing-selector-pay")).backgroundColor'),'rgb(192, 95, 60)');
    assert.equal(await f.js('getComputedStyle(document.querySelector(".billing-selector-option.selected")).borderTopColor'),'rgb(39, 74, 99)','selected plan border');
    assert.equal(await f.js('getComputedStyle(document.querySelector(".billing-selector-credits strong")).color'),'rgb(39, 74, 99)','coin amount color');
    assert.equal(await f.js('getComputedStyle(document.querySelector(".billing-selector>aside")).backgroundColor'),'rgb(244, 246, 248)');
    for(const width of [1200,840]){
      f.state.win.setContentSize(width,800);await delay(100);
      assert.equal(await f.js('(()=>{const e=document.querySelector(".billing-selector-benefits");return e.scrollWidth<=e.clientWidth+1})()'),true);
      fs.writeFileSync(path.join(evidence,'payment-brand-benefits-'+lang+'-'+width+'.png'),await captureBillingFrame(f));
    }
    await f.click('[data-sku="v2_plan_pro_annual"]');rows=await inspect();assert.deepEqual(rows.slice(0,4).map(r=>r.kind),['tasks','tokens','images','parallel']);assert.match(rows[3].text,/2/);
    await f.click('[data-sku="v2_plan_max_annual"]');rows=await inspect();assert.deepEqual(rows.slice(0,5).map(r=>r.kind),['tasks','tokens','images','value','parallel']);assert.match(rows[4].text,/8/);
    await f.click('.billing-top button:first-child');await f.wait('document.querySelectorAll(".billing-plan-card").length===3');
    assert.equal(await f.js('getComputedStyle(document.querySelector(".billing-plan-card.recommended")).borderTopColor'),'rgb(39, 74, 99)','recommended card border');
    assert.equal(await f.js('getComputedStyle(document.querySelector(".billing-plan-buy")).backgroundColor'),'rgb(192, 95, 60)');
    fs.writeFileSync(path.join(evidence,'payment-brand-cards-'+lang+'.png'),await captureBillingFrame(f));
    assert.equal(f.state.orders,0);
  });
  for(const theme of ['light','dark']) await run('发布关键：并行品牌：月白玄墨与靛青、单个朱赭操作 '+theme,{account:account(),settings:{...settings(),theme},backgroundTasks:[{taskId:'brand-queued',sid:'qa-session',accountId:'qa-account',queued:true,limit:1,tier:'free'}]},async f=>{
    await f.wait('!!document.querySelector(".background-queue-notice")');
    // The product currently forces light mode. Exercise legacy dark CSS tokens
    // in this isolated renderer without re-enabling the removed theme setting.
    if(theme==='dark')await f.js('document.documentElement.dataset.theme="dark"');
    const colors=await f.js('(()=>{const q=document.querySelector(".background-queue-notice"),b=document.querySelector(".background-queue-action"),i=document.querySelector(".background-queue-icon");return {theme:document.documentElement.dataset.theme,surface:getComputedStyle(q).backgroundColor,icon:getComputedStyle(i).color,cta:getComputedStyle(b).backgroundColor,font:getComputedStyle(q).fontFamily,stroke:i.querySelector("svg").getAttribute("stroke-width")}})()');
    assert.equal(colors.theme,theme);assert.equal(colors.surface,theme==='light'?'rgb(255, 255, 255)':'rgb(30, 35, 43)');
    assert.equal(colors.icon,theme==='light'?'rgb(39, 74, 99)':'rgb(111, 159, 173)');
    assert.equal(colors.cta,'rgb(192, 95, 60)');assert.match(colors.font,/Inter/);assert.equal(colors.stroke,'1.75');
    fs.writeFileSync(path.join(evidence,'brand-queue-'+theme+'.png'),await captureBillingFrame(f));
    await f.click('.foot-status .fs-clickable');await f.wait('!!document.querySelector(".task-center")');
    assert.equal(await f.js('getComputedStyle(document.querySelector(".tp-heading-icon")).color'),colors.icon);
    assert.equal(await f.js('getComputedStyle(document.querySelector(".tp-close")).outlineStyle'),'none');
    fs.writeFileSync(path.join(evidence,'brand-tasks-'+theme+'.png'),await captureBillingFrame(f));
    assert.equal(f.state.orders,0);assert.equal(f.state.sent.length,0);
  });
  for(const lang of ['zh','en']) await run('发布关键：并行排队：输入框待发送、提示可关闭、获得名额自动运行 '+lang,{account:account(),lang,settings:{...settings(),app:{teamEnabled:false,lang}}},async f=>{
    const queued={taskId:'ordinary-queued',sid:'qa-session',accountId:'qa-account',queued:true,limit:1,tier:'free'};
    emit(f.state,'evt:tasks',{running:['qa-session','other-session']});
    emit(f.state,'evt:background-queue',queued);
    await f.wait('!!document.querySelector(".background-queue-notice") && !document.querySelector(".thinking") && !document.querySelector(".send-btn.stop")');
    assert.equal(await f.js('!!document.querySelector(".send-btn.cont-wait")'),false);
    assert.equal(await f.js('document.querySelector(".send-btn").disabled'),true);
    assert.equal(await f.js('getComputedStyle(document.querySelector(".s-run.s-queued")).animationName'),'none');
    await f.fill('.composer textarea','稍后继续输入的补充说明');
    fs.writeFileSync(path.join(evidence,'ordinary-chat-queued-'+lang+'.png'),await captureBillingFrame(f));
    const stops=f.state.calls.filter(c=>c.method==='stop').length;
    await f.click('.background-queue-dismiss');await f.wait('!document.querySelector(".background-queue-notice")');
    for(let i=0;i<3;i++)emit(f.state,'evt:background-queue',queued);
    await delay(60);assert.equal(await f.js('!!document.querySelector(".background-queue-notice")'),false);
    assert.equal(await f.js('document.querySelector(".composer textarea").value'),'稍后继续输入的补充说明');
    assert.equal(f.state.calls.filter(c=>c.method==='stop').length,stops);
    assert.equal(f.state.sent.length,0);
    await f.click('.foot-status .fs-clickable');await f.wait('!!document.querySelector(".task-center")');
    assert.equal(await f.js('document.querySelectorAll(".tp-group.is-queued .tp-item").length'),1);
    assert.deepEqual(await f.js('(()=>{const c=getComputedStyle(document.querySelector(".tp-close"));return {outline:c.outlineStyle,shadow:c.boxShadow,border:c.borderTopWidth}})()'),{outline:'none',shadow:'none',border:'0px'});
    fs.writeFileSync(path.join(evidence,'task-panel-close-focus-'+lang+'.png'),await captureBillingFrame(f));
    await f.click('.tp-close');
    emit(f.state,'evt:background-queue',{...queued,queued:false});
    await f.wait('!!document.querySelector(".thinking") && !!document.querySelector(".send-btn.stop")');
    assert.equal(await f.js('!!document.querySelector(".s-run.s-queued")'),false);
    assert.equal(await f.js('document.querySelector(".composer textarea").value'),'稍后继续输入的补充说明');
    assert.equal(f.state.sent.length,0); // Main resumes the queued turn; renderer never resends it.
    emit(f.state,'evt:done',{sid:'qa-session'});emit(f.state,'evt:tasks',{running:[]});
    emit(f.state,'evt:background-queue',{...queued,queued:false,finished:true});
    await f.wait('!document.querySelector(".thinking") && !document.querySelector(".send-btn.stop")');
    emit(f.state,'evt:background-queue',{...queued,taskId:'new-request'});
    await f.wait('!!document.querySelector(".background-queue-notice")');
    assert.equal(f.state.orders,0);
  });
  const changeLanguage = async (f, code) => f.js(`(()=>{const select=document.querySelector('.language-switcher');if(!select)throw Error('Missing language selector');select.value=${JSON.stringify(code)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const uiLanguage = async (f, code) => f.js(`(()=>{localStorage.setItem('wuwei_lang',${JSON.stringify(code)});window.dispatchEvent(new StorageEvent('storage',{key:'wuwei_lang'}));})()`);

  const openLanguageSettings=async f=>{await f.click('.mq-select');await f.click('.model-picker footer button');await f.wait('!!document.querySelector(".settings")');await f.click('.set-tabs button:first-child');await f.wait('!!document.querySelector(".language-picker-trigger")');};
  await run('发布关键：多语言：18种语言搜索、键盘选择、即时切换及原文保留',{lang:'zh'},async f=>{
    await f.fill('.composer textarea','原始草稿 keep original');await openLanguageSettings(f);
    await f.click('.language-picker-trigger');await f.wait('document.querySelectorAll(".language-picker-options [role=option]").length===19');
    await f.fill('.language-picker-search input','рус');assert.equal(await f.js('document.querySelectorAll(".language-picker-options [role=option]").length'),1);
    f.state.win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});await f.wait('document.documentElement.lang==="ru"&&!document.querySelector(".language-picker-popup")');assert.equal(f.state.appLanguage,'ru');
    const codes=['zh','en','ru','fa','tr','fr','pt-BR','de','ar','es','pl','ja','ko','hi','vi','ms','id','it'];
    for(const code of codes){
      await f.click('.language-picker-trigger');await f.wait('!!document.querySelector(".language-picker-popup")');await f.click('.language-picker-options [data-language-code="'+code+'"]');
      await f.wait('document.documentElement.lang==='+JSON.stringify(code));await delay(35);
      assert.equal(f.state.appLanguage,code);assert.equal(await f.js('localStorage.getItem("wuwei_lang")'),code);assert.equal(await f.js('document.documentElement.dir'),'ltr');
      assert.equal(await f.js('document.querySelector(".composer textarea").value'),'原始草稿 keep original');
      const layout=await f.js(`(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {sidebar:r('.sidebar').left,main:r('.main').left,nav:r('.set-side').left,settings:r('.settings').left,content:r('.set-main').left,close:r('.set-main-head .set-win-btn:last-child').left,windowButtons:r('.win-ctrl').left,inputDir:document.querySelector('.composer textarea').dir,labelDir:getComputedStyle(document.querySelector('.app-set-label')).direction}})()`);
      assert.ok(layout.sidebar<layout.main&&layout.nav<layout.content,code+JSON.stringify(layout));assert.equal(layout.inputDir,'ltr');
      if(['fa','ar'].includes(code)){
        assert.equal(layout.labelDir,'ltr');assert.ok(layout.close>layout.content&&layout.windowButtons>layout.main+500,JSON.stringify(layout));
        await f.fill('.composer textarea',code==='fa'?'سلام، لطفاً کمک کنید.':'مرحباً، الرجاء المساعدة.');assert.equal(await f.js('getComputedStyle(document.querySelector(".composer textarea")).direction'),'ltr');
        await f.fill('.composer textarea','English draft 123');assert.equal(await f.js('getComputedStyle(document.querySelector(".composer textarea")).direction'),'ltr');await f.fill('.composer textarea','原始草稿 keep original');
      }

      await f.click('.language-picker-trigger');await f.wait('!!document.querySelector(".language-picker-popup")');
      const rect=await f.js('(()=>{const r=document.querySelector(".language-picker-popup").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()');assert.ok(rect.left>=0&&rect.right<=rect.width&&rect.top>=0&&rect.bottom<=rect.height,code+JSON.stringify(rect));
      if(['zh','en','ru','fa','ar','ja','hi'].includes(code)){await f.js('document.fonts.ready');await delay(200);fs.writeFileSync(path.join(evidence,'language-settings-'+code+'.png'),(await f.state.win.webContents.capturePage()).toPNG());}
      f.state.win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});await f.wait('!document.querySelector(".language-picker-popup")');assert.equal(await f.js('!!document.querySelector(".settings")'),true);
    }
    assert.equal(f.state.sent.length,0);await uiLanguage(f,'ru');await delay(60);
    const press=()=>f.state.win.webContents.sendInputEvent({type:'keyDown',keyCode:'T',modifiers:['control','shift']});press();await f.wait('document.documentElement.lang==="en"');press();await f.wait('document.documentElement.lang==="ru"');assert.equal(f.state.appLanguage,'ru');
  });
  for(const [systemLanguage,expected] of [['ru-RU','ru'],['ja-JP','ja'],['fa-IR','fa']]) await run('发布关键：多语言：默认跟随电脑系统语言 '+expected,{lang:'system',systemLanguage,settings:{...settings(),app:{teamEnabled:false,lang:'system'}}},async f=>{
    await f.wait('document.documentElement.lang==='+JSON.stringify(expected));assert.equal(f.state.appLanguage,'system');assert.equal(await f.js('localStorage.getItem("wuwei_lang")'),'system');
    await openLanguageSettings(f);await f.click('.language-picker-trigger');await f.click('.language-picker-options [data-language-code="en"]');await f.wait('document.documentElement.lang==="en"');assert.equal(f.state.appLanguage,'en');
    await f.click('.language-picker-trigger');await f.click('.language-picker-options [data-language-code="system"]');await f.wait('document.documentElement.lang==='+JSON.stringify(expected));assert.equal(f.state.appLanguage,'system');
  });
  for (const lang of ['zh','en']) await run('发布关键：侧栏显示：已完成会话保持单行布局、悬停删除和切换交互 '+lang, {
    lang,offscreen:true,settings:{...settings(),app:{teamEnabled:false,lang}},sessions:[
      {id:'qa-session',title:'HAL',createdAt:Date.now(),updatedAt:Date.now()},
      ...Array.from({length:12},(_,i)=>({id:'done-'+i,title:i%2?'历史已完成任务：知识宫殿资料整理与支付到账记录核对，这是一条很长的标题':'Completed conversation with a very long title that must stay on one line',done:true,createdAt:Date.now()-86400000*(i+1),updatedAt:Date.now()-86400000*(i+1)})),
    ],
  },async f=>{
    await f.wait('document.querySelectorAll(".session-item.done").length===12');
    for (const width of [232,180,320]) {
      await f.js(`document.querySelector('.sidebar').style.width='${width}px'`);
      const layout=await f.js(`Array.from(document.querySelectorAll('.session-item')).map(row=>{const title=row.querySelector('.s-title'),button=row.querySelector('.s-del'),r=row.getBoundingClientRect(),t=title.getBoundingClientRect(),b=button.getBoundingClientRect();return {display:getComputedStyle(row).display,height:r.height,whiteSpace:getComputedStyle(title).whiteSpace,overflow:getComputedStyle(title).overflow,inside:t.left>=r.left&&t.right<=r.right+1&&b.right<=r.right+1,buttonOpacity:getComputedStyle(button).opacity,border:getComputedStyle(button).borderTopWidth}})`);
      assert.equal(layout.length,13);for(const row of layout){assert.equal(row.display,'flex');assert.ok(row.height>=30&&row.height<=42,JSON.stringify(row));assert.equal(row.whiteSpace,'nowrap');assert.equal(row.overflow,'hidden');assert.equal(row.inside,true);assert.equal(row.buttonOpacity,'0');assert.equal(row.border,'0px');}
    }
    await f.js("document.querySelector('.sidebar').style.width='232px'");await f.js('document.fonts.ready');await delay(250);
    fs.writeFileSync(path.join(evidence,'sidebar-'+lang+'.png'),(await f.state.win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(evidence,'sidebar-'+lang+'-detail.png'),(await f.state.win.webContents.capturePage({x:0,y:0,width:232,height:Math.min(850,f.state.win.getContentSize()[1])})).toPNG());
    const point=await f.js("(()=>{const r=document.querySelector('.session-item.done').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
    f.state.win.webContents.sendInputEvent({type:'mouseMove',...point});await delay(150);assert.equal(await f.js("getComputedStyle(document.querySelector('.session-item.done .s-del')).opacity"),'1');
    await f.click('.session-item.done');assert.equal(f.state.switchedSession,'done-0');
    f.state.switchedSession=null;await f.click('.session-item.done .s-del');assert.equal(f.state.deletedSession,'done-0');assert.equal(f.state.switchedSession,null);
  });

  const billingAccount=account(1578.362704);billingAccount.flags=['billing_v2'];
  const openBilling=async(f,ledger=false,period='monthly')=>{const english=JSON.parse(fs.readFileSync(path.join(repo,'src/localization/locales/en.json'),'utf8')).messages,key=Object.keys(english).find(key=>english[key]===(ledger?'Coin details':'Top up')),pack=JSON.parse(fs.readFileSync(path.join(repo,'src/localization/locales',f.state.lang==='system'?'en.json':(f.state.lang||'zh')+'.json'),'utf8')).messages;await f.click('.acct-btn');await f.js(ledger?'Array.from(document.querySelectorAll(".acct-it")).find(b=>b.textContent.trim()==='+JSON.stringify(pack[key])+')?.click()':'document.querySelector("[data-account-upgrade]")?.click()');await f.wait('!!document.querySelector(".billing-panel")');if(!ledger&&period){await f.wait('!!document.querySelector(".billing-selector-periods")');await f.click('.billing-selector-periods button:nth-child('+(['monthly','annual','pack'].indexOf(period)+1)+')');await f.wait('document.querySelector(".billing-selector-periods button:nth-child('+(['monthly','annual','pack'].indexOf(period)+1)+')")?.getAttribute("aria-selected")==="true"');}};



  for(const lang of ['zh','en'])await run('发布关键：Mini：入口、100币折算、24小时付款与限购 '+lang,{account:clone(billingAccount),lang,settings:{...settings(),app:{lang}},modelCatalog:JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/billing-full-model-catalog.json'),'utf8')),imageCatalog:[{sku_id:'gpt_image_1_low',model:'gpt-image-1',quality:'low',coins_per_image:8}],miniTrial:{enabled:true,eligible:true},backgroundPolicy:{enabled:true,version:'qa',free:1,plans:{Pro:2,Plus:4,Max:8}}},async f=>{
    await openBilling(f,false,null);await f.wait('!!document.querySelector(".billing-selector-option")');await f.wait('document.querySelector("[data-sku=v2_plan_plus_monthly]")?.getAttribute("aria-pressed")===("true")');
    assert.equal(await f.js('document.querySelector("[data-period=monthly]").getAttribute("aria-selected")'),'true');
    assert.equal(await f.js('document.querySelectorAll(".billing-selector-periods button").length'),3);
    assert.deepEqual(await f.js('Array.from(document.querySelectorAll(".billing-selector-option")).map(e=>e.dataset.sku)'),['v2_plan_mini_day','v2_plan_pro_monthly','v2_plan_plus_monthly','v2_plan_max_monthly']);
    for(const [width,height] of [[1200,920],[1200,735],[840,735]]){
      f.state.win.setContentSize(width,height);await delay(100);
      const g=await f.js('(()=>{const a=document.querySelector("[data-sku=v2_plan_mini_day]"),b=document.querySelector("[data-sku=v2_plan_pro_monthly]"),pay=document.querySelector(".billing-selector-pay").getBoundingClientRect();return {miniAbovePro:a.getBoundingClientRect().bottom<b.getBoundingClientRect().top,payVisible:pay.bottom<=innerHeight-8,payTop:pay.top,payBottom:pay.bottom,height:innerHeight,miniNotMonthly:!a.querySelector(".billing-selector-price>span"),miniNoDiscount:!a.querySelector("del")}})()');
      assert.ok(g.miniAbovePro&&g.payVisible&&g.miniNotMonthly&&g.miniNoDiscount,JSON.stringify(g));
      fs.writeFileSync(path.join(evidence,`mini-above-pro-default-${lang}-${width}-${height}.png`),await captureBillingFrame(f));
    }
    f.state.win.setContentSize(1200,920);await delay(60);
    await f.click('[data-sku=v2_plan_mini_day]');await f.wait('document.querySelector("[data-sku=v2_plan_mini_day]")?.getAttribute("aria-pressed")==="true"');
    assert.equal(await f.js('document.querySelectorAll(".billing-selector-option").length'),4);
    assert.equal(await f.js('document.querySelector(".billing-selector-credits strong").textContent'),'100');
    assert.equal(await f.js('document.querySelector("[data-usage-kind=tasks]").textContent.includes("93")'),true);
    assert.equal(await f.js('document.querySelector("[data-usage-kind=images]").textContent.includes("12")'),true);
    assert.equal(await f.js('document.querySelector("[data-usage-kind=tokens]").textContent.includes(new Intl.NumberFormat(' + JSON.stringify(lang) + ',{notation:"compact",maximumFractionDigits:1}).format(930000))'),true);
    assert.equal(await f.js('document.querySelector(".billing-background-feature").textContent.includes("2")'),true);
    assert.equal(await f.js('!!document.querySelector(".billing-value-feature")'),false);
    const price=await f.js('document.querySelector(".billing-selector-price strong").textContent');assert.ok(price.includes(lang==='zh'?'7':'1'),price);
    assert.equal(f.state.orders,0);fs.writeFileSync(path.join(evidence,'mini-'+lang+'.png'),await captureBillingFrame(f));
    await f.click('.billing-selector-pay');await f.wait('!!document.querySelector(".billing-payment-lines")');
    assert.equal(await f.js('document.querySelector(".billing-payment-lines").textContent.includes("24")'),true);
    if(lang==='en'){assert.equal(await f.js('document.querySelectorAll(".billing-payment-choices button")[1].disabled'),true);await f.click('.billing-payment-choices button');}
    await f.wait('!!document.querySelector(".billing-live-order")');assert.equal(f.state.orders,1);
    assert.equal(f.state.billingCalls.find(x=>x.action==='quote').sku,'v2_plan_mini_day');
    fs.writeFileSync(path.join(evidence,'mini-checkout-'+lang+'.png'),await captureBillingFrame(f));
    f.state.billingPaid=true;await f.click('.billing-live-order .billing-secondary');await f.wait('!!document.querySelector(".billing-paid-symbol")');
    assert.equal(await f.js('document.querySelector(".billing-order-state").textContent.includes("100")'),true);
    await f.click('.billing-top button');await f.wait('!!document.querySelector(".billing-selector-periods")');
    await f.wait('!document.querySelector("[data-sku=v2_plan_mini_day]")');assert.equal(f.state.orders,1);
  });
  for(const lang of ['zh','en'])await run('发布关键：Mini：年付与对比套餐中的体验包仍按一天报价 '+lang,{account:clone(billingAccount),lang,settings:{...settings(),app:{lang}},miniTrial:{enabled:true,eligible:true}},async f=>{
    await openBilling(f,false,null);await f.wait('!!document.querySelector("[data-sku=v2_plan_mini_day]")');await f.click('[data-period=annual]');await f.wait('!!document.querySelector("[data-sku=v2_plan_pro_annual]")');
    const price=await f.js('document.querySelector("[data-sku=v2_plan_mini_day] .billing-selector-price strong").textContent');assert.ok(price.includes(lang==='zh'?'7':'1'));
    assert.equal(await f.js('!!document.querySelector("[data-sku=v2_plan_mini_day] del")'),false);
    await f.click('[data-period=pack]');await f.wait('document.querySelectorAll(".billing-selector-option").length===4');assert.equal(await f.js('!!document.querySelector("[data-sku=v2_plan_mini_day]")'),false);
    await f.click('[data-period=annual]');await f.wait('!!document.querySelector("[data-sku=v2_plan_mini_day]")');await f.click('.billing-top button:first-child');await f.wait('!!document.querySelector(".billing-plans-trial")');
    assert.equal(await f.js('document.querySelectorAll(".billing-plan-card").length'),3);
    assert.equal(await f.js('document.querySelector(".billing-plans-trial").getBoundingClientRect().bottom<document.querySelector(".billing-plan-grid").getBoundingClientRect().top'),true);
    fs.writeFileSync(path.join(evidence,'mini-above-pro-comparison-'+lang+'.png'),await captureBillingFrame(f));
    await f.click('.billing-plans-trial button');await f.wait('!!document.querySelector(".billing-payment-lines")');if(lang==='en'){await f.click('.billing-payment-choices button');}
    await f.wait('!!document.querySelector(".billing-live-order")');const q=f.state.billingCalls.filter(x=>x.action==='quote').at(-1),order=f.state.billingCalls.filter(x=>x.action==='create-order').at(-1);assert.equal(q.sku,'v2_plan_mini_day');assert.equal(order.expected.amountMinor,lang==='zh'?700:100);assert.equal(order.expected.creditsPerGrant,100);assert.equal(f.state.orders,1);
  });
  await run('发布关键：Mini：白名单付款后仍可重复购买且每次独立下单',{account:clone(billingAccount),miniTrial:{enabled:true,eligible:true,repeatAllowed:true}},async f=>{
    await openBilling(f,false,null);await f.wait('!!document.querySelector("[data-sku=v2_plan_mini_day]")');await f.click('[data-sku=v2_plan_mini_day]');await f.wait('!!document.querySelector("[data-sku=v2_plan_mini_day]")');
    const requestIds=[];
    for(let i=0;i<2;i++){
      await f.click('.billing-selector-pay');await f.wait('!!document.querySelector(".billing-live-order")');
      requestIds.push(f.state.billingCalls.filter(x=>x.action==='create-order').at(-1).requestId);assert.equal(f.state.orders,i+1);
      f.state.billingPaid=true;await f.click('.billing-live-order .billing-secondary');await f.wait('!!document.querySelector(".billing-paid-symbol")');
      await f.click('.billing-top button');await f.wait('!!document.querySelector("[data-sku=v2_plan_mini_day]")');
      f.state.billingPaid=false;
    }
    assert.equal(new Set(requestIds).size,2);assert.equal(f.state.orders,2);
  });
  for(const trial of [{enabled:false,eligible:true},{enabled:true,eligible:false},null])await run('发布关键：Mini：关闭、已购和旧服务隐藏入口 '+JSON.stringify(trial),{account:clone(billingAccount),miniTrial:trial},async f=>{
    await openBilling(f,false,null);await f.wait('!!document.querySelector(".billing-selector-option")');assert.equal(await f.js('document.querySelectorAll(".billing-selector-periods button").length'),3);
    assert.equal(await f.js('!!document.querySelector("[data-period=trial],[data-sku=v2_plan_mini_day]")'),false);assert.equal(f.state.orders,0);
  });
  await run('发布关键：Mini：迟到的首购拒绝回到正式套餐',{account:clone(billingAccount),miniTrial:{enabled:true,eligible:true}},async f=>{
    await openBilling(f,false,null);await f.wait('!!document.querySelector(".billing-selector-option")');await f.click('[data-sku=v2_plan_mini_day]');await f.wait('!!document.querySelector("[data-sku=v2_plan_mini_day]")');
    f.state.quoteError='TRIAL_USED';await f.click('.billing-selector-pay');await f.wait('!document.querySelector("[data-sku=v2_plan_mini_day]")');
    assert.equal(await f.js('document.querySelector("[data-period=monthly]").getAttribute("aria-selected")'),'true');assert.equal(f.state.orders,0);
  });
  await run('发布关键：Mini：重复付款进入退款提示而不显示权益到账',{account:clone(billingAccount),miniTrial:{enabled:true,eligible:true},billingRefundRequired:true},async f=>{
    await openBilling(f,false,null);await f.wait('!!document.querySelector(".billing-selector-option")');await f.click('[data-sku=v2_plan_mini_day]');await f.wait('!!document.querySelector("[data-sku=v2_plan_mini_day]")');
    await f.click('.billing-selector-pay');await f.wait('!!document.querySelector(".billing-live-order")');f.state.billingPaid=true;
    await f.click('.billing-live-order .billing-secondary');await f.wait('!!document.querySelector(".billing-order-state[role=alert]")');
    assert.equal(await f.js('!!document.querySelector(".billing-paid-symbol")'),false);
    assert.equal(await f.js('document.querySelector(".billing-order-state").textContent.includes("退款")'),true);
  });
  for(const lang of ['zh','en','fa'])await run('发布关键：账号菜单升级入口、年付优惠标与菜单顺序 '+lang,{account:clone(billingAccount),lang,settings:{...settings(),app:{teamEnabled:false,lang}}},async f=>{
    await f.click('.acct-btn');await f.wait('!!document.querySelector("[data-account-upgrade]")');await delay(180);
    const g=await f.js('(()=>{const e=document.querySelector("[data-account-upgrade]"),r=e.getBoundingClientRect(),b=e.querySelector(".acct-upgrade-discount").getBoundingClientRect();return {second:document.querySelectorAll(".acct-items .acct-it")[1]===e,inside:b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom,title:e.title,text:e.querySelector(".acct-upgrade-discount").textContent}})()');
    assert.ok(g.second&&g.inside,JSON.stringify(g));assert.equal(g.text,'−50%');assert.ok(g.title.length>8);
    fs.writeFileSync(path.join(evidence,'account-upgrade-'+lang+'.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await f.click('[data-account-upgrade]');await f.wait('!!document.querySelector(".billing-selector-option")');assert.equal(f.state.orders,0);
    await f.click('.billing-close');assert.equal(await f.js('!!document.querySelector(".sc-launcher-wrap,.sc-launcher")'),false);
    await f.fill('.composer textarea','QA send control check');assert.equal(await f.js('(()=>{const e=document.querySelector(".composer .send-btn"),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2));})()'),true);
    await f.click('.acct-btn');await f.click('[data-account-support]');await f.wait('!!document.querySelector(".sc-head")');await f.click('.sc-close');await f.wait('!document.querySelector(".sc-head")');assert.equal(await f.js('!!document.querySelector(".sc-launcher")'),false);
  });
  for(const lang of ['zh','en','fa'])await run('发布关键：完整模型目录、单列用量估算、搜索筛选与套餐联动 '+lang,{
    account:clone(billingAccount),lang,settings:{...settings(),app:{teamEnabled:false,lang}},
    modelCatalog:JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/billing-full-model-catalog.json'),'utf8')),
    imageCatalog:[{sku_id:'gpt_image_1_low',model:'gpt-image-1',quality:'low',coins_per_image:8},{sku_id:'gpt_image_1_medium',model:'gpt-image-1',quality:'medium',coins_per_image:29},{sku_id:'gpt_image_2_medium',model:'gpt-image-2',quality:'medium',coins_per_image:36},{sku_id:'nano_banana_2',model:'google/gemini-3.1-flash-image-preview',quality:'default',coins_per_image:46}]
  },async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');
    assert.equal(await f.js('document.querySelectorAll(".billing-selector-models>div").length'),50);
    assert.equal(await f.js('document.querySelectorAll(".billing-usage-metric").length'),3);
    assert.equal(await f.js('document.querySelectorAll(".billing-selector-models>div[data-model-id*=claude]").length'),9);
    for(const [width,height] of [[1280,840],[1200,735]]){
      f.state.win.setContentSize(width,height);await delay(120);await f.js('document.fonts.ready');
      const g=await f.js('(()=>{const p=document.querySelector(".billing-panel"),s=document.querySelector(".billing-catalog-search").getBoundingClientRect(),c=document.querySelector(".billing-catalog-controls").getBoundingClientRect(),b=document.querySelector(".billing-selector-pay").getBoundingClientRect(),rows=Array.from(document.querySelectorAll(".billing-selector-benefits li")).map(e=>e.getBoundingClientRect());return{scroll:p.scrollHeight,client:p.clientHeight,search:s.width,gap:document.dir==="rtl"?s.left-c.left:c.right-s.right,payBottom:b.bottom,height:innerHeight,aligned:rows.every((r,i)=>Math.abs(r.left-rows[0].left)<1&&(!i||r.top>rows[i-1].top))}})()');
      assert.ok(g.scroll<=g.client+2,JSON.stringify(g));assert.ok(g.search<=151&&g.search>=129,JSON.stringify(g));assert.ok(Math.abs(g.gap)<1,JSON.stringify(g));assert.ok(g.payBottom<g.height,JSON.stringify(g));assert.ok(g.aligned);await billingHeaderAligned(f);
      let capture;for(let attempt=0;attempt<3;attempt++){try{capture=await f.state.win.webContents.capturePage();break;}catch(error){if(!/UnknownVizError/.test(String(error))||attempt===2)throw error;f.state.win.webContents.invalidate();await delay(250);}}fs.writeFileSync(path.join(evidence,`billing-full-models-${lang}-${width}.png`),capture.toPNG());
    }
    await f.click('.billing-catalog-filters button:nth-child(3)');assert.equal(await f.js('document.querySelectorAll(".billing-selector-models>div").length'),3);
    await f.click('.billing-catalog-filters button:nth-child(4)');assert.equal(await f.js('document.querySelectorAll(".billing-selector-models>div").length'),5);
    await f.click('.billing-catalog-filters button:first-child');
    await f.js('(()=>{const e=document.querySelector(".billing-catalog-search input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"claude");e.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await f.wait('document.querySelectorAll(".billing-selector-models>div").length===9');
    await f.js('document.querySelector(".billing-catalog-search input").focus();document.querySelector(".billing-catalog-search input").select()');await delay(180);
    const searchFocus=await f.js('(()=>{const e=document.querySelector(".billing-catalog-search input"),i=getComputedStyle(e),o=getComputedStyle(e.parentElement);return {focused:document.activeElement===e,selected:e.selectionStart===0&&e.selectionEnd===e.value.length,inputOutline:i.outlineStyle,inputOutlineWidth:i.outlineWidth,inputShadow:i.boxShadow,inputBorder:i.borderWidth,outerOutline:o.outlineStyle,outerOutlineWidth:o.outlineWidth,outerShadow:o.boxShadow,outerBorder:o.borderWidth}})()');
    assert.equal(searchFocus.focused,true);assert.equal(searchFocus.selected,true);assert.equal(searchFocus.inputOutline,'none');assert.equal(searchFocus.inputShadow,'none');assert.equal(searchFocus.inputBorder,'0px');assert.equal(searchFocus.outerOutline,'none');assert.equal(searchFocus.outerShadow,'none');assert.equal(searchFocus.outerBorder,'1px');
    fs.writeFileSync(path.join(evidence,'model-search-focus-'+lang+'.json'),JSON.stringify(searchFocus,null,2));
    fs.writeFileSync(path.join(evidence,'model-search-focus-'+lang+'.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await f.click('.billing-selector-option:first-child');await delay(40);const pro=await f.js('Array.from(document.querySelectorAll(".billing-usage-metric")).map(e=>e.textContent)');
    await f.click('.billing-selector-option:last-child');await delay(40);const max=await f.js('Array.from(document.querySelectorAll(".billing-usage-metric")).map(e=>e.textContent)');assert.notDeepEqual(pro,max);
    assert.equal(await f.js('!!document.querySelector(".billing-usage-link,.billing-usage-details")'),false);
    if(lang==='en')assert.doesNotMatch(await f.js('document.querySelector(".billing-panel").textContent'),/[\u3400-\u9fff]/);
    assert.equal(f.state.orders,0);
    if(lang==='zh')assert.doesNotMatch(await f.js('document.querySelector(".billing-panel").textContent'),/积分/);
  });
  for(const modifier of ['control','meta'])await run('发布关键：语言快捷键切换界面、弹窗和临时英文显示 '+modifier,{
    offscreen:true,account:clone(billingAccount),sessions:[{id:'qa-session',title:'中文会话标题',createdAt:Date.now(),updatedAt:Date.now()}],
  },async f=>{
    const press=()=>{f.state.win.webContents.sendInputEvent({type:'keyDown',keyCode:'T',modifiers:[modifier,'shift']});f.state.win.webContents.sendInputEvent({type:'keyUp',keyCode:'T',modifiers:[modifier,'shift']});};
    await f.fill('.composer textarea','这条草稿不能丢失');await f.js("document.querySelector('.composer textarea').focus()");press();
    await f.wait('document.documentElement.lang==="en"');assert.equal(await f.js('localStorage.getItem("wuwei_lang")'),'en');await f.wait('document.querySelector(".s-title")?.textContent==="English preview conversation"');await f.wait('document.querySelector(".tb-title-txt")?.textContent==="English preview conversation"');await f.wait('document.querySelector(".msg.user .body")?.textContent.includes("Existing conversation, keep the chosen model")');assert.equal(await f.js('document.querySelector(".new-session").textContent.trim().normalize("NFKC")'),'+ New chat');assert.equal(await f.js('document.querySelector(".composer textarea").value'),'这条草稿不能丢失');assert.equal(f.state.appLanguage,'en');
    f.state.lang='en';await openBilling(f,true);await f.wait('!!document.querySelector(".billing-credit-record")');assert.doesNotMatch(await f.js('document.querySelector(".billing-ledger").textContent'),/[\u3400-\u9fff]/);
    press();await f.wait('document.documentElement.lang==="zh"');await f.wait('document.querySelector("#billing-title")?.textContent==="无为币明细"');
    press();await f.wait('document.documentElement.lang==="en"');await f.wait('document.querySelector("#billing-title")?.textContent==="Coin details"');
    await f.click('.billing-close');press();await f.wait('document.documentElement.lang==="zh"');await f.wait('document.querySelector(".s-title")?.textContent==="中文会话标题"');assert.equal(await f.js('document.querySelector(".tb-title-txt").textContent'),'中文会话标题');assert.match(await f.js('document.querySelector(".msg.user .body").textContent'),/已有对话/);assert.equal(await f.js('document.querySelector(".composer textarea").value'),'这条草稿不能丢失');assert.equal(f.state.sessions[0].title,'中文会话标题');assert.equal(f.state.sent.length,0);
    press();await f.wait('document.documentElement.lang==="en"');f.state.lang='en';await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-payment-choices")');assert.match(await f.js('document.querySelector(".billing-payment-choices").textContent'),/Card \/ PayPal/);assert.doesNotMatch(await f.js('document.querySelector(".billing-payment-layout").textContent'),/[\u3400-\u9fff]/);assert.equal(f.state.orders,0);
    await delay(200);fs.writeFileSync(path.join(evidence,'language-shortcut-'+modifier+'-en.png'),(await f.state.win.webContents.capturePage()).toPNG());
  });
  for(const code of ['ru','fa','ar','ja']) await run('发布关键：多语言付款与日历 '+code,{account:clone(billingAccount),cryptoOnly:true,lang:code,settings:{...settings(),app:{teamEnabled:false,lang:code}}},async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-pay-methods button:last-child")');await f.click('.billing-pay-methods button:last-child');await f.wait('!!document.querySelector(".billing-real-qr svg")');await billingHeaderAligned(f);assert.equal(f.state.orders,1);assert.equal(f.state.billingCalls.find(call=>call.action==='create-order').currency,'USD');assert.equal(await f.js('getComputedStyle(document.querySelector(".billing-crypto-address code")).direction'),'ltr');assert.equal(await f.js('getComputedStyle(document.querySelector(".billing-live-order h3")).textAlign'),'center');
    await delay(200);fs.writeFileSync(path.join(evidence,'payment-'+code+'.png'),(await f.state.win.webContents.capturePage()).toPNG());await f.click('.billing-close');await openBilling(f,true);await f.wait('!!document.querySelector(".billing-credit-record")');await f.click('.billing-date-trigger');await f.wait('!!document.querySelector(".billing-calendar")');
    const heading=await f.js('document.querySelector(".billing-calendar-heading b").textContent'),expected=await f.js('new Intl.DateTimeFormat('+JSON.stringify(code)+',{calendar:"gregory",year:"numeric",month:"long"}).format(new Date())');assert.equal(heading,expected);await billingHeaderAligned(f);
  });
  await run('发布关键：账单新版：英文付款和自动准备 Paddle 订单', {account:clone(billingAccount),lang:'en',settings:{...settings(),app:{teamEnabled:false,lang:'en'}}},async f=>{
    await f.click('.acct-btn');assert.deepEqual(await f.js('Array.from(document.querySelectorAll(".acct-items .acct-it")).slice(0,3).map(b=>({text:b.textContent.trim(),icon:!!b.querySelector("svg")}))'),[{text:'Coin details',icon:true},{text:'Upgrade−50%',icon:true},{text:'Settings',icon:true}]);assert.equal(await f.js('document.querySelector("[data-account-upgrade]").title'),'50% off yearly plans');await delay(180);fs.writeFileSync(path.join(evidence,'account-upgrade-en.png'),(await f.state.win.webContents.capturePage()).toPNG());await f.click('.acct-btn');
    await openBilling(f);await f.wait('document.querySelector(".billing-selector-option") && document.querySelector(".billing-plan-buy")?.disabled===false');
    await f.js('document.fonts.ready');await delay(200);fs.writeFileSync(path.join(evidence,'billing-selector-en.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await billingHeaderAligned(f);
    await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-pay-methods button")');await delay(150);fs.writeFileSync(path.join(evidence,'billing-methods-en.png'),(await f.state.win.webContents.capturePage()).toPNG());assert.equal(f.state.orders,0);await f.click('.billing-pay-methods button');await f.wait('!!document.querySelector(".billing-live-order")');assert.equal(f.state.externalURLs.length,1);
    assert.equal(f.state.orders,1);assert.equal(f.state.billingCalls.find(r=>r.action==='quote').currency,'USD');assert.equal(f.state.billingCalls.find(r=>r.action==='create-order').channel,'paddle');
    await delay(60);assert.equal(f.state.tracked.filter(x=>x.event==='upgrade_member_click').length,1);assert.equal(f.state.tracked.filter(x=>x.event==='billing_payment_method_select'&&x.props.channel==='paddle').length,1);assert.equal(f.state.tracked.filter(x=>x.event==='billing_checkout_open').length,1);
    await billingHeaderAligned(f);
    assert.doesNotMatch(await f.js('document.querySelector(".billing-panel").textContent'),/[\u3400-\u9fff]/);await delay(250);fs.writeFileSync(path.join(evidence,'billing-checkout-en.png'),(await f.state.win.webContents.capturePage()).toPNG());
  });
  await run('发布关键：账单新版：中文自动显示付款二维码且不重复下单', {account:clone(billingAccount)},async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-real-qr svg")');
    assert.equal(f.state.orders,1);await delay(200);fs.writeFileSync(path.join(evidence,'billing-qr-zh.png'),(await f.state.win.webContents.capturePage()).toPNG());assert.equal(f.state.billingCalls.find(r=>r.action==='create-order').currency,'CNY');assert.equal(f.state.tracked.filter(x=>x.event==='billing_payment_method_select'&&x.props.channel==='alipay'&&x.props.selection==='automatic').length,1);assert.equal(f.state.tracked.filter(x=>x.event==='billing_order_created').length,1);await uiLanguage(f,'en');await delay(250);assert.equal(f.state.orders,1);assert.match(await f.js('document.querySelector(".billing-live-order").textContent'),/Alipay/);
  });
  await run('发布关键：账单新版：英文加密付款自动显示地址和二维码', {account:clone(billingAccount),cryptoOnly:true,lang:'en',settings:{...settings(),app:{teamEnabled:false,lang:'en'}}},async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-pay-methods button:last-child")');await f.click('.billing-pay-methods button:last-child');await f.wait('!!document.querySelector(".billing-real-qr svg")');assert.equal(f.state.billingCalls.find(r=>r.action==='create-order').channel,'crypto');assert.equal(f.state.orders,1);
    for(const height of [760,920]){f.state.win.setContentSize(1200,height);await delay(80);await billingHeaderAligned(f);}await delay(50);assert.equal(f.state.tracked.filter(x=>x.event==='billing_payment_method_select'&&x.props.channel==='crypto').length,1);fs.writeFileSync(path.join(evidence,'billing-crypto-header-en.png'),(await f.state.win.webContents.capturePage()).toPNG());assert.ok(!JSON.stringify(f.state.tracked).includes('checkoutUrl'));assert.ok(!JSON.stringify(f.state.tracked).includes('receivingAddress'));
  });
  await run('发布关键：账单新版：付款失败可重试且复用订单幂等键', {account:clone(billingAccount),createError:true},async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-error") && !document.querySelector(".billing-checkout .billing-primary").disabled');f.state.createError=false;await f.click('.billing-checkout .billing-primary');await f.wait('!!document.querySelector(".billing-live-order")');const reqs=f.state.billingCalls.filter(r=>r.action==='create-order');assert.equal(reqs.length,2);assert.equal(reqs[0].requestId,reqs[1].requestId);assert.equal(f.state.orders,1);
  });
  await run('发布关键：账单新版：报价失败解除加载可再次购买', {account:clone(billingAccount),quoteError:true},async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-error") && document.querySelector(".billing-plan-buy")?.disabled===false');f.state.quoteError=false;await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-live-order")');assert.equal(f.state.orders,1);
  });
  await run('发布关键：账单新版：加载付款目录不阻止免费体验', {account:clone(billingAccount),billingDelay:1500},async f=>{
    await openBilling(f);await f.click('.billing-selector-free button');await f.wait('!!document.querySelector(".billing-subdialog")');assert.equal(await f.js('document.querySelector(".billing-subdialog .billing-primary").disabled'),false);await f.click('.billing-subdialog .billing-primary');await f.wait('!document.querySelector(".billing-panel")');assert.equal(f.state.orders,0);
  });
  await run('发布关键：账单新版：明细三位小数24小时分页和多语言日历', {account:clone(billingAccount),lang:'en',settings:{...settings(),app:{teamEnabled:false,lang:'en'}}},async f=>{
    await openBilling(f,true);await f.wait('!!document.querySelector(".billing-credit-record")');const text=await f.js('document.querySelector(".billing-ledger").textContent');assert.match(text,/1,578\.363/);assert.match(text,/-0\.03/);assert.doesNotMatch(text,/AM|PM|[\u3400-\u9fff]/);assert.match(text,/101 records · 3 pages/);assert.match(text,/Continuation after tool execution/);
    await f.click('.billing-date-trigger');await f.wait('!!document.querySelector(".billing-calendar")');assert.doesNotMatch(await f.js('document.querySelector(".billing-calendar").textContent'),/[\u3400-\u9fff]/);assert.match(await f.js('document.querySelector(".billing-calendar").textContent'),/Today/);await uiLanguage(f,'zh');await f.wait('document.querySelector(".billing-calendar")?.textContent.includes("今天")');await uiLanguage(f,'en');await f.click('.billing-calendar-actions button');
    await f.click('.billing-pagination button[aria-label="Page 3"]');await f.wait('document.querySelector(".billing-pagination [aria-current=page]")?.textContent==="3"');await f.wait('document.querySelector(".billing-credit-record")?.textContent.includes("Wuwei hosted")');assert.equal(f.state.billingCalls.filter(r=>r.action==='ledger').at(-1).offset,100);
    await delay(250);fs.writeFileSync(path.join(evidence,'billing-ledger-en.png'),(await f.state.win.webContents.capturePage()).toPNG());
  });
  await run('发布关键：账单新版：模型检测分类与每页条数组合筛选', {account:clone(billingAccount),lang:'en',settings:{...settings(),app:{teamEnabled:false,lang:'en'}}},async f=>{
    await openBilling(f,true);await f.wait('!!document.querySelector(".billing-page-size select")');
    assert.deepEqual(await f.js('Array.from(document.querySelector(".billing-page-size select").options).map(o=>Number(o.value))'),[10,20,50,100,200,500]);
    for(const limit of [10,20,100,200,500,50]){
      await f.js(`(()=>{const s=document.querySelector('.billing-page-size select');s.value='${limit}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await f.wait(`!!document.querySelector('.billing-credit-record') && document.querySelector('.billing-page-total')?.textContent.includes('${Math.ceil(101/limit)} pages')`);
      const last=f.state.billingCalls.filter(r=>r.action==='ledger').at(-1);assert.equal(last.limit,limit);assert.equal(last.offset,0);
    }
    await f.click('.billing-pagination button[aria-label="Page 3"]');await f.wait('document.querySelector(".billing-pagination [aria-current=page]")?.textContent==="3"');
    await f.js(`(()=>{const s=document.querySelector('.billing-page-size select');s.value='10';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await f.wait('document.querySelector(".billing-pagination [aria-current=page]")?.textContent==="1" && !!document.querySelector(".billing-credit-record")');
    await f.js(`(()=>{const s=document.querySelector('.billing-filters select');s.value='model_check';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await f.wait('document.querySelector(".billing-type")?.textContent==="Model checks"');assert.equal(f.state.billingCalls.filter(r=>r.action==='ledger').at(-1).type,'model_check');
    await uiLanguage(f,'zh');await f.wait('document.querySelector(".billing-page-size")?.textContent.includes("每页条数")');
    await delay(200);fs.writeFileSync(path.join(evidence,'billing-checks-page-size-zh.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await f.js(`(()=>{const s=document.querySelector('.billing-filters select');s.value='spend';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await f.wait('document.querySelector(".billing-type")?.textContent==="消费"');assert.equal(f.state.billingCalls.filter(r=>r.action==='ledger').at(-1).limit,10);
  });
  await run('发布关键：账单新版：套餐比较一屏显示并展示不同厂商', {account:clone(billingAccount)},async f=>{
    f.state.win.setContentSize(1200,735);await openBilling(f);await f.wait('!!document.querySelector(".billing-selector-option")');await f.click('.billing-top button:first-child');await f.wait('document.querySelectorAll(".billing-plan-card").length===3');
    await f.js('document.fonts.ready');await delay(250);fs.writeFileSync(path.join(evidence,'billing-comparison-zh.png'),(await f.state.win.webContents.capturePage()).toPNG());
    const layout=await f.js('({viewport:innerHeight,scroll:document.querySelector(".billing-panel").scrollHeight,client:document.querySelector(".billing-panel").clientHeight})');assert.ok(layout.scroll<=layout.client+2,JSON.stringify(layout));assert.equal(await f.js('document.querySelectorAll(".billing-card-benefits").length'),0);
  });

  await run('发布关键：账单新版：网页和加密支付可切换，切回复用待付款订单', {account:clone(billingAccount),lang:'en',settings:{...settings(),app:{teamEnabled:false,lang:'en'}}},async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-pay-methods button")');await f.click('.billing-pay-methods button');await f.wait('!!document.querySelector(".billing-live-order")');assert.equal(f.state.orders,1);
    await f.click('.billing-pay-methods button:last-child');await f.wait('!!document.querySelector(".billing-real-qr svg")');assert.equal(f.state.orders,2);
    await f.click('.billing-pay-methods button:first-child');await f.wait('document.querySelector(".billing-live-order")?.textContent.includes("Card / PayPal")');assert.equal(f.state.orders,2);assert.equal(f.state.externalURLs.length,2);
  });
  await run('发布关键：账单新版：完成付款后再次购买可新建订单', {account:clone(billingAccount)},async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-real-qr svg")');f.state.billingPaid=true;await f.click('.billing-live-order .billing-secondary');await f.wait('!!document.querySelector(".billing-paid-symbol")');assert.equal(await f.js('Array.from(document.querySelectorAll(".billing-pay-methods button")).every(button=>button.disabled)'),true);f.state.billingPaid=false;
    await f.click('.billing-top button:first-child');await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-real-qr svg")');assert.equal(f.state.orders,2);const ids=f.state.billingCalls.filter(r=>r.action==='create-order').map(r=>r.requestId);assert.notEqual(ids[0],ids[1]);
  });
  await run('发布关键：账单新版：关闭后迟到的报价不创建订单或重开付款页', {account:clone(billingAccount),quoteDelay:900},async f=>{
    await openBilling(f);await f.wait('document.querySelector(".billing-plan-buy")?.disabled===false');await f.click('.billing-plan-buy');await f.click('.billing-close');await delay(1050);assert.equal(await f.js('!!document.querySelector(".billing-panel")'),false);assert.equal(f.state.orders,0);
  });

  for(const lang of ['zh','en','fa','ar'])await run('发布关键：默认月付Plus、切换年付原价和实际金额 '+lang,{account:clone(billingAccount),lang,settings:{...settings(),app:{teamEnabled:false,lang}},modelCatalog:JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/billing-full-model-catalog.json'),'utf8')),imageCatalog:[{sku_id:'gpt_image_1_low',model:'gpt-image-1',quality:'low',coins_per_image:8},{sku_id:'gpt_image_2_medium',model:'gpt-image-2',quality:'medium',coins_per_image:36},{sku_id:'nano_banana_2',model:'google/gemini-3.1-flash-image-preview',quality:'default',coins_per_image:46}]},async f=>{
    await openBilling(f,false,null);await f.wait('document.querySelectorAll(".billing-selector-option").length===3');
    assert.equal(await f.js('document.querySelector("[data-period=monthly]").getAttribute("aria-selected")'),'true');
    assert.equal(await f.js('document.querySelector(".billing-selector-option.selected").dataset.sku'),'v2_plan_plus_monthly');
    assert.equal(await f.js('document.querySelector(".billing-selector-credits strong").textContent'),new Intl.NumberFormat(lang,{maximumFractionDigits:3}).format(10000));
    assert.equal(await f.js('document.querySelector(".billing-selector-option.selected .billing-selector-price strong").textContent'),await f.js(`new Intl.NumberFormat(${JSON.stringify(lang)},{style:'currency',currency:${JSON.stringify(lang==='zh'?'CNY':'USD')},maximumFractionDigits:0}).format(${lang==='zh'?268:40})`));
    assert.equal(f.state.orders,0);
    await f.js('document.fonts.ready');fs.writeFileSync(path.join(evidence,`default-monthly-plus-${lang}.png`),await captureBillingFrame(f));
    await f.click('[data-period=annual]');
    assert.equal(await f.js('document.querySelector("[data-period=annual]").getAttribute("aria-selected")'),'true');
    assert.match(await f.js('document.querySelector(".billing-selector-option.selected .billing-selector-name b").textContent'),/Plus/);
    const monthly=lang==='zh'?[13400,26800,53600]:[2000,4000,8000],annual=lang==='zh'?[80400,160800,321600]:[12000,24000,48000];
    const format=async amount=>f.js(`new Intl.NumberFormat(${JSON.stringify(lang)},{style:'currency',currency:${JSON.stringify(lang==='zh'?'CNY':'USD')},maximumFractionDigits:0}).format(${amount}/100)`);
    const displayed=await f.js(`Array.from(document.querySelectorAll('.billing-selector-option')).map(e=>({oldMonth:e.querySelector('.billing-original-monthly').textContent,oldYear:e.querySelector('.billing-original-annual').textContent,month:e.querySelector('.billing-selector-price strong').textContent,year:e.querySelector('.billing-current-annual').textContent,lines:Array.from(e.querySelectorAll('del')).map(d=>getComputedStyle(d).textDecorationLine)}))`);
    for(const [index,row] of displayed.entries()){assert.equal(row.oldMonth,await format(monthly[index]));assert.equal(row.oldYear,await format(monthly[index]*12));assert.equal(row.month,await format(annual[index]/12));assert.equal(row.year,await format(annual[index]));assert.ok(row.lines.every(line=>line.includes('line-through')));}
    for(const width of [1200,1000,840]){
      f.state.win.setContentSize(width,800);await delay(100);
      const geometry=await f.js(`(()=>{const boxes=Array.from(document.querySelectorAll('.billing-selector-option')).map(e=>{const r=e.getBoundingClientRect(),p=e.querySelector('.billing-selector-price').getBoundingClientRect();return{inside:p.left>=r.left&&p.right<=r.right+1,overflow:e.scrollWidth>e.clientWidth+1}});const pay=document.querySelector('.billing-plan-buy').getBoundingClientRect();return{boxes,payBottom:pay.bottom,height:innerHeight}})()`);
      assert.ok(geometry.boxes.every(box=>box.inside&&!box.overflow),lang+width+JSON.stringify(geometry));assert.ok(geometry.payBottom<geometry.height,lang+width+JSON.stringify(geometry));await f.js('document.fonts.ready');fs.writeFileSync(path.join(evidence,`annual-prices-${lang}-${width}.png`),await captureBillingFrame(f));
    }
    f.state.win.setContentSize(1200,800);await delay(70);await f.click('.billing-top button:first-child');await f.wait('document.querySelectorAll(".billing-plan-card").length===3');assert.equal(await f.js('document.querySelectorAll(".billing-plan-card del").length'),6);await delay(150);fs.writeFileSync(path.join(evidence,`annual-comparison-${lang}.png`),await captureBillingFrame(f));
    await f.click('.billing-plans-periods button:first-child');assert.equal(await f.js('document.querySelectorAll(".billing-plan-card del").length'),0);await f.click('.billing-plans-periods button:nth-child(3)');assert.equal(await f.js('document.querySelectorAll(".billing-plan-card del").length'),0);
    await f.click('.billing-plans-periods button:nth-child(2)');await f.wait('document.querySelectorAll(".billing-plan-card").length===3');await f.click('.billing-plan-card[data-sku="v2_plan_pro_annual"] .billing-plan-buy');await f.wait(lang==='zh'?'!!document.querySelector(".billing-real-qr svg")':'!!document.querySelector(".billing-pay-methods button")');if(lang!=='zh'){await f.click('.billing-pay-methods button');await f.wait('!!document.querySelector(".billing-live-order")');}
    const request=f.state.billingCalls.filter(call=>call.action==='create-order').at(-1);assert.equal(request.sku,'v2_plan_pro_annual');assert.equal(request.expected.amountMinor,annual[0]);assert.equal(request.expected.creditsPerGrant,4000);assert.equal(f.state.orders,1);
  });

  for(const lang of ['zh','en'])for(const member of [false,true])await run('发布关键：币包额度翻倍、单行到账说明和付款报价 '+lang+' '+(member?'member':'standard'),{account:clone(billingAccount),billingMember:member,lang,settings:{...settings(),app:{teamEnabled:false,lang}},modelCatalog:JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/billing-full-model-catalog.json'),'utf8')),imageCatalog:[{sku_id:'gpt_image_1_low',model:'gpt-image-1',quality:'low',coins_per_image:8},{sku_id:'gpt_image_2_medium',model:'gpt-image-2',quality:'medium',coins_per_image:36},{sku_id:'nano_banana_2',model:'google/gemini-3.1-flash-image-preview',quality:'default',coins_per_image:46}]} ,async f=>{
    await openBilling(f);await f.click('.billing-selector-periods button:nth-child(3)');await f.wait('document.querySelectorAll(".billing-selector-option").length===4');
    const expected=[3000,6000,10000,16000];
    for(const width of [1200,1000,840]){
      f.state.win.setContentSize(width,800);await delay(100);
      const g=await f.js(`Array.from(document.querySelectorAll('.billing-selector-option')).map(el=>{const n=el.querySelector('.billing-selector-name small'),name=el.querySelector('.billing-selector-name b'),r=n.getBoundingClientRect(),card=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);const text=range.getBoundingClientRect();return {title:name.textContent,text:n.textContent,height:text.height,line:parseFloat(getComputedStyle(n).lineHeight),inside:text.left>=card.left&&text.right<=card.right+1,whiteSpace:getComputedStyle(n).whiteSpace}})`);
      assert.equal(g.length,4);for(const [index,row] of g.entries()){assert.ok(row.inside,lang+width+JSON.stringify(row));if(lang==='zh'){assert.equal(row.text,new Intl.NumberFormat('en-US').format(expected[index]*(member?1.5:1))+' 币到账');assert.equal(row.whiteSpace,'nowrap');assert.ok(row.height<=row.line+1,JSON.stringify(row));}}
      await f.js('document.fonts.ready');fs.writeFileSync(path.join(evidence,`coin-packs-${lang}-${member?'member':'standard'}-${width}.png`),await captureBillingFrame(f));
    }
    f.state.win.setContentSize(1200,800);await delay(70);
    for(const [index,credits] of expected.entries()){
      await f.click('.billing-selector-option:nth-child('+(index+1)+')');assert.equal(await f.js('document.querySelector(".billing-selector-credits strong").textContent'),new Intl.NumberFormat('en-US').format(credits*(member?1.5:1)));
      assert.equal(await f.js('document.querySelectorAll(".billing-usage-metric").length'),3);assert.ok((await f.js("document.querySelector('.billing-usage-metric[data-usage-kind=images]').textContent")).includes(new Intl.NumberFormat(lang).format(Math.floor(credits*(member?1.5:1)/8))));
      await f.click('.billing-plan-buy');await f.wait(lang==='zh'?'!!document.querySelector(".billing-real-qr svg")':'!!document.querySelector(".billing-pay-methods button")');if(lang!=='zh'){await f.click('.billing-pay-methods button');await f.wait('!!document.querySelector(".billing-live-order")');}
      const req=f.state.billingCalls.filter(call=>call.action==='create-order').at(-1);assert.equal(req.expected.creditsPerGrant,credits*(member?1.5:1));assert.equal(req.expected.amountMinor,(lang==='zh'?[20000,33400,46800,66900]:[2990,4990,6990,9990])[index]);assert.equal(req.sku,['v2_pack_1500','v2_pack_3000','v2_pack_5000','v2_pack_8000'][index]);await f.click('.billing-top button:first-child');await f.wait('document.querySelectorAll(".billing-selector-option").length===4');
    }
    assert.equal(f.state.orders,4);
  });

  await run('发布关键：账单新版：切换月付年付积分包，按选中套餐准确报价', {account:clone(billingAccount)},async f=>{
    await openBilling(f);await f.wait('document.querySelectorAll(".billing-selector-option").length===3');await f.click('.billing-selector-periods button:nth-child(2)');await f.wait('document.querySelector(".billing-selector-option")?.textContent.includes("67")');await f.click('.billing-selector-option:last-child');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-real-qr svg")');let req=f.state.billingCalls.filter(r=>r.action==='create-order').at(-1);assert.equal(req.sku,'v2_plan_max_annual');assert.equal(req.expected.amountMinor,321600);assert.equal(req.expected.creditsPerGrant,20000);
    await f.click('.billing-top button:first-child');await f.click('.billing-selector-periods button:nth-child(3)');await f.wait('document.querySelectorAll(".billing-selector-option").length===4');await f.click('.billing-selector-option:nth-child(2)');await f.click('.billing-plan-buy');await f.wait('!!document.querySelector(".billing-real-qr svg")');req=f.state.billingCalls.filter(r=>r.action==='create-order').at(-1);assert.equal(req.sku,'v2_pack_3000');assert.equal(req.expected.amountMinor,33400);assert.equal(req.expected.creditsPerGrant,6000);
  });
  await run('多语言：已打开额度登录卡和历史系统提示同步切换', {account:null,settings:settings('wuwei-free','glm-4.7-flash'),nextError:'[[gw:free_daily_cap_reached]] 今日免费额度已用完：明日自动恢复，登录可解锁更高额度。'}, async f=>{
    await f.send();await f.wait('!!document.querySelector(".login-intro-reason")');
    assert.match(await f.js('document.querySelector(".login-intro-reason").textContent'),/今日/);
    await changeLanguage(f,'en');await f.wait('document.querySelector(".login-intro-reason")?.textContent.includes("Guest free quota")');
    assert.doesNotMatch(await f.js('Array.from(document.querySelectorAll(".notice,.login-intro-reason")).map(n=>n.textContent).join(" ")'),/[\u3400-\u9fff]/);
    await delay(250);fs.writeFileSync(path.join(evidence,'language-quota-en.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await changeLanguage(f,'zh');await f.wait('document.querySelector(".login-intro-reason")?.textContent.includes("今日")');
    await changeLanguage(f,'en');await f.click('.language-switcher + button');
    emit(f.state,'evt:error',{sid:'qa-session',message:'[[gw:anon_login_required]] 该模型登录后免费使用'});
    await f.wait('!!document.querySelector("input[type=password]")');
    assert.doesNotMatch(await f.js('Array.from(document.querySelectorAll(".notice,.login-intro-reason")).map(n=>n.textContent).join(" ")'),/[\u3400-\u9fff]/);
  });
  await run('多语言：英文首次启动免费额度错误和登录表单无中文', {lang:'en',account:null,settings:settings('wuwei-free','glm-4.7-flash'),nextError:'[[gw:free_daily_cap_reached]] 今日免费额度已用完'},async f=>{
    await f.send();await f.wait('!!document.querySelector(".login-intro-reason")');
    assert.doesNotMatch(await f.js('(()=>{const n=document.querySelector(".login-intro-reason").parentElement.cloneNode(true);n.querySelectorAll("select").forEach(s=>s.remove());return n.textContent;})()'),/[\u3400-\u9fff]/);
    await f.js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Sign in")?.click()');
    await f.wait('!!document.querySelector("input[type=password]")');
    assert.doesNotMatch(await f.js('(()=>{const n=document.querySelector("input[type=password]").closest("form")?.cloneNode(true);n?.querySelectorAll("select").forEach(s=>s.remove());return n?.textContent||"";})()'),/[\u3400-\u9fff]/);
    await changeLanguage(f,'zh');await f.wait('document.querySelector("input[type=password]")?.placeholder.includes("密码")');
  });
  await run('多语言：英文模型选择和支付页面无中文系统文案', {lang:'en',account:account(0),nextError:'[[gw:free_daily_cap_reached]] exhausted'},async f=>{
    await f.click('.mq-select');await f.wait('!!document.querySelector(".model-picker")');
    assert.doesNotMatch(await f.js('document.querySelector(".model-picker").textContent'),/[\u3400-\u9fff]/);
    await f.click('.model-picker-header button');await f.send();await f.wait('!!document.querySelector(".trial-plans")');
    assert.doesNotMatch(await f.js('document.querySelector(".pay-card").textContent'),/[\u3400-\u9fff]/);
    await uiLanguage(f,'zh');await f.wait('document.querySelector(".pay-card")?.textContent.includes("支付")');
    await uiLanguage(f,'en');await f.wait('document.querySelector(".pay-card")?.textContent.includes("Pay")');
    assert.doesNotMatch(await f.js('document.querySelector(".pay-card").textContent'),/[\u3400-\u9fff]/);
    await delay(250);fs.writeFileSync(path.join(evidence,'language-payment-en.png'),(await f.state.win.webContents.capturePage()).toPNG());
  });


  await run('多语言：设置所有页面和帮助所有章节英文检查', {lang:'en',allToolMessages:true,account:null,settings:settings('wuwei-free','glm-4.7-flash')},async f=>{
    const systemText=selector=>`(()=>{const n=document.querySelector(${JSON.stringify(selector)}).cloneNode(true);n.querySelectorAll('textarea,input,option,select,[data-language-name]').forEach(x=>x.remove());return n.textContent;})()`;
    await f.click('.mq-select');await f.click('.model-picker footer button');await f.wait('!!document.querySelector(".settings")');
    const tabs=await f.js('document.querySelectorAll(".set-tabs button").length');
    for(let i=0;i<tabs;i++){
      await f.js(`document.querySelectorAll('.set-tabs button')[${i}].click()`);await delay(80);
      const name=await f.js('document.querySelector(".set-tabs button.on").textContent');
      assert.doesNotMatch(await f.js(systemText('.settings')),/[\u3400-\u9fff]/,'Settings tab: '+name);
    }
    await uiLanguage(f,'zh');await delay(100);assert.match(await f.js('document.querySelector(".set-side-title").textContent'),/设置/);
    await uiLanguage(f,'en');await delay(100);await f.click('.set-win-btn:last-child');await f.wait('!document.querySelector(".settings")');
    await f.click('.acct-btn');await f.js('Array.from(document.querySelectorAll(".acct-it")).find(b=>b.textContent.trim()==="User Guide")?.click()');await f.wait('!!document.querySelector(".guide-modal")');
    const sections=await f.js('document.querySelectorAll(".guide-nav__it").length');
    for(let i=0;i<sections;i++){
      await f.js(`document.querySelectorAll('.guide-nav__it')[${i}].click()`);await delay(50);
      assert.doesNotMatch(await f.js(systemText('.guide-modal')),/[\u3400-\u9fff]/,'Help section '+i);
    }
    await uiLanguage(f,'zh');await delay(100);assert.match(await f.js('document.querySelector(".guide-modal").textContent'),/使用手册/);
    await uiLanguage(f,'en');await delay(250);assert.doesNotMatch(await f.js(systemText('.guide-modal')),/[\u3400-\u9fff]/);
    fs.writeFileSync(path.join(evidence,'language-help-en.png'),(await f.state.win.webContents.capturePage()).toPNG());
  });

  await run('多语言：中文服务端登录错误映射为英文且已显示错误随语言切换', {lang:'en',account:null,settings:settings('wuwei-free','glm-4.7-flash'),loginError:'邮箱或密码错误'}, async f=>{
    await f.click('.mq-select');await f.click('[data-model-key="wuwei-free/nemotron-super-free"]');await f.wait('!!document.querySelector("input[type=password]")');
    await f.fill('input[placeholder="Email"]','language-test@example.invalid');await f.fill('input[type=password]','isolated-test-password');
    await f.js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Sign in"&&!b.disabled)?.click()');
    await f.wait('document.body.textContent.includes("Wrong email or password")');
    await changeLanguage(f,'zh');await f.wait('!document.body.textContent.includes("Wrong email or password")');
    await changeLanguage(f,'en');await f.wait('document.body.textContent.includes("Wrong email or password")');
    assert.equal(f.state.orders,0);
  });
  await run('工具权限：默认自动允许 bash，跨会话也不弹窗',{},async f=>{
    for(const sid of ['qa-session','qa-background-session']) emit(f.state,'evt:permission-request',{id:sid==='qa-session'?901:902,name:'bash',input:{command:'echo isolated-fixture'},sid});
    await delay(150);
    assert.deepEqual(f.state.permissionReplies,[[901,'allow'],[902,'allow']]);
    assert.equal(await f.js('!!document.querySelector(".perm-overlay,.perm-card")'),false);
    assert.equal(f.state.sent.length,0);
  });
  await run('工具权限：新版普通工具确认自动放行',{},async f=>{
    emit(f.state,'evt:decision-request',{permId:'qa-local-tool',risk:'high',title:'允许执行 powershell？',question:'fixture',options:[{label:'允许',value:'allow'}],toolPermission:{name:'powershell',sid:'qa-session'}});
    await delay(150);assert.deepEqual(f.state.decisionReplies,[['qa-local-tool',{action:'allow'}]]);
    assert.equal(await f.js('!!document.querySelector(".tool-decision-mask")'),false);
    assert.equal(f.state.sent.length,0);
  });
  for(const loginFirst of [false,true])await run('发布关键：公告覆盖登录、保留输入与关闭后恢复 '+(loginFirst?'login-first':'announcement-first'),{announcement:JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/announcement-current.json'),'utf8')),announcementDelay:loginFirst?1200:0},async f=>{
    if(!loginFirst)await f.wait('!!document.querySelector(".announce-dialog")');
    f.state.account=null;emit(f.state,'evt:wuwei-auth-expired');
    await f.wait('!!document.querySelector(".session-expired-notice")');
    if(loginFirst){await f.fill('.wuwei-login-layer input:not([type=password])','layer-test@example.invalid');await f.fill('.wuwei-login-layer input[type=password]','isolated-fixture');}
    await f.wait('!!document.querySelector(".announce-dialog")');
    await f.wait('document.querySelector(".wuwei-login-layer")?.inert===true');
    assert.equal(await f.js('(()=>{const input=document.querySelector(".wuwei-login-layer input[type=password]"),r=input.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!top?.closest(".announce-dialog")})()'),true);
    await f.js('document.querySelector(".announce-primary").focus()');
    f.state.win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});f.state.win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await delay(50);
    assert.equal(await f.js('!!document.activeElement.closest(".announce-dialog")'),true);
    await f.js('document.fonts.ready');fs.writeFileSync(path.join(evidence,'announcement-above-login-'+(loginFirst?'login-first':'announcement-first')+'.png'),await captureBillingFrame(f));
    await f.click(loginFirst?'.announce-primary':'.announce-close');await f.wait('!document.querySelector(".announce-dialog")');
    await f.wait('document.querySelector(".wuwei-login-layer")?.inert===false && !!document.activeElement.closest(".wuwei-login-layer")');
    assert.equal(await f.js('!!document.querySelector(".session-expired-notice")'),true);
    if(loginFirst){assert.equal(await f.js('document.querySelector(".wuwei-login-layer input:not([type=password])").value'),'layer-test@example.invalid');assert.equal(await f.js('document.querySelector(".wuwei-login-layer input[type=password]").value'),'isolated-fixture');}
    assert.equal(f.state.orders,0);assert.equal(f.state.sent.length,0);
  });
  await run('登录恢复：失效事件清理旧账号并只弹出一次登录框',{},async f=>{
    f.state.account=null;
    emit(f.state,'evt:wuwei-auth-expired');
    await f.wait('!!document.querySelector(".session-expired-notice") && !!document.querySelector("input[type=password]")');
    assert.equal(await f.js('document.querySelector(".session-expired-notice").textContent.includes("登录已失效")'),true);
    await delay(180); // Let Chromium paint the newly mounted modal before capture.
    fs.writeFileSync(path.join(evidence,'session-expired-login-final.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await f.js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='×'&&b.closest('div')?.querySelector('input[type=password]'))?.click()`);
    await f.wait('!document.querySelector("input[type=password]")');
    emit(f.state,'evt:wuwei-auth-expired');await delay(150);
    assert.equal(await f.js('!!document.querySelector("input[type=password]")'),false);
  });
  await run('登录恢复：余额刷新遇到网络错误保留账号且不弹登录框',{},async f=>{
    f.state.meError='temporary network failure';
    await f.js(`[...document.querySelectorAll('button')].find(b=>b.className.includes('acct')&&!b.className.includes('refresh'))?.click()`);
    await f.wait('!!document.querySelector(".acct-balance-refresh-error")');
    assert.equal(await f.js('!!document.querySelector("input[type=password]")'),false);
    assert.equal(await f.js('document.body.textContent.includes("QA 隔离用户")'),true);
    f.state.meError=null;await f.click('.acct-balance-refresh');await f.wait('!document.querySelector(".acct-balance-refresh-error")');
  });
  await run('登录恢复：旧界面缓存仍显示账号但凭证已丢失时要求重登',{},async f=>{
    f.state.account=null;
    await f.js(`[...document.querySelectorAll('button')].find(b=>b.className.includes('acct')&&!b.className.includes('refresh'))?.click()`);
    await f.wait('!!document.querySelector(".session-expired-notice") && !!document.querySelector("input[type=password]")');
    assert.equal(f.state.orders,0);
  });
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
  await run('员工模型配置复用统一选择与顶级确认，确认前不写入员工草稿', {developmentOnly:true}, async f => {
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
  await run('顶级确认期间价格变化须重新确认，下架时撤销确认且不选择模型', {developmentOnly:true}, async f => {
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
  for(const lang of ['zh','en']) await run('发布关键：后台并行：套餐展示与排队 '+lang,{account:clone(billingAccount),lang,settings:{...settings(),app:{teamEnabled:false,lang}},modelCatalog:JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/billing-full-model-catalog.json'),'utf8')),backgroundPolicy:{enabled:true,version:'qa-background-v1',free:1,plans:{Pro:2,Plus:4,Max:8}}},async f=>{
    await openBilling(f,false,null);
    await f.wait('!!document.querySelector(".billing-background-feature")');
    assert.match(await f.js('document.querySelector(".billing-background-feature").textContent'),/4/);
    await f.click('[data-period=annual]');
    assert.match(await f.js('document.querySelector(".billing-background-feature").textContent'),/4/);
    await f.click('[data-sku="v2_plan_pro_annual"]');
    await f.wait('document.querySelector(".billing-background-feature")?.textContent.includes("2")');
    await f.click('[data-sku="v2_plan_max_annual"]');
    await f.wait('document.querySelector(".billing-background-feature")?.textContent.includes("8")');
    f.state.win.setContentSize(1200,800);await f.js('document.fonts.ready');
    fs.writeFileSync(path.join(evidence,'background-selector-'+lang+'.png'),await captureBillingFrame(f));
    await f.click('.billing-top button:first-child');await f.wait('document.querySelectorAll(".billing-plan-card").length===3');
    assert.deepEqual(await f.js('Array.from(document.querySelectorAll(".billing-background-feature")).map(e=>Number(e.textContent.match(/\\d+/)[0]))'),[2,4,8]);
    assert.match(await f.js('document.querySelector(".billing-plans-free").textContent'),/1/);
    for(const width of [1200,840]){
      f.state.win.setContentSize(width,800);await delay(80);
      const boxes=await f.js('Array.from(document.querySelectorAll(".billing-background-feature")).map(e=>({inside:e.getBoundingClientRect().right<=innerWidth,overflow:e.scrollWidth>e.clientWidth+2}))');
      assert.ok(boxes.every(b=>b.inside&&!b.overflow),JSON.stringify(boxes));
      fs.writeFileSync(path.join(evidence,'background-cards-'+lang+'-'+width+'.png'),await captureBillingFrame(f));
    }
    await f.click('.billing-top button:last-child');await f.wait('!document.querySelector(".billing-panel")');
    f.state.win.setContentSize(1200,800);await delay(100);
    fs.writeFileSync(path.join(evidence,'background-client-base-'+lang+'.png'),await captureBillingFrame(f));
    emit(f.state,'evt:background-queue',{taskId:'qa-waiting',sid:'qa-session',accountId:'qa-account',queued:true,limit:1,tier:'free'});
    await f.wait('document.querySelector(".foot-status")?.textContent.includes('+JSON.stringify(lang==='zh'?'任务排队中':'Task queued')+')');
    emit(f.state,'evt:background-queue',{taskId:'qa-waiting',sid:'qa-session',accountId:'qa-account',queued:false,limit:1,tier:'free'});
    await f.wait('!document.querySelector(".foot-status")?.textContent.includes('+JSON.stringify(lang==='zh'?'任务排队中':'Task queued')+')');
    assert.equal(f.state.orders,0);
  });
  await run('发布关键：后台并行：关闭的服务端策略不提前承诺权益',{account:clone(billingAccount),backgroundPolicy:{enabled:false,version:'qa-background-v1',free:1,plans:{Pro:2,Plus:4,Max:8}}},async f=>{
    await openBilling(f,false,null);assert.equal(await f.js('!!document.querySelector(".billing-background-feature")'),false);
    await f.click('.billing-top button:first-child');await f.wait('document.querySelectorAll(".billing-plan-card").length===3');
    assert.equal(await f.js('!!document.querySelector(".billing-background-feature")'),false);assert.equal(f.state.orders,0);
  });
  for(const lang of ['zh','en','fa','ar']) await run('发布关键：并行提示：等级上限、套餐入口、输入保留与自动收起 '+lang,{account:clone(billingAccount),lang,settings:{...settings(),app:{teamEnabled:false,lang}},backgroundPolicy:{enabled:true,version:'qa-background-v1',free:1,plans:{Pro:2,Plus:4,Max:8}}},async f=>{
    await f.fill('.composer textarea','保留这段尚未发送的工作要求');
    for(const [tier,limit] of [['free',1],['pro',2],['plus',4]]){
      const event={taskId:'notice-'+tier,sid:'qa-session',accountId:'qa-account',queued:true,limit,tier};
      emit(f.state,'evt:background-queue',event);
      await f.wait('document.querySelector(".background-queue-notice")?.dataset.tier==='+JSON.stringify(tier));
      assert.match(await f.js('document.querySelector(".background-queue-copy strong").textContent'),new RegExp(String(limit)));
      for(let i=0;i<3;i++)emit(f.state,'evt:background-queue',event);
      await delay(50);
      assert.equal((f.state.tracked??[]).filter(e=>e.event==='background_queue_notice_shown'&&e.props.tier===tier).length,1);
      for(const width of [1200,840]){
        f.state.win.setContentSize(width,800);await delay(75);
        const box=await f.js('(()=>{const n=document.querySelector(".background-queue-notice"),b=n.getBoundingClientRect(),t=document.querySelector(".composer textarea").getBoundingClientRect();return {inside:b.left>=0&&b.right<=innerWidth,above:b.bottom<=t.top,overflow:n.scrollWidth>n.clientWidth+2}})()');
        assert.ok(box.inside&&box.above&&!box.overflow,JSON.stringify(box));
      }
      f.state.win.setContentSize(1200,800);await delay(60);
      if(tier==='free')fs.writeFileSync(path.join(evidence,'background-upgrade-notice-'+lang+'.png'),await captureBillingFrame(f));
      await f.click('.background-queue-action');await f.wait('!!document.querySelector(".billing-panel")');
      await f.wait('document.querySelector("[data-period=monthly]")?.getAttribute("aria-selected")=="true"');
      await f.wait('document.querySelector("[data-sku=v2_plan_plus_monthly]")?.getAttribute("aria-pressed")=="true"');
      assert.equal(await f.js('document.querySelector(".composer textarea").value'),'保留这段尚未发送的工作要求');
      assert.equal(await f.js('document.querySelector(".background-queue-notice")?.dataset.tier'),tier);
      if(tier==='free')fs.writeFileSync(path.join(evidence,'background-upgrade-open-plans-'+lang+'.png'),await captureBillingFrame(f));
      assert.equal(f.state.orders,0);await f.click('.billing-top .billing-close');await f.wait('!document.querySelector(".billing-panel")');
      emit(f.state,'evt:background-queue',{...event,queued:false});await f.wait('!document.querySelector(".background-queue-notice")');
      emit(f.state,'evt:background-queue',{...event,queued:false,finished:true});
    }
    emit(f.state,'evt:background-queue',{taskId:'localized-list',sid:'qa-session',accountId:'qa-account',queued:true,limit:8,tier:'max',label:'本地任务 / Task'});
    await f.wait('!!document.querySelector(".background-queue-action")');await f.click('.background-queue-action');await f.wait('!!document.querySelector(".task-center")');
    assert.equal(await f.js('getComputedStyle(document.querySelector(".task-center")).direction'),'ltr');
    assert.equal(await f.js('getComputedStyle(document.querySelector(".tp-title")).textAlign'),'left');
    assert.equal(await f.js('document.querySelector(".task-center").textContent.includes("background.tasks.")'),false);
    fs.writeFileSync(path.join(evidence,'background-task-panel-'+lang+'.png'),await captureBillingFrame(f));
    await f.click('.tp-close');emit(f.state,'evt:background-queue',{taskId:'localized-list',sid:'qa-session',accountId:'qa-account',queued:false,finished:true});
    assert.equal(f.state.sent.length,0);assert.equal(f.state.orders,0);
    assert.equal((f.state.tracked??[]).filter(e=>e.event==='background_queue_upgrade_click').length,3);
  });
  await run('发布关键：并行提示：Max查看真实任务且同会话多任务互不清除',{account:clone(billingAccount),backgroundTasks:[{taskId:'max-running',sid:'__room_worker',sourceSid:'qa-session',accountId:'qa-account',queued:false,limit:8,tier:'max',label:'整理客户访谈'},{taskId:'max-waiting',sid:'__room_worker',sourceSid:'qa-session',accountId:'qa-account',queued:true,limit:8,tier:'max',label:'分析竞品资料'}]},async f=>{
    await f.wait('document.querySelector(".background-queue-action")?.textContent.includes("查看任务")');
    await f.click('.background-queue-action');await f.wait('!!document.querySelector(".tasks-panel")');
    assert.match(await f.js('document.querySelector(".tasks-panel").textContent'),/分析竞品资料/);
    assert.equal(await f.js('!!document.querySelector(".billing-panel")'),false);assert.equal(f.state.orders,0);
    const taskPanelGeometry=()=>f.js('(()=>{const p=document.querySelector(".task-center"),r=p.getBoundingClientRect(),c=document.querySelector(".composer textarea").getBoundingClientRect();return {inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,clearInput:r.bottom<=c.top,groups:p.querySelectorAll(".tp-group").length};})()');
    for(const width of [1200,840]){
      f.state.win.setContentSize(width,800);await delay(100);
      const geometry=await taskPanelGeometry();assert.ok(geometry.inside&&geometry.clearInput);assert.equal(geometry.groups,2);
      if(width===840)fs.writeFileSync(path.join(evidence,'background-tasks-narrow.png'),await captureBillingFrame(f));
    }
    f.state.win.setContentSize(1200,800);await delay(100);
    fs.writeFileSync(path.join(evidence,'background-upgrade-max-tasks.png'),await captureBillingFrame(f));
    const panelRect=await f.js('(()=>{const r=document.querySelector(".task-center").getBoundingClientRect();return {x:Math.floor(r.x)-12,y:Math.floor(r.y)-12,width:Math.ceil(r.width)+24,height:Math.ceil(r.height)+24}})()');
    fs.writeFileSync(path.join(evidence,'background-tasks-detail.png'),(await f.state.win.webContents.capturePage(panelRect)).toPNG());
    await f.click('.tp-close');await f.wait('!document.querySelector(".tasks-panel")');
    assert.equal(await f.js('!!document.querySelector(".background-queue-notice")'),true);
    await f.click('.background-queue-action');await f.wait('!!document.querySelector(".tasks-panel")');
    await f.js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');await f.wait('!document.querySelector(".tasks-panel")');
    await f.click('.background-queue-action');await f.wait('!!document.querySelector(".tasks-panel")');
    for(let i=0;i<18;i++)emit(f.state,'evt:background-queue',{taskId:'long-queue-'+i,sid:'qa-session',accountId:'qa-account',queued:true,limit:8,tier:'max',label:'待处理资料 '+i});
    await delay(100);assert.ok((await taskPanelGeometry()).inside);
    assert.equal(await f.js('(()=>{const e=document.querySelector(".tp-groups");return e.scrollHeight>e.clientHeight})()'),true);
    for(let i=0;i<18;i++)emit(f.state,'evt:background-queue',{taskId:'long-queue-'+i,sid:'qa-session',accountId:'qa-account',queued:false,finished:true});
    await f.click('.mq-overlay');
    const second={taskId:'max-waiting-two',sid:'qa-session',accountId:'qa-account',queued:true,limit:8,tier:'max',label:'检查研究结果'};
    emit(f.state,'evt:background-queue',second);
    emit(f.state,'evt:background-queue',{taskId:'max-waiting',sid:'__room_worker',sourceSid:'qa-session',accountId:'qa-account',queued:false,finished:true});
    await delay(50);assert.equal(await f.js('!!document.querySelector(".background-queue-notice")'),true);
    emit(f.state,'evt:background-queue',{...second,queued:false,finished:true});await f.wait('!document.querySelector(".background-queue-notice")');
  });
  await run('发布关键：并行提示：迟到的快照不复活任务且切换账号不串提示',{account:clone(billingAccount),backgroundDelay:1200,backgroundTasks:[{taskId:'late',sid:'qa-session',accountId:'qa-account',queued:true,limit:2,tier:'pro'}]},async f=>{
    emit(f.state,'evt:background-queue',{taskId:'late',sid:'qa-session',accountId:'qa-account',queued:false,finished:true});
    await delay(1300);assert.equal(await f.js('!!document.querySelector(".background-queue-notice")'),false);
    emit(f.state,'evt:background-queue',{taskId:'owned',sid:'qa-session',accountId:'qa-account',queued:true,limit:2,tier:'pro'});
    await f.wait('!!document.querySelector(".background-queue-notice")');
    const other=clone(billingAccount);other.user.id='different-account';emit(f.state,'evt:wuwei-me',other);
    await f.wait('!document.querySelector(".background-queue-notice")');assert.equal(f.state.orders,0);
  });
  await run('发布关键：并行提示：游客升级先登录，登录后打开套餐并保留输入',{lang:'en',account:null,settings:{...settings(),app:{teamEnabled:false,lang:'en'}}},async f=>{
    await f.fill('.composer textarea','Keep my draft');
    emit(f.state,'evt:background-queue',{taskId:'guest-queued',sid:'qa-session',accountId:null,queued:true,limit:1,tier:'free'});
    await f.wait('!!document.querySelector(".background-queue-action")');await f.click('.background-queue-action');
    await f.wait('!!document.querySelector("input[type=password]")');assert.equal(f.state.orders,0);
    await f.fill('input[placeholder="Email"]','background-upgrade@example.invalid');await f.fill('input[type=password]','isolated-password');
    await f.js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Sign in"&&!b.disabled)?.click()');
    await f.wait('!!document.querySelector(".billing-panel")');assert.equal(f.state.orders,0);
    assert.equal(await f.js('document.querySelector(".composer textarea").value'),'Keep my draft');
  });
  await run('发布关键：并行提示：员工群聊使用真实任务入口和套餐页',{account:clone(billingAccount),settings:{...settings(),app:{teamEnabled:true,lang:'zh'}},teamEmployees:[{id:'worker',name:'研究助手',role:'Researcher',tools:[]}],teamRooms:[{id:'qa-room',type:'group',name:'并行验收群',members:['worker'],createdAt:Date.now(),updatedAt:Date.now()}],backgroundTasks:[{taskId:'room-queued',roomId:'qa-room',accountId:'qa-account',queued:true,limit:2,tier:'pro',label:'研究助手'}]},async f=>{
    await f.wait('!!document.querySelector(".fs-clickable")');await f.click('.fs-clickable');await f.wait('!!document.querySelector(".tasks-panel")');
    await f.click('[data-background-task="room-queued"] .tp-title');
    await f.wait('!!document.querySelector(".tc-room-queue .background-queue-notice")');
    const geometry=await f.js('(()=>{const a=document.querySelector(".tc-room-queue").getBoundingClientRect(),b=document.querySelector(".tc-composer textarea").getBoundingClientRect();return {visible:a.height>0,above:a.bottom<=b.top};})()');assert.ok(geometry.visible&&geometry.above);
    fs.writeFileSync(path.join(evidence,'background-upgrade-room.png'),await captureBillingFrame(f));
    await f.click('.tc-room-queue .background-queue-action');await f.wait('!!document.querySelector(".billing-panel")');
    assert.equal(f.state.orders,0);assert.equal(f.state.sent.length,0);
    await f.click('.billing-top .billing-close');await f.wait('!!document.querySelector(".tc-room-queue .background-queue-notice")');
    emit(f.state,'evt:background-queue',{taskId:'room-queued',roomId:'qa-room',accountId:'qa-account',queued:false,finished:true});await f.wait('!document.querySelector(".tc-room-queue .background-queue-notice")');
  });
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ renderer: url.href, rendererMode:process.env.WUWEI_QA_BUILT_RENDERER==='1'?'production':'development', backend: 'isolated in-memory IPC', realPayments: 0, results }, null, 2));
  app.exit(results.every(r => r.passed||r.skipped) ? 0 : 1);
}).catch(error => { console.error(error.stack); app.exit(1); });
