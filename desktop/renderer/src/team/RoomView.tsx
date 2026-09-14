// 房间 · 多员工协作界面
//
// 与普通聊天最大的不同：每条消息都要显示"谁说的"。人类靠右、员工靠左带姓名徽标，
// 这样一眼能看出这是一屋子人在说话，而不是单线对话。

import { useEffect, useRef, useState } from "react";
import type { Employee, Room, RoomMessage } from "../../../../src/team/types.js";

type Props = { en: boolean; employees: Employee[]; onBack: () => void };

export function RoomView({ en, employees, onBack }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMembers, setNewMembers] = useState<Set<string>>(new Set());
  const [newCoord, setNewCoord] = useState<string>("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const api = (window as any).wuwei?.team;

  const room = rooms.find((r) => r.id === cur) || null;
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name || id;

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

  const send = () => {
    const t = text.trim();
    if (!t || !cur || running) return;
    setText("");
    setHint("");
    void api.roomSend(cur, t);
  };

  // ── 建房间 ──
  if (creating) {
    return (
      <div className="room-wrap">
        <div className="room-head">
          <span className="room-title">{en ? "New room" : "新建房间"}</span>
          <button className="mcp-btn" onClick={() => setCreating(false)}>
            {en ? "Cancel" : "取消"}
          </button>
        </div>
        <div className="room-form">
          <label className="room-field">
            <span>{en ? "Room name" : "房间名"}</span>
            <input
              className="mcp-search"
              style={{ margin: 0 }}
              value={newName}
              placeholder={en ? "e.g. Landing page revamp" : "例如：落地页改版"}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <div className="room-field">
            <span>{en ? "Members" : "成员"}</span>
            <div className="team-emp-grid">
              {employees.map((e) => {
                const on = newMembers.has(e.id);
                return (
                  <label className="team-emp" key={e.id} style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={on}
                      style={{ marginTop: "5px", flex: "0 0 auto" }}
                      onChange={() => {
                        const n = new Set(newMembers);
                        if (on) {
                          n.delete(e.id);
                          if (newCoord === e.id) setNewCoord("");
                        } else n.add(e.id);
                        setNewMembers(n);
                      }}
                    />
                    <span className="team-emp-main">
                      <span className="team-emp-name">
                        {e.name}
                        {e.title && <span className="team-emp-title">{e.title}</span>}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {employees.length === 0 && (
              <div className="mcp-empty">
                {en ? "No teammates yet — install an app first." : "还没有员工，先去应用中心装一个。"}
              </div>
            )}
          </div>
          <label className="room-field">
            <span>{en ? "Coordinator (answers without being @-ed)" : "常驻协调者（不用 @ 也会应答）"}</span>
            <select className="room-select" value={newCoord} onChange={(e) => setNewCoord(e.target.value)}>
              <option value="">{en ? "None — everyone must be @-ed" : "不设（所有人都要被 @ 才说话）"}</option>
              {[...newMembers].map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </select>
            <span className="room-hint">
              {en
                ? "Without a coordinator, messages that @ nobody are just recorded as context — nobody runs. That's the biggest cost saver."
                : "不设协调者时，没 @ 人的消息只记进上下文、不唤醒任何人——这是最省钱的一档。"}
            </span>
          </label>
          <button
            className="mcp-btn save"
            disabled={!newName.trim() || newMembers.size === 0}
            onClick={async () => {
              const r = await api.roomCreate(newName.trim(), [...newMembers], newCoord || undefined);
              setRooms(r?.rooms || []);
              setCur(r?.room?.id || null);
              setCreating(false);
              setNewName("");
              setNewMembers(new Set());
              setNewCoord("");
            }}
          >
            {en ? "Create" : "创建"}
          </button>
        </div>
      </div>
    );
  }

  // ── 房间列表 ──
  if (!room) {
    return (
      <div className="room-wrap">
        <div className="room-head">
          <span className="room-title">{en ? "Rooms" : "房间"}</span>
          <button className="mcp-btn save" onClick={() => setCreating(true)}>
            {en ? "New room" : "新建房间"}
          </button>
          <button className="mcp-btn" onClick={onBack}>
            {en ? "Back" : "返回"}
          </button>
        </div>
        <div className="mcp-scroll">
          {rooms.length === 0 && (
            <div className="mcp-empty">
              {en
                ? "No rooms yet. Create one and pull a few teammates in."
                : "还没有房间。建一个，把几名员工拉进去一起干活。"}
            </div>
          )}
          {rooms.map((r) => (
            <button className="mcp-card room-card" key={r.id} onClick={() => setCur(r.id)}>
              <div className="mcp-card-head">
                <span className="mcp-name">{r.name}</span>
                <span className="mcp-count">
                  {r.members.length} {en ? "members" : "人"}
                  {r.coordinator ? ` · ${nameOf(r.coordinator)}${en ? " coordinates" : " 主持"}` : ""}
                </span>
              </div>
              {r.lastText && <div className="team-desc">{r.lastText}</div>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 房间内 ──
  return (
    <div className="room-wrap">
      <div className="room-head">
        <button className="mcp-btn" onClick={() => setCur(null)}>
          {en ? "← Rooms" : "← 房间"}
        </button>
        <span className="room-title">{room.name}</span>
        <span className="room-members">
          {room.members.map((id) => (
            <span className="team-chip" key={id}>
              {nameOf(id)}
              {room.coordinator === id && <b className="room-coord">{en ? "host" : "主持"}</b>}
            </span>
          ))}
        </span>
        <button
          className="mcp-btn del"
          onClick={async () => {
            if (!confirm(en ? `Delete room "${room.name}"?` : `删除房间「${room.name}」？聊天记录也会一并删除。`)) return;
            const r = await api.roomDelete(room.id);
            setRooms(r?.rooms || []);
            setCur(null);
          }}
        >
          {en ? "Delete" : "删除"}
        </button>
      </div>

      <div className="room-flow">
        {msgs.length === 0 && (
          <div className="mcp-empty">
            {en
              ? `Say something. @ someone to call them; ${room.coordinator ? `${nameOf(room.coordinator)} answers even without @.` : "nobody answers unless @-ed."}`
              : `说点什么吧。@ 某人可以点名叫他；${room.coordinator ? `${nameOf(room.coordinator)} 不用 @ 也会应答。` : "没设协调者，所以要 @ 了才有人应答。"}`}
          </div>
        )}
        {msgs.map((m) => (
          <div className={"room-msg " + (m.speaker.kind === "human" ? "mine" : "") + (m.error ? " err" : "")} key={m.id}>
            {m.speaker.kind === "agent" && <span className="room-who">{m.speaker.name}</span>}
            <div className="room-bubble">{m.text}</div>
          </div>
        ))}
        {running && <div className="room-typing">{en ? "Teammates are working…" : "员工正在干活…"}</div>}
        {hint && <div className="room-hintbar">{hint}</div>}
        <div ref={endRef} />
      </div>

      <div className="room-input">
        <textarea
          value={text}
          rows={2}
          placeholder={en ? "Message the room…  @name to call someone" : "在房间里说话…  用 @姓名 点名"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {running ? (
          <button className="mcp-btn del" onClick={() => void api.roomAbort(room.id)}>
            {en ? "Stop" : "停止"}
          </button>
        ) : (
          <button className="mcp-btn save" disabled={!text.trim()} onClick={send}>
            {en ? "Send" : "发送"}
          </button>
        )}
      </div>
    </div>
  );
}
