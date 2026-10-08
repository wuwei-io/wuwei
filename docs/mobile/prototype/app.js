// ===== 无为手机端高保真 v2 全量 · 公共零件 =====
const statusbar = `<div class="statusbar"><span>9:41</span><span class="icons">●●● 📶 100%</span></div>`;
const svg = (p,s=24)=>`<svg class="i" viewBox="0 0 24 24" style="width:${s}px;height:${s}px">${p}</svg>`;
const I = {
  search:'<path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
  chevR:'<path d="M9 18l6-6-6-6"/>',
  back:'<path d="M15 18l-6-6 6-6"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  terminal:'<path d="M4 17l6-6-6-6M12 19h8"/>',
  warn:'<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  chart:'<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>',
  check:'<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 12h.01M3 10h18"/>',
  gift:'<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9M12 8a3 3 0 1 0-3-3 3 3 0 0 0 3 3 3 3 0 1 0 3-3"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  edit:'<path d="M11 4H4v16h16v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17h.01"/>',
  laptop:'<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20"/>',
  camera:'<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.2"/>',
};
function tabbar(active){
  const tabs=[['chat',I.chat,'对话'],['chart',I.chart,'进度'],['check',I.check,'审批'],['user',I.user,'我']];
  return `<div class="tabbar">${tabs.map(([k,ic,label])=>`
    <div class="tab ${active===k?'on':''}"><svg class="i" viewBox="0 0 24 24">${ic}</svg>
    <span>${label}</span>${k==='check'?'<span class="dot">2</span>':''}</div>`).join('')}</div>`;
}
function nav(title,{back=true,right=''}={}){
  return `<div class="navbar">${back?`<div class="nav-back">${svg(I.back,22)}</div>`:'<div style="width:36px"></div>'}
    <span class="title">${title}</span>${right||'<div style="width:36px"></div>'}</div>`;
}
// 无为真实 WuMark：开口圆弧 + 朱赭火种点在弧的断口末端（不在圆心）。浅底上环色用深靛青#274A63，火种保持朱赭#C05F3C
function fireLogo(size){
  const s = size || 88;
  return `<div class="guide-logo" style="width:${s}px;height:${s}px;">
    <svg viewBox="25 25 180 180" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">
      <path d="M152.04 193.48 A82 82 0 1 1 195.48 150.04" fill="none" stroke="#274A63" stroke-width="12" stroke-linecap="round"/>
      <circle cx="195.48" cy="150.04" r="10" fill="#C05F3C"/>
    </svg>
  </div>`;
}
I.chevD='<path d="M6 9l6 6 6-6"/>';
I.mic='<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
I.plusSm='<path d="M12 5v14M5 12h14"/>';
I.image='<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>';
// 订阅版余量条（Claude Code 真实三维度：5h 滚动窗 / 周 / 上下文占用）
// 横排三段 mini 条，每段 = 标签 + 进度条 + 数值。统一「已用」口径：进度条填充=已用量，越满越接近用完
// 三色阈值（按已用）：已用<50 靛青 / ≥50 暖金 / ≥85 朱红告警
function qcls(usedPct){ return usedPct>=85?'low':usedPct>=50?'warn':'ok'; }
function qseg(label, usedPct, num){
  const c = qcls(usedPct);
  return `<div class="qseg">
    <div class="qseg-top"><span class="qseg-label">${label}</span><span class="qseg-num qn-${c}">${num}</span></div>
    <div class="quota-bar"><div class="quota-fill qf-${c}" style="width:${usedPct}%"></div></div>
  </div>`;
}
// Claude Code 订阅版：三段全走「已用」口径（5h 已用 / 本周已用 / 上下文已用）
function quotaStrip(){
  const ctxUsed = 60; // 已用 120K/200K=60%
  const cc = qcls(ctxUsed);
  return `<div class="quota-strip">
    ${qseg('5h 已用', 15, '15%')}
    ${qseg('本周已用', 32, '32%')}
    <div class="qseg">
      <div class="qseg-top"><span class="qseg-label">上下文</span><span class="qseg-num qn-${cc}">120K/200K</span></div>
      <div class="quota-bar"><div class="quota-fill qf-${cc}" style="width:${ctxUsed}%"></div></div>
    </div>
  </div>`;
}
// 输入区（含模型胶囊）：state = 'idle' | 'running'
function inputStack(model, state){
  const right = state==='running'
    ? `<div class="stop-btn">${svg(I.stop,18)}</div>`
    : `<div class="send-btn">${svg(I.send,18)}</div>`;
  return `<div class="input-stack">
    <div class="row2">
      <div class="model-pill"><span class="mdot"></span><span>当前 · </span><span class="mname">${model}</span>${svg(I.chevD,14)}</div>
      ${state==='running'?'<span style="font-size:11.5px;color:var(--accent);font-weight:600;">生成中…</span>':''}
    </div>
    <div class="input-line">
      <div class="ic-btn">${svg(I.plusSm,20)}</div>
      <div class="input-box" style="flex:1;">${state==='running'?'<span style="color:var(--text-faint);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">正在回复，可点右侧停止</span>':'<span class="ph" style="color:var(--text-faint)">发消息…</span>'}</div>
      <div class="ic-btn">${svg(I.mic,18)}</div>
      ${right}
    </div>
  </div>`;
}

// ===== 真实模型数据（快照自 /api/model-pricing，倍率实时算：免费=0，非免费最便宜综合价=1×基准）=====
// 说明：手机端上线时清单与倍率由后端动态返回，这里用真实快照画稿，口径一致。
// 倍率染色：免费→绿 / ≥3×→朱赭 / 1~3×→靛青 / <1×→绿
function multClass(m){ if(m==='免费') return 'mc-free'; const v=parseFloat(m); if(v>=3) return 'mc-spark'; if(v>=1) return 'mc-accent'; return 'mc-free'; }
// 一级：平台分组（provider）。count=模型数, free=是否含免费, minMult=最低倍率标签
const PROVIDERS = [
  {id:'free', name:'免费体验', note:'无需登录 · 13 款免费', count:13, hasFree:true, min:'免费', ic:'免', bg:'#3f8f6b', on:false},
  {id:'claude', name:'Claude', note:'8 款 · 最强综合', count:8, min:'12×', ic:'C', bg:'#c05f3c', on:true},
  {id:'gpt', name:'GPT', note:'5 款 · OpenAI', count:5, min:'2.8×', ic:'G', bg:'#274a63', on:false},
  {id:'gemini', name:'Gemini', note:'3 款 · 长上下文', count:3, min:'5.6×', ic:'✦', bg:'#8a5f83', on:false},
  {id:'grok', name:'Grok', note:'3 款 · xAI', count:3, min:'7.5×', ic:'X', bg:'#16191e', on:false},
  {id:'zhipu', name:'智谱 GLM', note:'3 款 · 国产高性价比', count:3, min:'1.3×', ic:'智', bg:'#3f6f8f', on:false},
  {id:'qwen', name:'通义千问', note:'2 款 · 阿里', count:2, min:'1.24×', ic:'通', bg:'#6a4fa0', on:false},
  {id:'doubao', name:'豆包', note:'4 款 · 字节 · 1× 起', count:4, min:'1×', ic:'豆', bg:'#a97f2e', on:false},
  {id:'deepseek', name:'DeepSeek', note:'1 款 · 2.63×', count:1, min:'2.63×', ic:'DS', bg:'#4a63c0', on:false},
  {id:'kimi', name:'Kimi', note:'1 款 · 月之暗面', count:1, min:'34×', ic:'K', bg:'#1c3547', on:false},
  {id:'minimax', name:'MiniMax', note:'1 款 · 3×', count:1, min:'3×', ic:'M', bg:'#5c8a73', on:false},
  {id:'mistral', name:'Mistral', note:'1 款 · 4×', count:1, min:'4×', ic:'Ms', bg:'#c8933f', on:false},
  {id:'llama', name:'Llama', note:'1 款 · 1.68×', count:1, min:'1.68×', ic:'La', bg:'#5b8a98', on:false},
];
// 二级：Claude 平台下真实模型清单（展开示例）
const CLAUDE_MODELS = [
  {name:'Claude Haiku 4.5', desc:'最快最省 · 日常轻任务', mult:'12×', on:false},
  {name:'Claude Sonnet 5', desc:'均衡快准 · 日常首选', mult:'24×', on:true},
  {name:'Claude Sonnet 4.6', desc:'稳定均衡 · 上一代旗舰', mult:'36×', on:false},
  {name:'Claude Opus 4.8', desc:'最强推理 · 复杂难题', mult:'60×', on:false},
  {name:'Claude Opus 5', desc:'最强推理 · 新一代', mult:'60×', on:false},
  {name:'Claude Fable 5', desc:'顶配创作 · 旗舰', mult:'120×', on:false},
];
// 执行位置（仅当有在线电脑时出现在 sheet 顶部）
function execLocation(){
  return `<div class="exec-sec">
    <div class="exec-head">执行位置 <span>决定这台会话在哪跑</span></div>
    <div class="exec-opt on">
      <div class="exec-ic hosted">⚡</div>
      <div class="exec-main"><div class="exec-name">无为托管</div><div class="exec-sub">默认 · 走托管额度，随开随用</div></div>
      <span class="mo-check">${svg(I.check,18)}</span>
    </div>
    <div class="exec-opt">
      <div class="exec-ic">💻</div>
      <div class="exec-main"><div class="exec-name">MacBook-Pro（我的）</div><div class="exec-sub"><span class="on-dot"></span>在线 · Claude Code 订阅 · 5h 已用 15% · 周已用 32%</div></div>
      <span class="exec-link">查看对话 ${svg(I.chevR,14)}</span>
    </div>
    <div class="exec-opt">
      <div class="exec-ic">💻</div>
      <div class="exec-main"><div class="exec-name">办公室台式机</div><div class="exec-sub"><span class="on-dot"></span>在线 · Codex 订阅 · 周已用 8%</div></div>
      <span class="exec-link">查看对话 ${svg(I.chevR,14)}</span>
    </div>
  </div>`;
}

const SCREENS = [];
const GROUPS = [];
function add(group,label,sub,html){ SCREENS.push({group,label,sub,html}); }

// ========== A 启动/账号 ==========
add('A · 启动 / 账号','登录','A2 · 账密为主 · 登录后使用',`
${statusbar}
<div class="navbar"><div style="width:36px"></div><span class="title"></span><div style="width:36px"></div></div>
<div class="content" style="display:flex;flex-direction:column;padding:0 28px;">
  <div style="text-align:center;margin:30px 0 22px;">${fireLogo(72)}
    <div style="font-size:22px;font-weight:800;margin-top:6px;">无为</div>
    <div style="font-size:13.5px;color:var(--text-muted);margin-top:6px;">一念既出，万事自成</div>
  </div>
  <!-- 主登录：账号密码 -->
  <div class="field">${svg(I.user,18)}<span class="ph">账号 / 邮箱</span></div>
  <div class="field">${svg(I.lock,18)}<span class="ph">密码</span></div>
  <button class="btn-full btn-primary" style="margin-top:4px;">登录</button>
  <div style="display:flex;justify-content:space-between;margin-top:12px;">
    <span class="link-c" style="font-weight:500;">注册账号</span>
    <span class="link-c" style="font-weight:500;color:var(--text-muted)">忘记密码？</span>
  </div>
  <!-- 分割 -->
  <div style="display:flex;align-items:center;gap:12px;margin:22px 0 16px;color:var(--text-faint);font-size:12px;">
    <span style="flex:1;height:1px;background:var(--border);"></span>或使用以下方式<span style="flex:1;height:1px;background:var(--border);"></span>
  </div>
  <!-- 第三方：邮箱验证码 / Google（微信/Apple 已去掉） -->
  <div style="display:flex;justify-content:center;gap:40px;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;">
      <div class="oauth-ic" style="background:var(--bg-raised);color:var(--accent);">${svg(I.chat,22)}</div>
      <span class="oauth-lb">邮箱验证码</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;">
      <div class="oauth-ic" style="background:#fff;border:1px solid var(--border);"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3C3.6 21.3 7.5 24 12 24z"/><path fill="#FBBC05" d="M5.5 14.6a7.2 7.2 0 0 1 0-4.6V7H1.7a12 12 0 0 0 0 10.6l3.8-3z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.5 0 3.6 2.7 1.7 6.4l3.8 3C6.4 6.7 9 4.8 12 4.8z"/></svg></div>
      <span class="oauth-lb">Google</span>
    </div>
  </div>
  <div style="flex:1"></div>
  <div style="text-align:center;padding:18px 0 26px;">
    <div style="font-size:11.5px;color:var(--text-faint);line-height:1.6;">登录即代表同意<span class="agree-link">《用户协议》</span>和<span class="agree-link">《隐私政策》</span></div>
  </div>
</div>`);

