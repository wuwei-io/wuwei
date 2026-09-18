// 一人公司 · SOP 库 · 数据层
//
// 全部数据收在 ~/.wuwei/sop/ 子目录下，删掉整个目录 = 卸载干净，不在数据根目录留痕迹。
// ⚠️ 本模块不在加载时做任何 IO：目录只在「真的要写」时懒创建，读不到一律返回空。
//    这样总开关关闭时（registerSop 根本不被调用），磁盘上不会凭空多出 sop 目录。
//
// 存储布局：
//   ~/.wuwei/sop/tree.json                  —— 整棵树（SopNode[]）
//   ~/.wuwei/sop/docs/<id>.md               —— 某 SOP 的「当前版」正文（员工用 read_file 直接读）
//   ~/.wuwei/sop/versions/<id>/<n>.md        —— 第 n 版的正文快照（回滚/查看历史用）
//   ~/.wuwei/sop/versions/<id>/meta.json     —— 该 SOP 的版本历史（SopVersion[]）

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SopNode, SopVersion } from "../../../src/sop/types.js";

const DIR = join(homedir(), process.env.WUWEI_DATA_DIR_NAME || ".wuwei", "sop");
const TREE = join(DIR, "tree.json");
const DOCS_DIR = join(DIR, "docs");
const VER_DIR = join(DIR, "versions");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback; // 不存在/损坏都按空处理，不抛错、不自动重建
  }
}

function docPath(id: string): string {
  return join(DOCS_DIR, `${id}.md`);
}
function verDir(id: string): string {
  return join(VER_DIR, id);
}
function verPath(id: string, n: number): string {
  return join(verDir(id), `${n}.md`);
}
function verMetaPath(id: string): string {
  return join(verDir(id), "meta.json");
}

// ───────────────────────── 树 ─────────────────────────

export function loadTree(): SopNode[] {
  const v = readJson<SopNode[]>(TREE, []);
  return Array.isArray(v) ? v : [];
}

export function saveTree(nodes: SopNode[]) {
  mkdirSync(DIR, { recursive: true }); // 懒创建：只有真的写入才落目录
  writeFileSync(TREE, JSON.stringify(nodes, null, 2));
}

/** 同层最大 order + 1，用于把新节点放到同级末尾 */
function nextOrder(nodes: SopNode[], parentId?: string): number {
  const sib = nodes.filter((n) => (n.parentId || "") === (parentId || ""));
  return sib.length ? Math.max(...sib.map((n) => n.order)) + 1 : 0;
}

/**
 * 新建节点（类别或 SOP）。
 * 一事一 SOP：建 SOP 时若 taskKey 已存在 → 不新建，直接返回既有节点（exists:true），仿 findOrCreateDm 去重。
 */
export function createNode(
  kind: "category" | "sop",
  name: string,
  parentId?: string,
  opts?: { taskKey?: string; summary?: string },
): { node: SopNode; exists: boolean } {
  const nodes = loadTree();
  const taskKey = opts?.taskKey?.trim();
  if (kind === "sop" && taskKey) {
    const found = nodes.find((n) => n.kind === "sop" && n.taskKey === taskKey);
    if (found) return { node: found, exists: true }; // 一事一 SOP：已存在直接返回
  }
  const now = Date.now();
  const node: SopNode = {
    id: randomUUID(),
    kind,
    name: name || (kind === "category" ? "新类别" : "新 SOP"),
    parentId: parentId || undefined,
    order: nextOrder(nodes, parentId),
    createdAt: now,
    updatedAt: now,
    ...(kind === "sop" ? { taskKey: taskKey || undefined, currentVersion: 0, summary: opts?.summary } : {}),
  };
  saveTree([...nodes, node]);
  return { node, exists: false };
}

export function renameNode(id: string, name: string): SopNode[] {
  const nodes = loadTree().map((n) => (n.id === id ? { ...n, name: name || n.name, updatedAt: Date.now() } : n));
  saveTree(nodes);
  return nodes;
}

/** 拖拽移动：改父类别 + 目标层排序序号，并把同层其余节点顺延，保证 order 稳定唯一。 */
export function moveNode(id: string, parentId: string | undefined, order: number): SopNode[] {
  const nodes = loadTree();
  const moving = nodes.find((n) => n.id === id);
  if (!moving) return nodes;
  const pid = parentId || undefined;
  // 防环：不能把类别拖进它自己的子孙里
  if (moving.kind === "category" && pid && isDescendant(nodes, pid, id)) return nodes;
  const updated = nodes.map((n) => (n.id === id ? { ...n, parentId: pid, order, updatedAt: Date.now() } : n));
  // 目标层重排：同 parentId 的节点按 order 升序，把落点腾开
  const sib = updated
    .filter((n) => (n.parentId || "") === (pid || ""))
    .sort((a, b) => (a.id === id ? order - 0.5 : a.order) - (b.id === id ? order - 0.5 : b.order));
  sib.forEach((n, i) => (n.order = i));
  saveTree(updated);
  return updated;
}

/** target 是否是 ancestor 的子孙（含自身判定用 moveNode 防环）。 */
function isDescendant(nodes: SopNode[], target: string, ancestor: string): boolean {
  let cur: string | undefined = target;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestor) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  return false;
}

