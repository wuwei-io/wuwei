// 群 · 多员工协作界面（tc- 设计语言，与一人公司内页统一）
//
// 三个界面：群列表、建群、群内聊天。每条消息显示"谁说的"——人类靠右、员工靠左带头像+名字，
// 一眼看出这是一屋子人在说话，而不是单线对话。

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Employee, Room, RoomMessage } from "../../../../src/team/types.js";
import { EmployeeAvatar } from "./EmployeeAvatar.js";
import { useTx } from "../tx.js";

// footer：App 传入的底部状态栏，现在复用主对话那条完整的 <ComposerFoot>(连通灯 + 平台/模型默认选择器 +
// 思考档 + 本月额度/周余量 + 上下文统计)。群/私聊没有 per-session 的「模型」，选择器切的是「全局默认模型」——
// 和主对话是同一套 state/handler，切了全局默认就变。上下文统计则传本群/私聊自己的估算值(per-room)，故 footer
// 改成 render-prop 函数：App 把 room 的 contextK 注入 <ComposerFoot roomMode contextK>。
// dmSelfId：进入私聊(type==="dm")时「当前视角是哪名员工」。人类在私聊里发言时用它算出「对方」=要唤醒回复的成员。
type Props = { en: boolean; employees: Employee[]; onBack: () => void; initialRoomId?: string | null; dmSelfId?: string | null; footer?: (ctx: { contextK: number; running: boolean }) => ReactNode; renderMd?: (text: string) => ReactNode };

// 群/私聊没有主进程回报的精确 token 数(那是 per-session 的)，这里按消息文本长度粗估：
// CJK 字符 ≈ 1 token/字，其余(英文/符号/空格) ≈ 0.3 token/字。只用于底栏「上下文 ~x.xk」展示，标了 ~ 表示估算。
function estimateRoomContextK(msgs: { text?: string }[]): number {
  let tokens = 0;
  for (const m of msgs) {
    const s = m.text || "";
    let cjk = 0;
    for (const ch of s) if (/[㐀-鿿豈-﫿぀-ヿ가-힯]/.test(ch)) cjk++;
    tokens += cjk + (s.length - cjk) * 0.3;
  }
  return tokens / 1000;
}