add('A · 启动 / 账号','验证码','A3 · 输入 + 倒计时',`
${statusbar}
${nav('',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding:12px 28px;">
  <div style="font-size:24px;font-weight:800;margin:14px 0 8px;">输入验证码</div>
  <div style="font-size:14px;color:var(--text-muted);margin-bottom:28px;">邮箱验证码已发送至 l****u@gmail.com</div>
  <div class="field-code">
    <div class="code-cell">2</div><div class="code-cell">7</div><div class="code-cell">4</div>
    <div class="code-cell active">|</div><div class="code-cell"></div><div class="code-cell"></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:13.5px;color:var(--text-faint);">51s 后可重新发送</span>
    <span class="link-c">换个方式登录</span>
  </div>
  <button class="btn-full btn-primary" style="margin-top:32px;">登录</button>
</div>`);

// A5 注册账号（登录页"注册账号"进入）—— 只走邮箱：邮箱 + 邮箱验证码 + 设置密码
add('A · 启动 / 账号','注册账号','A5 · 邮箱注册',`
${statusbar}
${nav('注册账号',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding:12px 28px;">
  <div style="font-size:22px;font-weight:800;margin:10px 0 6px;">创建无为账号</div>
  <div style="font-size:13.5px;color:var(--text-muted);margin-bottom:24px;">用邮箱注册，一个账号多端通用</div>
  <div class="field">${svg(I.chat,18)}<span class="ph">邮箱地址</span></div>
  <div class="field" style="padding-right:6px;">${svg(I.shield,18)}<span class="ph" style="flex:1;">邮箱验证码</span>
    <button style="flex:0 0 auto;height:34px;padding:0 14px;border:none;border-radius:9px;background:var(--accent-soft);color:var(--accent);font-size:13px;font-weight:650;cursor:pointer;">获取验证码</button></div>
  <div class="field">${svg(I.lock,18)}<span class="ph">设置密码（8-20 位）</span></div>
  <label style="display:flex;align-items:flex-start;gap:8px;margin:14px 2px 4px;font-size:11.5px;color:var(--text-faint);line-height:1.6;cursor:pointer;">
    <span style="flex:0 0 auto;width:16px;height:16px;border-radius:5px;background:var(--accent);display:grid;place-items:center;margin-top:1px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span>
    <span>我已阅读并同意<span class="agree-link">《用户协议》</span>和<span class="agree-link">《隐私政策》</span></span>
  </label>
  <button class="btn-full btn-primary" style="margin-top:18px;">注册并登录</button>
  <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--text-muted);">已有账号？<span class="link-c">去登录</span></div>
</div>`);

// A6 忘记密码（登录页"忘记密码?"进入）—— 邮箱 + 邮箱验证码 + 设置新密码
add('A · 启动 / 账号','忘记密码','A6 · 邮箱重置',`
${statusbar}
${nav('重置密码',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding:12px 28px;">
  <div style="font-size:22px;font-weight:800;margin:10px 0 6px;">找回你的账号</div>
  <div style="font-size:13.5px;color:var(--text-muted);margin-bottom:24px;">验证邮箱后设置新密码</div>
  <div class="field">${svg(I.chat,18)}<span class="ph">注册邮箱</span></div>
  <div class="field" style="padding-right:6px;">${svg(I.shield,18)}<span class="ph" style="flex:1;">邮箱验证码</span>
    <button style="flex:0 0 auto;height:34px;padding:0 14px;border:none;border-radius:9px;background:var(--accent-soft);color:var(--accent);font-size:13px;font-weight:650;cursor:pointer;">获取验证码</button></div>
  <div class="field">${svg(I.lock,18)}<span class="ph">设置新密码（8-20 位）</span></div>
  <div class="field">${svg(I.lock,18)}<span class="ph">确认新密码</span></div>
  <button class="btn-full btn-primary" style="margin-top:18px;">确认重置</button>
  <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--text-muted);"><span class="link-c">返回登录</span></div>
</div>`);

add('A · 启动 / 账号','首次引导','A4 · 3 屏之一 · 可跳过',`
${statusbar}
<div class="navbar"><div style="width:36px"></div><span></span><div class="nav-text">跳过</div></div>
<div class="content" style="display:flex;flex-direction:column;text-align:center;padding:0 32px;">
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">
    ${fireLogo()}
    <div style="font-size:22px;font-weight:800;margin:8px 0 12px;">随身接着聊</div>
    <div style="font-size:15px;color:var(--text-muted);line-height:1.7;">桌面上没聊完的活，掏出手机继续。<br>你的 AI 同事随时在线待命。</div>
  </div>
  <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;">
    <span style="width:22px;height:6px;border-radius:3px;background:var(--spark);"></span>
    <span style="width:6px;height:6px;border-radius:3px;background:var(--border-strong);"></span>
    <span style="width:6px;height:6px;border-radius:3px;background:var(--border-strong);"></span>
  </div>
  <button class="btn-full btn-primary" style="margin-bottom:30px;">下一步</button>
</div>`);

// A4-2 首次引导第2屏 —— 远程操控电脑
add('A · 启动 / 账号','首次引导 2','A4-2 · 3 屏之二',`
${statusbar}
<div class="navbar"><div style="width:36px"></div><span></span><div class="nav-text">跳过</div></div>
<div class="content" style="display:flex;flex-direction:column;text-align:center;padding:0 32px;">
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">
    <div style="width:84px;height:84px;border-radius:22px;background:var(--accent-soft);display:grid;place-items:center;color:var(--accent);margin-bottom:8px;">${svg(I.laptop,40)}</div>
    <div style="font-size:22px;font-weight:800;margin:8px 0 12px;">远程操控你的电脑</div>
    <div style="font-size:15px;color:var(--text-muted);line-height:1.7;">手机发一句，电脑上的无为就接着跑。<br>选哪台在线电脑、用订阅还是按量，随你。</div>
  </div>
  <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;">
    <span style="width:6px;height:6px;border-radius:3px;background:var(--border-strong);"></span>
    <span style="width:22px;height:6px;border-radius:3px;background:var(--spark);"></span>
    <span style="width:6px;height:6px;border-radius:3px;background:var(--border-strong);"></span>
  </div>
  <button class="btn-full btn-primary" style="margin-bottom:30px;">下一步</button>
</div>`);

// A4-3 首次引导第3屏 —— 审批把关
add('A · 启动 / 账号','首次引导 3','A4-3 · 3 屏之三',`
${statusbar}
<div class="navbar"><div style="width:36px"></div><span></span><div style="width:36px"></div></div>
<div class="content" style="display:flex;flex-direction:column;text-align:center;padding:0 32px;">
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">
    <div style="width:84px;height:84px;border-radius:22px;background:var(--green-bg);display:grid;place-items:center;color:var(--green);margin-bottom:8px;">${svg(I.shield,40)}</div>
    <div style="font-size:22px;font-weight:800;margin:8px 0 12px;">危险操作你说了算</div>
    <div style="font-size:15px;color:var(--text-muted);line-height:1.7;">删文件、改配置等高风险动作，<br>会推到手机等你一键拍板，不怕 AI 乱来。</div>
  </div>
  <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;">
    <span style="width:6px;height:6px;border-radius:3px;background:var(--border-strong);"></span>
    <span style="width:6px;height:6px;border-radius:3px;background:var(--border-strong);"></span>
    <span style="width:22px;height:6px;border-radius:3px;background:var(--spark);"></span>
  </div>
  <button class="btn-full btn-primary" style="margin-bottom:30px;">开始使用</button>
</div>`);

// A7 用户协议全文（登录/注册页协议链接进入）—— 占位版标准框架
add('A · 启动 / 账号','用户协议','A7 · 全文阅读 · 只读',`
${statusbar}
${nav('用户协议',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding:4px 20px 20px;">
  <div class="doc-body">
    <div class="doc-meta">版本 v1.0 · 生效日期 2026-01-01 · 最后更新 2026-01-01</div>
    <div class="doc-h">1. 服务说明</div>
    <div class="doc-p">本协议是您与"无为"之间关于使用本产品及相关服务所订立的协议。无为向您提供 AI 对话、任务协作、远程查看与审批等功能。您使用本服务即视为已阅读并同意本协议全部条款。</div>
    <div class="doc-h">2. 账号与注册</div>
    <div class="doc-p">您需使用有效邮箱注册账号，并对账号下的一切活动负责。请妥善保管账号与密码，因保管不善造成的损失由您自行承担。您承诺注册信息真实、准确、完整。</div>
    <div class="doc-h">3. 用户行为规范</div>
    <div class="doc-p">您承诺不利用本服务从事任何违反法律法规、侵犯他人合法权益或干扰服务正常运行的行为，包括但不限于传播违法信息、恶意攻击、滥用算力资源等。</div>
    <div class="doc-h">4. 知识产权</div>
    <div class="doc-p">本产品的软件、界面、商标及相关内容的知识产权归无为所有。您使用服务过程中生成的内容，其权利归属依照相关法律及另行约定执行。</div>
    <div class="doc-h">5. 免责声明</div>
    <div class="doc-p">本服务按"现状"提供。在法律允许的最大范围内，对于因不可抗力、第三方原因或您自身操作导致的服务中断、数据损失等，无为不承担责任。AI 生成内容仅供参考，请您自行判断并核实。</div>
    <div class="doc-h">6. 协议变更</div>
    <div class="doc-p">我们可能根据业务调整修订本协议，变更后将在应用内公示。若您在变更生效后继续使用服务，即视为接受修订内容。</div>
    <div class="doc-h">7. 联系方式</div>
    <div class="doc-p">如对本协议有任何疑问，可通过"我 - 关于与帮助 - 联系客服"与我们联系。</div>
    <div class="doc-p" style="margin-top:16px;color:var(--text-faint);">（以上为占位框架，法务细则以正式版本为准。）</div>
  </div>
</div>`);

// A8 隐私政策全文
add('A · 启动 / 账号','隐私政策','A8 · 全文阅读 · 只读',`
${statusbar}
${nav('隐私政策',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding:4px 20px 20px;">
  <div class="doc-body">
    <div class="doc-meta">版本 v1.0 · 生效日期 2026-01-01 · 最后更新 2026-01-01</div>
    <div class="doc-h">1. 信息收集范围</div>
    <div class="doc-p">为提供服务，我们可能收集您的账号信息（邮箱）、设备信息、对话内容及操作日志。我们仅收集实现功能所必需的信息。</div>
    <div class="doc-h">2. 信息使用方式</div>
    <div class="doc-p">所收集的信息用于账号登录、服务提供、安全风控、功能改进与必要的客户支持，不会用于与上述目的无关的用途。</div>
    <div class="doc-h">3. 信息存储与安全</div>
    <div class="doc-p">我们采用加密传输与访问控制等安全措施保护您的信息。远程查看电脑端内容时，数据经加密通道实时读取、不在云端落库。信息存储期限不超过实现目的所必需的时间。</div>
    <div class="doc-h">4. 第三方共享</div>
    <div class="doc-p">除法律要求或为实现功能必需（如第三方模型服务商、登录服务 Google）外，我们不会向第三方共享您的个人信息；共享时将要求对方遵守保密义务。</div>
    <div class="doc-h">5. 您的权利</div>
    <div class="doc-p">您有权查询、更正、删除您的个人信息，并可申请注销账号。您可在"账号与安全"中管理，或通过客服行使上述权利。</div>
    <div class="doc-h">6. Cookie 与设备信息</div>
    <div class="doc-p">我们可能使用必要的本地存储与设备标识以维持登录状态、保障服务安全，不用于跨应用追踪。</div>
    <div class="doc-h">7. 政策更新</div>
    <div class="doc-p">本政策如有更新将在应用内公示，重大变更会以显著方式提示您。</div>
    <div class="doc-h">8. 联系我们</div>
    <div class="doc-p">如对隐私保护有任何疑问或投诉，可通过"我 - 关于与帮助 - 联系客服"与我们联系。</div>
    <div class="doc-p" style="margin-top:16px;color:var(--text-faint);">（以上为占位框架，法务细则以正式版本为准。）</div>
  </div>
</div>`);