/** 删除节点：类别级联删所有子孙（含其对应的 docs/versions）。 */
export function deleteNode(id: string): SopNode[] {
  const nodes = loadTree();
  // 收集要删的 id 集合（自身 + 所有子孙）
  const toDelete = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
        toDelete.add(n.id);
        changed = true;
      }
    }
  }
  // 删对应的正文与版本目录
  for (const n of nodes) {
    if (n.kind === "sop" && toDelete.has(n.id)) {
      try { if (existsSync(docPath(n.id))) rmSync(docPath(n.id), { force: true }); } catch { /* ignore */ }
      try { if (existsSync(verDir(n.id))) rmSync(verDir(n.id), { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  const rest = nodes.filter((n) => !toDelete.has(n.id));
  saveTree(rest);
  return rest;
}

// ───────────────────────── 正文与版本 ─────────────────────────

/** 读某 SOP 的当前版正文；不存在返回空串。 */
export function readSopDoc(id: string): string {
  try { return readFileSync(docPath(id), "utf8"); } catch { return ""; }
}

/**
 * 保存 SOP 正文 = 写 docs/<id>.md（当前版） + 复制到 versions/<id>/<n>.md + currentVersion++ + meta 追加。
 * 每次保存都产生一个新版本，历史不丢。
 */
export function saveSopDoc(id: string, text: string, note?: string): { version: number; node: SopNode | null } {
  const nodes = loadTree();
  const node = nodes.find((n) => n.id === id && n.kind === "sop");
  if (!node) return { version: 0, node: null };
  const nextVer = (node.currentVersion || 0) + 1;
  const body = String(text ?? "");
  // 1) 当前版正文
  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(docPath(id), body);
  // 2) 版本快照
  mkdirSync(verDir(id), { recursive: true });
  writeFileSync(verPath(id, nextVer), body);
  // 3) meta 追加
  const meta = listVersions(id);
  meta.push({ version: nextVer, ts: Date.now(), note: note || undefined, bytes: Buffer.byteLength(body, "utf8") });
  writeFileSync(verMetaPath(id), JSON.stringify(meta, null, 2));
  // 4) 树上更新版本号 + updatedAt
  const updated = nodes.map((n) => (n.id === id ? { ...n, currentVersion: nextVer, updatedAt: Date.now() } : n));
  saveTree(updated);
  return { version: nextVer, node: updated.find((n) => n.id === id) || null };
}

export function listVersions(id: string): SopVersion[] {
  const v = readJson<SopVersion[]>(verMetaPath(id), []);
  return Array.isArray(v) ? v : [];
}

/** 读第 n 版正文；不存在返回 null（区别于「空正文」）。 */
export function readVersion(id: string, n: number): string | null {
  try { return readFileSync(verPath(id, n), "utf8"); } catch { return null; }
}

/**
 * 回滚：把第 n 版正文作为「新版本」写入（历史不丢，currentVersion 继续 ++），note 记 "回滚自 vN"。
 * 刻意不删掉 n 之后的版本——回滚本身也是一次可追溯的变更。
 */
export function rollback(id: string, n: number): { version: number } | { error: string } {
  const src = readVersion(id, n);
  if (src === null) return { error: "version_not_found" };
  const note = process.env.WUWEI_LANG === "en" ? `Rolled back from v${n}` : `回滚自 v${n}`;
  const r = saveSopDoc(id, src, note);
  if (!r.node) return { error: "sop_not_found" };
  return { version: r.version };
}

// ───────────────────────── 查询 ─────────────────────────

export function findByTaskKey(key: string): SopNode | null {
  const k = (key || "").trim();
  if (!k) return null;
  return loadTree().find((n) => n.kind === "sop" && n.taskKey === k) ?? null;
}

/** 从某节点向上拼类别路径，如「部署 / Vercel」，方便搜索结果里展示归属。 */
export function categoryPathOf(id: string): string {
  const nodes = loadTree();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const names: string[] = [];
  let cur = byId.get(id)?.parentId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const p = byId.get(cur);
    if (!p) break;
    names.unshift(p.name);
    cur = p.parentId;
  }
  return names.join(" / ");
}

export interface SopSearchHit {
  id: string;
  name: string;
  categoryPath: string;
  summary?: string;
  currentVersion?: number;
  taskKey?: string;
}

/** 搜索 SOP：匹配 name + summary + 当前版正文（大小写不敏感）。空 query 返回全部 SOP。 */
export function searchSops(q: string): SopSearchHit[] {
  const query = (q || "").trim().toLowerCase();
  const nodes = loadTree().filter((n) => n.kind === "sop");
  const hits = nodes.filter((n) => {
    if (!query) return true;
    if (n.name.toLowerCase().includes(query)) return true;
    if ((n.summary || "").toLowerCase().includes(query)) return true;
    if ((n.taskKey || "").toLowerCase().includes(query)) return true;
    return readSopDoc(n.id).toLowerCase().includes(query);
  });
  return hits.map((n) => ({
    id: n.id,
    name: n.name,
    categoryPath: categoryPathOf(n.id),
    summary: n.summary,
    currentVersion: n.currentVersion,
    taskKey: n.taskKey,
  }));
}

/** 更新 SOP 的摘要（write_sop 迭代时可带 summary）。 */
export function updateSummary(id: string, summary: string): SopNode[] {
  const nodes = loadTree().map((n) => (n.id === id && n.kind === "sop" ? { ...n, summary, updatedAt: Date.now() } : n));
  saveTree(nodes);
  return nodes;
}

/**
 * 抹掉整个模块的数据（用户在设置里关掉模块并选择「同时清除数据」时用）。
 * 可插拔的最后一环：关掉开关 + 删目录 = 完全恢复到没装过的状态。
 */
export function purge() {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
}
