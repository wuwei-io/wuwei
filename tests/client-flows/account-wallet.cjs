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
const url = new URL(process.env.WUWEI_QA_RENDERER_URL || 'http://127.0.0.1:18361/');
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
    case 'newSession': s.lastNewSessionOptions=clone(args[0]); if(args[0]?.mode==='chat')s.settings.imageMode=false;emit(s, 'evt:session-loaded', { id: (s.newSessionCount=(s.newSessionCount??0)+1)===1?'qa-new-session':'qa-new-session-'+s.newSessionCount, messages: [],...(args[0]?.mode==='chat'?{mode:'chat'}:{}) }); return true;
    case 'wuweiMe': { if (s.meError) throw Error(s.meError); const value = clone(s.account); if (s.meDelay) await delay(s.meDelay); return value; }
    case 'wuweiCatalog': return clone(s.modelCatalog||(s.account?.flags?.includes('billing_v2')?billingModelCatalog:catalog));
    case 'imageCatalog': return clone(s.imageCatalog || []);
    case 'supportThread': return {messages:[],unread:0};
    case 'getModelPricing': return { providers: [] };
    case 'fetchModels': return [];
    case 'getAppVersion': return '1.7.72';
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
      if(s.miniPurchased||s.billingPaid){for(const p of products)if(p.period==='monthly')p.recommended=p.name==='Pro';}
      if(req.action==='wallet'){const result=clone(s.walletData??walletSnapshot(s.account?.user.id));if(s.walletDelay)await delay(s.walletDelay);return s.walletFail?{error:'wallet_unavailable'}:result;}
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
      if(req.action==='order'){if(s.billingPaid){s.billingOrder={...s.billingOrder,status:'paid',...(s.billingRefundRequired?{refundRequired:true}:{}),creditsGranted:s.billingRefundRequired?0:s.billingOrder.sku==='v2_plan_mini_monthly'?600:2000,balance:3578.362704};}return clone(s.billingOrder);}
      if(req.action==='ledger')return {balance:1578.362704,total:req.type==='model_check'?1:101,limit:req.limit||50,offset:req.offset||0,hasMore:(req.offset||0)+(req.limit||50)<(req.type==='model_check'?1:101),records:req.type==='model_check'?[{id:'check-only',type:'model_check',source:'free_model',description:'免费模型 glm-4.7-flash',createdAt:'2026-10-24T00:00:00Z',amount:0,balanceAfter:1578.362704,model:'glm-4.7-flash'}]:[{id:'record-'+(req.offset||0),type:'spend',source:'model_usage',description:'无为托管模型调用',createdAt:'2026-10-20T15:14:12Z',amount:-0.03039,balanceAfter:1578.362704,model:'mimo-v2.6-flash',parameters:{turn_kind:'tool_cont',input_tokens:100}},{id:'free-record',type:'spend',source:'free_model',description:'免费模型 glm-4.7-flash',createdAt:'2026-10-20T15:05:49Z',amount:0,balanceAfter:1578.362704,model:'glm-4.7-flash'}]};
      return {error:'unknown_action'};
    }
    case 'checkin': {
      s.checkinCalls=(s.checkinCalls??0)+1;
      const owner=s.account?.user.id, old=clone(s.walletData??walletSnapshot(owner));
      if(s.checkinDelay)await delay(s.checkinDelay);
      if(s.checkinFail)return {error:'network'};
      if(old.daily?.claimed)return {success:false,amount:0};
      const at=Date.now(),amount=old.daily.amount+old.daily.bonus;
      if(s.account?.user.id===owner){
        const batch={source:'gift',receiptSource:'signin',remaining:amount,expiresAt:new Date(at+(s.checkinExpiryMs??86400000)).toISOString()};
        s.walletData={...old,asOf:new Date(at).toISOString(),balance:old.balance+amount,expiring:old.expiring+amount,batches:[...old.batches,batch],daily:{...old.daily,claimed:true}};
        s.account={...s.account,coin:{...s.account.coin,balance:s.walletData.balance,lastSignin:new Date(at).toISOString().slice(0,10)}};
      }
      return {success:true,amount,streak:1};
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
    if (details.url.startsWith('https://wuweiai.io/api/billing/client-config')) { callback({redirectURL: url.origin + '/qa-config?client=' + state.win.webContents.id}); return; }
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

const http = require('node:http');
const server = http.createServer((req,res) => {
  const request = new URL(req.url, url);
  if(request.pathname==='/qa-current-config'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({accountFooter:{layout:[...states.values()][0]?.footerLayout??'classic'}}));return;}
  if (request.pathname === '/qa-config') {
    const state=states.get(+request.searchParams.get('client'));
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});
    res.end(JSON.stringify({accountFooter:{layout:state?.footerLayout??'classic'},registrationGift:{amount:100},freeAllowance:{dailyTokens:2000000,dailyCalls:100,resetTimezone:'Asia/Shanghai'}})); return;
  }
  if(request.pathname==='/qa-save-config'&&req.method==='POST'){let body='';req.on('data',chunk=>body+=chunk);req.on('end',async()=>{try{const value=JSON.parse(body);if(!['classic','wallet'].includes(value.layout))throw Error('invalid');for(const state of states.values()){state.footerLayout=value.layout;await state.win.webContents.executeJavaScript("window.dispatchEvent(new Event('focus'))");}res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');}catch{res.writeHead(400);res.end();}});return;}
  if(['/admin-preview.html','/admin-preview.js'].includes(request.pathname)){res.writeHead(200,{'Content-Type':request.pathname.endsWith('.js')?'text/javascript':'text/html'});res.end(fs.readFileSync(path.join(evidence,request.pathname.slice(1))));return;}
  const file=path.resolve(repo,'out/renderer','.'+(request.pathname==='/'?'/index.html':decodeURIComponent(request.pathname)));
  if (!file.startsWith(path.join(repo,'out/renderer')+path.sep)) {res.writeHead(403);res.end();return;}
  try {res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(fs.readFileSync(file));} catch {res.writeHead(404);res.end();}
});
const walletSnapshot = (userId='qa-account') => ({userId,balance:638.5,permanent:600,expiring:38.5,asOf:new Date().toISOString(),daily:{amount:10,bonus:0,claimed:false,resetsAt:new Date(Date.now()+9*3600000).toISOString(),expiryHours:24},plan:{name:'Mini',period:'monthly',endsAt:'2026-11-30T00:00:00Z',member:true},batches:[{source:'gift',receiptSource:'signin',remaining:30,expiresAt:new Date(Date.now()+7.5*3600000).toISOString()},{source:'gift',receiptSource:'activity_reward',remaining:8.5,expiresAt:new Date(Date.now()+2*86400000).toISOString()}]});
const walletAccount=()=>({...account(638.5),user:{id:'qa-account',name:'huihui pang',email:'huihui@example.com',avatar:null},membership:{tier:'pro_month',plan:'Mini',expireAt:'2026-11-30T00:00:00Z'},flags:['billing_v2']});
const hover=(f,selector)=>f.js(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 await new Promise(resolve=>server.listen(+url.port,'127.0.0.1',resolve));
 if(process.env.WUWEI_WALLET_PREVIEW==='1'){
  const f=await boot({account:walletAccount(),footerLayout:'wallet',offscreen:false});
  f.state.win.setTitle('无为 · 账号底栏分支预览（示例账户）');
  const {Menu}=require('electron');
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'底栏版本预览',submenu:[{label:'打开后台配置预览',click:()=>{const admin=new BrowserWindow({width:1150,height:850,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});admin.loadURL(url.origin+'/admin-preview.html');}},{type:'separator'},{label:'新版 · 无为币与头像',click:async()=>{f.state.footerLayout='wallet';await f.js("window.dispatchEvent(new Event('focus'))");}},{label:'原版 · 头像与昵称',click:async()=>{f.state.footerLayout='classic';await f.js("window.dispatchEvent(new Event('focus'))");}},{type:'separator'},{label:'亮色',click:()=>f.js("document.documentElement.dataset.theme='light'")},{label:'暗色',click:()=>f.js("document.documentElement.dataset.theme='dark'")}]}]));
  f.state.win.show();f.state.win.on('closed',()=>app.exit(0));return;
 }
 await run('底栏：原版默认、配置热切换与回退保留草稿',{account:walletAccount()},async f=>{
  await f.wait('!!document.querySelector(".acct-btn")');await f.fill('.composer textarea','保留尚未发送的草稿');
  await f.click('.acct-btn');await f.wait('!!document.querySelector(".acct-menu")');assert(await f.js('!!document.querySelector(".acct-wallet-row")'));
  fs.writeFileSync(path.join(evidence,'client-classic.png'),await captureBillingFrame(f));
  const admin=new BrowserWindow({show:false,width:1150,height:850,webPreferences:{sandbox:true,contextIsolation:true,offscreen:true,backgroundThrottling:false}});
  try {
   await admin.loadURL(url.origin+'/admin-preview.html');
   const adminJs=code=>admin.webContents.executeJavaScript(code,true);
   for(let i=0;i<100&&!await adminJs('!!document.querySelector("[role=button]")');i++)await delay(30);
   await adminJs('document.querySelector("[role=button]").click()');
   for(const layout of ['wallet','classic']) {
    await adminJs(`{const e=document.querySelector('select');e.value='${layout}';e.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('button[type=submit]').click();}`);
    await f.wait(layout==='wallet'?'!!document.querySelector(".account-coin-pill")':'!!document.querySelector(".acct-btn")');
    assert.equal(await f.js('!!document.querySelector(".acct-menu")'),false);
   }
  } finally {admin.destroy();}
  assert.equal(await f.js('document.querySelector(".composer textarea").value'),'保留尚未发送的草稿');assert.equal(f.state.orders,0);
 });
 const memberModelCatalog=clone(catalog);
 const memberIds=['claude-fable-5-1','claude-fable-5','claude-opus-5-5','claude-opus-5'];
 memberModelCatalog.find(p=>p.id==='wuwei-claude').models.push(...memberIds.map((id,i)=>model(id,false,false,{category:'premium',rank:-100+i},{input:3038.4,output:15192,cache:303.84})));
 memberModelCatalog.push(provider('wuwei-gpt',false,['gpt-6-1-sol','gpt-6-sol','gpt-6-astra','gpt-6-luna'].map((id,i)=>model(id,false,false,{category:'premium',rank:-80+i},{input:1519.2,output:7596,cache:151.92}))));
 const modelTarget='[data-model-key="wuwei-claude/claude-fable-5-1"]';
 const premiumList=async f=>{await f.click('.mq-select');await f.wait('!!document.querySelector(".model-picker")');await f.click('.model-picker nav button:nth-child(3)');await f.wait('!!document.querySelector('+JSON.stringify(modelTarget)+')');};
 await run('会员模型：非会员有余额也进入升级且仅七个模型带皇冠',{account:{...account(100000),flags:['billing_v2']},modelCatalog:memberModelCatalog},async f=>{
  await f.fill('.composer textarea','尚未发送的内容');await premiumList(f);
  assert.equal(await f.js('document.querySelectorAll(".model-picker-member-crown").length'),7);
  assert.equal(await f.js(`document.querySelector('[data-model-key="wuwei-gpt/gpt-6-luna"]').hasAttribute("data-membership-locked")`),false);
  fs.writeFileSync(path.join(evidence,'nonmember-model-list.png'),await captureBillingFrame(f));
  await f.click(modelTarget);await f.wait('!!document.querySelector(".billing-panel")');
  assert.equal(await f.js('!!document.querySelector(".model-picker-confirm")'),false);assert.equal(f.state.settings.model,'nemotron-super-free');
  assert.equal(await f.js('document.querySelector(".composer textarea").value'),'尚未发送的内容');assert.equal(f.state.orders,0);assert.equal(f.state.sent.length,0);
  fs.writeFileSync(path.join(evidence,'nonmember-upgrade.png'),await captureBillingFrame(f));
 });
 for(const plan of ['Mini','Pro'])await run('会员模型：有效 '+plan+' 可以确认选用且仍提示价格',{account:{...account(100000),membership:{tier:'pro_month',plan,expireAt:new Date(Date.now()+86400000).toISOString()},flags:['billing_v2']},modelCatalog:memberModelCatalog},async f=>{
  await premiumList(f);assert.equal(await f.js('document.querySelector('+JSON.stringify(modelTarget)+').hasAttribute("data-membership-locked")'),false);
  await f.click(modelTarget);await f.wait('!!document.querySelector("[data-action=confirm-premium]")');
  assert.equal(await f.js('!!document.querySelector(".billing-panel")'),false);
  await f.click('[data-action=confirm-premium]');await f.wait('!document.querySelector(".model-picker")');assert.equal(f.state.settings.model,'claude-fable-5-1');assert.equal(f.state.orders,0);
 });
 await run('会员模型：过期账号转升级',{account:{...account(100000),membership:{tier:'pro_month',plan:'Pro',expireAt:new Date(Date.now()-1000).toISOString()},flags:['billing_v2']},modelCatalog:memberModelCatalog},async f=>{
  await premiumList(f);await f.click(modelTarget);await f.wait('!!document.querySelector(".billing-panel")');assert.equal(f.state.orders,0);assert.equal(f.state.sent.length,0);
 });
 await run('会员模型：游客点击进入登录入口',{account:null,modelCatalog:memberModelCatalog},async f=>{
  await premiumList(f);await f.click(modelTarget);await f.wait('!!document.querySelector("input[type=password]")');assert.equal(f.state.orders,0);assert.equal(f.state.sent.length,0);
 });
 await run('会员模型：旧会话未付费发送时保留草稿并阻止请求',{account:{...account(100000),flags:['billing_v2']},settings:settings('wuwei-claude','claude-fable-5-1'),modelCatalog:memberModelCatalog},async f=>{
  await f.send();await f.wait('!!document.querySelector(".billing-panel")');assert.equal(f.state.sent.length,0);assert.equal(f.state.orders,0);
  assert.equal(await f.js('document.querySelector(".composer textarea").value'),'隔离流程测试');
 });
 for(const theme of ['light','dark']) await run('底栏：余额头像菜单、付费详情与品牌 '+theme,{account:walletAccount(),footerLayout:'wallet',settings:{...settings(),theme}},async f=>{
  await f.wait('!!document.querySelector(".account-coin-pill")');await f.js(`document.documentElement.dataset.theme='${theme}'`);
  assert.equal(await f.js('!!document.querySelector(".acct-btn")'),false);
  fs.writeFileSync(path.join(evidence,'client-wallet-'+theme+'.png'),await captureBillingFrame(f));
  await hover(f,'.account-coin-pill');await f.wait('!!document.querySelector(".account-wallet-batch")');
  assert.match(await f.js('document.querySelector(".account-wallet-popover").textContent'),/638.5[\s\S]*38.5/);
  assert.equal(await f.js('document.querySelectorAll(".account-wallet-batch").length'),2);
  assert.match(await f.js('document.querySelector(".account-wallet-batches").textContent'),/签到赠币[\s\S]*活动赠币/);
  assert.match(await f.js('document.querySelector(".account-wallet-countdown").textContent'),/剩余.*\d{2}:\d{2}:\d{2}/);
  assert.match(await f.js('document.querySelector(".account-wallet-daily").textContent'),/签到领.*10.*币/);
  assert.equal(await f.js('!!document.querySelector(".account-wallet-permanent")'),false);

  const rect=await f.js('document.querySelector(".account-wallet-popover").getBoundingClientRect().toJSON()');
  f.state.win.webContents.sendInputEvent({type:'mouseMove',x:Math.floor(rect.x+40),y:Math.floor(rect.y+30)});await delay(350);
  assert(await f.js('!!document.querySelector(".account-wallet-popover")'));
  fs.writeFileSync(path.join(evidence,'client-balance-'+theme+'.png'),await captureBillingFrame(f));
  await hover(f,'.account-avatar-only');await f.wait('!!document.querySelector(".acct-menu")');
  assert.equal(await f.js('!!document.querySelector(".account-wallet-popover")'),false);
  const text=await f.js('document.querySelector(".acct-menu").textContent');assert.match(text,/huihui/);assert.match(text,/签到/);assert.match(text,/设置/);assert.match(text,/客服/);
  fs.writeFileSync(path.join(evidence,'client-avatar-'+theme+'.png'),await captureBillingFrame(f));
  for(const button of ['.account-coin-add','.account-upgrade']){
   await f.click(button);await f.wait('!!document.querySelector(".billing-panel")');assert.equal(f.state.orders,0);
   await f.click('.billing-top .billing-close');await f.wait('!document.querySelector(".billing-panel")');
  }
  await hover(f,'.account-coin-pill');await f.wait('!!document.querySelector(".account-wallet-details")');await f.click('.account-wallet-details');
  await f.wait('!!document.querySelector(".billing-ledger") || !!document.querySelector(".billing-ledger-view") || !!document.querySelector(".billing-ledger-table")');
  for(let i=0;i<40&&!f.state.billingCalls.some(r=>r.action==='ledger');i++)await delay(30);assert(f.state.billingCalls.some(r=>r.action==='ledger'));assert.equal(f.state.orders,0);
 });
 for(const theme of ['light','dark']) await run('底栏：语言菜单直接切换并保留草稿 '+theme,{account:walletAccount(),footerLayout:'wallet',settings:{...settings(),theme}},async f=>{
  await f.js(`document.documentElement.dataset.theme='${theme}'`);
  await f.fill('.composer textarea','切换语言保留的草稿');
  await hover(f,'.account-avatar-only');await f.wait('!!document.querySelector(".account-language-trigger")');
  await hover(f,'.account-language-trigger');await f.wait('!!document.querySelector(".account-language-popup")');
  assert.equal(await f.js('document.querySelectorAll("[data-account-language]").length'),19);
  assert.equal(await f.js('document.querySelector("[data-account-language=zh]").getAttribute("aria-checked")'),'true');
  const r=await f.js('document.querySelector(".account-language-popup").getBoundingClientRect().toJSON()');
  f.state.win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(r.x+50),y:Math.round(r.y+30)});await delay(350);
  assert(await f.js('!!document.querySelector(".acct-menu")&&!!document.querySelector(".account-language-popup")'));
  assert(await f.js('(()=>{const e=document.querySelector(".account-language-popup"),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+30,r.top+20))})()'));
  fs.writeFileSync(path.join(evidence,'account-language-'+theme+'.png'),await captureBillingFrame(f));
  await f.click('[data-account-language=en]');await f.wait('document.documentElement.lang==="en"');
  assert.equal(await f.js('localStorage.getItem("wuwei_lang")'),'en');await f.wait('!document.querySelector(".account-language-popup")');
  assert.equal(f.state.appLanguage,'en');
  assert.equal(await f.js('document.querySelector(".composer textarea").value'),'切换语言保留的草稿');
  assert.equal(await f.js('!!document.querySelector(".settings-modal")'),false);
  await f.click('.account-language-trigger');await f.wait('!!document.querySelector(".account-language-popup")');
  assert.equal(await f.js('document.querySelector("[data-account-language=en]").getAttribute("aria-checked")'),'true');
  await f.click('[data-account-language=zh]');await f.wait('document.documentElement.lang==="zh"');
  assert.equal(f.state.orders,0);
 });
 await run('底栏：语言菜单键盘、跟随系统与窄窗边界',{account:walletAccount(),footerLayout:'wallet',systemLanguage:'en-US'},async f=>{
  f.state.win.setSize(360,720);await hover(f,'.account-avatar-only');
  await f.click('.account-language-trigger');await f.wait('!!document.querySelector(".account-language-popup")');
  const r=await f.js('document.querySelector(".account-language-popup").getBoundingClientRect().toJSON()');
  assert(r.left>=0&&r.right<=360&&r.top>=0&&r.bottom<=720);
  await f.js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}))');
  assert.equal(await f.js('document.activeElement.dataset.accountLanguage'),'it');
  await f.js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}))');
  assert.equal(await f.js('document.activeElement.dataset.accountLanguage'),'system');
  await f.click('[data-account-language=system]');await f.wait('document.documentElement.lang==="en"');
  assert.equal(f.state.appLanguage,'system');assert.equal(await f.js('localStorage.getItem("wuwei_lang")'),'system');
  await f.click('.account-language-trigger');await f.wait('!!document.querySelector(".account-language-popup")');
  assert.equal(await f.js('document.querySelector("[data-account-language=system]").getAttribute("aria-checked")'),'true');
  await f.js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  await f.wait('!document.querySelector(".account-language-popup")');assert(await f.js('!!document.querySelector(".acct-menu")'));
  await f.js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))');
  await f.wait('!!document.querySelector(".account-language-popup")');
  await f.js('document.querySelector(".composer textarea").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
  await f.wait('!document.querySelector(".acct-menu")&&!document.querySelector(".account-language-popup")');
  assert.equal(f.state.orders,0);
 });
 await run('底栏：倒计时逐秒更新、边界自动刷新',{account:walletAccount(),footerLayout:'wallet'},async f=>{
  f.state.walletData=walletSnapshot();
  f.state.walletData.asOf=new Date().toISOString();
  f.state.walletData.batches[0].expiresAt=new Date(Date.now()+2400).toISOString();
  f.state.walletData.daily.resetsAt=f.state.walletData.batches[0].expiresAt;
  f.state.walletData.daily.claimed=true;
  await hover(f,'.account-coin-pill');await f.wait('!!document.querySelector(".account-wallet-countdown")');
  const before=await f.js('document.querySelector(".account-wallet-countdown").textContent');
  assert.equal(await f.js('!!document.querySelector(".account-wallet-daily")'),false);
  await delay(1100);
  const after=await f.js('document.querySelector(".account-wallet-countdown").textContent');assert.notEqual(before,after);
  f.state.walletData={...walletSnapshot(),balance:608.5,permanent:600,expiring:8.5,batches:[walletSnapshot().batches[1]]};
  await f.wait('document.querySelectorAll(".account-wallet-batch").length===1',4000);
  assert(await f.js('!!document.querySelector(".account-wallet-checkin")'));
  assert.equal(f.state.orders,0);
 });
 await run('底栏：旧服务不伪造每日数量',{account:walletAccount(),footerLayout:'wallet'},async f=>{
  f.state.walletData=walletSnapshot();delete f.state.walletData.daily;
  await hover(f,'.account-coin-pill');await f.wait('!!document.querySelector(".account-wallet-batch")');
  assert.match(await f.js('document.querySelector(".account-wallet-daily").textContent'),/暂不可用/);
  assert.equal(f.state.orders,0);
 });
 await run('底栏：快捷签到到账后开始失效倒计时',{account:{...walletAccount(),coin:{balance:52}},footerLayout:'wallet'},async f=>{
  f.state.walletData={...walletSnapshot(),balance:52,permanent:52,expiring:0,batches:[]};f.state.checkinDelay=350;
  await hover(f,'.account-coin-pill');await f.wait('!!document.querySelector(".account-wallet-checkin:not(:disabled)")');
  assert.equal(await f.js('!!document.querySelector(".account-wallet-reset")'),false);
  assert.equal(await f.js('!!document.querySelector(".account-wallet-countdown")'),false);
  fs.writeFileSync(path.join(evidence,'quick-checkin-before.png'),await captureBillingFrame(f));
  await f.click('.account-wallet-checkin');await f.wait('document.querySelector(".account-wallet-checkin")?.disabled');
  await f.click('.account-wallet-checkin');assert.equal(f.state.checkinCalls,1);
  await f.wait('document.querySelector(".account-wallet-total")?.textContent.includes("62")');
  await f.wait('!!document.querySelector(".account-wallet-countdown")');
  assert.match(await f.js('document.querySelector(".account-wallet-countdown").textContent'),/后失效/);
  assert.equal(await f.js('!!document.querySelector(".account-wallet-checkin")'),false);
  assert.equal(await f.js('!!document.querySelector(".checkin-pop-overlay")'),false);
  assert.match(await f.js('document.querySelector(".account-wallet-total").textContent'),/62/);
  assert.match(await f.js('document.querySelector(".account-wallet-expiring").textContent'),/签到赠币[\s\S]*10/);
  const grant=f.state.walletData.batches[0];assert(Math.abs(Date.parse(grant.expiresAt)-Date.parse(f.state.walletData.asOf)-86400000)<5);
  fs.writeFileSync(path.join(evidence,'quick-checkin-after.png'),await captureBillingFrame(f));assert.equal(f.state.orders,0);
 });
 await run('底栏：快捷签到失败可重试且不污染切换账号',{account:walletAccount(),footerLayout:'wallet'},async f=>{
  f.state.walletData=walletSnapshot();f.state.checkinFail=true;
  await hover(f,'.account-coin-pill');await f.wait('!!document.querySelector(".account-wallet-checkin:not(:disabled)")');
  await f.click('.account-wallet-checkin');await f.wait('!!document.querySelector(".account-wallet-claim-error")');
  assert.equal(await f.js('document.querySelector(".account-wallet-checkin").disabled'),false);
  assert.match(await f.js('document.querySelector(".account-wallet-total").textContent'),/638.5/);
  f.state.checkinFail=false;f.state.checkinDelay=700;await f.click('.account-wallet-checkin');
  f.state.account={...walletAccount(),user:{...walletAccount().user,id:'account-b'},coin:{balance:10}};
  f.state.walletData={...walletSnapshot('account-b'),balance:10,permanent:10,expiring:0,batches:[]};
  emit(f.state,'evt:wuwei-me',clone(f.state.account));await delay(1000);await hover(f,'.account-coin-pill');
  await f.wait('document.querySelector(".account-wallet-total")?.textContent.includes("10")');
  assert.equal(f.state.account.user.id,'account-b');assert.equal(f.state.account.coin.balance,10);
  await f.wait('document.querySelector(".account-wallet-checkin")?.disabled===false');
  assert.equal(await f.js('!!document.querySelector(".checkin-pop-overlay")'),false);assert.equal(f.state.orders,0);
 });
 await run('底栏：手动刷新旋转、防重复并更新真实响应',{account:walletAccount(),footerLayout:'wallet'},async f=>{
  await hover(f,'.account-coin-pill');await f.wait('!!document.querySelector(".account-wallet-batch")');
  const before=f.state.billingCalls.filter(r=>r.action==='wallet').length;
  f.state.walletDelay=750;f.state.walletData={...walletSnapshot(),balance:637.5,permanent:599};
  await f.click('.account-wallet-refresh');await f.wait('document.querySelector(".account-wallet-refresh")?.getAttribute("aria-busy")==="true"');
  assert(await f.js('document.querySelector(".account-wallet-refresh").disabled'));
  assert.equal(await f.js('getComputedStyle(document.querySelector(".account-wallet-refresh svg")).animationName'),'account-wallet-refresh-spin');
  const first=await f.js('getComputedStyle(document.querySelector(".account-wallet-refresh svg")).transform');await delay(120);
  assert.notEqual(await f.js('getComputedStyle(document.querySelector(".account-wallet-refresh svg")).transform'),first);
  await f.click('.account-wallet-refresh');assert.equal(f.state.billingCalls.filter(r=>r.action==='wallet').length,before+1);
  await f.wait('document.querySelector(".account-wallet-refresh")?.getAttribute("aria-busy")==="false"');
  assert.match(await f.js('document.querySelector(".account-wallet-total").textContent'),/637.5/);
  assert.match(await f.js('document.querySelector(".account-coin-balance").textContent'),/637.5/);
  assert.equal(await f.js('getComputedStyle(document.querySelector(".account-wallet-refresh svg")).animationName'),'none');
  assert.equal(await f.js('document.querySelector(".account-wallet-refresh").disabled'),false);
  f.state.walletFail=true;await f.click('.account-wallet-refresh');await f.wait('document.querySelector(".account-wallet-status")?.textContent.includes("刷新失败")');
  assert.match(await f.js('document.querySelector(".account-wallet-total").textContent'),/637.5/);
  assert.equal(await f.js('document.querySelector(".account-wallet-refresh").disabled'),false);
  f.state.walletFail=false;await f.click('.account-wallet-refresh');await f.wait('document.querySelector(".account-wallet-refresh")?.getAttribute("aria-busy")==="false"');
  assert.equal(await f.js('!!document.querySelector(".account-wallet-status")'),false);assert.equal(f.state.orders,0);
 });
 await run('底栏：失败保留提示、迟到账号数据隔离',{account:walletAccount(),footerLayout:'wallet'},async f=>{
  await f.wait('!!document.querySelector(".account-coin-pill")');await hover(f,'.account-coin-pill');await f.wait('!!document.querySelector(".account-wallet-batch")');
  f.state.walletFail=true;await f.click('.account-wallet-heading button');await f.wait('document.querySelector(".account-wallet-status")?.textContent.includes("刷新失败")');
  assert.equal(await f.js('document.querySelectorAll(".account-wallet-batch").length'),2);
  f.state.walletFail=false;f.state.walletData=walletSnapshot('qa-account');f.state.walletDelay=700;await f.click('.account-wallet-heading button');
  f.state.account={...walletAccount(),user:{...walletAccount().user,id:'account-b'},coin:{balance:10}};
  emit(f.state,'evt:wuwei-me',clone(f.state.account));await delay(900);await hover(f,'.account-coin-pill');
  await f.wait('document.querySelector(".account-wallet-popover")?.textContent.includes("无法读取")');
  assert.equal(await f.js('document.querySelectorAll(".account-wallet-batch").length'),0);assert.equal(f.state.orders,0);
 });
 await run('底栏：游客先登录、键盘关闭、窄窗浮层',{account:null,footerLayout:'wallet'},async f=>{
  await f.wait('!!document.querySelector(".account-coin-pill")');await f.click('.account-coin-add');await f.wait('!!document.querySelector("input[type=password]")');assert.equal(f.state.orders,0);
 });
 await run('底栏：键盘可进入、离开关闭、窄窗不截断',{account:walletAccount(),footerLayout:'wallet'},async f=>{
  await f.wait('document.querySelector(".account-coin-balance")?.textContent.includes("638.5")');f.state.win.setContentSize(840,720);await delay(200);
  await f.js('document.querySelector(".account-coin-balance").focus();document.querySelector(".account-coin-balance").dispatchEvent(new FocusEvent("focusin",{bubbles:true}))');await f.wait('!!document.querySelector(".account-wallet-batch")');
  const r=await f.js('document.querySelector(".account-wallet-popover").getBoundingClientRect().toJSON()');assert(r.x>=0&&r.y>=0&&r.right<=840&&r.bottom<=720);assert(await f.js('(()=>{const p=document.querySelector(".account-wallet-popover"),r=p.getBoundingClientRect();return p.contains(document.elementFromPoint(r.right-8,r.y+22))})()'));
  await f.js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');await f.wait('!document.querySelector(".account-wallet-popover")');
  await f.js('document.querySelector(".account-avatar-only").focus();document.querySelector(".account-avatar-only").dispatchEvent(new FocusEvent("focusin",{bubbles:true}))');await f.wait('!!document.querySelector(".acct-menu")');
  const m=await f.js('document.querySelector(".acct-menu").getBoundingClientRect().toJSON()');assert(m.x>=0&&m.y>=0&&m.right<=840&&m.bottom<=720);
  fs.writeFileSync(path.join(evidence,'client-narrow.png'),await captureBillingFrame(f));
  await f.js('document.querySelector(".composer textarea").focus();document.querySelector(".account-footer-wallet").dispatchEvent(new FocusEvent("focusout",{bubbles:true,relatedTarget:document.querySelector(".composer textarea")}))');await f.wait('!document.querySelector(".acct-menu")');
 });
 fs.writeFileSync(path.join(evidence,'client-ui-tests.json'),JSON.stringify({renderer:'actual compiled App',backend:'isolated in-memory IPC',realOrders:0,results},null,2));
 server.close();app.exit(results.every(r=>r.passed)?0:1);
}).catch(e=>{console.error(e);server.close();app.exit(1)});
