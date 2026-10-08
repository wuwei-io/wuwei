// 逐屏截图：连调试 Chrome(9222)，对每个 .phone 元素裁切截 PNG，存 shots/
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
  });
}

async function main() {
  // 找到原型标签
  const list = JSON.parse(await httpGet('http://127.0.0.1:9222/json'));
  let target = list.find(t => t.type === 'page' && (t.url || '').includes('127.0.0.1:8099'));
  if (!target) { console.error('没找到原型标签(127.0.0.1:8099)'); process.exit(1); }
  console.log('target:', target.title);

  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.on('message', buf => {
    const m = JSON.parse(buf.toString());
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
    }
  });
  await new Promise(r => ws.on('open', r));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1300, height: 900, deviceScaleFactor: 2, mobile: false
  });

  // 动态从 DOM 读每屏 label 做文件名（屏数/顺序变了也自动跟上）
  const nameExpr = `JSON.stringify([...document.querySelectorAll('.frame-wrap')].map((w,i)=>{
    const lb=w.querySelector('.frame-label');
    let t=(lb? lb.childNodes[0].textContent : ('screen'+i)).trim();
    t=t.replace(/[\\\\/:*?"<>|·\\s]+/g,'-').replace(/-+$/,'');
    const n=String(i+1).padStart(2,'0');
    return n+'-'+t;
  }))`;
  const gotNames = await send('Runtime.evaluate', { expression: nameExpr, returnByValue: true });
  const names = JSON.parse(gotNames.result.value);
  // 清空旧图，避免残留过期文件名
  for (const f of fs.readdirSync(OUT)) { if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f)); }

  const evalExpr = `JSON.stringify([...document.querySelectorAll('.phone')].map(p=>{const r=p.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}))`;
  const got = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true });
  const rects = JSON.parse(got.result.value);
  console.log('phones:', rects.length);

  // 当前页面总高度，用于 setDeviceMetrics 时能把所有 phone 纳入渲染
  const pageH = await send('Runtime.evaluate', { expression: 'document.body.scrollHeight', returnByValue: true });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1300, height: Math.ceil(pageH.result.value) + 40, deviceScaleFactor: 2, mobile: false
  });

  // 重新取 rect（高度变了布局可能微调）
  const got2 = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true });
  const rects2 = JSON.parse(got2.result.value);

  for (let i = 0; i < rects2.length; i++) {
    const r = rects2[i];
    const clip = { x: r.x - 2, y: r.y - 2, width: r.w + 4, height: r.h + 4, scale: 2 };
    const shot = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    const file = path.join(OUT, names[i] + '.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('saved', names[i] + '.png');
  }

  await send('Emulation.clearDeviceMetricsOverride');
  ws.close();
  console.log('ALL DONE');
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