// ========== B 对话模块 ==========
add('B · 对话','会话列表','B1 · 登录后会话列表 · 标设备',`
${statusbar}
<div class="navbar"><span class="big-title">对话</span><div class="nav-btn plain">${svg(I.search)}</div></div>
<div class="content">
  <div class="device-entry">
    <div class="de-head"><span class="de-title">在线电脑 · 2</span><span class="de-more">全部 ${svg(I.chevR,13)}</span></div>
    <div class="de-rows">
      <div class="de-row">
        <div class="de-ic">${svg(I.laptop,18)}</div>
        <div class="de-info"><span class="de-name">MacBook-Pro（我的）</span><span class="de-sub"><span class="on-dot"></span>在线 · Claude Code 订阅 · 周已用 32%</span></div>
        ${svg(I.chevR,16)}
      </div>
      <div class="de-row">
        <div class="de-ic">${svg(I.laptop,18)}</div>
        <div class="de-info"><span class="de-name">办公室台式机</span><span class="de-sub"><span class="on-dot"></span>在线 · Codex 订阅 · 周已用 8%</span></div>
        ${svg(I.chevR,16)}
      </div>
    </div>
  </div>
  <div class="sec-label" style="margin-top:4px;">最近对话</div>
  ${[
    ['码','av-spark','小码 · 部署 wuwei-site','已上线，公网 200。','刚刚','MacBook-Pro（我的）'],
    ['移','av-accent','小移 · 手机端脚手架','好，我先初始化 Expo + expo-router…','14:26','MacBook-Pro（我的）'],
    ['数','av-accent','小数 · 周报取数','本月回款趋势已出，8 月是峰值…','2 小时前','办公室台式机'],
    ['文','av-green','小文 · 落地页文案','这版文案我按"说人话"重写了…','昨天','办公室台式机'],
  ].map(([a,c,t,m,tm,dev])=>`
  <div class="chat-item">
    <div class="avatar av-sm ${c}">${a}</div>
    <div class="chat-main">
      <div class="chat-row1"><span class="chat-name" style="font-size:14.5px">${t}</span><span class="chat-time">${tm}</span></div>
      <div class="chat-msg">${m}</div>
      <div class="chat-dev">${svg(I.laptop,12)}<span>${dev}</span></div>
    </div>
  </div>`).join('')}
</div>
<div class="fab">${svg(I.plus)}</div>
${tabbar('chat')}`);

add('B · 对话','新建对话','B4 · 先选执行设备 → 选员工/开聊',`
${statusbar}
${nav('新建对话',{right:'<div class="nav-text">取消</div>'})}
<div class="content">
  <div class="sec-label">执行设备</div>
  <div class="dev-pick">
    <div class="dev-ic">${svg(I.laptop,20)}</div>
    <div class="dev-main">
      <div class="dev-name">MacBook-Pro（我的）</div>
      <div class="dev-sub"><span class="on-dot"></span>在线 · Claude Code 订阅 · 周已用 32%</div>
    </div>
    ${svg(I.chevR,18)}
  </div>
  <div class="dev-hint">对话将在这台电脑的无为上远程运行 · 仅一台时默认选中</div>
  <div class="sec-label">直接开聊</div>
  <div class="output-card" style="background:var(--accent-soft);border-color:rgba(39,74,99,.2);">
    <div class="out-ico" style="background:var(--accent);color:#fff;">${svg(I.chat,20)}</div>
    <div style="flex:1"><div style="font-size:14.5px;font-weight:650;">和"无为"对话</div>
      <div style="font-size:12.5px;color:var(--text-muted);">自动派给最合适的同事</div></div>
    ${svg(I.chevR,18)}
  </div>
  <div class="sec-label">选择同事</div>
  ${[['移','av-accent','小移','移动端设计'],['码','av-spark','小码','工程开发'],['文','av-green','小文','文案策划'],['数','av-accent','小数','数据分析'],['美','av-plum','小美','视觉设计']].map(([a,c,n,d])=>`
  <div class="list-row"><div class="avatar av-sm ${c}">${a}</div>
    <div class="list-main"><div class="list-t">${n}</div><div class="list-d">${d}</div></div>
    ${svg(I.chevR,18)}</div>`).join('')}
</div>`);

add('B · 对话','会话搜索','B5 · 跨会话搜内容',`
${statusbar}
<div class="navbar"><div class="nav-back">${svg(I.back,22)}</div>
  <div class="search" style="flex:1;margin:0 8px;">${svg(I.search,18)}<span style="color:var(--text)">脚手架</span></div>
  <div class="nav-text">取消</div></div>
<div class="content">
  <div class="sec-label">3 条结果</div>
  ${[['码','av-spark','小码 · 手机端脚手架','…帮我把 <b style="color:var(--accent)">脚手架</b> 初始化好，装上导航…','刚刚'],
     ['移','av-accent','小移 · App 设计评审','…等 <b style="color:var(--accent)">脚手架</b> 跑通我对照标注切图…','昨天'],
     ['笨','av-gold','小笨 · 本周计划','…先出 <b style="color:var(--accent)">脚手架</b> 再铺页面…','周一']].map(([a,c,t,m,tm])=>`
  <div class="chat-item"><div class="avatar av-sm ${c}">${a}</div>
    <div class="chat-main"><div class="chat-row1"><span class="chat-name" style="font-size:14.5px">${t}</span><span class="chat-time">${tm}</span></div>
    <div class="chat-msg">${m}</div></div></div>`).join('')}
</div>`);

// ---- B2 对话详情（主战场·重点打磨）----
// B2a：运行中 · 订阅版（顶部余量条 + 模型胶囊 + 多种消息类型）
add('B · 对话','对话详情 · 运行中','B2a · 订阅版 · 全消息类型',`
${statusbar}
${nav('小码 · 手机端脚手架',{right:'<div class="nav-btn plain">'+svg(I.chevR)+'</div>'})}
${quotaStrip()}
<div class="content">
  <div class="msg-flow">
    <div class="ai-name" style="text-align:center;color:var(--text-faint);font-size:11.5px;margin:2px 0;">今天 14:26</div>
    <div class="msg-row user"><div class="bubble-user">帮我把 Expo 脚手架搭好，跑通首页</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div>
      <div class="ai-text">好，我先初始化 Expo + expo-router，再装状态管理。开跑：</div>
      <div class="tool-row"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px;color:var(--green)">${I.terminal}</svg><span class="tool-name">终端</span><span class="tool-cmd">npm install expo-router zustand</span><span class="tool-status st-ok">✓</span></div>
      <div class="tool-row"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px;color:var(--accent)">${I.file}</svg><span class="tool-name">写文件</span><span class="tool-cmd">app/(tabs)/index.tsx</span><span class="tool-status st-ok">✓</span></div>
      <div class="code-block"><div class="cb-head"><span>app/(tabs)/index.tsx</span><span>复制</span></div>
        <div class="cb-body"><span class="cm">// 首页入口</span><br><span class="kw">export default function</span> Home() {<br>&nbsp;&nbsp;<span class="kw">return</span> &lt;View&gt;&lt;Text&gt;<span class="st">你好，无为</span>&lt;/Text&gt;&lt;/View&gt;<br>}</div></div>
      <div class="ai-text" style="margin-top:8px;">首页已生成，正在启动开发服务器预览：</div>
      <div class="tool-row"><div class="spin"></div><span class="tool-name">终端</span><span class="tool-cmd">expo start --ios</span><span class="tool-status st-run">运行中</span></div>
      </div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div>
      <div class="ai-text">预览出来了，你看下首页效果：</div>
      <div class="img-msg"><div class="img-ph">📱 首页预览截图</div></div>
      </div></div>
    <div class="msg-row user"><div class="bubble-user">顺手把我本地那个 2G 的 SQLite 库导出成 Excel 发我</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div>
      <div class="boundary-note">
        <svg class="bn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
        <div class="bn-body"><div class="bn-title">这步请在电脑端完成</div>
          <div class="bn-text">导出本地 2G 数据库涉及<b>读写本地文件与重算力</b>，手机端做不了。请到<b>电脑端无为</b>让我跑，导出后可随时在手机上查看结果。</div></div>
      </div>
      <div class="ai-text" style="margin-top:8px;">需要的话我把要执行的命令先给你备好，你回到电脑端一键发起 👍</div>
      </div></div>
  </div>
</div>
${inputStack('Claude Sonnet 5','running')}`);

// B2b-1：模型选择 sheet 第一级 —— 执行位置 + 平台分组（点胶囊弹出）
add('B · 对话','模型选择 ①执行位置+平台','B2b-1 · 点胶囊 → 两级 sheet',`
${statusbar}
${nav('小码 · 手机端脚手架',{right:'<div class="nav-btn plain">'+svg(I.chevR)+'</div>'})}
${quotaStrip()}
<div class="content" style="filter:blur(1.5px);opacity:.4;">
  <div class="msg-flow">
    <div class="msg-row user"><div class="bubble-user">帮我把 Expo 脚手架搭好</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div><div class="ai-text">好，我先初始化…</div></div></div>
  </div>
</div>
<div class="drawer-mask"><div class="sheet">
  <div class="drawer-handle"></div>
  <div class="sheet-title">选择模型</div>
  <div class="sheet-sub">清单与倍率由后端实时返回 · 倍率=相对最低价的消耗倍数</div>
  ${execLocation()}
  <div class="sheet-divider"></div>
  <div class="sheet-grouphd">模型平台 <span>13 个平台 · 共 46 款</span></div>
  ${PROVIDERS.map(p=>`
  <div class="model-opt ${p.on?'opt-on':''}">
    <div class="mo-ic" style="background:${p.bg}">${p.ic}</div>
    <div class="mo-main"><div class="mo-name">${p.name}</div><div class="mo-desc">${p.note}</div></div>
    <span class="mult ${multClass(p.min)}">${p.min==='免费'?'免费':p.min+' 起'}</span>
    ${svg(I.chevR,16)}
  </div>`).join('')}
</div></div>`);

// B2b-2：模型选择 sheet 第二级 —— 展开 Claude 平台下真实模型
add('B · 对话','模型选择 ②平台内模型','B2b-2 · 选平台 → 具体模型',`
${statusbar}
${nav('小码 · 手机端脚手架',{right:'<div class="nav-btn plain">'+svg(I.chevR)+'</div>'})}
${quotaStrip()}
<div class="content" style="filter:blur(1.5px);opacity:.4;">
  <div class="msg-flow">
    <div class="msg-row user"><div class="bubble-user">帮我把 Expo 脚手架搭好</div></div>
  </div>
</div>
<div class="drawer-mask"><div class="sheet">
  <div class="drawer-handle"></div>
  <div class="sheet-back"><span class="sb-ico">${svg(I.back,18)}</span><span>Claude</span><span class="sb-sub">8 款 · 均衡到顶配</span></div>
  ${CLAUDE_MODELS.map(m=>`
  <div class="model-opt ${m.on?'opt-on':''}">
    <div class="mo-ic" style="background:#c05f3c;font-size:11px">C</div>
    <div class="mo-main"><div class="mo-name">${m.name}</div><div class="mo-desc">${m.desc}</div></div>
    <span class="mult ${multClass(m.mult)}">${m.mult}</span>
    ${m.on?'<span class="mo-check">'+svg(I.check,20)+'</span>':'<span style="width:20px"></span>'}
  </div>`).join('')}
  <div class="sheet-foot">倍率越高消耗越快 · 订阅版按倍率折算额度，按量付费按真实币价结算</div>
</div></div>`);

add('B · 对话','对话详情 · 按量付费','B2c · 无余量条 · 待输入',`
${statusbar}
${nav('小移 · App 设计评审',{right:'<div class="nav-btn plain">'+svg(I.chevR)+'</div>'})}
<div class="content">
  <div class="msg-flow">
    <div class="msg-row user"><div class="bubble-user">四页高保真我看完了，浅色方向对了</div></div>
    <div class="msg-row"><div class="ai-av" style="background:linear-gradient(135deg,#7fb0be,#5b8a98)">移</div><div class="ai-body"><div class="ai-name">小移</div>
      <div class="ai-text">收到！那我按浅色规范铺完剩余页面，并把对话页三个核心需求一起做了：模型选择、余量条、消息流打磨。</div></div></div>
    <div class="msg-row user"><div class="bubble-user">好，质量优先</div></div>
  </div>
</div>
${inputStack('Claude Sonnet 5','idle')}
<div style="position:absolute;bottom:98px;left:16px;font-size:10.5px;color:var(--text-faint);background:var(--bg);padding:2px 8px;border-radius:6px;border:1px solid var(--border);">↑ 按量付费无余量条</div>`);

add('B · 对话','对话详情·工具抽屉','B3 · 点工具行展开',`
${statusbar}
${nav('小码 · 手机端脚手架')}
<div class="content" style="filter:blur(1px);opacity:.5;">
  <div class="msg-flow">
    <div class="msg-row user"><div class="bubble-user">帮我初始化 Expo 项目</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div>
      <div class="ai-text">好，正在装依赖…</div></div></div>
  </div>
</div>
<div class="drawer-mask"><div class="drawer">
  <div class="drawer-handle"></div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
    <svg class="i" viewBox="0 0 24 24" style="width:18px;height:18px;color:var(--green)">${I.terminal}</svg>
    <span style="font-size:15px;font-weight:700;flex:1">终端 · npm install</span>
    <span class="tool-status st-ok">✓ 完成</span>
  </div>
  <div class="kv"><span class="k">命令</span><span class="v">npm install expo-router zustand</span></div>
  <div class="kv"><span class="k">耗时</span><span class="v">8.4s</span></div>
  <div class="kv"><span class="k">退出码</span><span class="v" style="color:var(--green)">0</span></div>
  <div class="detail-label" style="margin:16px 0 8px;">输出</div>
  <div class="cmd-view" style="max-height:140px;overflow:auto;">$ npm install expo-router zustand<br>added 214 packages in 8s<br>72 packages are looking for funding<br><span style="color:var(--green)">✓ done</span></div>
  <button class="btn-full btn-ghost" style="margin-top:16px;">收起</button>
</div></div>`);

