import { tr } from "../../../../src/localization/index.js";
// 数字婴儿 · 状态卡
// 它此刻的样子(形象随活动状态变) + 生命体征(精力/开心/年龄/心跳/概念/好奇) + 唯一主操作。
// 数据全部来自后端 /alive/status，不再解析纯文本。
import React from "react";
import { BabyAvatar, inferBabyState, stripActivityEmoji, STATE_LABEL } from "./BabyAvatar.js";
import * as Ic from "./icons.js";

type Vitals = {
  alive?: boolean;
  age?: string;
  ticks?: number;
  energy?: number;
  mood?: string;
  happiness?: number;
  concepts?: number;
  curiosity?: number;
  activity?: string;
  wakeups?: number;
  recent?: string[];
};

export function BabyHero({
  vitals,
  alive,
  activity,
  busy,
  onToggleAlive,
}: {
  vitals: Vitals;
  alive: boolean;
  activity: string;
  busy: string;
  onToggleAlive: () => void;
}) {
  const state = inferBabyState(activity, alive);
  const ActIcon = Ic.ACTIVITY_ICON[state] || Ic.IcSparkle;
  const energy = Math.round(vitals.energy ?? 0);
  const happy = Math.round(vitals.happiness ?? 0);
  const said = stripActivityEmoji(activity) || STATE_LABEL[state];

  return (
    <div className={`by-s-${state}`}>
      <div className="by-hero">
        <div className="by-hero-art">
          <BabyAvatar
            state={state}
            happiness={vitals.happiness ?? 55}
            energy={vitals.energy ?? 100}
            alive={alive}
            size={104}
          />
        </div>
        <div className="by-hero-info">
          <div className="by-name">
            {tr("ui.babyhero.message.7085f6de54")}<span className={"by-badge" + (alive ? " live" : "")}>{alive ? tr("ui.app.message.8dd0b7c7d2") : tr("ui.app.message.fbf16a8272")}</span>
            {vitals.mood && <span className="by-badge">{vitals.mood}</span>}
          </div>
          <div className="by-act">
            <span className="by-act-ico">
              <ActIcon size={15} />
            </span>
            <span className="by-act-txt">{said}</span>
          </div>
          <div className="by-sub">
            {vitals.age || "—"} {tr("ui.babyhero.message.e79b02816d")}{vitals.ticks ?? 0} {tr("ui.babyhero.message.c42da19ce7")}</div>
        </div>
      </div>

      <div className="by-bars">
        <div className="by-bar-row">
          <span className="by-bar-ico" style={{ color: "var(--warn)" }}>
            <Ic.IcBolt size={13} />
          </span>
          <span className="by-bar-lab">{tr("ui.babyhero.message.71c5a81c3e")}</span>
          <span className="by-bar energy">
            <span style={{ width: `${Math.max(0, Math.min(100, energy))}%` }} />
          </span>
          <span className="by-bar-num">{energy}</span>
        </div>
        <div className="by-bar-row">
          <span className="by-bar-ico" style={{ color: "var(--spark)" }}>
            <Ic.IcHeart size={13} />
          </span>
          <span className="by-bar-lab">{tr("ui.babyhero.message.6a07375d2f")}</span>
          <span className="by-bar happy">
            <span style={{ width: `${Math.max(0, Math.min(100, happy))}%` }} />
          </span>
          <span className="by-bar-num">{happy}</span>
        </div>
      </div>

      <div className="by-stats">
        <Stat icon={<Ic.IcNodes size={14} />} v={vitals.concepts ?? 0} k={tr("ui.babyhero.message.ce79e9a7af")} />
        <Stat icon={<Ic.IcSprout size={14} />} v={vitals.curiosity ?? 0} k={tr("ui.babyhero.message.f6d387ffd4")} />
        <Stat icon={<Ic.IcClock size={14} />} v={vitals.ticks ?? 0} k={tr("ui.babyhero.message.26fdf02c9b")} />
        <Stat icon={<Ic.IcSunrise size={14} />} v={vitals.wakeups ?? 0} k={tr("ui.babyhero.message.93d61b47d6")} />
      </div>

      {!!(vitals.recent && vitals.recent.length) && (
        <div className="by-recent">
          {vitals.recent.slice(-5).map((c) => (
            <span className="by-chip" key={c} title={c}>
              {c}
            </span>
          ))}
        </div>
      )}

      <button className={"by-primary" + (alive ? " on" : "")} onClick={onToggleAlive}>
        {alive ? <Ic.IcPause size={15} /> : <Ic.IcInfinity size={16} />}
        {alive ? tr("ui.babyhero.message.add3b194c3") : tr("ui.babyhero.message.4360c3d919")}
      </button>
      {!!busy && (
        <div className="by-busy">
          <span className="by-spin">
            <Ic.IcRefresh size={13} />
          </span>
          {busy}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, v, k }: { icon: React.ReactNode; v: number | string; k: string }) {
  return (
    <div className="by-stat">
      <span className="by-stat-ico">{icon}</span>
      <span>
        <span className="by-stat-v">{v}</span>
        <br />
        <span className="by-stat-k">{k}</span>
      </span>
    </div>
  );
}
