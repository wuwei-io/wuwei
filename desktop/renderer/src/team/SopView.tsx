import { tr, getCurrentLanguage } from "../../../../src/localization/index.js";
// 一人公司 · SOP 库 · 单个 SOP 详情界面（tc- 设计语言，与群/私聊统一）
//
// 三个 tab：查看（渲染 md 全文）/ 编辑（源码 textarea + 实时预览，存盘产生新版本）/ 版本（历史列表，可查看/回滚）。
// 树导航在侧栏（App.tsx），本组件只负责「当前选中的这个 SOP」的正文与版本。

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { SopNode, SopVersion } from "../../../../src/sop/types.js";

type Props = {
  en: boolean;
  sopId: string;
  nodes: SopNode[]; // 整棵树（用于取当前节点的名字/taskKey/版本号 + 类别路径）
  renderMd?: (text: string) => ReactNode;
  // 统一样式化确认弹窗（App 提供，替代原生 confirm()）
  askConfirm?: (opts: { title?: string; message: string; danger?: boolean; okText?: string; onOk: () => void }) => void;
};

export function SopView({ en, sopId, nodes, renderMd, askConfirm }: Props) {
  const [tab, setTab] = useState<"view" | "edit" | "versions">("view");
  const [doc, setDoc] = useState("");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<SopVersion[]>([]);
  const [viewingVer, setViewingVer] = useState<number | null>(null); // 正在预览的历史版本号
  const [verText, setVerText] = useState("");
  const api = (window as any).wuwei?.team;

  const node = nodes.find((n) => n.id === sopId && n.kind === "sop") || null;
  // 类别路径：向上拼父类别名
  const pathOf = (id?: string): string => {
    const names: string[] = [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let cur = id ? byId.get(id)?.parentId : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) { seen.add(cur); const p = byId.get(cur); if (!p) break; names.unshift(p.name); cur = p.parentId; }
    return names.join(" / ");
  };

  // 切 SOP：拉正文、复位 tab/草稿
  useEffect(() => {
    setTab("view"); setDirty(false); setViewingVer(null);
    api?.sopDoc?.(sopId).then((r: any) => { const t = r?.text || ""; setDoc(t); setDraft(t); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sopId]);

  // 进版本 tab 时拉历史
  useEffect(() => {
    if (tab === "versions") api?.sopVersions?.(sopId).then((r: any) => setVersions(r?.versions || []));
    if (tab !== "versions") { setViewingVer(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sopId]);

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    await api?.sopSave?.(sopId, draft);
    setSaving(false);
    setDoc(draft); setDirty(false);
    setTab("view");
  };

  const openVersion = async (n: number) => {
    const r = await api?.sopReadVersion?.(sopId, n);
    setVerText(r?.text ?? "");
    setViewingVer(n);
  };

  const doRollback = (n: number) => {
    const run = async () => {
      await api?.sopRollback?.(sopId, n);
      const r = await api?.sopDoc?.(sopId);
      const t = r?.text || ""; setDoc(t); setDraft(t);
      const vr = await api?.sopVersions?.(sopId);
      setVersions(vr?.versions || []);
      setViewingVer(null);
    };
    const msg = tr("ui.sopview.roll.back.to.this.creates.new.0d2a1aa", { p0: n });
    if (askConfirm) askConfirm({ message: msg, onOk: () => { void run(); } });
    else void run();
  };

  if (!node) {
    return <div className="tc-pane"><div className="tc-empty">{tr("ui.sopview.sop.not.found.2c43529")}</div></div>;
  }
  const path = pathOf(sopId);

  return (
    <div className="tc-pane sop-pane">
      {/* 头部：标题 + 类别路径 + taskKey + 版本号 */}
      <div className="sop-head">
        <div className="sop-head-main">
          <span className="sop-title" title={node.name}>{node.name}</span>
          <div className="sop-head-meta">
            {path && <span className="sop-crumb">{path}</span>}
            {node.taskKey && <span className="sop-tag" title="taskKey">{node.taskKey}</span>}
            <span className="sop-ver">v{node.currentVersion || 0}</span>
          </div>
        </div>
        <div className="tc-seg sop-seg">
          <button className={tab === "view" ? "on" : ""} onClick={() => setTab("view")}>{tr("ui.sopview.view.b481c5f")}</button>
          <button className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}>{tr("set.st.editShort")}</button>
          <button className={tab === "versions" ? "on" : ""} onClick={() => setTab("versions")}>
            {tr("ui.sopview.history.d5e2bd3")}{versions.length ? <span className="sop-seg-cnt">{versions.length}</span> : null}
          </button>
        </div>
      </div>

      {/* 查看 */}
      {tab === "view" && (
        <div className="sop-body sop-view">
          {doc.trim()
            ? (renderMd ? renderMd(doc) : <pre className="sop-raw">{doc}</pre>)
            : <div className="tc-empty">{tr("ui.sopview.no.content.yet.switch.to.edit.b34be69")}</div>}
        </div>
      )}

      {/* 编辑：左源码右实时预览 */}
      {tab === "edit" && (
        <div className="sop-body sop-edit">
          <div className="sop-edit-cols">
            <textarea
              className="sop-textarea"
              value={draft}
              placeholder={tr("ui.sopview.write.the.sop.in.markdown.f48461a")}
              onChange={(e) => { setDraft(e.target.value); setDirty(e.target.value !== doc); }}
            />
            <div className="sop-preview">
              {draft.trim() ? (renderMd ? renderMd(draft) : <pre className="sop-raw">{draft}</pre>) : <div className="tc-empty">{tr("ui.sopview.preview.6d82087")}</div>}
            </div>
          </div>
          <div className="sop-edit-foot">
            <span className="sop-edit-hint">{dirty ? (tr("ui.sopview.unsaved.changes.599070c")) : (tr("ui.app.saved.0a6bf62"))}</span>
            <button className="tc-btn" disabled={!dirty || saving} onClick={save}>
              {saving ? (tr("ui.app.saving.4c8592b")) : (tr("ui.sopview.save.as.new.version.c3476aa"))}
            </button>
          </div>
        </div>
      )}

      {/* 版本历史 */}
      {tab === "versions" && (
        <div className="sop-body sop-versions">
          {viewingVer !== null ? (
            <div className="sop-ver-preview">
              <div className="sop-ver-preview-bar">
                <button className="tc-btn-ghost" onClick={() => setViewingVer(null)}>‹ {tr("ui.sopview.back.to.list.f71d656")}</button>
                <span className="sop-ver-preview-t">v{viewingVer}</span>
                <button className="tc-btn" onClick={() => doRollback(viewingVer)}>{tr("ui.sopview.roll.back.to.this.9238b73")}</button>
              </div>
              <div className="sop-view">{verText.trim() ? (renderMd ? renderMd(verText) : <pre className="sop-raw">{verText}</pre>) : <div className="tc-empty">{tr("ui.sopview.empty.01039ef")}</div>}</div>
            </div>
          ) : versions.length === 0 ? (
            <div className="tc-empty">{tr("ui.sopview.no.versions.yet.save.once.to.a457f6a")}</div>
          ) : (
            <div className="sop-ver-list">
              {[...versions].reverse().map((v) => (
                <div className="sop-ver-row" key={v.version}>
                  <span className="sop-ver-no">v{v.version}</span>
                  <span className="sop-ver-info">
                    <span className="sop-ver-time">{new Date(v.ts).toLocaleString()}</span>
                    {v.note && <span className="sop-ver-note">{v.note}</span>}
                  </span>
                  <span className="sop-ver-acts">
                    <button className="tc-btn-ghost" onClick={() => openVersion(v.version)}>{tr("ui.sopview.view.a26bcab")}</button>
                    <button className="tc-btn-ghost" onClick={() => doRollback(v.version)}>{tr("ui.sopview.roll.back.0edc3e8")}</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