// B6：语音输入 —— 按住说话（录音中 / 转写中 / 失败提示 三态）
function voiceBase(){ return `${statusbar}
${nav('小码 · 手机端脚手架',{right:'<div class="nav-btn plain">'+svg(I.chevR)+'</div>'})}
<div class="content" style="opacity:.6;">
  <div class="msg-flow">
    <div class="msg-row user"><div class="bubble-user">刚才那个报错怎么解决</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div>
      <div class="ai-text">你把完整报错贴我，或直接语音说也行。</div></div></div>
  </div>
</div>`; }

// 声波竖条（随机高度+错峰动画，静态图里也有层次）
function waveform(n){
  let bars='';
  for(let i=0;i<n;i++){ const h=6+Math.round(Math.random()*22); const d=(Math.random()*0.9).toFixed(2);
    bars+=`<span style="height:${h}px;animation-delay:${d}s"></span>`; }
  return `<div class="waveform">${bars}</div>`;
}

// B6a：实时识别中 —— 边说边上屏（已确认黑 + 临时识别灰）+ 声波 + 停止/取消
add('B · 对话','语音输入 · 实时识别','B6a · 边说边出字 + 声波',`
${voiceBase()}
<div class="voice-panel">
  <div class="vp-cancel-tip"><span class="vp-chevron">${svg(I.back,14).replace('class="i"','class="i" style="transform:rotate(90deg);width:14px;height:14px"')}</span>上滑取消</div>
  <div class="vp-live">帮我把登录页的报错<span class="interim">贴到对话里一起看</span><span class="caret"></span></div>
  <div class="vp-row">
    <div class="vp-x">${svg(I.plusSm,20).replace('M12 5v14M5 12h14','M6 6l12 12M18 6L6 18')}</div>
    ${waveform(26)}
    <div class="vp-stop">${svg(I.check,22)}</div>
  </div>
  <div style="font-size:10.5px;color:var(--text-faint);text-align:center;margin-top:10px;">说话时文字实时上屏 · 点 ✓ 结束并填入输入框，确认再发送</div>
</div>`);

// B6b：上滑取消 · 松手激活态（红）—— 展示取消手势反馈
add('B · 对话','语音输入 · 上滑取消','B6b · 松手即取消',`
${voiceBase()}
<div class="voice-panel cancel">
  <div class="vp-cancel-tip armed">${svg(I.plusSm,14).replace('M12 5v14M5 12h14','M6 6l12 12M18 6L6 18')} 松手取消本次语音</div>
  <div class="vp-live" style="opacity:.4;">帮我把登录页的报错<span class="interim">贴到对话里一起看</span></div>
  <div class="vp-row">
    <div class="vp-x" style="background:var(--red);color:#fff;border:none;">${svg(I.plusSm,20).replace('M12 5v14M5 12h14','M6 6l12 12M18 6L6 18')}</div>
    ${waveform(26)}
    <div class="vp-stop">${svg(I.check,22)}</div>
  </div>
  <div style="font-size:10.5px;color:var(--red);text-align:center;margin-top:10px;font-weight:600;">手指已上滑到取消区 · 松手将丢弃本次识别</div>
</div>`);

// B6c：识别失败兜底（无网/无权限/没听清）
add('B · 对话','语音输入 · 失败兜底','B6c · 无网/无权限/没听清',`
${voiceBase()}
<div class="toast-fail">${svg(I.warn,16)}<span>没听清或网络不稳，实时识别中断了。可重试或直接打字</span></div>
<div class="input-stack">
  <div class="input-line">
    <div class="ic-btn">${svg(I.plusSm,20)}</div>
    <div class="input-box" style="flex:1;"><span class="ph" style="color:var(--text-faint)">发消息…</span></div>
    <div class="ic-btn">${svg(I.mic,18)}</div>
  </div>
  <div style="font-size:10.5px;color:var(--text-faint);margin-top:6px;padding-left:4px;">提示 2 秒后自动消失 · 首次需在系统弹窗允许麦克风权限</div>
</div>`);

// ========== C 任务进度模块 ==========
// 任务列表主体（A/B 两个入口方案共用，保证对比公平）
const progressBody = `
  <div class="seg"><span class="s on">运行中 2</span><span class="s">排队 1</span><span class="s">已完成</span></div>
  ${[['搭建 RN 脚手架并跑通首页','码','av-spark','pill-run','● 运行中','第 3/6 步',45],
     ['生成上周数据周报','数','av-accent','pill-run','● 运行中','取数中',20]].map(([t,a,c,pc,ps,step,pct])=>`
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
      <span style="font-size:15.5px;font-weight:650;line-height:1.35;max-width:70%">${t}</span>
      <span class="pill ${pc}">${ps}</span></div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
      <span class="mini-av ${c}">${a}</span><span style="font-size:12.5px;color:var(--text-dim)">${a==='码'?'小码':'小数'}</span>
      <span style="font-size:12px;color:var(--text-faint);margin-left:auto">更新于 1 分钟前</span></div>
    <div class="prog-row"><span>${step}</span><span style="color:var(--accent)">${pct}%</span></div>
    <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
  </div>`).join('')}
  <div class="sec-label">排队中</div>
  <div class="card" style="opacity:.75;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <span style="font-size:15.5px;font-weight:650;max-width:70%">导出落地页三版文案</span>
      <span class="pill pill-queue">○ 排队</span></div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:10px;">
      <span class="mini-av av-green">文</span><span style="font-size:12.5px;color:var(--text-dim)">小文 · 等待前置任务</span></div>
  </div>`;

// 【进度页】定时任务入口 = 方案A（已拍板）：右上角时钟图标 + "定时"文字标签
add('C · 进度','进度','C1 · 进度首页（定时入口=图标+文字）',`
${statusbar}
<div class="navbar"><span class="big-title">进度</span>
  <div style="display:flex;align-items:center;gap:4px;color:var(--accent);font-size:13px;font-weight:600;cursor:pointer;padding:6px 8px;">${svg(I.clock,18)}<span>定时</span></div>
</div>
<div class="content">${progressBody}</div>
${tabbar('chart')}`);

add('C · 进度','定时任务','C3 · 只读+开关',`
${statusbar}
${nav('定时任务',{right:'<div class="nav-text" style="color:var(--text-faint)">桌面创建</div>'})}
<div class="content">
  <div style="font-size:12.5px;color:var(--text-muted);margin:6px 2px 12px;line-height:1.5;">手机端可查看与开关，新建定时任务请在桌面端操作。</div>
  ${[['每日数据周报','数','av-accent','每天 09:00',true],
     ['官网健康巡检','码','av-spark','每 30 分钟',true],
     ['周五复盘提醒','文','av-green','每周五 18:00',false]].map(([t,a,c,freq,on])=>`
  <div class="list-row"><div class="avatar av-sm ${c}">${a}</div>
    <div class="list-main"><div class="list-t" style="font-size:14.5px">${t}</div>
      <div class="list-d">${svg(I.clock,12).replace('class="i"','class="i" style="width:12px;height:12px;vertical-align:-1px;display:inline"')} ${freq}</div></div>
    <div class="switch ${on?'':'off'}"></div></div>`).join('')}
</div>`);

// ========== D 审批模块 ==========
add('D · 审批','审批中心列表','D1 · Tab3 · 红点',`
${statusbar}
<div class="navbar"><span class="big-title">审批</span><div class="nav-btn plain">${svg(I.clock)}</div></div>
<div class="content">
  <div style="font-size:11.5px;color:var(--text-faint);background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin:4px 0 12px;line-height:1.5;">⚡ 远程电脑正阻塞等待你的决定 · <b style="color:var(--warn)">60 秒内不处理将自动拒绝</b></div>
  <div class="sec-label">待处理 · 2</div>

  <div class="card appr-card" style="border-left:3px solid var(--red);">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span class="risk-badge risk-high">${svg(I.warn,14)} 需要你决定</span>
      <span class="appr-count low">${svg(I.clock,13)} 00:48</span></div>
    <div class="appr-dev">💻 MacBook-Pro（我的）· 小码问你</div>
    <div class="appr-ctx"><span class="appr-ctx-label">来自对话</span>小码 · 部署 wuwei-site</div>
    <div class="decide-q">测试日志表 test_logs 里有 2.1 万条记录，怎么处理？</div>
    <div class="decide-opts">
      <button class="decide-opt"><span class="do-main">先备份再删</span><span class="do-sub">导出一份再清空，最稳妥（推荐）</span></button>
      <button class="decide-opt"><span class="do-main">直接删除</span><span class="do-sub">不保留，彻底清空 · 不可恢复</span></button>
      <button class="decide-opt"><span class="do-main">保留不动</span><span class="do-sub">只清缓存，日志表不碰</span></button>
    </div>
    <div class="appr-view" style="margin-top:10px;">${svg(I.chat,14)}<span>查看完整对话</span>${svg(I.chevR,15)}</div>
  </div>

  <div class="card appr-card" style="border-left:3px solid var(--warn);">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span class="risk-badge risk-mid">${svg(I.warn,14)} 需要你决定</span>
      <span class="appr-count">${svg(I.clock,13)} 00:55</span></div>
    <div class="appr-dev">💻 办公室台式机 · 小数问你</div>
    <div class="appr-ctx"><span class="appr-ctx-label">来自对话</span>小数 · 周报取数</div>
    <div class="decide-q">生产环境数据库连接串要更新，是否应用这次改动？</div>
    <div class="decide-opts">
      <button class="decide-opt"><span class="do-main">应用并备份原配置</span><span class="do-sub">改之前自动存一份旧配置（推荐）</span></button>
      <button class="decide-opt"><span class="do-main">仅本次应用</span><span class="do-sub">直接覆盖 3 个环境变量</span></button>
      <button class="decide-opt"><span class="do-main">先不改</span><span class="do-sub">保持现状，稍后我自己处理</span></button>
    </div>
    <div class="appr-view" style="margin-top:10px;">${svg(I.chat,14)}<span>查看完整对话</span>${svg(I.chevR,15)}</div>
  </div>

  <div class="sec-label">刚刚处理</div>
  <div class="list-row"><div class="list-ico" style="background:var(--green-bg);color:var(--green)">${svg(I.check,18)}</div>
    <div class="list-main"><div class="list-t" style="font-size:14.5px">安装项目依赖 · <span style="color:var(--text-muted);font-family:var(--mono);font-size:12px">run_command</span></div><div class="list-d">已允许 · 刚刚</div></div></div>
</div>
${tabbar('check')}`);

// ========== E 通讯录/团队 ==========
add('E · 通讯录','通讯录','E1 · 收进「我」',`
${statusbar}
${nav('通讯录',{right:'<div class="nav-btn plain">'+svg(I.search)+'</div>'})}
<div class="content">
  <div class="sec-label">在忙 · 2</div>
  ${[['码','av-spark','小码','正在执行 npm install…',true],['数','av-accent','小数','正在生成图表…',true]].map(([a,c,n,s,run])=>`
  <div class="list-row"><div class="avatar av-sm ${c}">${a}${run?'<span class="run-dot"></span>':''}</div>
    <div class="list-main"><div class="list-t">${n}</div><div class="list-d" style="color:var(--accent)">${s}</div></div>
    ${svg(I.chevR,18)}</div>`).join('')}
  <div class="sec-label">全部同事</div>
  ${[['移','av-accent','小移','移动端设计师'],['文','av-green','小文','文案策划'],['美','av-plum','小美','视觉设计师'],['笨','av-gold','小笨','CEO / 统筹']].map(([a,c,n,d])=>`
  <div class="list-row"><div class="avatar av-sm ${c}">${a}</div>
    <div class="list-main"><div class="list-t">${n}</div><div class="list-d">${d}</div></div>
    ${svg(I.chevR,18)}</div>`).join('')}
</div>`);

add('E · 通讯录','员工详情','E2 · 人设+发起对话',`
${statusbar}
${nav('',{right:'<div style="width:36px"></div>'})}
<div class="content" style="text-align:center;">
  <div class="avatar av-lg av-spark" style="margin:8px auto 14px;">码</div>
  <div style="font-size:20px;font-weight:800;">小码</div>
  <div style="font-size:13.5px;color:var(--text-muted);margin-top:4px;">工程开发 · 全栈</div>
  <div style="display:flex;justify-content:center;gap:8px;margin:14px 0;"><span class="chip">React</span><span class="chip">Node</span><span class="chip">部署运维</span></div>
  <div class="detail-card" style="text-align:left;margin-top:8px;">
    <div class="detail-label">简介</div>
    <div style="font-size:14px;color:var(--text-dim);line-height:1.7;">负责无为各端的工程实现与部署。写代码前先看清现状，动手快、交付稳，不确定的地方会先问清楚再干。</div>
  </div>
  <div class="detail-card" style="text-align:left;">
    <div class="detail-label">最近协作</div>
    <div class="list-row" style="padding:10px 0"><div class="list-ico">${svg(I.chat,16)}</div>
      <div class="list-main"><div class="list-t" style="font-size:14px">手机端脚手架</div><div class="list-d">运行中 · 45%</div></div>${svg(I.chevR,16)}</div>
  </div>
</div>
<div class="bottom-actions"><button class="btn btn-primary">发起对话</button></div>`);