export function RoomView({ en, employees, onBack, initialRoomId, dmSelfId, footer, renderMd }: Props) {
  const tx = useTx(); // 翻译显示层：翻译态下群名/员工名/发言人名临时译成英文覆盖显示(纯覆盖，不改数据)
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  // 员工干活进度：empId → {name, 思考文本, 工具列表}。只显示、不进消息流；跑完清掉。
  const [progress, setProgress] = useState<Record<string, { name: string; text: string; tools: { name: string; done: boolean }[] }>>({});
  const [expanded, setExpanded] = useState(false); // 进度是否展开看详细
  const [justStopped, setJustStopped] = useState(false); // 刚点了「停止」→ 冒出「继续」入口
  // 最近一轮在干活的员工（进度块跑完/被停会清空 progress，先快照下来，「继续」时据此重新点名唤醒）
  const lastWorkersRef = useRef<{ id: string; name: string }[]>([]);
  const [mention, setMention] = useState<string | null>(null); // @ 补全：输入 @ 后的查询词，null=不显示
  const [mentionIdx, setMentionIdx] = useState(0); // @ 弹窗当前高亮项(键盘 ↑↓ 导航)
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMembers, setNewMembers] = useState<Set<string>>(new Set());
  const [newCoord, setNewCoord] = useState<string>("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const api = (window as any).wuwei?.team;

  // 从侧边栏点某个群进来 → 直接进那个群（外部指定优先）
  useEffect(() => {
    if (initialRoomId) setCur(initialRoomId);
  }, [initialRoomId]);

  const room = rooms.find((r) => r.id === cur) || null;
  const empOf = (id: string) => employees.find((e) => e.id === id);
  const nameOf = (id: string) => empOf(id)?.name || id;

  // @ 补全候选：所有人 + 群成员，按查询词过滤。抽到组件层，弹窗渲染与键盘导航共用同一份。
  const mentionAll = en ? "Everyone" : "所有人";
  const mentionCands: { id: string; name: string }[] = (() => {
    if (mention === null || !room) return [];
    const cand0 = [{ id: "__all__", name: mentionAll }, ...room.members.map((id) => ({ id, name: nameOf(id) }))];
    const q = mention.toLowerCase();
    return cand0.filter((c) => !q || c.name.toLowerCase().includes(q));
  })();
  const pickMention = (name: string) => {
    const inserted = name === mentionAll ? (en ? "all" : "所有人") : name;
    setText((t) => t.replace(/@[^\s@]*$/, `@${inserted} `));
    setMention(null);
    setMentionIdx(0);
  };

  useEffect(() => {
    api?.rooms().then((r: any) => setRooms(r?.rooms || []));
    const off = (window as any).wuwei?.onEvent?.((ch: string, p: any) => {
      if (ch === "evt:team-rooms") setRooms(p?.rooms || []);
      else if (ch === "evt:team-room") {
        setCur((c) => {
          if (p?.roomId === c) {
            setMsgs(p.messages || []);
            setRunning(!!p.running);
          }
          return c;
        });
      } else if (ch === "evt:team-room-hint") {
        // 只认当前打开房间的 hint(用 setCur 读最新值，别用闭包里捕获的旧 cur)，防跨房间串显。
        // no-responders 存哨兵、渲染时按当前语言转双语文案(切语言也能正确显示)。
        setCur((c) => { if (p?.roomId === c) setHint(p?.code === "no-responders" ? "@@no-responders@@" : (p?.hint || "")); return c; });
      } else if (ch === "evt:team-room-progress") {
        const empId = p?.empId;
        if (!empId) return;
        setCur((c) => {
          if (p?.roomId !== c) return c; // 别的房间的进度不串显到当前房间
          setProgress((prev) => {
            if (p.done) { const n = { ...prev }; delete n[empId]; return n; } // 该员工干完，清掉他的进度
            const pc = prev[empId] || { name: p.empName || "", text: "", tools: [] };
            const next = { ...pc, name: p.empName || pc.name };
            if (p.kind === "text") next.text = (pc.text + (p.delta || "")).slice(-800); // 只留最近思考，别无限涨
            else if (p.kind === "tool-start") next.tools = [...pc.tools, { name: p.name, done: false }];
            else if (p.kind === "tool-end") { const t = [...pc.tools]; for (let i = t.length - 1; i >= 0; i--) if (!t[i].done) { t[i] = { ...t[i], done: true }; break; } next.tools = t; }
            return { ...prev, [empId]: next };
          });
          return c;
        });
      }
    });
    return () => off?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cur) return;
    setHint("");
    api?.roomMessages(cur).then((r: any) => {
      setMsgs(r?.messages || []);
      setRunning(!!r?.running);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, running]);

  // 快照「谁在干活」：进度块随时会因跑完/被停而清空，先把当前在场的员工记下来，供「继续」重新点名。
  useEffect(() => {
    const ws = Object.entries(progress).map(([id, p]) => ({ id, name: p.name }));
    if (ws.length) lastWorkersRef.current = ws;
  }, [progress]);

  // 新一轮真的跑起来了（running 变 true）→ 收起「继续」入口，别和运行中的停止按钮打架。
  useEffect(() => {
    if (running) setJustStopped(false);
  }, [running]);

  // 换群/私聊：清掉「继续」入口，别把上一个会话的状态带过来。
  useEffect(() => {
    setJustStopped(false);
    lastWorkersRef.current = [];
  }, [cur]);

  const send = () => {
    const t = text.trim();
    if (!t || !cur || running) return;
    setText("");
    setHint("");
    setJustStopped(false);
    // 私聊(type==="dm")：唤醒「对方」= 非当前视角(dmSelfId)的那名成员，让人类能像微信一样直接跟员工对话。
    // 群场景不传 dmResponder，主进程仍走 @/协调者的 pickResponders。
    const dmResponder = room?.type === "dm" ? (room.members || []).find((m) => m !== dmSelfId) : undefined;
    void api.roomSend(cur, t, dmResponder);
  };

  // 「继续」：停止后从头接着干。员工被中止时的半成品并没有落库(orchestrator 在 aborted 时直接 return，
  // 不保存部分输出)，所以这里做的是「重新点名刚才那几位、发一条『接着上一步做』的指令」——不是逐字续跑，
  // 而是让同一批人带着上下文再跑一轮。私聊直接唤醒对方；群里 @ 上刚才在干活的成员，确保能被唤醒。
  const resume = () => {
    if (!cur || running) return;
    const workers = lastWorkersRef.current;
    if (!workers.length) return;
    setJustStopped(false);
    setHint("");
    if (room?.type === "dm") {
      const dmResponder = (room.members || []).find((m) => m !== dmSelfId);
      void api.roomSend(cur, en ? "Please continue from where you left off." : "接着上一步继续做。", dmResponder);
    } else {
      const at = workers.map((w) => `@${w.name}`).join(" ");
      void api.roomSend(cur, `${at} ${en ? "please continue from where you left off." : "接着上一步继续做。"}`);
    }
  };

  // 一个小头像（用于成员堆叠、消息气泡）
  const Avatar = ({ id, cls }: { id: string; cls?: string }) => {
    const e = empOf(id);
    return (
      <span className={"tc-room-av " + (cls || "")}>
        <EmployeeAvatar icon={e?.icon} avatarData={e?.avatarData} name={e?.name || id} />
      </span>
    );
  };

  // ── 建群 ──
  if (creating) {
    return (
      <div className="tc-pane">
        <div className="tc-room-bar">
          <button className="tc-btn-ghost" onClick={() => setCreating(false)}>‹ {en ? "Cancel" : "取消"}</button>
          <span className="tc-room-bar-t">{en ? "New group" : "建群"}</span>
        </div>

        <div className="tc-field" style={{ marginTop: 18 }}>
          <label>{en ? "Group name" : "群名"}</label>
          <input
            className="tc-input"
            value={newName}
            placeholder={en ? "e.g. Landing page revamp" : "例如：落地页改版"}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>

        <div className="tc-field">
          <label>{en ? "Members" : "成员"}<em>{en ? "pull teammates in" : "拉进来一起干活"}</em></label>
          {employees.length === 0 ? (
            <div className="tc-empty">{en ? "No teammates yet — add some first." : "还没有员工，先去「员工」页添加。"}</div>
          ) : (
            <div className="tc-emps">
              {employees.map((e) => {
                const on = newMembers.has(e.id);
                return (
                  <label className={"tc-emp tc-pick" + (on ? " picked" : "")} key={e.id}>
                    <input
                      type="checkbox"
                      className="tc-pick-cb"
                      checked={on}
                      onChange={() => {
                        const n = new Set(newMembers);
                        if (on) { n.delete(e.id); if (newCoord === e.id) setNewCoord(""); }
                        else n.add(e.id);
                        setNewMembers(n);
                      }}
                    />
                    <span className="tc-ava"><EmployeeAvatar icon={e.icon} avatarData={e.avatarData} name={e.name} /></span>
                    <span className="tc-emp-meta">
                      <span className="tc-emp-nm">
                        <b title={e.name}>{tx(e.name)}</b>
                        {e.title && <span className="tc-role" title={e.title}>{e.title}</span>}
                      </span>
                      {e.blurb && <span className="tc-emp-desc" title={e.blurb}>{e.blurb}</span>}
                    </span>
                    {on && (
                      <span className="tc-pick-check">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="tc-field">
          <label>{en ? "Coordinator" : "常驻协调者"}<em>{en ? "answers without being @-ed" : "不用 @ 也会应答"}</em></label>
          <select className="tc-input tc-select" value={newCoord} onChange={(e) => setNewCoord(e.target.value)}>
            <option value="">{en ? "None — everyone must be @-ed" : "不设（所有人都要被 @ 才说话）"}</option>
            {[...newMembers].map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
          </select>
          <div className="tc-field-hint">
            {en
              ? "Without a coordinator, messages that @ nobody are just recorded — nobody runs. Biggest cost saver."
              : "不设协调者时，没 @ 人的消息只记进上下文、不唤醒任何人——这是最省钱的一档。"}
          </div>
        </div>

        <button
          className="tc-btn tc-room-create"
          disabled={!newName.trim() || newMembers.size === 0}
          onClick={async () => {
            const r = await api.roomCreate(newName.trim(), [...newMembers], newCoord || undefined);
            setRooms(r?.rooms || []);
            setCur(r?.room?.id || null);
            setCreating(false);
            setNewName(""); setNewMembers(new Set()); setNewCoord("");
          }}
        >
          {en ? "Create group" : "创建群"}
        </button>
      </div>
    );
  }

  // ── 群列表 ──
  if (!room) {
    return (
      <div className="tc-pane">
        <div className="tc-room-bar">
          <span className="tc-room-bar-t">{en ? "Groups" : "群"}</span>
          <button className="tc-add" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {en ? "New group" : "建群"}
          </button>
        </div>

        {rooms.filter((r) => r.type !== "dm").length === 0 ? (
          <div className="tc-empty-hero">
            <span className="tc-empty-ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </span>
            <div className="tc-empty-t">{en ? "No groups yet" : "还没有群"}</div>
            <div className="tc-empty-d">{en ? "Create one and pull a few teammates in to work together." : "建一个，把几名员工拉进去一起干活。"}</div>
            <button className="tc-btn" onClick={() => setCreating(true)}>{en ? "New group" : "建群"}</button>
          </div>
        ) : (
          <div className="tc-room-list">
            {rooms.filter((r) => r.type !== "dm").map((r) => (
              <button className="tc-room-card" key={r.id} onClick={() => setCur(r.id)}>
                <span className="tc-room-stack">
                  {r.members.slice(0, 4).map((id) => <Avatar key={id} id={id} cls="stacked" />)}
                </span>
                <span className="tc-room-meta">
                  <span className="tc-room-nm">
                    {tx(r.name)}
                    {r.coordinator && <span className="tc-room-host">{nameOf(r.coordinator)} {en ? "hosts" : "主持"}</span>}
                  </span>
                  {r.lastText && <span className="tc-room-last">{r.lastText}</span>}
                </span>
                <span className="tc-room-cnt">{r.members.length} {en ? "" : "人"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 群内聊天 ──
  // 顶栏(群名/成员/⋯)已上移到软件标题栏(App 里)，这里不再重复渲染，直接进消息流。
  return (
    <div className="tc-pane tc-chat-pane">
      <div className="tc-chat-flow">
        {msgs.length === 0 && (
          <div className="tc-chat-empty">
            {en
              ? `Say something. @ someone to call them; ${room.coordinator ? `${nameOf(room.coordinator)} answers even without @.` : "nobody answers unless @-ed."}`
              : `说点什么吧。@ 某人点名叫他；${room.coordinator ? `${nameOf(room.coordinator)} 不用 @ 也会应答。` : "没设协调者，要 @ 了才有人应答。"}`}
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.speaker.kind === "human";
          return (
            <div className={"tc-msg" + (mine ? " mine" : "") + (m.error ? " err" : "")} key={m.id}>
              {!mine && (
                <span className="tc-msg-av">
                  <EmployeeAvatar icon={empOf(m.speaker.id)?.icon} avatarData={empOf(m.speaker.id)?.avatarData} name={m.speaker.name} />
                </span>
              )}
              <span className="tc-msg-body">
                {!mine && <span className="tc-msg-who">{tx(m.speaker.name)}</span>}
                <span className="tc-bubble">{renderMd ? renderMd(m.text) : m.text}</span>
              </span>
              {/* 悬停出现的删除单条：直接删，不弹确认（撤销成本低、群消息不金贵） */}
              <button
                className="tc-msg-del"
                title={en ? "Delete message" : "删除这条"}
                onClick={() => cur && api?.roomMsgDelete(cur, m.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          );
        })}
        {/* 员工干活进度：思考+工具，可展开看详细。只显示不进群消息流，跑完自动消失。 */}
        {Object.keys(progress).length > 0 && (() => {
          // 收起时的摘要：谁在干 + 调了几个工具，让用户一眼看出「在干活」还是「挂了」。
          const toolCount = Object.values(progress).reduce((n, p) => n + p.tools.length, 0);
          const toolSummary = toolCount > 0 ? (en ? ` · ${toolCount} ${toolCount === 1 ? "tool" : "tools"}` : ` · ${toolCount} 个工具`) : "";
          return (
          <div className="tc-prog">
            <button className="tc-prog-bar" onClick={() => setExpanded((v) => !v)}>
              <span className="tc-chat-typing"><span /><span /><span /></span>
              <span className="tc-prog-who">
                {Object.values(progress).map((p) => p.name).join("、")} {en ? "working…" : "正在干活…"}{toolSummary}
              </span>
              <svg className={"tc-prog-caret" + (expanded ? " up" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {expanded && (
              <div className="tc-prog-detail">
                {Object.entries(progress).map(([id, p]) => (
                  <div className="tc-prog-emp" key={id}>
                    <div className="tc-prog-name">{tx(p.name)}</div>
                    {p.tools.length > 0 && (
                      <div className="tc-prog-tools">
                        {p.tools.map((t, i) => (
                          <span className={"tc-prog-tool" + (t.done ? " done" : "")} key={i}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              {t.done ? <path d="M20 6 9 17l-5-5" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
                            </svg>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.text && <div className="tc-prog-think">{p.text}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })()}
        {/* 停止后的「继续」入口：重新点名刚才那几位、发一条「接着做」的指令再跑一轮（不是逐字续跑，半成品没落库）。 */}
        {!running && justStopped && lastWorkersRef.current.length > 0 && (
          <div className="tc-prog-resume">
            <span className="tc-prog-resume-t">{en ? "Stopped." : "已停止。"}</span>
            <button className="tc-prog-resume-btn" onClick={resume}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /></svg>
              {en ? "Continue" : "继续"}
            </button>
          </div>
        )}
        {hint && <div className="tc-chat-hint">{hint === "@@no-responders@@" ? (en ? "No one was called on. @ an employee, or set a standing coordinator in the group settings." : "没有人被点名。@某位员工，或在群设置里指定一名常驻协调者。") : hint}</div>}
        <div ref={endRef} />
      </div>

      {/* 输入框：抄主对话框风格——整体一个大圆角框，发送/停止按钮内嵌右下，对齐 */}
      <div className="tc-composer">
        {/* @ 补全：输入 @ 弹出成员 + 所有人。鼠标点选或键盘 ↑↓ 高亮 + Enter 选中 */}
        {mention !== null && mentionCands.length > 0 && (() => {
          const cands = mentionCands;
          return (
            <div className="tc-mention">
              {cands.map((c, i) => (
                <button
                  key={c.id}
                  className={"tc-mention-item" + (c.id === "__all__" ? " all" : "") + (i === mentionIdx ? " on" : "")}
                  onMouseEnter={() => setMentionIdx(i)}
                  onMouseDown={(e) => { e.preventDefault(); pickMention(c.name); }}
                >
                  {c.id === "__all__" ? (
                    <span className="tc-mention-av all">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    </span>
                  ) : (
                    <span className="tc-mention-av"><EmployeeAvatar icon={empOf(c.id)?.icon} avatarData={empOf(c.id)?.avatarData} name={c.name} /></span>
                  )}
                  <span className="tc-mention-nm">{tx(c.name)}</span>
                </button>
              ))}
            </div>
          );
        })()}
        <textarea
          value={text}
          rows={1}
          placeholder={en ? "Message the group…  @name to call someone" : "在群里说话…  用 @姓名 点名（含所有人）"}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            const m = /@([^\s@]*)$/.exec(v); // 光标处末尾的 @查询
            setMention(m ? m[1] : null);
            setMentionIdx(0); // 查询词变了，高亮回到第一项
          }}
          onKeyDown={(e) => {
            // @ 弹窗开着：↑↓ 移高亮、Enter 选中、Esc 关闭；都 preventDefault，别触发发送/换行
            if (mention !== null && mentionCands.length > 0) {
              if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionCands.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionCands.length) % mentionCands.length); return; }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); pickMention(mentionCands[Math.min(mentionIdx, mentionCands.length - 1)].name); return; }
              if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && mention === null) { e.preventDefault(); send(); }
          }}
        />
        {running ? (
          <button className="send-btn stop" onClick={() => { void api.roomAbort(room.id); setJustStopped(true); }} title={en ? "Stop" : "停止"}>
            <span className="stop-sq" />
          </button>
        ) : (
          <button className={"send-btn" + (text.trim() ? " active" : "")} disabled={!text.trim()} onClick={send} title={en ? "Send" : "发送"}>
            ↵
          </button>
        )}
      </div>
      {footer && <div className="tc-room-foot">{footer({ contextK: estimateRoomContextK(msgs), running })}</div>}
    </div>
  );
}
