// 应用中心 · 面板
//
// 复用 MCP 面板既有的 .mcp-* 样式（theme.css 里已有整套卡片/状态点/按钮），
// 刻意不抽公用组件：两边 UI 还没定型，过早抽象反而会把 MCP 那边一起拖下水。
// 等应用中心形态稳定、确认两者布局一致后，再抽 CardStore 并让 MCP 面板改用它。

import { useEffect, useRef, useState } from "react";
import type { Employee, TeamAppCard } from "../../../../src/team/types.js";
import { EmployeeAvatar } from "./EmployeeAvatar.js";

type TeamState = { apps: TeamAppCard[]; employees: Employee[] };

/**
 * 头像裁剪器：选中本地图后，在一个圆形取景框里拖动定位 + 滑块缩放，确认后裁成 256×256 的 data URL。
 * 纯前端 canvas，不上传任何文件到服务器。
 */
function AvatarCropper({ file, en, onCancel, onDone }: { file: File; en: boolean; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const BOX = 240; // 取景框边长（屏幕像素）
  const OUT = 256; // 输出头像边长
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1); // 相对“图片铺满取景框”的额外缩放
  const [pos, setPos] = useState({ x: 0, y: 0 }); // 图片中心相对取景框中心的偏移(屏幕像素)
  const [minCover, setMinCover] = useState(1); // 让图片至少铺满取景框的基准缩放
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    // ⚠️ 用 FileReader 读成 dataURL，而不是 objectURL。之前的 bug：在 onload 里立刻
    //    revokeObjectURL，可 <img> 还在用这个已被释放的 URL → 取景框纯黑、图片显示不出来。
    //    dataURL 是自包含的 base64，不会失效，也不用手动释放。
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const im = new Image();
      im.onload = () => {
        imgRef.current = im;
        setMinCover(BOX / Math.min(im.width, im.height)); // 铺满取景框的最小缩放
        setScale(1);
        setPos({ x: 0, y: 0 });
        setImg(im);
      };
      im.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [file]);

  const eff = minCover * scale; // 有效缩放
  const dispW = img ? img.width * eff : 0;
  const dispH = img ? img.height * eff : 0;

  const onDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current || !img) return;
    const nx = drag.current.px + (e.clientX - drag.current.x);
    const ny = drag.current.py + (e.clientY - drag.current.y);
    // 限制别拖出取景框（图片边缘不能进框内）
    const maxX = Math.max(0, (dispW - BOX) / 2);
    const maxY = Math.max(0, (dispH - BOX) / 2);
    setPos({ x: Math.max(-maxX, Math.min(maxX, nx)), y: Math.max(-maxY, Math.min(maxY, ny)) });
  };
  const onUp = () => { drag.current = null; };

  const confirm = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = OUT; c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // 取景框在图片坐标系里的左上角：框中心=图片中心+pos，反推源区域
    const scaleOut = OUT / BOX;
    const srcCx = img.width / 2 - pos.x / eff;
    const srcCy = img.height / 2 - pos.y / eff;
    const srcSize = BOX / eff;
    ctx.drawImage(img, srcCx - srcSize / 2, srcCy - srcSize / 2, srcSize, srcSize, 0, 0, OUT, OUT);
    void scaleOut;
    onDone(c.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div className="tc-modal-mask" style={{ zIndex: 70 }} onClick={onCancel}>
      <div className="tc-modal tc-crop" onClick={(e) => e.stopPropagation()}>
        <div className="tc-modal-head">
          <span>{en ? "Crop avatar" : "裁剪头像"}</span>
          <button className="tc-modal-x" onClick={onCancel}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div
          className="tc-crop-stage"
          style={{ width: BOX, height: BOX }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        >
          {img && (
            <img
              src={img.src}
              draggable={false}
              style={{
                position: "absolute",
                width: dispW,
                height: dispH,
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                userSelect: "none",
              }}
              alt=""
            />
          )}
          <div className="tc-crop-ring" />
        </div>
        <input
          className="tc-crop-slider"
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
        />
        <div className="tc-crop-hint">{en ? "Drag to reposition · slide to zoom" : "拖动定位 · 滑动缩放"}</div>
        <div className="tc-modal-foot">
          <button className="tc-btn-ghost" onClick={onCancel}>{en ? "Cancel" : "取消"}</button>
          <button className="tc-btn" onClick={confirm}>{en ? "Use this" : "用这张"}</button>
        </div>
      </div>
    </div>
  );
}

