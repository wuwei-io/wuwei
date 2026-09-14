// 应用中心 · 面板
//
// 复用 MCP 面板既有的 .mcp-* 样式（theme.css 里已有整套卡片/状态点/按钮），
// 刻意不抽公用组件：两边 UI 还没定型，过早抽象反而会把 MCP 那边一起拖下水。
// 等应用中心形态稳定、确认两者布局一致后，再抽 CardStore 并让 MCP 面板改用它。

import { useEffect, useState } from "react";
import type { Employee, TeamAppCard } from "../../../../src/team/types.js";

type TeamState = { apps: TeamAppCard[]; employees: Employee[] };

/** 员工头像：按 icon 字段给一组手写线性 SVG（currentColor 跟随主题），没有就用名字首字 */
function EmployeeIcon({ icon, name }: { icon?: string; name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (icon === "pen")
    return (
      <svg {...common}>
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    );
  if (icon === "code")
    return (
      <svg {...common}>
        <path d="m16 18 6-6-6-6" />
        <path d="m8 6-6 6 6 6" />
      </svg>
    );
  if (icon === "chart")
    return (
      <svg {...common}>
        <path d="M3 3v18h18" />
        <path d="m7 15 4-5 3 3 5-7" />
      </svg>
    );
  if (icon === "palette")
    return (
      <svg {...common}>
        <circle cx="13.5" cy="6.5" r=".8" />
        <circle cx="17.5" cy="10.5" r=".8" />
        <circle cx="8.5" cy="7.5" r=".8" />
        <circle cx="6.5" cy="12.5" r=".8" />
        <path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.6-10-8.6z" />
      </svg>
    );
  // 下面几个是给导入员工用的（openclaw 的 emoji 会映射到这里），缺了就会退化成首字头像
  if (icon === "brain")
    return (
      <svg {...common}>
        <path d="M12 5.5a2.8 2.8 0 0 0-2.8 2.8 2.4 2.4 0 0 0-1.3 4.3 2.4 2.4 0 0 0 1.4 4.2 2.8 2.8 0 0 0 2.7 1.6" />
        <path d="M12 5.5a2.8 2.8 0 0 1 2.8 2.8 2.4 2.4 0 0 1 1.3 4.3 2.4 2.4 0 0 1-1.4 4.2 2.8 2.8 0 0 1-2.7 1.6" />
        <path d="M12 5.5v13" />
      </svg>
    );
  if (icon === "coin")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M14.5 9.2c-.5-.7-1.4-1.1-2.5-1.1-1.5 0-2.4.7-2.4 1.8 0 2.6 5 1.2 5 3.9 0 1.2-1 2-2.6 2-1.2 0-2.1-.4-2.6-1.2" />
        <path d="M12 6.6v10.8" />
      </svg>
    );
  if (icon === "crystal")
    return (
      <svg {...common}>
        <path d="M12 3 4.5 9.5 12 21l7.5-11.5z" />
        <path d="M4.5 9.5h15" />
        <path d="M12 3v18" />
      </svg>
    );
  if (icon === "ring")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 3v5.4M12 15.6V21M3 12h5.4M15.6 12H21" />
      </svg>
    );
  if (icon === "sprout")
    return (
      <svg {...common}>
        <path d="M12 21v-8" />
        <path d="M12 13c0-3.3-2.4-6-5.5-6C6.5 10.5 8.9 13 12 13z" />
        <path d="M12 13c0-3.9 2.8-7 6.3-7 0 3.9-2.8 7-6.3 7z" />
      </svg>
    );
  return <span className="team-avatar-txt">{name.slice(0, 1)}</span>;
}

type ImportCandidate = { sourceId: string; name: string; title?: string; blurb?: string; icon?: string };
type ImportSource = { kind: string; path: string; candidates: ImportCandidate[] };

