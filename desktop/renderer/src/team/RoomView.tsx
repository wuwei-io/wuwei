// 群 · 多员工协作界面（tc- 设计语言，与一人公司内页统一）
//
// 三个界面：群列表、建群、群内聊天。每条消息显示"谁说的"——人类靠右、员工靠左带头像+名字，
// 一眼看出这是一屋子人在说话，而不是单线对话。

import { useEffect, useRef, useState } from "react";
import type { Employee, Room, RoomMessage } from "../../../../src/team/types.js";
import { EmployeeAvatar } from "./EmployeeAvatar.js";

type Props = { en: boolean; employees: Employee[]; onBack: () => void; initialRoomId?: string | null };

export function RoomView({ en, employees, onBack, initialRoomId }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  // 员工干活进度：empId → {name, 思考文本, 工具列表}。只显示、不进消息流；跑完清掉。
  const [progress, setProgress] = useState<Record<string, { name: string; text: string; tools: { name: string; done: boolean }[] }>>({});
  const [expanded, setExpanded] = useState(false); // 进度是否展开看详细
  const [showMenu, setShowMenu] = useState(false); // 群头部 ⋯ 菜单（成员/删除）
  const [mention, setMention] = useState<string | null>(null); // @ 补全：输入 @ 后的查询词，null=不显示
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
      } else if (ch === "evt:team-room-hint") setHint(p?.hint || "");
      else if (ch === "evt:team-room-progress") {
        const empId = p?.empId;
        if (!empId) return;
        setProgress((prev) => {
          if (p.done) { const n = { ...prev }; delete n[empId]; return n; } // 该员工干完，清掉他的进度
          const cur = prev[empId] || { name: p.empName || "", text: "", tools: [] };
          const next = { ...cur, name: p.empName || cur.name };
          if (p.kind === "text") next.text = (cur.text + (p.delta || "")).slice(-800); // 只留最近思考，别无限涨
          else if (p.kind === "tool-start") next.tools = [...cur.tools, { name: p.name, done: false }];
          else if (p.kind === "tool-end") { const t = [...cur.tools]; for (let i = t.length - 1; i >= 0; i--) if (!t[i].done) { t[i] = { ...t[i], done: true }; break; } next.tools = t; }
          return { ...prev, [empId]: next };
        });
      }
    });
    return () => off?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cur) return;
    setHint("");
    setShowMenu(false);
    api?.roomMessages(cur).then((r: any) => {
      setMsgs(r?.messages || []);
      setRunning(!!r?.running);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, running]);

  const send = () => {
    const t = text.trim();
    if (!t || !cur || running) return;
    setText("");
    setHint("");
    void api.roomSend(cur, t);
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
                        <b title={e.name}>{e.name}</b>
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

        {rooms.length === 0 ? (
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
            {rooms.map((r) => (
              <button className="tc-room-card" key={r.id} onClick={() => setCur(r.id)}>
                <span className="tc-room-stack">
                  {r.members.slice(0, 4).map((id) => <Avatar key={id} id={id} cls="stacked" />)}
                </span>
                <span className="tc-room-meta">
                  <span className="tc-room-nm">
                    {r.name}
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
  return (
    <div className="tc-pane tc-chat-pane">
      <div className="tc-room-bar">
        <button className="tc-btn-ghost" onClick={() => setCur(null)}>‹ {en ? "Groups" : "群"}</button>
        <span className="tc-room-bar-t">{room.name}</span>
        <span className="tc-room-mini">{room.members.length}{en ? "" : " 人"}</span>
        <div className="tc-menu-wrap" style={{ marginLeft: "auto" }}>
          <button className="tc-icon-btn" onClick={() => setShowMenu((v) => !v)} title={en ? "Group info" : "群信息"}>
            <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
          {showMenu && (
            <>
              <div className="tc-menu-mask" onClick={() => setShowMenu(false)} />
              <div className="tc-menu">
                <div className="tc-menu-sec">{en ? "Members" : "群成员"}</div>
                <div className="tc-menu-members">
                  {room.members.map((id) => {
                    const e = empOf(id);
                    return (
                      <span className="tc-menu-mem" key={id}>
                        <span className="tc-menu-mem-av"><EmployeeAvatar icon={e?.icon} avatarData={e?.avatarData} name={e?.name || id} /></span>
                        <span className="tc-menu-mem-nm">{nameOf(id)}</span>
                        {room.coordinator === id && <span className="tc-menu-host">{en ? "host" : "主持"}</span>}
                      </span>
                    );
                  })}
                </div>
                <button
                  className="tc-menu-del"
                  onClick={async () => {
                    setShowMenu(false);
                    if (!confirm(en ? `Delete group "${room.name}"?` : `删除群「${room.name}」？聊天记录也会一并删除。`)) return;
                    const r = await api.roomDelete(room.id);
                    setRooms(r?.rooms || []);
                    setCur(null);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                  {en ? "Delete group" : "删除群"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

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
                {!mine && <span className="tc-msg-who">{m.speaker.name}</span>}
                <span className="tc-bubble">{m.text}</span>
              </span>
            </div>
          );
        })}
        {/* 员工干活进度：思考+工具，可展开看详细。只显示不进群消息流，跑完自动消失。 */}
        {Object.keys(progress).length > 0 && (
          <div className="tc-prog">
            <button className="tc-prog-bar" onClick={() => setExpanded((v) => !v)}>
              <span className="tc-chat-typing"><span /><span /><span /></span>
              <span className="tc-prog-who">
                {Object.values(progress).map((p) => p.name).join("、")} {en ? "working…" : "正在干活…"}
              </span>
              <svg className={"tc-prog-caret" + (expanded ? " up" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {expanded && (
              <div className="tc-prog-detail">
                {Object.entries(progress).map(([id, p]) => (
                  <div className="tc-prog-emp" key={id}>
                    <div className="tc-prog-name">{p.name}</div>
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
        )}
        {hint && <div className="tc-chat-hint">{hint}</div>}
        <div ref={endRef} />
      </div>

      {/* 输入框：抄主对话框风格——整体一个大圆角框，发送/停止按钮内嵌右下，对齐 */}
      <div className="tc-composer">
        {/* @ 补全：输入 @ 弹出成员 + 所有人，点选插入 */}
        {mention !== null && (() => {
          const all = en ? "Everyone" : "所有人";
          const names = [all, ...room.members.map((id) => nameOf(id))];
          const q = mention.toLowerCase();
          const cands = names.filter((n) => !q || n.toLowerCase().includes(q));
          if (cands.length === 0) return null;
          const pick = (name: string) => {
            const inserted = name === all ? (en ? "all" : "所有人") : name;
            setText((t) => t.replace(/@[^\s@]*$/, `@${inserted} `));
            setMention(null);
          };
          return (
            <div className="tc-mention">
              {cands.map((n) => (
                <button key={n} className={"tc-mention-item" + (n === all ? " all" : "")} onMouseDown={(e) => { e.preventDefault(); pick(n); }}>
                  {n === all ? <span className="tc-mention-all">@</span> : <span className="tc-mention-dot" />}
                  {n}
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
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mention !== null) { setMention(null); return; }
            if (e.key === "Enter" && !e.shiftKey && mention === null) { e.preventDefault(); send(); }
          }}
        />
        {running ? (
          <button className="send-btn stop" onClick={() => void api.roomAbort(room.id)} title={en ? "Stop" : "停止"}>
            <span className="stop-sq" />
          </button>
        ) : (
          <button className={"send-btn" + (text.trim() ? " active" : "")} disabled={!text.trim()} onClick={send} title={en ? "Send" : "发送"}>
            ↵
          </button>
        )}
      </div>
    </div>
  );
}