// ========== G 远程设备浏览（/remote/[deviceId]，从模型选择器"查看对话"进入）==========
// 顶部 4 Tab：对话 / 员工 / 群聊 / SOP，实时经 relay 读这台电脑本地内容，不落库
add('G · 远程设备','远程设备 · 对话Tab','G1 · 看这台电脑的会话',`
${statusbar}
${nav('MacBook-Pro（我的）',{right:'<div class="nav-btn plain">'+svg(I.info)+'</div>'})}
<div style="padding:0 16px 2px;display:flex;align-items:center;gap:8px;">
  <span class="on-dot"></span><span style="font-size:12.5px;color:var(--text-dim)">在线 · macOS · Claude Code 订阅 · 周已用 32%</span>
</div>
<div class="rseg"><span class="rs on">对话</span><span class="rs">员工</span><span class="rs">群聊</span><span class="rs">SOP</span></div>
<div class="content" style="padding-top:2px;">
  <div class="sec-label">这台电脑上的会话 · 实时读取</div>
  ${[['小码 · 部署 wuwei-site','刚刚 · 23 条','码','av-spark'],
     ['小数 · 周报取数','2 小时前 · 11 条','数','av-accent'],
     ['小文 · 落地页文案','昨天 · 40 条','文','av-green']].map(([t,d,a,c])=>`
  <div class="chat-item"><div class="avatar av-sm ${c}">${a}</div>
    <div class="chat-main"><div class="chat-row1"><span class="chat-name" style="font-size:14.5px">${t}</span></div>
    <div class="chat-msg">${d}</div></div>${svg(I.chevR,16)}</div>`).join('')}
  <div style="font-size:10.5px;color:var(--text-faint);text-align:center;margin-top:10px;">内容存在这台电脑本地，经加密通道实时读取 · 不上传云端</div>
</div>`);

// 远程浏览页公共头 + Tab 条
function remoteHead(active){
  const tabs=[['对话'],['员工'],['群聊'],['SOP']];
  return `${statusbar}
${nav('MacBook-Pro（我的）',{right:'<div class="nav-btn plain">'+svg(I.info)+'</div>'})}
<div style="padding:0 16px 2px;display:flex;align-items:center;gap:8px;">
  <span class="on-dot"></span><span style="font-size:12.5px;color:var(--text-dim)">在线 · macOS · Claude Code 订阅 · 周已用 32%</span>
</div>
<div class="rseg">${tabs.map(([n])=>`<span class="rs ${n===active?'on':''}">${n}</span>`).join('')}</div>`;
}

add('G · 远程设备','远程设备 · 员工Tab','G2 · 这台电脑的 AI 员工',`
${remoteHead('员工')}
<div class="content" style="padding-top:2px;">
  <div class="sec-label">这台电脑上的 AI 员工 · 5 位</div>
  ${[['码','小码','工程开发 · 全栈','av-spark'],['数','小数','数据分析','av-accent'],['文','小文','文案策划','av-green'],['美','小美','视觉设计','av-plum'],['移','小移','移动端设计','av-accent']].map(([a,n,r,c])=>`
  <div class="list-row"><div class="avatar av-sm ${c}">${a}</div>
    <div class="list-main"><div class="list-t" style="font-size:15px">${n}</div><div class="list-d">${r}</div></div>${svg(I.chevR,16)}</div>`).join('')}
  <div style="font-size:10.5px;color:var(--text-faint);text-align:center;margin-top:12px;">员工与人设存在这台电脑本地 · 手机端只读浏览</div>
</div>`);

add('G · 远程设备','远程设备 · 群聊Tab','G3 · 这台电脑的群聊',`
${remoteHead('群聊')}
<div class="content" style="padding-top:2px;">
  <div class="sec-label">这台电脑上的群聊 · 3 个</div>
  ${[['产','产品攻坚组','小笨、小码、小移 · 42 条','#274a63'],['发','发版协调','小码、小数 · 18 条','#c05f3c'],['周','周会纪要','全员 · 7 条','#3f8f6b']].map(([ic,n,d,bg])=>`
  <div class="chat-item"><div class="avatar av-sm" style="background:${bg}">${ic}</div>
    <div class="chat-main"><div class="chat-row1"><span class="chat-name" style="font-size:14.5px">${n}</span></div>
    <div class="chat-msg">${d}</div></div>${svg(I.chevR,16)}</div>`).join('')}
  <div style="font-size:10.5px;color:var(--text-faint);text-align:center;margin-top:12px;">群聊记录存本地 · 实时读取不落库</div>
</div>`);

add('G · 远程设备','远程设备 · SOP Tab','G4 · 这台电脑的 SOP 库',`
${remoteHead('SOP')}
<div class="content" style="padding-top:2px;">
  <div class="sec-label">这台电脑上的 SOP · 6 篇</div>
  ${[['部署','Vercel 部署标准流程','部署运维 · v3'],['部署','wuwei-site 生产部署','部署运维 · v2'],['复盘','事故复盘模板','研发 · v1'],['隧道','Clash TUN 隧道连通','调试 · v1']].map(([cat,t,d])=>`
  <div class="list-row"><div class="list-ico">${svg(I.file,17)}</div>
    <div class="list-main"><div class="list-t" style="font-size:14.5px">${t}</div><div class="list-d">${cat} · ${d}</div></div>${svg(I.chevR,16)}</div>`).join('')}
  <div style="font-size:10.5px;color:var(--text-faint);text-align:center;margin-top:12px;">SOP 全文存本地 · 手机端只读查看，编辑/新建在桌面端</div>
</div>`);

// 远程只读标注条（4 个二级详情页复用）
function remoteReadonly(txt){
  return `<div style="display:flex;align-items:center;gap:7px;background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin-bottom:12px;">
    <svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px;color:var(--text-faint);flex:0 0 auto">${I.lock}</svg>
    <span style="font-size:11px;color:var(--text-faint);line-height:1.5;">${txt}</span></div>`;
}

// G1a：某条会话详情 —— 远程操控：可续聊（手机发消息→relay→该电脑 agent 执行→回流手机，双向同步）
add('G · 远程设备','远程会话详情','G1a · 远程操控可续聊',`
${statusbar}
${nav('小码 · 部署 wuwei-site',{right:'<div class="nav-btn plain">'+svg(I.info)+'</div>'})}
<div class="remote-ctrl-bar">
  <span class="on-dot"></span>
  <span class="rc-text">正在远程操控 <b>MacBook-Pro（我的）</b></span>
  <span class="rc-tag">同步中</span>
</div>
<div class="content" style="padding-top:8px;">
  <div style="display:flex;align-items:center;gap:7px;background:#EAF0F4;border:1px solid #D4E0E8;border-radius:10px;padding:8px 12px;margin-bottom:12px;">
    <svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px;color:var(--accent);flex:0 0 auto">${I.info}</svg>
    <span style="font-size:11px;color:var(--accent);line-height:1.5;">你发的消息将发送到这台电脑上执行，电脑端可同步查看</span>
  </div>
  <div class="msg-flow">
    <div class="ai-name" style="text-align:center;color:var(--text-faint);font-size:11.5px;margin:2px 0;">今天 10:12</div>
    <div class="msg-row user"><div class="bubble-user">把 wuwei-site 发到生产</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div>
      <div class="ai-text">好，先本地 build standalone，再打包 scp 传服务器原子切换：</div>
      <div class="tool-row"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px;color:var(--green)">${I.terminal}</svg><span class="tool-name">终端</span><span class="tool-cmd">npm run build</span><span class="tool-status st-ok">✓</span></div>
      <div class="tool-row"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px;color:var(--green)">${I.terminal}</svg><span class="tool-name">终端</span><span class="tool-cmd">bash scripts/deploy-standalone.sh</span><span class="tool-status st-ok">✓</span></div>
      <div class="ai-text" style="margin-top:8px;">已上线，公网 200。</div>
      </div></div>
    <div class="ai-name" style="text-align:center;color:var(--text-faint);font-size:11.5px;margin:10px 0 2px;">刚刚 · 手机发送</div>
    <div class="msg-row user"><div class="bubble-user">顺手把 nginx 日志 tail 一下看有没有报错</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码 <span style="font-size:10.5px;color:var(--accent);font-weight:600;">● 远程执行中</span></div>
      <div class="tool-row"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px;color:var(--text-dim)">${I.terminal}</svg><span class="tool-name">终端</span><span class="tool-cmd">tail -f /var/log/nginx/error.log</span><span class="tool-status" style="color:var(--accent)">⟳</span></div>
      </div></div>
  </div>
</div>
${inputStack('Claude Sonnet 4','idle')}
<div class="remote-relay-note">消息经 relay.wuweiai.io 同步到该电脑执行 · 设备 wd_8f3a…（真实链路待与小码对齐）</div>`);

// B2d：对话内就地审批 —— 用户正在对话页，危险操作直接在对话流里弹审批卡（不跳审批Tab）
add('B · 对话','对话详情 · 就地审批','B2d · 底部上拉决策弹窗',`
${statusbar}
${nav('小码 · 部署 wuwei-site',{right:'<div class="nav-btn plain">'+svg(I.info)+'</div>'})}
${quotaStrip()}
<div class="content" style="padding-top:8px;">
  <div class="msg-flow">
    <div class="msg-row user"><div class="bubble-user">清理一下测试环境的缓存和旧日志表</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div>
      <div class="ai-text">缓存可以直接清。不过测试日志表 <b>test_logs</b> 里还有 <b>2.1 万条</b>记录，删了就找不回来了 —— 你想怎么处理？</div></div></div>
  </div>
</div>
${inputStack('Claude Sonnet 4','running')}
<!-- 底部上拉决策弹窗（展开态）：遮罩 + 悬浮卡，可最小化/关闭/自定义输入 -->
<div class="sheet-mask"></div>
<div class="decide-sheet">
  <div class="sheet-grip"></div>
  <div class="decide-sheet-head">
    <span class="risk-badge risk-high">${svg(I.warn,14)} 需要你决定</span>
    <div class="decide-head-right">
      <span class="decide-wait">等你决定</span>
      <span class="decide-min" title="最小化">${svg(I.chevD,18)}</span>
    </div>
  </div>
  <div class="decide-sheet-q">测试日志表 test_logs 里有 2.1 万条记录，删了找不回来，怎么处理？</div>
  <div class="decide-opts">
    <button class="decide-opt"><span class="do-main">先备份再删</span><span class="do-sub">导出一份再清空，最稳妥（推荐）</span></button>
    <button class="decide-opt"><span class="do-main">直接删除</span><span class="do-sub">不保留，彻底清空 · 不可恢复</span></button>
    <button class="decide-opt"><span class="do-main">保留不动</span><span class="do-sub">只清缓存，日志表不碰</span></button>
  </div>
  <div class="decide-custom">
    <div class="decide-custom-box"><span class="ph" style="color:var(--text-faint)">或直接告诉小码怎么做…</span></div>
    <div class="send-btn" style="width:34px;height:34px;">${svg(I.send,16)}</div>
  </div>
  <div class="decide-sheet-foot">
    <span class="decide-foot-link">${svg(I.chevD,13)}查看具体会执行什么</span>
    <span class="decide-note">重要操作 · 不自动执行，一直等你</span>
  </div>
</div>`);

// B2d-2：决策弹窗【最小化态】—— 收成底部一条小悬浮条，上方对话可自由翻看
add('B · 对话','对话详情 · 决策最小化','B2d-2 · 弹窗最小化·可看上下文',`
${statusbar}
${nav('小码 · 部署 wuwei-site',{right:'<div class="nav-btn plain">'+svg(I.info)+'</div>'})}
${quotaStrip()}
<div class="content" style="padding-top:8px;">
  <div class="msg-flow">
    <div class="msg-row user"><div class="bubble-user">清理一下测试环境的缓存和旧日志表</div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div>
      <div class="ai-text">缓存可以直接清。不过测试日志表 <b>test_logs</b> 里还有 <b>2.1 万条</b>记录，删了就找不回来了 —— 你想怎么处理？</div>
      <div class="ai-text" style="margin-top:8px;">补充下：这张表是上个月压测留下的，和线上业务无关；备份导出大概 30MB、几秒钟。</div></div></div>
    <div class="ai-name" style="text-align:center;color:var(--text-faint);font-size:11.5px;margin:6px 0 2px;">↑ 决策已收起，可自由翻看对话上下文</div>
  </div>
</div>
<!-- 最小化提示条（浮在输入框上方）+ 保留底部输入框 -->
<div class="decide-minibar">
  <span class="risk-badge risk-high">${svg(I.warn,13)} 待你决定</span>
  <span class="decide-minibar-txt">日志表怎么处理</span>
  <span class="decide-minibar-up">${svg(I.chevD,16)}</span>
</div>
${inputStack('Claude Sonnet 4','idle')}`);