type ImportCandidate = { sourceId: string; name: string; title?: string; blurb?: string; icon?: string };
type ImportSource = { kind: string; path: string; candidates: ImportCandidate[] };

// 可选头像图标（都在 EmployeeIcon 里有画）。空值=用名字首字。
const ICON_CHOICES = ["", "pen", "code", "chart", "palette", "brain", "coin", "crystal", "ring", "sprout"];

type ProviderOpt = { id: string; label: string; models: string[] };

// 员工编辑弹窗：独立组件，AppStore(管理页) 与 App(右键「编辑」在当前界面直接弹，不跳转到一人公司) 共用。
// 自带草稿状态；保存/删除后回调 onSaved(带最新列表)再 onClose。
export function EmployeeEditModal({
  en, providers, employee, onClose, onSaved,
}: {
  en: boolean;
  providers?: ProviderOpt[];
  employee: Employee;
  onClose: () => void;
  onSaved?: (r: { apps?: TeamAppCard[]; employees?: Employee[] }) => void;
}) {
  const api = (window as any).wuwei?.team;
  const [edit, setEdit] = useState<Employee>(employee);
  const [cropFile, setCropFile] = useState<File | null>(null);
  return (
    <>
      <div className="tc-modal-mask" onClick={onClose}>
        <div className="tc-modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="tc-modal-head">
            <span>{en ? "Edit teammate" : "编辑员工"}</span>
            <button className="tc-modal-x" onClick={onClose} title={en ? "Close" : "关闭"}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="tc-field">
            <label>{en ? "Avatar" : "头像"}</label>
            <div className="tc-ava-row">
              <span className="tc-ava-preview">
                <EmployeeAvatar icon={edit.icon} avatarData={edit.avatarData} name={edit.name} />
              </span>
              <div className="tc-ava-actions">
                <label className="tc-btn-ghost tc-upload">
                  {en ? "Upload image" : "上传图片"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) setCropFile(f); }} />
                </label>
                {edit.avatarData && (
                  <button className="tc-btn-ghost danger" onClick={() => setEdit({ ...edit, avatarData: undefined })}>{en ? "Remove photo" : "移除照片"}</button>
                )}
              </div>
            </div>
            <div className="tc-icon-grid" style={{ marginTop: 10, opacity: edit.avatarData ? 0.45 : 1 }}>
              {ICON_CHOICES.map((ic) => (
                <button key={ic || "_txt"} className={"tc-icon-opt" + (!edit.avatarData && (edit.icon || "") === ic ? " on" : "")} title={ic || (en ? "Initial" : "首字")} onClick={() => setEdit({ ...edit, icon: ic || undefined, avatarData: undefined })}>
                  {ic ? <EmployeeAvatar icon={ic} name={edit.name} /> : <span className="team-avatar-txt">{edit.name.slice(0, 1) || "员"}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="tc-field">
            <label>{en ? "Name" : "名字"}</label>
            <input className="tc-input" value={edit.name} maxLength={12} onChange={(ev) => setEdit({ ...edit, name: ev.target.value })} />
          </div>
          <div className="tc-field">
            <label>{en ? "Title" : "职位"}</label>
            <input className="tc-input" value={edit.title || ""} maxLength={8} placeholder={en ? "e.g. Copywriter" : "如：文案"} onChange={(ev) => setEdit({ ...edit, title: ev.target.value })} />
          </div>
          <div className="tc-field">
            <label>{en ? "One-liner" : "简介"}</label>
            <input className="tc-input" value={edit.blurb || ""} maxLength={30} placeholder={en ? "A short line under the name" : "名字下方的一句话"} onChange={(ev) => setEdit({ ...edit, blurb: ev.target.value })} />
          </div>

          {providers && providers.length > 0 && (
            <div className="tc-field">
              <label>{en ? "Model" : "模型"}<em>{en ? "which platform & model this teammate uses" : "这名员工用哪个平台和模型"}</em></label>
              <div className="tc-model-row">
                <select className="tc-input tc-select" value={edit.model?.providerId || ""} onChange={(ev) => { const pid = ev.target.value; if (!pid) { setEdit({ ...edit, model: undefined }); return; } const p = providers.find((x) => x.id === pid); setEdit({ ...edit, model: { providerId: pid, model: p?.models?.[0] || "" } }); }}>
                  <option value="">{en ? "Follow current chat" : "跟随当前会话"}</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                {edit.model?.providerId && (() => {
                  const p = providers.find((x) => x.id === edit.model!.providerId);
                  const models = p?.models || [];
                  return models.length > 0 ? (
                    <select className="tc-input tc-select" value={edit.model.model || ""} onChange={(ev) => setEdit({ ...edit, model: { providerId: edit.model!.providerId, model: ev.target.value } })}>
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input className="tc-input" placeholder={en ? "model id" : "模型名"} value={edit.model.model || ""} onChange={(ev) => setEdit({ ...edit, model: { providerId: edit.model!.providerId, model: ev.target.value } })} />
                  );
                })()}
              </div>
            </div>
          )}

          <div className="tc-divider"><span>{en ? "Persona files" : "人格定义"}</span></div>
          <div className="tc-field">
            <label>{en ? "Identity & duties" : "身份与职责"}<em>{en ? "who they are, what they own, what they don't" : "他是谁、负责什么、不做什么"}</em></label>
            <textarea className="tc-textarea" rows={5} value={edit.persona || ""} onChange={(ev) => setEdit({ ...edit, persona: ev.target.value })} />
          </div>
          <div className="tc-field">
            <label>{en ? "Personality & voice" : "性格与说话风格"}<em>{en ? "tone, temperament, how they talk" : "语气、脾气、表达习惯"}</em></label>
            <textarea className="tc-textarea" rows={3} value={edit.soul || ""} placeholder={en ? "Optional" : "选填"} onChange={(ev) => setEdit({ ...edit, soul: ev.target.value })} />
          </div>
          <div className="tc-field">
            <label>{en ? "About the boss" : "关于老板"}<em>{en ? "who they serve, preferences, projects" : "服务的人是谁、偏好、在做的项目"}</em></label>
            <textarea className="tc-textarea" rows={3} value={edit.aboutUser || ""} placeholder={en ? "Optional" : "选填"} onChange={(ev) => setEdit({ ...edit, aboutUser: ev.target.value })} />
          </div>
          <div className="tc-field">
            <label>{en ? "Long-term memory" : "长期记忆"}<em>{en ? "background & conclusions to always remember" : "需长期记住的背景、约定、结论"}</em></label>
            <textarea className="tc-textarea" rows={3} value={edit.memory || ""} placeholder={en ? "Optional" : "选填"} onChange={(ev) => setEdit({ ...edit, memory: ev.target.value })} />
          </div>

          <div className="tc-modal-foot">
            <button className="tc-btn-ghost danger tc-del-emp" onClick={async () => { if (!confirm(en ? `Delete "${edit.name}"? This can't be undone.` : `删除员工「${edit.name}」？此操作不可撤销。`)) return; const r = await api.removeEmployee(edit.id); onSaved?.(r || {}); onClose(); }}>{en ? "Delete" : "删除员工"}</button>
            <span style={{ flex: 1 }} />
            <button className="tc-btn-ghost" onClick={onClose}>{en ? "Cancel" : "取消"}</button>
            <button className="tc-btn" disabled={!edit.name.trim() || !edit.persona.trim()} onClick={async () => {
              const r = await api.updateEmployee(edit.id, {
                name: edit.name.trim(),
                title: (edit.title || "").trim() || undefined,
                blurb: (edit.blurb || "").trim() || undefined,
                icon: edit.icon,
                avatarData: edit.avatarData ?? null,
                persona: edit.persona.trim(),
                soul: (edit.soul || "").trim() || null,
                aboutUser: (edit.aboutUser || "").trim() || null,
                memory: (edit.memory || "").trim() || null,
                model: edit.model?.providerId && edit.model.model ? edit.model : null,
              });
              onSaved?.(r || {});
              onClose();
            }}>{en ? "Save" : "保存"}</button>
          </div>
        </div>
      </div>
      {cropFile && (
        <AvatarCropper file={cropFile} en={en} onCancel={() => setCropFile(null)} onDone={(dataUrl) => { setEdit({ ...edit, avatarData: dataUrl }); setCropFile(null); }} />
      )}
    </>
  );
}

export function AppStore({ en, onEmployees, onOpenChat, providers }: { en: boolean; onEmployees?: (list: Employee[]) => void; onOpenChat?: () => void; providers?: ProviderOpt[] }) {
  const [state, setState] = useState<TeamState>({ apps: [], employees: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // 导入：扫描是用户主动触发的（要起一次 wsl 进程列发行版），不在打开面板时自动跑
  const [scan, setScan] = useState<ImportSource[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<string>("");
  // 编辑员工：edit=正在编辑的员工(交给共享的 EmployeeEditModal)，null=没在编辑
  const [edit, setEdit] = useState<Employee | null>(null);
  // 「添加员工」弹窗：装团队包 / 从 openclaw 导入 都收进这里，不再摊在主界面。
  const [showAdd, setShowAdd] = useState(false);

  const api = (window as any).wuwei?.team;

  useEffect(() => {
    let alive = true;
    api?.state().then((s: TeamState) => {
      if (!alive || !s) return;
      setState(s);
      onEmployees?.(s.employees || []); // 上抛给群界面：建群选人要用同一份员工表
    });
    // 主进程侧任何变更都会广播 evt:team，界面跟着刷新（与 MCP 面板同一套机制）
    const off = (window as any).wuwei?.onEvent?.((ch: string, p: TeamState) => {
      if (ch === "evt:team" && p) {
        setState(p);
        onEmployees?.(p.employees || []);
      }
    });
    return () => {
      alive = false;
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (key: string, fn: () => Promise<TeamState>) => {
    setBusy(key);
    try {
      const s = await fn();
      if (s?.apps) setState({ apps: s.apps, employees: s.employees });
    } finally {
      setBusy(null);
    }
  };

  const kw = q.trim().toLowerCase();
  const apps = state.apps; // 团队包在「添加员工」弹窗里全量展示，不受主搜索框影响
  // 主搜索框过滤「我的员工」：按名字/职位/简介匹配
  const hired = state.employees.filter(
    (e) =>
      !kw ||
      e.name.toLowerCase().includes(kw) ||
      (e.title || "").toLowerCase().includes(kw) ||
      (e.blurb || "").toLowerCase().includes(kw),
  );

  return (
    <div className="tc-pane">
      {/* 顶部：搜索 + 添加员工。装团队/导入都收进「添加员工」弹窗，主界面只留员工。 */}
      <div className="tc-pane-top">
        <div className="tc-search-wrap">
          <input
            className="tc-search"
            placeholder={en ? "Search teammates" : "搜索员工"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="tc-search-x" onClick={() => setQ("")} title={en ? "Clear" : "清空"}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <button className="tc-add" onClick={() => setShowAdd(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          {en ? "Add teammate" : "添加员工"}
        </button>
      </div>

      {/* 我的员工 */}
      <div className="tc-sec">
        <h3>{en ? "My teammates" : "我的员工"}</h3>
        <span className="tc-count">{hired.length}</span>
        {hired.length > 0 && <span className="tc-hint">{en ? "click a card to chat" : "点头像卡即可私聊"}</span>}
      </div>
      {state.employees.length === 0 ? (
        <div className="tc-empty-hero">
          <span className="tc-empty-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="3.2" /><path d="M17 11l2 2 3.5-3.5" /></svg>
          </span>
          <div className="tc-empty-t">{en ? "No teammates yet" : "还没有员工"}</div>
          <div className="tc-empty-d">{en ? "Install a team pack, or import your teammates from openclaw." : "装一个团队包，或从 openclaw 导入你的员工。"}</div>
          <button className="tc-btn" onClick={() => setShowAdd(true)}>{en ? "Add teammates" : "添加员工"}</button>
        </div>
      ) : hired.length === 0 ? (
        <div className="tc-empty">{en ? `No teammate matches "${q}"` : `没有匹配「${q}」的员工`}</div>
      ) : (
        <div className="tc-emps">
          {hired.map((e) => (
            <div className="tc-emp-wrap" key={e.id}>
              <button
                className="tc-emp"
                title={en ? `Chat with ${e.name}` : `和${e.name}私聊`}
                onClick={() => { void api.chat(e.id); onOpenChat?.(); }}
              >
                <span className="tc-ava">
                  <EmployeeAvatar icon={e.icon} avatarData={e.avatarData} name={e.name} />
                </span>
                <span className="tc-emp-meta">
                  <span className="tc-emp-nm">
                    <b title={e.name}>{e.name}</b>
                    {e.title && <span className="tc-role" title={e.title}>{e.title}</span>}
                  </span>
                  {e.blurb && <span className="tc-emp-desc" title={e.blurb}>{e.blurb}</span>}
                </span>
                <span className="tc-go">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              </button>
              <button
                className="tc-emp-edit"
                title={en ? "Edit" : "编辑"}
                onClick={() => setEdit({ ...e })}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 添加员工弹窗：装团队包 + 从 openclaw 导入，都收在这里，不再摊在主界面 */}
      {showAdd && (
        <div className="tc-modal-mask" onClick={() => setShowAdd(false)}>
          <div className="tc-modal tc-add-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="tc-modal-head">
              <span>{en ? "Add teammates" : "添加员工"}</span>
              <button className="tc-modal-x" onClick={() => setShowAdd(false)} title={en ? "Close" : "关闭"}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

      {/* 从别处导入 —— 轻量一条 */}
      <div className="tc-sec" style={{ marginTop: 4 }}>
        <h3>{en ? "Import from elsewhere" : "从别处导入"}</h3>
      </div>
      <div className="tc-import">
        <span className="tc-import-ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </span>
        <span className="tc-import-t">
          <b>{en ? "Import teammates from openclaw" : "从 openclaw 导入员工"}</b>
          <p>
            {en
              ? "Finds agent personas on this machine (incl. inside WSL). openclaw doesn't need to be running."
              : "在本机（含 WSL 内）查找已配好的员工人格 · 不需要 openclaw 正在运行"}
          </p>
        </span>
        <button
          type="button"
          className="tc-btn-ghost"
          disabled={busy === "scan"}
          onClick={async () => {
            setBusy("scan");
            setImported("");
            try {
              const r = await api.importScan();
              setScan(r?.sources || []);
              setPicked(new Set((r?.sources || []).flatMap((s: ImportSource) => s.candidates.map((c) => c.sourceId))));
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "scan" ? (en ? "Scanning…" : "扫描中…") : en ? "Scan" : "扫描本机"}
        </button>
      </div>
      {scan?.length === 0 && <div className="tc-note">{en ? "Nothing found on this machine." : "本机没找到可导入的来源。"}</div>}
      {imported && <div className="tc-note ok">{imported}</div>}
      {scan?.map((s) => (
        <div className="tc-import-result" key={s.path}>
          <div className="tc-note dim">{s.kind} · {s.path}</div>
          <div className="tc-emps">
            {s.candidates.map((c) => {
              const on = picked.has(c.sourceId);
              const dup = state.employees.some((e) => e.id === `oc-${c.sourceId}`);
              return (
                <label className={"tc-emp tc-pick" + (dup ? " dup" : "")} key={c.sourceId}>
                  <input
                    type="checkbox"
                    checked={on && !dup}
                    disabled={dup}
                    onChange={() => {
                      const next = new Set(picked);
                      if (on) next.delete(c.sourceId);
                      else next.add(c.sourceId);
                      setPicked(next);
                    }}
                  />
                  <span className="tc-ava">
                    <EmployeeAvatar icon={c.icon} name={c.name} />
                  </span>
                  <span className="tc-emp-meta">
                    <span className="tc-emp-nm">
                      <b title={c.name}>{c.name}</b>
                      {c.title && <span className="tc-role" title={c.title}>{c.title}</span>}
                    </span>
                    <span className="tc-emp-desc" title={c.blurb || c.sourceId}>{dup ? (en ? "Already imported" : "已导入") : c.blurb || c.sourceId}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="tc-btn"
            disabled={busy === "imp" || picked.size === 0}
            onClick={async () => {
              setBusy("imp");
              try {
                const ids = [...picked].filter((id) => !state.employees.some((e) => e.id === `oc-${id}`));
                const r = await api.importApply(s.path, ids);
                if (r?.apps) setState({ apps: r.apps, employees: r.employees });
                setImported(en ? `Imported ${r?.added ?? 0} teammate(s).` : `已导入 ${r?.added ?? 0} 名员工，可以直接私聊了。`);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "imp" ? (en ? "Importing…" : "导入中…") : en ? `Import selected (${picked.size})` : `导入选中的 ${picked.size} 名`}
          </button>
        </div>
      ))}

      {/* 可安装的应用 */}
      <div className="tc-sec">
        <h3>{en ? "Team packs" : "可安装的团队"}</h3>
      </div>
      {apps.map((a) => (
        <div className={"tc-app" + (a.installed && !a.disabled ? " on" : "")} key={a.id}>
          <div className="tc-app-top">
            <span className="tc-app-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span className="tc-app-h">
              <span className="tc-app-nm">{a.name}</span>
              <span className="tc-app-c">
                {a.employees.length} {en ? "teammates" : "名员工"}
                {a.installed && (a.disabled ? (en ? " · disabled" : " · 已停用") : en ? " · installed" : " · 已安装")}
              </span>
            </span>
            <span className="tc-app-act">
              {a.installed ? (
                <>
                  <button type="button" className="tc-btn-ghost" disabled={busy === a.id} onClick={() => run(a.id, () => api.toggle(a.id))}>
                    {a.disabled ? (en ? "Enable" : "启用") : en ? "Disable" : "停用"}
                  </button>
                  <button type="button" className="tc-btn-ghost danger" disabled={busy === a.id} onClick={() => run(a.id, () => api.uninstall(a.id))}>
                    {en ? "Uninstall" : "卸载"}
                  </button>
                </>
              ) : (
                <button type="button" className="tc-btn" disabled={busy === a.id} onClick={() => run(a.id, () => api.install(a.id))}>
                  {busy === a.id ? (en ? "Installing…" : "安装中…") : en ? "Install" : "安装"}
                </button>
              )}
            </span>
          </div>
          <p className="tc-app-desc">{a.desc}</p>
          <div className="tc-roster">
            {a.employees.map((e) => (
              <span className="tc-chip" key={e.id}>
                <EmployeeAvatar icon={e.icon} avatarData={e.avatarData} name={e.name} />
                {e.name}
              </span>
            ))}
          </div>
        </div>
      ))}
          </div>
        </div>
      )}

      {/* 编辑员工：复用共享的 EmployeeEditModal(与 App 右键「编辑」同一个) */}
      {edit && (
        <EmployeeEditModal
          en={en}
          providers={providers}
          employee={edit}
          onClose={() => setEdit(null)}
          onSaved={(r) => { if (r?.apps) setState({ apps: r.apps as any, employees: (r.employees || []) as any }); }}
        />
      )}
    </div>
  );
}
