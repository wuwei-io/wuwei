import { tr, getCurrentLanguage } from "../../../../src/localization/index.js";
import { localizeEmployee, localizeTeamApp, editLocalizedEmployeeField } from "../../../../src/team/default-localization.js";
// 应用中心 · 面板
//
// 复用 MCP 面板既有的 .mcp-* 样式（theme.css 里已有整套卡片/状态点/按钮），
// 刻意不抽公用组件：两边 UI 还没定型，过早抽象反而会把 MCP 那边一起拖下水。
// 等应用中心形态稳定、确认两者布局一致后，再抽 CardStore 并让 MCP 面板改用它。

import { useEffect, useRef, useState } from "react";
import type { Employee, TeamAppCard } from "../../../../src/team/types.js";
import { EmployeeAvatar } from "./EmployeeAvatar.js";
import { ModelPicker } from '../components/ModelPicker.js';
import type { ModelChoice } from '../../../../src/model-selection.js';

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
          <span>{tr("ui.appstore.crop.avatar.3902951")}</span>
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
        <div className="tc-crop-hint">{tr("ui.appstore.drag.to.reposition.slide.to.zoom.3c5e3b3")}</div>
        <div className="tc-modal-foot">
          <button className="tc-btn-ghost" onClick={onCancel}>{tr("set.st.cancel")}</button>
          <button className="tc-btn" onClick={confirm}>{tr("ui.appstore.use.this.8f35442")}</button>
        </div>
      </div>
    </div>
  );
}

type ImportCandidate = { sourceId: string; name: string; title?: string; blurb?: string; icon?: string };
type ImportSource = { kind: string; path: string; candidates: ImportCandidate[] };

// 可选头像图标（都在 EmployeeIcon 里有画）。空值=用名字首字。
const ICON_CHOICES = ["", "pen", "code", "chart", "palette", "brain", "coin", "crystal", "ring", "sprout"];

type ProviderOpt = { id: string; label: string; models: string[]; choices?: ModelChoice[] };