// G2a：某员工详情（人设/职责/当前状态，只读）
add('G · 远程设备','远程员工详情','G2a · 人设/状态只读',`
${statusbar}
${nav('',{right:'<div style="width:36px"></div>'})}
<div class="content" style="text-align:center;">
  <div class="avatar av-lg av-spark" style="margin:8px auto 14px;position:relative;">码<span class="run-dot"></span></div>
  <div style="font-size:20px;font-weight:800;">小码</div>
  <div style="font-size:13.5px;color:var(--accent);margin-top:4px;">● 正在执行 npm install…</div>
  <div style="display:flex;justify-content:center;gap:8px;margin:14px 0;"><span class="chip">React</span><span class="chip">Node</span><span class="chip">部署运维</span></div>
  ${remoteReadonly('员工人设存在这台电脑本地 · 手机端只读。编辑人设请到桌面端。')}
  <div class="detail-card" style="text-align:left;">
    <div class="detail-label">职责</div>
    <div style="font-size:14px;color:var(--text-dim);line-height:1.7;">负责无为各端工程实现与部署。动手快、交付稳，不确定先问清楚再干。</div>
  </div>
  <div class="detail-card" style="text-align:left;">
    <div class="detail-label">当前状态</div>
    <div class="kv"><span class="k">正在跑</span><span class="v">部署 wuwei-site</span></div>
    <div class="kv" style="border:none"><span class="k">今日消耗</span><span class="v">42 无为币</span></div>
  </div>
</div>`);

// G3a：某群聊详情（远程操控 · 可发消息/语音，和单人对话一致，含订阅版余量条）
add('G · 远程设备','远程群聊详情','G3a · 可发言 · 远程操控',`
${statusbar}
${nav('产品攻坚组',{right:'<div class="nav-btn plain">'+svg(I.info)+'</div>'})}
<div class="remote-ctrl-bar">
  <span class="on-dot"></span>
  <span class="rc-text">正在远程操控 <b>MacBook-Pro（我的）</b> 的群聊</span>
  <span class="rc-tag">同步中</span>
</div>
${quotaStrip()}
<div class="content" style="padding-top:8px;">
  <div class="msg-flow">
    <div class="msg-row"><div class="ai-av" style="background:linear-gradient(135deg,#d4b25e,#a97f2e)">笨</div><div class="ai-body"><div class="ai-name">小笨</div><div class="ai-text">手机端 v3 要逐屏过，重点三块：模型/语音/余量条。</div></div></div>
    <div class="msg-row"><div class="ai-av">码</div><div class="ai-body"><div class="ai-name">小码</div><div class="ai-text">脚手架我这边跑通了，等小移的稿对照重构。</div></div></div>
    <div class="msg-row"><div class="ai-av" style="background:linear-gradient(135deg,#7fb0be,#5b8a98)">移</div><div class="ai-body"><div class="ai-name">小移</div><div class="ai-text">稿今天出，我按真实代码对齐倍率和执行位置。</div></div></div>
    <div class="msg-row user"><div class="bubble-user">@所有人 稿出了我统一核对，别各做各的。</div></div>
  </div>
</div>
${inputStack('Claude Sonnet 4.5', 'idle')}`);

// G4a：某篇 SOP 全文（阅读页，只读，底部注明编辑在桌面端）
add('G · 远程设备','远程 SOP 全文','G4a · 正文阅读 · 只读',`
${statusbar}
${nav('',{right:'<div class="nav-btn plain">'+svg(I.info)+'</div>'})}
<div class="content" style="padding-top:8px;">
  <div style="font-size:19px;font-weight:800;line-height:1.35;">wuwei-site 生产部署标准流程</div>
  <div style="display:flex;gap:8px;margin:8px 0 14px;"><span class="chip">部署运维</span><span class="chip" style="background:var(--green-bg);color:var(--green)">v2 当前版</span></div>
  ${remoteReadonly('SOP 全文存这台电脑本地 · 手机端只读。编辑/新建版本请到桌面端。')}
  <div style="font-size:14px;color:var(--text);line-height:1.8;">
    <div style="font-weight:700;margin:4px 0 6px;">1. 本地构建</div>
    <div style="color:var(--text-dim);">执行 <code style="font-family:var(--mono);background:var(--code-bg);padding:1px 5px;border-radius:4px;">npm run build</code> 产出 standalone 产物，不在服务器 build。</div>
    <div style="font-weight:700;margin:14px 0 6px;">2. 打包上传</div>
    <div style="color:var(--text-dim);">产物打包 scp 传 <code style="font-family:var(--mono);background:var(--code-bg);padding:1px 5px;border-radius:4px;">/opt/wuwei-site</code>，保留 .env.local。</div>
    <div style="font-weight:700;margin:14px 0 6px;">3. 原子切换 + 回滚</div>
    <div style="color:var(--text-dim);">软链指向新版本原子切换，失败自动回滚到上一版。脚本 scripts/deploy-standalone.sh。</div>
  </div>
</div>
<div style="flex:0 0 auto;border-top:1px solid var(--border);background:var(--bg-soft);padding:12px 16px 26px;text-align:center;">
  <span style="font-size:12px;color:var(--text-faint);">编辑 / 新建版本请到桌面端 SOP 库</span>
</div>`);

// ========== F 我/设置 ==========
add('F · 我 / 设置','我','F1 · Tab4',`
${statusbar}
<div class="navbar"><span class="big-title">我</span><div class="nav-btn plain">${svg(I.edit)}</div></div>
<div class="content">
  <div style="display:flex;align-items:center;gap:14px;padding:10px 4px 18px;">
    <div class="avatar av-lg av-accent">笨</div>
    <div><div style="font-size:19px;font-weight:750;">小笨</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:3px;">l****u@gmail.com</div></div>
  </div>
  <div class="wallet">
    <div class="wallet-bal" style="display:flex;align-items:baseline;gap:2px;">
      <svg viewBox="0 0 24 24" width="22" height="22" style="margin-right:4px;align-self:center;"><circle cx="12" cy="12" r="10" fill="none" stroke="#c05f3c" stroke-width="2"/><path d="M12 7v10M9 10h5a1.5 1.5 0 0 1 0 3H9h6" fill="none" stroke="#c05f3c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      328
    </div>
    <div style="font-size:12.5px;color:var(--text-muted);font-weight:600;margin-top:1px;">无为币余额</div>
    <div class="wallet-hint">无为币用于消耗模型额度。充值请前往电脑端或官网，移动端仅供查看。</div>
  </div>
  <div class="pro-card"><div><div style="font-size:15px;font-weight:750;">无为 Pro</div><div style="font-size:12px;opacity:.9;margin-top:2px;">有效期至 2025-12-31 · 续费请前往电脑端/官网</div></div>
    <span style="flex:0 0 auto;white-space:nowrap;background:rgba(255,255,255,.22);padding:6px 12px;border-radius:999px;font-size:11.5px;font-weight:600;">查看权益</span></div>
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-ico">${svg(I.gift,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">每日签到</div></div><div class="list-r">已连续 5 天 ${svg(I.chevR,16)}</div></div>
    <div class="list-row"><div class="list-ico">${svg(I.user,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">通讯录</div></div>${svg(I.chevR,16)}</div>
  </div>
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-ico">${svg(I.lock,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">账号与安全</div></div>${svg(I.chevR,16)}</div>
    <div class="list-row"><div class="list-ico">${svg(I.moon,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">通用设置</div></div><div class="list-r">浅色 ${svg(I.chevR,16)}</div></div>
    <div class="list-row"><div class="list-ico">${svg(I.info,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">关于与帮助</div></div><div class="list-r">v1.0.0 ${svg(I.chevR,16)}</div></div>
  </div>
</div>
${tabbar('user')}`);

add('F · 我 / 设置','账号与安全','F2',`
${statusbar}
${nav('账号与安全',{right:'<div style="width:36px"></div>'})}
<div class="content">
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-main"><div class="list-t" style="font-size:14.5px">邮箱</div></div><div class="list-r">l****u@gmail.com ${svg(I.chevR,16)}</div></div>
    <div class="list-row"><div class="list-main"><div class="list-t" style="font-size:14.5px">Google</div></div><div class="list-r">已绑定 ${svg(I.chevR,16)}</div></div>
    <div class="list-row"><div class="list-main"><div class="list-t" style="font-size:14.5px">修改密码</div></div>${svg(I.chevR,16)}</div>
  </div>
  <div class="sec-label">登录设备</div>
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-ico">${svg(I.user,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">iPhone 15 Pro <span style="color:var(--green);font-size:11px;font-weight:600;">当前</span></div><div class="list-d">上海 · 刚刚</div></div></div>
    <div class="list-row"><div class="list-ico">${svg(I.globe,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">Windows · 桌面端</div><div class="list-d">上海 · 2 小时前</div></div><div class="list-r" style="color:var(--red)">下线</div></div>
  </div>
  <button class="btn-full btn-ghost" style="margin-top:20px;color:var(--red);border-color:var(--red);">退出登录</button>
</div>`);

add('F · 我 / 设置','通用设置','F3 · 主题/通知',`
${statusbar}
${nav('通用设置',{right:'<div style="width:36px"></div>'})}
<div class="content">
  <div class="sec-label">外观</div>
  <div class="detail-card" style="padding:14px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:56px;height:56px;border-radius:12px;background:#ffffff;border:2px solid var(--accent);display:grid;place-items:center;color:#16191e;font-size:14px;font-weight:700;flex:0 0 auto;">Aa</div>
      <div><div style="font-size:14.5px;font-weight:650;">浅色</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">干净清爽 · 当前仅提供浅色主题</div></div>
    </div>
  </div>
  <div class="sec-label">通知</div>
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-ico">${svg(I.bell,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">审批提醒</div></div><div class="switch"></div></div>
    <div class="list-row"><div class="list-ico">${svg(I.chart,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">任务完成通知</div></div><div class="switch"></div></div>
    <div class="list-row"><div class="list-ico">${svg(I.chat,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">新消息通知</div></div><div class="switch off"></div></div>
  </div>
  <div class="sec-label">审批</div>
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-ico">${svg(I.clock,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">智能判断是否倒计时</div></div><div class="switch"></div></div>
  </div>
  <div style="font-size:11.5px;color:var(--text-faint);margin:7px 4px 4px;line-height:1.6;">开：AI 自动判断——重要操作（如删数据）不计时、一直等你；小事可加倒计时、超时按默认项。关：所有决策都不计时、都等你决定。</div>
  <div class="sec-label">通用</div>
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-ico">${svg(I.globe,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">语言</div></div><div class="list-r">简体中文 ${svg(I.chevR,16)}</div></div>
    <div class="list-row"><div class="list-main"><div class="list-t" style="font-size:14.5px">清除缓存</div></div><div class="list-r">128 MB ${svg(I.chevR,16)}</div></div>
  </div>
</div>`);

// F1a 编辑资料（"我"页铅笔图标进入）—— 头像 + 昵称
add('F · 我 / 设置','编辑资料','F1a · 头像/昵称',`
${statusbar}
${nav('编辑资料',{right:'<div class="nav-text">保存</div>'})}
<div class="content" style="padding-top:20px;">
  <div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:28px;">
    <div style="position:relative;">
      <div class="avatar av-lg" style="background:linear-gradient(135deg,#7fb0be,#5b8a98);width:84px;height:84px;border-radius:22px;font-size:34px;">笨</div>
      <div style="position:absolute;right:-5px;bottom:-5px;width:30px;height:30px;border-radius:50%;background:#fff;border:1px solid var(--border);box-shadow:0 2px 6px -1px rgba(30,40,55,.18);display:grid;place-items:center;"><svg viewBox="0 0 24 24" width="16" height="16" style="stroke:var(--accent);stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round;">${I.camera}</svg></div>
    </div>
    <span style="font-size:12.5px;color:var(--accent);font-weight:600;">更换头像</span>
  </div>
  <div class="sec-label">昵称</div>
  <div class="detail-card" style="padding:0 14px;">
    <div class="field" style="border:none;margin:0;background:transparent;padding:14px 0;"><span style="font-size:15px;color:var(--text);flex:1;">小笨</span><span style="font-size:12px;color:var(--text-faint);">2/20</span></div>
  </div>
  <div style="font-size:11.5px;color:var(--text-faint);margin:8px 4px;line-height:1.6;">昵称将展示给你的 AI 同事，便于区分设备与对话归属。</div>
</div>`);

