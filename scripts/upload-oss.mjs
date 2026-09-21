// CI 发布：把 release/ 下的安装包 + electron-updater 清单(latest*.yml) 传到阿里云 OSS。
// 供 electron-updater 自动更新 + 官网下载读取（bucket=wuwei-repo, public-read, 路径 updates/）。
// 凭证仅从环境变量读（GitHub Actions secrets），绝不硬编码。缺凭证则跳过(不挡发布)。
import OSS from "ali-oss";
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const KEY_ID = process.env.OSS_KEY_ID;
const KEY_SECRET = process.env.OSS_KEY_SECRET;
if (!KEY_ID || !KEY_SECRET) {
  console.log("[oss] 未配置 OSS_KEY_ID/SECRET，跳过 OSS 上传");
  process.exit(0);
}

const DIR = "release";
const BASE = "https://wuwei-repo.oss-cn-hangzhou.aliyuncs.com/updates/";
// 允许上传的产物类型：安装包 + 差分块 + 更新清单
const ALLOW = new Set([".exe", ".dmg", ".appimage", ".deb", ".zip", ".blockmap", ".yml"]);

const client = new OSS({
  // 传输加速全球 endpoint：桶已开「传输加速·全球」。GitHub(美)→杭州直连跨境极不稳(超时/socket hang up)，
  // 走加速走阿里优化线路，稳且快。用 endpoint 就不要再传 region(否则被 region 覆盖回杭州直连)。
  endpoint: "https://oss-accelerate.aliyuncs.com",
  accessKeyId: KEY_ID,
  accessKeySecret: KEY_SECRET,
  bucket: "wuwei-repo",
  secure: true,
  timeout: 600000,
});

let files;
try {
  files = readdirSync(DIR).filter((f) => {
    const p = join(DIR, f);
    return statSync(p).isFile() && ALLOW.has(extname(f).toLowerCase());
  });
} catch {
  console.log(`[oss] 无 ${DIR}/ 目录，跳过`);
  process.exit(0);
}
if (!files.length) {
  console.log("[oss] release/ 无可上传产物");
  process.exit(0);
}

// 先传安装包，最后传 latest*.yml —— 保证更新器读到清单时对应包已就绪。
files.sort((a, b) => (a.endsWith(".yml") ? 1 : 0) - (b.endsWith(".yml") ? 1 : 0));

for (const f of files) {
  const key = `updates/${f}`;
  const local = join(DIR, f);
  const sizeMB = statSync(local).size / 1024 / 1024;
  const upload = () =>
    sizeMB > 8
      ? // 跨境上传(GitHub美→杭州OSS)极不稳：小分片(2MB)+串行(parallel:1，跨境最稳、少连接争用)+大超时。
        client.multipartUpload(key, local, { parallel: 1, partSize: 2 * 1024 * 1024, timeout: 600000 })
      : client.put(key, local, { timeout: 600000 });

  let lastErr;
  const MAX = 5; // 跨境时段性超时：多重试几次+退避，riding out 坏网络窗口
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      await upload();
      console.log(`[oss] ✓ ${BASE}${f}  (${sizeMB.toFixed(1)}MB)`);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[oss] 第${attempt}次上传 ${f} 失败：${e?.message || e}${attempt < MAX ? "，重试…" : ""}`);
      if (attempt < MAX) await new Promise((r) => setTimeout(r, attempt * 5000)); // 退避 5s/10s/15s/20s
    }
  }
  if (lastErr) {
    console.error(`[oss] ✗ 放弃 ${f}`);
    process.exit(1);
  }
}
console.log(`[oss] 完成，共 ${files.length} 个文件`);

// ── 清理旧版本安装包：只保留最近 KEEP 个版本，老的删掉省空间(桶已上百 GB)。latest*.yml 永不删。 ──
const KEEP = 3;
const cmpVer = (a, b) => { const pa = a.split(".").map(Number), pb = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); } return 0; };
try {
  const all = [];
  let marker;
  do {
    const r = await client.list({ prefix: "updates/", "max-keys": 1000, marker }, {});
    for (const o of r.objects || []) all.push(o.name);
    marker = r.nextMarker;
  } while (marker);
  const byVer = {};
  for (const name of all) {
    const base = name.replace(/^updates\//, "");
    if (base.toLowerCase().endsWith(".yml")) continue; // 更新清单永不删
    const m = base.match(/wuwei-v?(\d+\.\d+\.\d+)/i); // 从 wuwei-1.6.98-setup.exe / wuwei-1.6.98.AppImage 提版本
    if (!m) continue;
    (byVer[m[1]] ||= []).push(name);
  }
  const versions = Object.keys(byVer).sort(cmpVer); // 升序
  const oldVersions = versions.slice(0, Math.max(0, versions.length - KEEP)); // 最老的几个
  const toDelete = oldVersions.flatMap((v) => byVer[v]);
  if (toDelete.length) {
    // deleteMulti 单次最多 1000 个
    for (let i = 0; i < toDelete.length; i += 1000) await client.deleteMulti(toDelete.slice(i, i + 1000), { quiet: true });
    console.log(`[oss] 清理旧版本 ${oldVersions.join(", ")}，删除 ${toDelete.length} 个文件（保留最近 ${KEEP} 版）`);
  } else {
    console.log(`[oss] 版本数 ${versions.length} ≤ ${KEEP}，无需清理`);
  }
} catch (e) {
  console.warn(`[oss] 清理旧版本失败(不影响发布)：${e?.message || e}`);
}