// 员工编辑弹窗：独立组件，AppStore(管理页) 与 App(右键「编辑」在当前界面直接弹，不跳转到一人公司) 共用。
// 自带草稿状态；保存/删除后回调 onSaved(带最新列表)再 onClose。
export function EmployeeEditModal({
  en, providers, employee, onClose, onSaved, loggedIn = false, onRequireLogin, onConnections,
}: {
  en: boolean;
  providers?: ProviderOpt[];
  loggedIn?: boolean;
  onRequireLogin?: () => void;
  onConnections?: () => void;
  employee: Employee;
  onClose: () => void;
  onSaved?: (r: { apps?: TeamAppCard[]; employees?: Employee[] }) => void;
}) {
  const api = (window as any).wuwei?.team;
  // Canonical draft is storage-facing; presentation is derived for the active language.
  const [edit, setEdit] = useState<Employee>(employee);
  const display = localizeEmployee(edit, (getCurrentLanguage()));
  const saveText = (field: "name" | "title" | "blurb" | "persona") =>
    edit[field] === employee[field] ? employee[field] : (edit[field] || "").trim();
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const choices = (providers || []).flatMap(p => p.choices || []).filter(c => c.category !== 'images');
  const selectedKey = edit.model ? `${edit.model.providerId}/${edit.model.model}` : '';
  const selectedModel = choices.find(c => c.key === selectedKey);
  return (
    <>
      <div className="tc-modal-mask" onClick={onClose}>
        <div className="tc-modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="tc-modal-head">
            <span>{tr("ui.appstore.edit.teammate.09f3802")}</span>
            <button className="tc-modal-x" onClick={onClose} title={tr("msg.close")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="tc-field">
            <label>{tr("ui.appstore.avatar.8f6f49e")}</label>
            <div className="tc-ava-row">
              <span className="tc-ava-preview">
                <EmployeeAvatar icon={edit.icon} avatarData={edit.avatarData} name={display.name} />
              </span>
              <div className="tc-ava-actions">
                <label className="tc-btn-ghost tc-upload">
                  {tr("ui.appstore.upload.image.28a325f")}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) setCropFile(f); }} />
                </label>
                {edit.avatarData && (
                  <button className="tc-btn-ghost danger" onClick={() => setEdit({ ...edit, avatarData: undefined })}>{tr("ui.appstore.remove.photo.09cfbf1")}</button>
                )}
              </div>
            </div>
            <div className="tc-icon-grid" style={{ marginTop: 10, opacity: edit.avatarData ? 0.45 : 1 }}>
              {ICON_CHOICES.map((ic) => (
                <button key={ic || "_txt"} className={"tc-icon-opt" + (!edit.avatarData && (edit.icon || "") === ic ? " on" : "")} title={ic || (tr("ui.appstore.initial.9fdc60d"))} onClick={() => setEdit({ ...edit, icon: ic || undefined, avatarData: undefined })}>
                  {ic ? <EmployeeAvatar icon={ic} name={display.name} /> : <span className="team-avatar-txt">{display.name.slice(0, 1) || (tr("ui.appstore.text.d51d079"))}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="tc-field">
            <label>{tr("ui.appstore.name.9ebe8e4")}</label>
            <input className="tc-input" value={display.name} maxLength={12} onChange={(ev) => setEdit(editLocalizedEmployeeField(employee, edit, "name", ev.target.value, (getCurrentLanguage())))} />
          </div>
          <div className="tc-field">
            <label>{tr("ui.appstore.title.8cf3891")}</label>
            <input className="tc-input" value={display.title || ""} maxLength={80} placeholder={tr("ui.appstore.copywriter.2a155f3")} onChange={(ev) => setEdit(editLocalizedEmployeeField(employee, edit, "title", ev.target.value, (getCurrentLanguage())))} />
          </div>
          <div className="tc-field">
            <label>{tr("ui.appstore.one.liner.6b0027c")}</label>
            <input className="tc-input" value={display.blurb || ""} maxLength={160} placeholder={tr("ui.appstore.short.line.under.the.name.ab7356a")} onChange={(ev) => setEdit(editLocalizedEmployeeField(employee, edit, "blurb", ev.target.value, (getCurrentLanguage())))} />
          </div>

          {providers && providers.length > 0 && (
            <div className="tc-field">
              <label>{tr("set.m.model")}<em>{tr("ui.appstore.which.platform.model.this.teammate.uses.951c92e")}</em></label>
              {choices.length > 0 ? <div className="tc-model-row">
                <button type="button" className="tc-btn-ghost" data-testid="employee-model-picker" onClick={() => setShowModelPicker(true)}>{selectedModel ? (en ? selectedModel.labelEn : selectedModel.label) : edit.model?.model || (tr("ui.appstore.follow.current.chat.d11d408"))}</button>
                {edit.model && <button type="button" className="tc-btn-ghost" onClick={() => setEdit({ ...edit, model: undefined })}>{tr("ui.appstore.follow.current.chat.d11d408")}</button>}
              </div> : <div className="tc-model-row">
                <select className="tc-input tc-select" value={edit.model?.providerId || ""} onChange={(ev) => { const pid = ev.target.value; setEdit({ ...edit, model: pid ? { providerId: pid, model: '' } : undefined }); }}>
                  <option value="">{tr("ui.appstore.follow.current.chat.d11d408")}</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                {edit.model?.providerId && (() => {
                  const p = providers.find((x) => x.id === edit.model!.providerId);
                  const models = p?.models || [];
                  return models.length > 0 ? (
                    <select className="tc-input tc-select" value={edit.model.model || ""} onChange={(ev) => setEdit({ ...edit, model: { providerId: edit.model!.providerId, model: ev.target.value } })}>
                      <option value="" disabled>{tr("ui.app.choose.model.0d10839")}</option>
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input className="tc-input" placeholder={tr("ui.appstore.model.id.7f1e587")} value={edit.model.model || ""} onChange={(ev) => setEdit({ ...edit, model: { providerId: edit.model!.providerId, model: ev.target.value } })} />
                  );
                })()}
              </div>}
            </div>
          )}

          <div className="tc-divider"><span>{tr("ui.appstore.persona.files.85ab855")}</span></div>
          <div className="tc-field">
            <label>{tr("ui.appstore.identity.duties.0fbd372")}<em>{tr("ui.appstore.who.they.are.what.they.own.e41914e")}</em></label>
            <textarea className="tc-textarea" rows={5} value={display.persona || ""} onChange={(ev) => setEdit(editLocalizedEmployeeField(employee, edit, "persona", ev.target.value, (getCurrentLanguage())))} />
          </div>
          <div className="tc-field">
            <label>{tr("ui.appstore.personality.voice.a1eea25")}<em>{tr("ui.appstore.tone.temperament.how.they.talk.a1827d9")}</em></label>
            <textarea className="tc-textarea" rows={3} value={edit.soul || ""} placeholder={tr("ui.appstore.optional.00a972f")} onChange={(ev) => setEdit({ ...edit, soul: ev.target.value })} />
          </div>
          <div className="tc-field">
            <label>{tr("ui.appstore.about.the.boss.691a3b2")}<em>{tr("ui.appstore.who.they.serve.preferences.projects.276a33a")}</em></label>
            <textarea className="tc-textarea" rows={3} value={edit.aboutUser || ""} placeholder={tr("ui.appstore.optional.00a972f")} onChange={(ev) => setEdit({ ...edit, aboutUser: ev.target.value })} />
          </div>
          <div className="tc-field">
            <label>{tr("ui.appstore.long.term.memory.6ca42b4")}<em>{tr("ui.appstore.background.conclusions.to.always.remember.0504ea1")}</em></label>
            <textarea className="tc-textarea" rows={3} value={edit.memory || ""} placeholder={tr("ui.appstore.optional.00a972f")} onChange={(ev) => setEdit({ ...edit, memory: ev.target.value })} />
          </div>

          <div className="tc-modal-foot">
            <button className="tc-btn-ghost danger tc-del-emp" onClick={async () => { if (!confirm(tr("ui.appstore.delete.this.can.be.undone.3ad6bdb", { p0: display.name }))) return; const r = await api.removeEmployee(edit.id); onSaved?.(r || {}); onClose(); }}>{tr("ui.appstore.delete.02958b2")}</button>
            <span style={{ flex: 1 }} />
            <button className="tc-btn-ghost" onClick={onClose}>{tr("set.st.cancel")}</button>
            <button className="tc-btn" disabled={!edit.name.trim() || !edit.persona.trim() || !!(edit.model?.providerId && !edit.model.model.trim())} onClick={async () => {
              const r = await api.updateEmployee(edit.id, {
                name: saveText("name"),
                title: saveText("title"),
                blurb: saveText("blurb"),
                icon: edit.icon,
                avatarData: edit.avatarData ?? null,
                persona: saveText("persona"),
                soul: (edit.soul || "").trim() || null,
                aboutUser: (edit.aboutUser || "").trim() || null,
                memory: (edit.memory || "").trim() || null,
                model: edit.model?.providerId && edit.model.model ? edit.model : null,
              });
              onSaved?.(r || {});
              onClose();
            }}>{tr("set.st.save")}</button>
          </div>
        </div>
      </div>
      {showModelPicker && <div className="team-model-picker" onClick={() => setShowModelPicker(false)}><div onClick={event => event.stopPropagation()}>
        <ModelPicker choices={choices} selectedKey={selectedKey} loggedIn={loggedIn} lang={(getCurrentLanguage())} loading={false}
          onChoose={async choice => { setEdit({ ...edit, model: { providerId: choice.providerId, model: choice.modelId } }); }}
          onClose={() => setShowModelPicker(false)}
          onRequireLogin={() => { setShowModelPicker(false); onClose(); onRequireLogin?.(); }}
          onConnections={() => { setShowModelPicker(false); onClose(); onConnections?.(); }} />
      </div></div>}
      {cropFile && (
        <AvatarCropper file={cropFile} en={en} onCancel={() => setCropFile(null)} onDone={(dataUrl) => { setEdit({ ...edit, avatarData: dataUrl }); setCropFile(null); }} />
      )}
    </>
  );
}

export function AppStore({ en, onEmployees, onOpenChat, providers, loggedIn, onRequireLogin, onConnections }: { en: boolean; onEmployees?: (list: Employee[]) => void; onOpenChat?: () => void; providers?: ProviderOpt[]; loggedIn?: boolean; onRequireLogin?: () => void; onConnections?: () => void }) {
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
  const apps = state.apps.map(a => localizeTeamApp(a, (getCurrentLanguage()))); // 团队包在「添加员工」弹窗里全量展示，不受主搜索框影响
  // 主搜索框过滤「我的员工」：按名字/职位/简介匹配
  const hired = state.employees.map(e => localizeEmployee(e, (getCurrentLanguage()))).filter(
    (e) =>
      !kw ||
      (state.employees.find(original => original.id === e.id)?.name || "").toLowerCase().includes(kw) ||
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
            placeholder={tr("ui.appstore.search.teammates.b2a5c15")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="tc-search-x" onClick={() => setQ("")} title={tr("ui.app.clear.c69ad09")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <button className="tc-add" onClick={() => setShowAdd(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          {tr("ui.appstore.add.teammate.3e6e84b")}
        </button>
      </div>

      {/* 我的员工 */}
      <div className="tc-sec">
        <h3>{tr("ui.appstore.my.teammates.b200126")}</h3>
        <span className="tc-count">{hired.length}</span>
        {hired.length > 0 && <span className="tc-hint">{tr("ui.appstore.click.card.to.chat.3b31129")}</span>}
      </div>
      {state.employees.length === 0 ? (
        <div className="tc-empty-hero">
          <span className="tc-empty-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="3.2" /><path d="M17 11l2 2 3.5-3.5" /></svg>
          </span>
          <div className="tc-empty-t">{tr("ui.appstore.no.teammates.yet.e02635b")}</div>
          <div className="tc-empty-d">{tr("ui.appstore.install.team.pack.or.import.your.afa834a")}</div>
          <button className="tc-btn" onClick={() => setShowAdd(true)}>{tr("ui.appstore.add.teammates.43594c5")}</button>
        </div>
      ) : hired.length === 0 ? (
        <div className="tc-empty">{tr("ui.appstore.no.teammate.matches.f27319c", { p0: q })}</div>
      ) : (
        <div className="tc-emps">
          {hired.map((e) => (
            <div className="tc-emp-wrap" key={e.id}>
              <button
                className="tc-emp"
                title={tr("ui.app.chat.with.e3dbfcc", { p0: e.name })}
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
                title={tr("set.st.editShort")}
                onClick={() => setEdit({ ...state.employees.find(original => original.id === e.id)! })}
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
              <span>{tr("ui.appstore.add.teammates.43594c5")}</span>
              <button className="tc-modal-x" onClick={() => setShowAdd(false)} title={tr("msg.close")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

      {/* 从别处导入 —— 轻量一条 */}
      <div className="tc-sec" style={{ marginTop: 4 }}>
        <h3>{tr("ui.appstore.import.from.elsewhere.be18176")}</h3>
      </div>
      <div className="tc-import">
        <span className="tc-import-ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </span>
        <span className="tc-import-t">
          <b>{tr("ui.appstore.import.teammates.from.openclaw.cc81bf8")}</b>
          <p>
            {tr("ui.appstore.finds.agent.personas.on.this.machine.6b035f3")}
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
          {busy === "scan" ? (tr("ui.appstore.scanning.985f769")) : tr("ui.appstore.scan.677912c")}
        </button>
      </div>
      {scan?.length === 0 && <div className="tc-note">{tr("ui.appstore.nothing.found.on.this.machine.5a873c6")}</div>}
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
                    <span className="tc-emp-desc" title={c.blurb || c.sourceId}>{dup ? (tr("ui.appstore.already.imported.b88fce0")) : c.blurb || c.sourceId}</span>
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
                setImported(tr("ui.appstore.imported.teammate.b35218a", { p0: r?.added ?? 0 }));
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "imp" ? (tr("ui.appstore.importing.91f7249")) : tr("ui.appstore.import.selected.ff28c9e", { p0: picked.size })}
          </button>
        </div>
      ))}

      {/* 可安装的应用 */}
      <div className="tc-sec">
        <h3>{tr("ui.appstore.team.packs.8c1b7f5")}</h3>
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
                {a.employees.length} {tr("ui.appstore.teammates.1a12afc")}
                {a.installed && (a.disabled ? (tr("ui.appstore.disabled.019c80b")) : tr("ui.appstore.installed.1e1a5c9"))}
              </span>
            </span>
            <span className="tc-app-act">
              {a.installed ? (
                <>
                  <button type="button" className="tc-btn-ghost" disabled={busy === a.id} onClick={() => run(a.id, () => api.toggle(a.id))}>
                    {a.disabled ? (tr("set.mcp.enable")) : tr("ui.appstore.disable.5dac4e9")}
                  </button>
                  <button type="button" className="tc-btn-ghost danger" disabled={busy === a.id} onClick={() => run(a.id, () => api.uninstall(a.id))}>
                    {tr("ui.appstore.uninstall.2188190")}
                  </button>
                </>
              ) : (
                <button type="button" className="tc-btn" disabled={busy === a.id} onClick={() => run(a.id, () => api.install(a.id))}>
                  {busy === a.id ? (tr("ui.appstore.installing.f04fe00")) : tr("set.mcp.dInstall")}
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
          loggedIn={loggedIn}
          onRequireLogin={onRequireLogin}
          onConnections={onConnections}
          employee={edit}
          onClose={() => setEdit(null)}
          onSaved={(r) => { if (r?.apps) setState({ apps: r.apps as any, employees: (r.employees || []) as any }); }}
        />
      )}
    </div>
  );
}