// F3a 切换语言（通用设置"语言"进入）
add('F · 我 / 设置','切换语言','F3a · 语言列表',`
${statusbar}
${nav('语言',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding-top:12px;">
  <div class="detail-card" style="padding:4px 14px;">
    ${[['简体中文',true],['繁體中文',false],['English',false],['跟随系统',false]].map(([n,on])=>`
    <div class="list-row"><div class="list-main"><div class="list-t" style="font-size:14.5px">${n}</div></div>${on?'<span style="color:var(--accent);">'+svg(I.check,18)+'</span>':''}</div>`).join('')}
  </div>
</div>`);

// F1b 每日签到成功弹窗（点"每日签到"进入）
add('F · 我 / 设置','签到成功','F1b · 弹窗 · 得币',`
${statusbar}
<div class="navbar"><span class="big-title">我</span><div class="nav-btn plain">${svg(I.edit)}</div></div>
<div class="content" style="opacity:.4;"><div class="sec-label">·········</div></div>
<div style="position:absolute;inset:0;background:rgba(22,25,30,.45);display:flex;align-items:center;justify-content:center;z-index:40;">
  <div style="width:280px;background:#fff;border-radius:20px;padding:28px 24px 20px;text-align:center;box-shadow:0 20px 50px -12px rgba(0,0,0,.4);">
    <div style="width:64px;height:64px;border-radius:50%;background:var(--spark-soft);display:grid;place-items:center;margin:0 auto 14px;">
      <svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="10" fill="none" stroke="#c05f3c" stroke-width="2"/><path d="M12 7v10M9 10h5a1.5 1.5 0 0 1 0 3H9h6" fill="none" stroke="#c05f3c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div style="font-size:18px;font-weight:800;">签到成功</div>
    <div style="font-size:14px;color:var(--spark);font-weight:700;margin-top:6px;">+5 无为币</div>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:8px;">已连续签到 6 天 · 连签 7 天得双倍</div>
    <button class="btn-full btn-primary" style="margin-top:20px;height:44px;">开心收下</button>
  </div>
</div>`);

add('F · 我 / 设置','关于与帮助','F4',
statusbar + nav('关于与帮助',{right:'<div style="width:36px"></div>'}) +
'<div class="content" style="text-align:center;">'+
  '<div style="margin:20px 0 8px;">'+fireLogo()+'</div>'+
  '<div style="font-size:20px;font-weight:800;">无为</div>'+
  '<div style="font-size:13px;color:var(--text-muted);margin-top:4px;">版本 1.0.0</div>'+
  '<div style="font-size:12.5px;color:var(--text-faint);margin:4px 0 24px;">一念既出，万事自成</div>'+
  '<div class="detail-card" style="padding:4px 14px;text-align:left;">'+
    '<div class="list-row"><div class="list-ico">'+svg(I.help,18)+'</div><div class="list-main"><div class="list-t" style="font-size:14.5px">使用手册</div></div>'+svg(I.chevR,16)+'</div>'+
    '<div class="list-row"><div class="list-ico">'+svg(I.chat,18)+'</div><div class="list-main"><div class="list-t" style="font-size:14.5px">联系客服</div></div>'+svg(I.chevR,16)+'</div>'+
    '<div class="list-row"><div class="list-ico">'+svg(I.info,18)+'</div><div class="list-main"><div class="list-t" style="font-size:14.5px">用户协议 / 隐私政策</div></div>'+svg(I.chevR,16)+'</div>'+
    '<div class="list-row"><div class="list-main"><div class="list-t" style="font-size:14.5px">检查更新</div></div><div class="list-r" style="color:var(--green)">已是最新</div></div>'+
  '</div>'+
'</div>');

// F4a 使用手册
add('F · 我 / 设置','使用手册','F4a · 帮助文档',`
${statusbar}
${nav('使用手册',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding-top:8px;">
  <div class="search">${svg(I.search,18)}<span>搜索帮助</span></div>
  ${[['快速开始','登录、绑定电脑、发起第一个对话'],['远程操控电脑端','手机如何远程操控电脑上的无为、选择执行设备'],['模型与计费','订阅版余量 vs 按量付费无为币怎么算'],['审批与安全','高风险操作如何审批、60 秒自动拒绝'],['语音输入','实时语音转文字怎么用'],['常见问题','连不上电脑、收不到验证码等']].map(([t,d])=>`
  <div class="list-row" style="padding:13px 4px;"><div class="list-main"><div class="list-t" style="font-size:14.5px;font-weight:650;">${t}</div><div class="list-d" style="margin-top:3px;">${d}</div></div>${svg(I.chevR,16)}</div>`).join('')}
</div>`);

// F4a-1 使用手册·文章详情（范例：快速开始）
add('F · 我 / 设置','手册·快速开始','F4a-1 · 图文教程',`
${statusbar}
${nav('',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding:4px 20px 24px;">
  <div style="font-size:21px;font-weight:800;line-height:1.35;margin-bottom:6px;">快速开始</div>
  <div style="font-size:12px;color:var(--text-faint);margin-bottom:18px;">3 分钟上手 · 更新于 2026-01-01</div>
  <div class="help-lead">无为手机端是你电脑端无为的"随身遥控"——登录后绑定电脑，就能在手机上远程操控电脑上的 AI 同事干活。跟着下面三步走。</div>

  <div class="help-step"><span class="help-num">1</span><div class="help-body"><div class="help-h">登录账号</div><div class="help-p">用账号/邮箱 + 密码，或邮箱验证码、Google 登录。首次使用建议先注册。</div></div></div>
  <div class="mini-shot"><div class="mini-phone">
    ${fireLogo(26)}<div class="mini-title">无为</div>
    <div class="mini-field"></div><div class="mini-field"></div>
    <div class="mini-btn">登录</div>
    <div class="mini-oauth"><span></span><span></span></div>
  </div></div>

  <div class="help-step"><span class="help-num">2</span><div class="help-body"><div class="help-h">让电脑端上线</div><div class="help-p">在电脑上打开无为，进「设置 → 手机端远程」，开启"允许手机端远程调用本机"。回到手机，对话页顶部「在线电脑」里就会出现这台设备。</div></div></div>
  <div class="mini-shot"><div class="mini-win">
    <div class="mini-win-bar"><i></i><i></i><i></i></div>
    <div class="mini-row"><span class="mini-row-t">允许手机端远程调用本机</span><span class="mini-switch on"></span></div>
    <div class="mini-row"><span class="mini-row-t">同步订阅版模型给手机</span><span class="mini-switch"></span></div>
    <div class="mini-row"><span class="mini-row-t">设备名称</span><span class="mini-row-v">MacBook-Pro</span></div>
  </div></div>

  <div class="help-step"><span class="help-num">3</span><div class="help-body"><div class="help-h">发起第一个对话</div><div class="help-p">点右下角 ＋ 新建对话，先选一台在线电脑作为执行设备，再选同事或直接开聊。你发的消息会同步到那台电脑上执行，结果实时回到手机。</div></div></div>
  <div class="mini-shot"><div class="mini-phone">
    <div class="mini-label">执行设备</div>
    <div class="mini-dev"><span class="mini-dev-ic"></span><div class="mini-dev-txt"><b>MacBook-Pro</b><em>● 在线 · 订阅</em></div></div>
    <div class="mini-label">直接开聊</div>
    <div class="mini-chat-row"><span class="mini-ava"></span><span>和"无为"对话</span></div>
    <div class="mini-chat-row"><span class="mini-ava" style="background:#c05f3c"></span><span>小码 · 工程开发</span></div>
  </div></div>

  <div class="help-tip">${svg(I.info,15)}<div><b>小提示</b>：没有在线电脑时无法远程执行——先确认电脑端已打开并开启了远程调用开关。</div></div>

  <div class="help-related">相关：<span class="link-c">远程操控电脑端</span> · <span class="link-c">模型与计费</span></div>
</div>`);

// 手册迷你示意图：按类型画对应的 CSS mock
function miniShot(type){
  const P = inner => `<div class="mini-shot"><div class="mini-phone">${inner}</div></div>`;
  const WIN = inner => `<div class="mini-shot"><div class="mini-win"><div class="mini-win-bar"><i></i><i></i><i></i></div>${inner}</div></div>`;
  switch(type){
    case 'device-pick': return P(`<div class="mini-label">执行设备</div><div class="mini-dev"><span class="mini-dev-ic"></span><div class="mini-dev-txt"><b>MacBook-Pro</b><em>● 在线 · 订阅</em></div></div><div class="mini-dev" style="border-color:var(--border);background:var(--bg-soft);"><span class="mini-dev-ic" style="background:var(--border-strong)"></span><div class="mini-dev-txt"><b>办公室台式机</b><em style="color:var(--text-faint)">● 在线</em></div></div>`);
    case 'remote-flow': return P(`<div class="mini-bubble-r">把 wuwei-site 发到生产</div><div class="mini-bubble-l"><b>小码</b>好，开始远程执行…</div><div class="mini-tool">▸ 终端 npm run build ✓</div><div class="mini-foot">● 经 relay 同步到电脑执行</div>`);
    case 'two-way': return P(`<div class="mini-sync"><div class="mini-sync-dev">📱 手机</div><div class="mini-sync-arrow">⇅</div><div class="mini-sync-dev">💻 电脑</div></div><div class="mini-foot">一处操作 · 两端同步</div>`);
    case 'quota': return P(`<div class="mini-quota"><span>5h 已用</span><div class="mini-qbar"><i style="width:15%"></i></div></div><div class="mini-quota"><span>本周已用</span><div class="mini-qbar"><i style="width:32%"></i></div></div><div class="mini-quota"><span>上下文</span><div class="mini-qbar"><i style="width:60%;background:var(--gold)"></i></div></div>`);
    case 'pay': return P(`<div class="mini-pill">● 当前 · GPT-4o · 按量</div><div class="mini-foot" style="margin-top:10px">按量付费 · 无余量条</div><div class="mini-coin">🪙 本次消耗 ~3 无为币</div>`);
    case 'balance': return P(`<div class="mini-wallet"><em>无为币余额</em><b>328</b><span>充值请前往电脑端/官网</span></div>`);
    case 'decide': return P(`<div class="mini-badge">⚠ 需要你决定</div><div class="mini-q">日志表有 2.1 万条，怎么处理？</div><div class="mini-opt on">先备份再删</div><div class="mini-opt">直接删除</div>`);
    case 'decide-opt': return P(`<div class="mini-opt on"><b>先备份再删</b><em>最稳妥（推荐）</em></div><div class="mini-opt"><b>直接删除</b><em>不可恢复</em></div><div class="mini-opt"><b>保留不动</b><em>不碰</em></div>`);
    case 'countdown': return P(`<div class="mini-badge">⚠ 需要你决定</div><div class="mini-count">⏱ 00:48</div><div class="mini-foot">60 秒不选 · 按默认项处理</div>`);
    case 'voice-rec': return P(`<div class="mini-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="mini-foot" style="color:var(--red)">● 录音中 · 松手发送</div>`);
    case 'voice-text': return P(`<div class="mini-bubble-l" style="align-self:stretch">帮我把登录页的报错贴到…<span class="mini-cursor">|</span></div><div class="mini-foot">实时转文字 · 边说边上屏</div>`);
    case 'voice-cancel': return P(`<div class="mini-cancel">✕ 松手取消本次语音</div><div class="mini-wave"><i></i><i></i><i></i><i></i><i></i></div><div class="mini-foot">手指上滑到取消区</div>`);
    case 'remote-switch': return WIN(`<div class="mini-row"><span class="mini-row-t">允许手机端远程调用本机</span><span class="mini-switch on"></span></div><div class="mini-row"><span class="mini-row-t">同步订阅版模型给手机</span><span class="mini-switch"></span></div>`);
    case 'code': return P(`<div class="mini-field" style="height:16px"></div><div class="mini-field" style="height:16px"></div><div class="mini-foot">邮箱验证码已发送</div><div class="mini-cells"><span>2</span><span>7</span><span>4</span><span></span></div>`);
    case 'recharge': return P(`<div class="mini-wallet"><em>无为币余额</em><b>328</b><span>充值请前往电脑端/官网</span></div>`);
    default: return `<div class="help-shot">${type}</div>`;
  }
}