export function AppStore({ en, onEmployees }: { en: boolean; onEmployees?: (list: Employee[]) => void }) {
  const [state, setState] = useState<TeamState>({ apps: [], employees: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // 导入：扫描是用户主动触发的（要起一次 wsl 进程列发行版），不在打开面板时自动跑
  const [scan, setScan] = useState<ImportSource[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<string>("");

  const api = (window as any).wuwei?.team;

  useEffect(() => {
    let alive = true;
    api?.state().then((s: TeamState) => {
      if (!alive || !s) return;
      setState(s);
      onEmployees?.(s.employees || []); // 上抛给房间界面：建群选人要用同一份员工表
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
  const apps = state.apps.filter(
    (a) =>
      !kw ||
      a.name.toLowerCase().includes(kw) ||
      a.desc.toLowerCase().includes(kw) ||
      a.employees.some((e) => e.name.toLowerCase().includes(kw)),
  );
  const hired = state.employees;

  return (
    <div className="mcp-pane">
      <input
        className="mcp-search"
        placeholder={en ? "Search apps or teammates" : "搜索应用或员工"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mcp-scroll">
        <div className="mcp-sec">
          {en ? "Your teammates" : "我的员工"}（{hired.length}）
        </div>
        {hired.length === 0 && (
          <div className="mcp-empty">
            {en
              ? "No teammates yet. Install an app below to hire some."
              : "还没有员工。装一个下面的应用就有了。"}
          </div>
        )}
        {hired.length > 0 && (
          <div className="team-emp-grid">
            {hired.map((e) => (
              <button
                className="team-emp team-emp-btn"
                key={e.id}
                title={en ? `Chat with ${e.name}` : `和${e.name}私聊`}
                onClick={() => void api.chat(e.id)}
              >
                <span className="team-emp-ico">
                  <EmployeeIcon icon={e.icon} name={e.name} />
                </span>
                <span className="team-emp-main">
                  <span className="team-emp-name">
                    {e.name}
                    {e.title && <span className="team-emp-title">{e.title}</span>}
                  </span>
                  {e.blurb && <span className="team-emp-blurb">{e.blurb}</span>}
                </span>
                <span className="team-emp-go">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 从别处导入员工。扫描按钮常驻，扫不到就明说没找到，不留一个没反馈的按钮。 */}
        <div className="mcp-sec">{en ? "Import teammates" : "从别处导入员工"}</div>
        <div className="mcp-card">
          <div className="mcp-card-head">
            <span className="mcp-name">{en ? "Scan this machine" : "扫描本机"}</span>
            <span className="mcp-count">
              {en ? "reads openclaw personas" : "读取 openclaw 的员工人格"}
            </span>
            <span className="mcp-actions">
              <button
                type="button"
                className="mcp-btn"
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
                {busy === "scan" ? (en ? "Scanning…" : "扫描中…") : en ? "Scan" : "扫描"}
              </button>
            </span>
          </div>
          <div className="team-desc">
            {en
              ? "Looks for openclaw agent personas on this machine (including inside WSL). Nothing is imported until you pick."
              : "在本机（含 WSL 内）查找 openclaw 的员工人格文件。不需要 openclaw 正在运行；勾选后才会真正导入。"}
          </div>
          {scan?.length === 0 && (
            <div className="team-desc" style={{ opacity: 0.75 }}>
              {en ? "Nothing found on this machine." : "本机没找到可导入的来源。"}
            </div>
          )}
          {imported && <div className="team-desc">{imported}</div>}
          {scan?.map((s) => (
            <div key={s.path}>
              <div className="team-desc" style={{ opacity: 0.75, wordBreak: "break-all" }}>
                {s.kind} · {s.path}
              </div>
              <div className="team-emp-grid">
                {s.candidates.map((c) => {
                  const on = picked.has(c.sourceId);
                  const dup = state.employees.some((e) => e.id === `oc-${c.sourceId}`);
                  return (
                    <label className="team-emp" key={c.sourceId} style={{ cursor: dup ? "default" : "pointer", opacity: dup ? 0.5 : 1 }}>
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
                        style={{ marginTop: "5px", flex: "0 0 auto" }}
                      />
                      <span className="team-emp-ico">
                        <EmployeeIcon icon={c.icon} name={c.name} />
                      </span>
                      <span className="team-emp-main">
                        <span className="team-emp-name">
                          {c.name}
                          {c.title && <span className="team-emp-title">{c.title}</span>}
                        </span>
                        <span className="team-emp-blurb">
                          {dup ? (en ? "Already imported" : "已导入") : c.blurb || c.sourceId}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div style={{ padding: "0 10px 10px" }}>
                <button
                  type="button"
                  className="mcp-btn save"
                  disabled={busy === "imp" || picked.size === 0}
                  onClick={async () => {
                    setBusy("imp");
                    try {
                      const ids = [...picked].filter((id) => !state.employees.some((e) => e.id === `oc-${id}`));
                      const r = await api.importApply(s.path, ids);
                      if (r?.apps) setState({ apps: r.apps, employees: r.employees });
                      setImported(
                        en
                          ? `Imported ${r?.added ?? 0} teammate(s).`
                          : `已导入 ${r?.added ?? 0} 名员工，可以直接私聊了。`,
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === "imp"
                    ? en
                      ? "Importing…"
                      : "导入中…"
                    : en
                      ? `Import selected (${picked.size})`
                      : `导入选中的 ${picked.size} 名`}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mcp-sec">{en ? "Available apps" : "可安装的应用"}</div>
        {apps.map((a) => (
          <div className={"mcp-card " + (a.installed ? (a.disabled ? "disabled" : "ready") : "")} key={a.id}>
            <div className="mcp-card-head">
              <span className={"mcp-dot " + (a.installed ? (a.disabled ? "disabled" : "ready") : "")} />
              <span className="mcp-name">{a.name}</span>
              <span className="mcp-count">
                {a.employees.length} {en ? "teammates" : "名员工"}
              </span>
              <span className="mcp-actions">
                {a.installed ? (
                  <>
                    <button
                      type="button"
                      className="mcp-btn"
                      disabled={busy === a.id}
                      onClick={() => run(a.id, () => api.toggle(a.id))}
                    >
                      {a.disabled ? (en ? "Enable" : "启用") : en ? "Disable" : "停用"}
                    </button>
                    <button
                      type="button"
                      className="mcp-btn del"
                      disabled={busy === a.id}
                      onClick={() => run(a.id, () => api.uninstall(a.id))}
                    >
                      {en ? "Uninstall" : "卸载"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="mcp-btn save"
                    disabled={busy === a.id}
                    onClick={() => run(a.id, () => api.install(a.id))}
                  >
                    {busy === a.id ? (en ? "Installing…" : "安装中…") : en ? "Install" : "安装"}
                  </button>
                )}
              </span>
            </div>
            <div className="team-desc">{a.desc}</div>
            <div className="team-roster">
              {a.employees.map((e) => (
                <span className="team-chip" key={e.id}>
                  <EmployeeIcon icon={e.icon} name={e.name} />
                  {e.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
