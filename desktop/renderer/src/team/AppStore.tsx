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
  return <span className="team-avatar-txt">{name.slice(0, 1)}</span>;
}

export function AppStore({ en }: { en: boolean }) {
  const [state, setState] = useState<TeamState>({ apps: [], employees: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const api = (window as any).wuwei?.team;

  useEffect(() => {
    let alive = true;
    api?.state().then((s: TeamState) => alive && s && setState(s));
    // 主进程侧任何变更都会广播 evt:team，界面跟着刷新（与 MCP 面板同一套机制）
    const off = (window as any).wuwei?.onEvent?.((ch: string, p: TeamState) => {
      if (ch === "evt:team" && p) setState(p);
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
              <div className="team-emp" key={e.id}>
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
              </div>
            ))}
          </div>
        )}

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