// F4a-2~6 使用手册其余 5 篇文章详情（图文教程，同一样式）
[
  {code:'F4a-2',title:'远程操控电脑端',lead:'手机端的核心就是远程操控电脑上的无为——消息经加密中转同步到电脑执行，结果实时回手机，电脑端也能同步看到。',steps:[
    ['选择执行设备','新建对话时在顶部选一台在线电脑；只有一台会默认选中。对话就绑定在这台电脑上跑。','device-pick'],
    ['发消息=远程执行','你发的每条消息都会同步到那台电脑的无为 agent 去执行，工具调用、命令、生成结果都实时回流到手机。','remote-flow'],
    ['双向同步','在电脑上也能同步看到你手机发的内容，手机电脑一处操作、两端同步。','two-way'],
  ],tip:'远程会话、群聊都能续聊；员工详情、SOP 全文为只读查看。'},
  {code:'F4a-3',title:'模型与计费',lead:'无为支持两种计费：订阅版（如 Claude Code 订阅，按额度窗口）和按量付费（走无为币）。对话页会按当前模型自动切换显示。',steps:[
    ['订阅版·看余量','用订阅版模型时，对话页顶部显示 5h / 本周已用量 + 上下文占用，按额度窗口计。','quota'],
    ['按量付费·扣无为币','用按量付费模型时不显示余量条，按实际用量扣无为币，倍率越高消耗越快。','pay'],
    ['余额只读','手机端只展示无为币余额，充值请前往电脑端或官网。','balance'],
  ],tip:'无为币余额仅手机端查看，不在 App 内充值。'},
  {code:'F4a-4',title:'审批与安全',lead:'当 AI 在推进任务遇到需要你拍板的岔路口时，会停下来用白话问你——你做选择题，而不是去审命令。',steps:[
    ['AI 抛出决策','遇到删数据、改配置等关键动作，AI 会用白话说清情况和影响，给你几个选项。','decide'],
    ['你做选择','点选"先备份再删/直接删/保留不动"等选项即可，看不懂技术细节也没关系。','decide-opt'],
    ['60 秒机制','远程电脑会阻塞等你决定，60 秒不处理会按最稳妥的默认项处理。','countdown'],
  ],tip:'你不在对话页时，待决策会汇总到审批 Tab，点卡片可进对话看前因后果。'},
  {code:'F4a-5',title:'语音输入',lead:'按住麦克风说话，实时转成文字边说边上屏，松手即发送，适合随手口述。',steps:[
    ['按住说话','按住输入框右侧麦克风开始录音，屏幕显示实时声波动效。','voice-rec'],
    ['实时上屏','你说的话会实时转成文字填进输入框，边说边出字。','voice-text'],
    ['松手发送/上滑取消','松手即发送；手指上滑到取消区松手则丢弃本次。','voice-cancel'],
  ],tip:'首次使用需在系统弹窗允许麦克风权限；没网或没听清会提示重试或直接打字。'},
  {code:'F4a-6',title:'常见问题',lead:'遇到问题先看这里，多数能自助解决。仍有疑问可联系客服。',steps:[
    ['连不上电脑/显示离线','确认电脑端无为已打开，且在「设置→手机端远程」开启了"允许手机端远程调用本机"。','remote-switch'],
    ['收不到邮箱验证码','检查垃圾邮件箱；1 分钟后可重新发送；仍收不到可换账号密码登录。','code'],
    ['无为币/充值问题','手机端只看余额，充值请到电脑端或官网操作。','recharge'],
  ],tip:'以上没解决？去「联系客服」发起会话或提交工单，我们会尽快处理。'},
].forEach(a=>{
  add('F · 我 / 设置','手册·'+a.title, a.code+' · 图文教程', `
${statusbar}
${nav('',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding:4px 20px 24px;">
  <div style="font-size:21px;font-weight:800;line-height:1.35;margin-bottom:6px;">${a.title}</div>
  <div style="font-size:12px;color:var(--text-faint);margin-bottom:18px;">更新于 2026-01-01</div>
  <div class="help-lead">${a.lead}</div>
  ${a.steps.map((s,i)=>`
  <div class="help-step"><span class="help-num">${i+1}</span><div class="help-body"><div class="help-h">${s[0]}</div><div class="help-p">${s[1]}</div></div></div>
  ${miniShot(s[2])}`).join('')}
  <div class="help-tip">${svg(I.info,15)}<div><b>小提示</b>：${a.tip}</div></div>
  <div class="help-related">相关：<span class="link-c">使用手册首页</span></div>
</div>`);
});

// F4b 联系客服
add('F · 我 / 设置','联系客服','F4b · 客服信息',`
${statusbar}
${nav('联系客服',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding-top:16px;">
  <div class="detail-card" style="padding:18px;text-align:center;">
    <div style="width:52px;height:52px;border-radius:14px;background:var(--accent-soft);display:grid;place-items:center;color:var(--accent);margin:0 auto 12px;">${svg(I.chat,26)}</div>
    <div style="font-size:15px;font-weight:700;">在线客服</div>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">工作日 9:00–18:00 · 通常 5 分钟内回复</div>
    <button class="btn-full btn-primary" style="margin-top:16px;height:44px;">发起会话</button>
  </div>
  <div class="sec-label">其他方式</div>
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-ico">${svg(I.chat,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">客服邮箱</div></div><div class="list-r">support@wuwei.ai ${svg(I.chevR,16)}</div></div>
    <div class="list-row"><div class="list-ico">${svg(I.globe,18)}</div><div class="list-main"><div class="list-t" style="font-size:13.5px;white-space:nowrap;">帮助中心（官网）</div></div><div class="list-r" style="font-size:12px;">wuweiai.io/help ${svg(I.chevR,16)}</div></div>
    <div class="list-row"><div class="list-ico">${svg(I.info,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">提交反馈/工单</div></div>${svg(I.chevR,16)}</div>
  </div>
  <div style="font-size:11.5px;color:var(--text-faint);margin:10px 4px;line-height:1.6;">提交反馈时会自动附带版本号与设备信息，便于定位问题（不含你的对话内容）。</div>
</div>`);

// F4b-1 在线客服对话（点"发起会话"进入）
add('F · 我 / 设置','在线客服对话','F4b-1 · 客服会话',`
${statusbar}
${nav('在线客服',{right:'<span style="font-size:11px;color:var(--green);font-weight:600;display:flex;align-items:center;gap:4px;"><span class="on-dot"></span>在线</span>'})}
<div class="content" style="padding-top:12px;">
  <div style="text-align:center;font-size:11px;color:var(--text-faint);margin-bottom:14px;">工作日 9:00–18:00 · 人工客服为你服务</div>
  <div class="msg-flow">
    <div class="msg-row"><div class="ai-av" style="background:var(--accent);">服</div><div class="ai-body"><div class="ai-name">无为客服</div><div class="ai-text">您好，我是无为客服小助手 👋 请问有什么可以帮您？您也可以直接描述遇到的问题。</div></div></div>
    <div class="msg-row"><div class="ai-av" style="background:var(--accent);">服</div><div class="ai-body"><div class="ai-text" style="margin-top:6px;">常见问题可点下方快捷入口：</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
        <span class="chip" style="cursor:pointer;">连不上电脑</span><span class="chip" style="cursor:pointer;">收不到验证码</span><span class="chip" style="cursor:pointer;">无为币/充值</span><span class="chip" style="cursor:pointer;">转人工</span>
      </div></div></div>
    <div class="msg-row user"><div class="bubble-user">手机连不上我的电脑，显示离线</div></div>
    <div class="msg-row"><div class="ai-av" style="background:var(--accent);">服</div><div class="ai-body"><div class="ai-text">请确认电脑端无为已打开，并在「设置 → 手机端远程」里开启了"允许手机端远程调用本机"。需要的话我帮您转接人工，稍等～</div></div></div>
  </div>
</div>
<div class="input-stack"><div class="input-line">
  <div class="ic-btn">${svg(I.plusSm,20)}</div>
  <div class="input-box" style="flex:1;"><span class="ph" style="color:var(--text-faint)">描述你的问题…</span></div>
  <div class="ic-btn">${svg(I.mic,18)}</div>
  <div class="send-btn">${svg(I.send,18)}</div>
</div></div>`);

// F4c 用户协议/隐私政策 二选入口（点进分别到已做好的 A7/A8 正文页）
add('F · 我 / 设置','协议与政策','F4c · 二选入口',`
${statusbar}
${nav('用户协议 / 隐私政策',{right:'<div style="width:36px"></div>'})}
<div class="content" style="padding-top:12px;">
  <div class="detail-card" style="padding:4px 14px;">
    <div class="list-row"><div class="list-ico">${svg(I.info,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">用户协议</div><div class="list-d">v1.0 · 生效 2026-01-01</div></div>${svg(I.chevR,16)}</div>
    <div class="list-row"><div class="list-ico">${svg(I.shield,18)}</div><div class="list-main"><div class="list-t" style="font-size:14.5px">隐私政策</div><div class="list-d">v1.0 · 生效 2026-01-01</div></div>${svg(I.chevR,16)}</div>
  </div>
</div>`);

add('X · 空状态','进度·空态','C1 · 无任务',
statusbar +
'<div class="navbar"><span class="big-title">进度</span><div style="width:36px"></div></div>'+
'<div class="content"><div class="empty-guide">'+ fireLogo() +
  '<div class="guide-title">还没有任务在跑</div>'+
  '<div class="guide-desc">让 AI 同事帮你做点事，<br>任务进度会实时显示在这里。</div>'+
  '<div class="guide-btn">去发起一个任务</div>'+
'</div></div>'+ tabbar('chart'));

add('X · 空状态','审批·空态','D1 · 全部处理完',
statusbar +
'<div class="navbar"><span class="big-title">审批</span><div style="width:36px"></div></div>'+
'<div class="content"><div class="empty-guide">'+
  '<div style="width:80px;height:80px;border-radius:50%;background:var(--green-bg);display:grid;place-items:center;color:var(--green);margin-bottom:14px;">'+svg(I.check,40)+'</div>'+
  '<div class="guide-title">都处理完啦</div>'+
  '<div class="guide-desc">当前没有待审批的操作。<br>有新请求会第一时间通知你。</div>'+
'</div></div>'+ tabbar('check'));

// ========== 渲染 ==========
(function render(){
  const byGroup = {};
  SCREENS.forEach(function(s){ (byGroup[s.group]=byGroup[s.group]||[]).push(s); });
  const root = document.getElementById('root');
  let html = '';
  Object.keys(byGroup).forEach(function(g){
    html += '<div class="group-title">'+g+' <span>'+byGroup[g].length+' 页</span></div><div class="frames">';
    byGroup[g].forEach(function(s){
      html += '<div class="frame-wrap"><div class="frame-label">'+s.label+' <span>'+s.sub+'</span></div>'+
        '<div class="phone"><div class="notch"></div><div class="screen">'+s.html+'</div></div></div>';
    });
    html += '</div>';
  });
  html += '<div class="note"><h3>说明</h3>本页为无为手机端高保真 v3（全量），承接已定稿的四页黄金动线，共 <b>'+SCREENS.length+' 屏</b>。'+
    '<br><br><b>本轮按真实代码对齐补齐的 4 块（小码确认过实现）：</b>'+
    '<br>① <b>模型选择器改两级</b>（B2b-1/B2b-2）：先选平台（13 个 provider）再选具体模型；<b>清单与倍率用真实 /api/model-pricing 快照</b>，后端实时算（免费=0、非免费最便宜综合价=1× 基准），倍率 pill 动态染色（免费绿 / ≥3×朱赭 / 1~3×靛青 / <1×绿）。原占位的固定 5 模型、5×/0.3× 已作废。'+
    '<br>② <b>执行位置选择器</b>：并进模型 sheet 顶部（非独立页），仅当有在线电脑时出现——⚡无为托管（默认）+ 各在线电脑（带订阅/额度），每台可"查看对话→"。'+
    '<br>③ <b>语音输入</b>（B6a/b/c）：输入框空时显麦克风，<b>按住说话</b>、无波形/倒计时、松开转写（录完再转）、文字填入输入框不直接发；补了一个真实实现里缺的<b>失败兜底提示</b>（无网/无权限）。'+
    '<br>④ <b>远程危险操作审批</b>：落地形态是<b>独立审批 Tab</b>（非消息流弹卡），按真实字段校准——工具名+💻设备+参数预览（monospace），<b>60 秒不处理自动拒</b>，按钮为"拒绝/允许"，并<b>接入 RiskBadge 风险徽章</b>（真实代码里组件有、尚未接入，设计先给到位）。'+
    '<br>⑤ 新增 <b>G 远程设备浏览页</b>（/remote/[id]，顶部 4 Tab：对话/员工/群聊/SOP，实时读电脑本地内容不落库）。'+
    '<br><br><b>对话页三大核心（上一轮）：</b>① 消息流全类型；② 模型胶囊→sheet；③ 订阅版余量条（≥50%靛青/<50%暖金/≤15%朱红），按量付费（B2c）不显示。'+
    '<br>全部严格复用四页 token 与组件。<b>仅浅色主题</b>（深色已砍）。<br><br><b>给小码的重构提示：</b>theme.ts 色值已干净（禁硬编码色已落实）；重灾区是<b>尺寸常量</b>（fontSize/radius/spacing 仍散写死数字），重构重点是建尺寸 token 并替换。</div>';
  root.innerHTML = html;
})();
