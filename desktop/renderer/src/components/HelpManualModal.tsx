import { tr, getCurrentLanguage } from "../../../../src/localization/index.js";
import React, { useState } from "react";
import type { Lang } from "../i18n.js";
import { GuideScreenshot } from "./GuideScreenshot.js";
import companyZh from "../assets/guide/company-zh.png";
import companyEn from "../assets/guide/company-en.png";
import teamZh from "../assets/guide/team-pack-zh.png";
import teamEn from "../assets/guide/team-pack-en.png";
import platformZh from "../assets/guide/platform-menu-zh.png";
import platformEn from "../assets/guide/platform-menu-en.png";
import imageModelsZh from "../assets/guide/image-models-zh.png";
import imageModelsEn from "../assets/guide/image-models-en.png";

/**
 * 使用手册 / User Guide —— 账号菜单入口打开的大弹窗。
 * 左侧模块导航 + 右侧图文讲解，中英双语（英文为主）。
 * 内容全部基于客户端真实功能（右键菜单/总目标/脑网络/数字婴儿/会员…），不虚构。
 * 插图用内联简约 SVG（线性 · currentColor · 无为 VI），无外部资源；
 * 需要真实截图处用 <figure class="guide-shot"> 占位，后续可直接替换成 <img>。
 */

type Props = { lang: Lang; onClose: () => void };

// 双语小工具：英文为主。


// —— 章节图标（统一 18px 线性 currentColor）——
const IconStart = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" /></svg>
);
const IconModes = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="8" r="2.5" /><path d="M11 8h9" /><circle cx="17" cy="16" r="2.5" /><path d="M13 16H4" /></svg>
);
const IconSessions = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 9h17M8 13h8M8 16h5" /></svg>
);
const IconGoal = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
);
const IconBrain = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.4A3 3 0 0 0 7 18.5a2.5 2.5 0 0 0 2.5 1V4.5z" /><path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.4A3 3 0 0 1 17 18.5a2.5 2.5 0 0 1-2.5 1V4.5z" /></svg>
);
const IconPalace = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M4 21V9.5l8-5 8 5V21" /><path d="M9 21v-6h6v6M9.5 11.5h.01M14.5 11.5h.01" /></svg>
);
const IconCoins = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></svg>
);
const IconHelp = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-11.7 7.9L4 20l1.4-4A8.5 8.5 0 1 1 21 11.5z" /><path d="M12 8.5v.01M12 11v3.5" /></svg>
);
const IconSettings = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.2-1.3L14 2h-4l-.3 2.1a7 7 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.3l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.2 1.3L10 22h4l.3-2.1a7 7 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12z" /></svg>
);

// —— 内容小组件 ——
function Tip({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "pro" }) {
  return <div className={"guide-tip guide-tip--" + tone}>{children}</div>;
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="guide-kbd">{children}</kbd>;
}
// 简约「截图/示意」框：内含内联 SVG 演示，需要时可整块换成 <img src=…>
function Shot({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="guide-shot">
      <div className="guide-shot__frame">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
function FeatRow({ badge, title, desc }: { badge: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="guide-feat">
      <div className="guide-feat__badge">{badge}</div>
      <div className="guide-feat__body">
        <div className="guide-feat__title">{title}</div>
        <div className="guide-feat__desc">{desc}</div>
      </div>
    </div>
  );
}

export function HelpManualModal({ lang, onClose }: Props) {

  const [active, setActive] = useState("start");

  const sections: { id: string; icon: React.ReactNode; label: string; body: React.ReactNode }[] = [
    {
      id: "start",
      icon: IconStart,
      label: tr("ui.helpmanualmodal.getting.started.debb2ba"),
      body: (
        <>
          <p className="guide-lead">
            {tr("ui.helpmanualmodal.wuwei.is.an.ai.agent.that.a051b0b")}
          </p>
          <h4>{tr("ui.helpmanualmodal.first.steps.6c3baff")}</h4>
          <FeatRow badge={<span className="guide-num">1</span>} title={tr("login.signin")} desc={tr("ui.helpmanualmodal.click.your.avatar.at.the.bottom.885baf6")} />
          <FeatRow badge={<span className="guide-num">2</span>} title={tr("ui.helpmanualmodal.pick.model.f0a0929")} desc={tr("ui.helpmanualmodal.use.the.model.picker.in.the.ba3dcf6")} />
          <FeatRow badge={<span className="guide-num">3</span>} title={tr("ui.helpmanualmodal.describe.the.task.330849f")} desc={tr("ui.helpmanualmodal.type.what.you.want.plain.language.e6c45c6")} />
          <Tip>
            {tr("ui.helpmanualmodal.not.sure.what.to.ask.try.8017f59")}
          </Tip>
        </>
      ),
    },
    {
      id: "company",
      icon: <IconGroup />,
      label: tr("ui.app.my.company.05b42c6"),
      body: (
        <>
          <p className="guide-lead">{tr("ui.helpmanualmodal.build.team.of.ai.teammates.with.a340ee0")}</p>
          <GuideScreenshot src={lang !== "zh" ? companyEn : companyZh} lang={lang} alt={tr("ui.helpmanualmodal.company.sidebar.add.teammate.button.teammate.dc0bf8d")} caption={tr("ui.helpmanualmodal.open.my.company.add.teammate.click.5755824")} marks={[{n:1,x:3,y:4},{n:2,x:90,y:18},{n:3,x:23,y:47}]} />
          <h4>{tr("ui.helpmanualmodal.install.your.team.4850c12")}</h4>
          <GuideScreenshot src={lang !== "zh" ? teamEn : teamZh} lang={lang} alt={tr("ui.helpmanualmodal.add.teammates.dialog.six.person.team.cdf9758")} caption={tr("ui.helpmanualmodal.team.pack.after.installation.disable.uninstall.5b1a6bf")} />
          <FeatRow badge={<span className="guide-num">1</span>} title={tr("ui.helpmanualmodal.open.my.company.4a1620b")} desc={tr("ui.helpmanualmodal.new.users.have.my.company.enabled.7b90548")} />
          <FeatRow badge={<span className="guide-num">2</span>} title={tr("ui.helpmanualmodal.choose.team.pack.caf61fc")} desc={tr("ui.helpmanualmodal.no.teammates.are.installed.automatically.on.60279dc")} />
          <FeatRow badge={<span className="guide-num">3</span>} title={tr("ui.helpmanualmodal.start.working.85c2c51")} desc={tr("ui.helpmanualmodal.the.default.team.includes.six.teammates.ed1fda8")} />
          <h4>{tr("ui.helpmanualmodal.manage.teammates.and.departments.9d86574")}</h4>
          <FeatRow badge={<IconGroup />} title={tr("ui.helpmanualmodal.ask.ai.to.manage.teammates.8e69ab1")} desc={tr("ui.helpmanualmodal.in.chat.describe.the.teammate.name.7fa16ff")} />
          <FeatRow badge={<IconSettings2 />} title={tr("ui.helpmanualmodal.organize.departments.96d2e9e")} desc={tr("ui.helpmanualmodal.ask.ai.create.marketing.department.make.49373c6")} />
          <h4>{tr("ui.helpmanualmodal.create.groups.and.collaborate.ad7c34a")}</h4>
          <FeatRow badge={<IconGroup />} title={tr("ui.helpmanualmodal.bring.the.right.people.together.0269a80")} desc={tr("ui.helpmanualmodal.open.my.company.groups.new.group.9b17973")} />
          <Tip>{tr("ui.helpmanualmodal.give.the.team.concrete.goal.and.17b8535")}</Tip>
        </>
      ),
    },
    {
      id: "images",
      icon: IconStart,
      label: tr("ui.helpmanualmodal.image.generation.060603e"),
      body: (
        <>
          <p className="guide-lead">{tr("ui.helpmanualmodal.generate.images.in.the.conversation.with.166f645")}</p>
          <GuideScreenshot src={lang !== "zh" ? platformEn : platformZh} lang={lang} alt={tr("ui.helpmanualmodal.platform.menu.showing.wuwei.hosted.image.ad07963")} caption={tr("ui.helpmanualmodal.open.the.platform.switcher.below.the.2799e45")} />
          <GuideScreenshot src={lang !== "zh" ? imageModelsEn : imageModelsZh} lang={lang} alt={tr("ui.helpmanualmodal.image.model.menu.showing.gpt.image.fc18c44")} caption={tr("ui.helpmanualmodal.choose.an.image.model.from.the.5e3d12f")} />

          <FeatRow badge={<span className="guide-num">1</span>} title={tr("ui.helpmanualmodal.sign.in.and.choose.model.c254045")} desc={tr("ui.helpmanualmodal.click.the.platform.below.the.message.0d0a7d0")} />
          <FeatRow badge={<span className="guide-num">2</span>} title={tr("ui.helpmanualmodal.describe.your.image.26fb713")} desc={tr("ui.helpmanualmodal.describe.the.subject.setting.style.and.8f4bd58")} />
          <FeatRow badge={<span className="guide-num">3</span>} title={tr("ui.helpmanualmodal.confirm.the.cost.c33d3c3")} desc={tr("ui.helpmanualmodal.the.confirmation.dialog.shows.the.estimated.a6f9341")} />
          <FeatRow badge={<span className="guide-num">4</span>} title={tr("ui.helpmanualmodal.view.the.result.21459e9")} desc={tr("ui.helpmanualmodal.when.generation.finishes.the.image.appears.95db343")} />
          <Tip>{tr("ui.helpmanualmodal.if.the.result.is.unknown.or.42e386f")}</Tip>
        </>
      ),
    },
    {
      id: "modes",
      icon: IconModes,
      label: tr("ui.helpmanualmodal.run.modes.depth.a58654a"),
      body: (
        <>
          <p className="guide-lead">{tr("ui.helpmanualmodal.three.run.modes.decide.how.much.70d18c4")}</p>
          <FeatRow badge={<span className="guide-chip">{tr("mode.manual")}</span>} title={tr("ui.helpmanualmodal.approve.each.step.84ac07d")} desc={tr("ui.helpmanualmodal.it.asks.permission.before.every.tool.04cb61b")} />
          <FeatRow badge={<span className="guide-chip">{tr("mode.auto")}</span>} title={tr("ui.helpmanualmodal.auto.approve.e97abb3")} desc={tr("ui.helpmanualmodal.permissions.auto.granted.so.it.runs.1113375")} />
          <FeatRow badge={<span className="guide-chip guide-chip--on">{tr("ui.app.smart.continue.269f877")}</span>} title={tr("ui.helpmanualmodal.runs.then.keeps.going.413a34a")} desc={tr("ui.helpmanualmodal.auto.approves.and.after.finishing.round.4bd5bc1")} />
          <h4>{tr("ui.helpmanualmodal.thinking.depth.05161de")}</h4>
          <p>{tr("ui.helpmanualmodal.the.depth.picker.trades.speed.for.79104d5")}</p>
          <div className="guide-scale">
            <span>{tr("ui.helpmanualmodal.fast.d56d4ff")}</span>
            <span className="guide-scale__on">{tr("ui.helpmanualmodal.balanced.rec.7b14236")}</span>
            <span>{tr("ui.helpmanualmodal.deep.cb03d15")}</span>
            <span>{tr("ui.helpmanualmodal.deeper.96029be")}</span>
            <span>{tr("ui.helpmanualmodal.max.70a555c")}</span>
          </div>
          <Tip>{tr("ui.helpmanualmodal.keep.balanced.for.most.work.bump.74ab54b")}</Tip>
        </>
      ),
    },
    {
      id: "sessions",
      icon: IconSessions,
      label: tr("ui.helpmanualmodal.sessions.hidden.tricks.c673abb"),
      body: (
        <>
          <p className="guide-lead">{tr("ui.helpmanualmodal.the.real.power.is.in.the.62a5466")}</p>
          <figure className="guide-shot">
            <div className="gm-stage">
              <div className="gm-menu">
                <div className="gm-item"><IconHandoff /><span>{tr("ctx.handoff")}</span></div>
                <div className="gm-sep" />
                <div className="gm-item"><IconGoal2 /><span>{tr("ui.app.set.overall.goal.846f9cb")}</span></div>
                <div className="gm-item"><IconHist /><span>{tr("ui.app.view.full.history.17b4cd4")}</span></div>
                <div className="gm-sep" />
                <div className="gm-item gm-done"><IconCheck /><span>{tr("ctx.markDone")}</span></div>
                <div className="gm-item"><IconDiscuss /><span>{tr("ctx.markDiscuss")}</span></div>
                <div className="gm-sep" />
                <div className="gm-head">{tr("ctx.moveToGroup")}</div>
                <div className="gm-item"><IconPlusSm /><span>{tr("ctx.newGroup")}</span></div>
                <div className="gm-sep" />
                <div className="gm-head">{tr("ctx.priority")}</div>
                <div className="gm-chips">
                  <span className="gm-chip gm-chip--on">{tr("ctx.prioNone")}</span>
                  <span className="gm-chip">{tr("ui.helpmanualmodal.high.29b7559")}</span>
                  <span className="gm-chip">{tr("ui.helpmanualmodal.medium.c3c3788")}</span>
                  <span className="gm-chip">{tr("ui.helpmanualmodal.low.1638d14")}</span>
                </div>
                <div className="gm-head">{tr("ctx.quadrant")}</div>
                <div className="gm-quad">
                  <span className="gm-qb">{tr("ui.helpmanualmodal.urgent.important.eab7d5f")}</span>
                  <span className="gm-qb">{tr("ui.helpmanualmodal.important.not.urgent.7c78c1e")}</span>
                  <span className="gm-qb">{tr("ui.helpmanualmodal.urgent.not.important.003cf85")}</span>
                  <span className="gm-qb">{tr("ui.helpmanualmodal.neither.ea42932")}</span>
                </div>
              </div>
            </div>
            <figcaption>{tr("ui.helpmanualmodal.the.actual.right.click.menu.reproduced.bfe67ee")}</figcaption>
          </figure>
          <FeatRow badge={<IconGoal2 />} title={tr("ui.helpmanualmodal.summarize.hand.off.to.new.chat.579e94a")} desc={tr("ui.helpmanualmodal.distills.what.matters.from.long.messy.7cce538")} />
          <FeatRow badge={<IconGoal2 />} title={tr("ui.helpmanualmodal.set.overall.goal.8da8d13")} desc={tr("ui.helpmanualmodal.give.the.chat.one.big.goal.4399035")} />
          <FeatRow badge={<IconHist />} title={tr("ui.helpmanualmodal.view.full.history.e5cf91c")} desc={tr("ui.helpmanualmodal.see.the.original.exchanges.from.before.369a84a")} />
          <FeatRow badge={<IconCheck />} title={tr("ui.helpmanualmodal.mark.done.for.discussion.db10247")} desc={tr("ui.helpmanualmodal.flag.conversation.as.finished.or.as.2bf3d63")} />
          <FeatRow badge={<IconPrio />} title={tr("ui.helpmanualmodal.priority.eisenhower.quadrants.81301d7")} desc={tr("ui.helpmanualmodal.tag.high.medium.low.or.use.3e6d813")} />
          <FeatRow badge={<IconGroup />} title={tr("ui.helpmanualmodal.groups.86fbe0c")} desc={tr("ui.helpmanualmodal.move.conversations.into.custom.groups.or.a9a6ab9")} />
          <Tip>
            {tr("ui.helpmanualmodal.search.everything.with.33130b1")}<Kbd>{tr("ui.helpmanualmodal.ctrl.618e43f")}</Kbd>{tr("ui.helpmanualmodal.it.searches.inside.all.conversation.content.bf5d076")}
          </Tip>
        </>
      ),
    },
    {
      id: "goals",
      icon: IconGoal,
      label: tr("ui.helpmanualmodal.goals.autonomy.ff607ab"),
      body: (
        <>
          <p className="guide-lead">{tr("ui.helpmanualmodal.this.is.what.makes.wuwei.an.d03a2fd")}</p>
          <div className="guide-flow">
            <div className="guide-flow__step"><span>1</span>{tr("ui.helpmanualmodal.right.click.chat.set.overall.goal.b8c6a4c")}</div>
            <div className="guide-flow__arrow">→</div>
            <div className="guide-flow__step"><span>2</span>{tr("ui.helpmanualmodal.turn.on.smart.continue.bd3913b")}</div>
            <div className="guide-flow__arrow">→</div>
            <div className="guide-flow__step"><span>3</span>{tr("ui.helpmanualmodal.it.self.decomposes.runs.to.completion.1aaab75")}</div>
          </div>
          <p>{tr("ui.helpmanualmodal.under.the.hood.it.plans.the.f27a5aa")}</p>
          <Tip>{tr("ui.helpmanualmodal.when.long.run.has.bloated.the.f08ab83")}</Tip>
        </>
      ),
    },
    {
      id: "brain",
      icon: IconBrain,
      label: tr("ui.helpmanualmodal.brain.network.dcc051f"),
      body: (
        <>
          <div className="guide-protag">Pro</div>
          <p className="guide-lead">{tr("ui.helpmanualmodal.the.brain.network.is.wuwei.long.f1763d8")}</p>
          <Shot caption={tr("ui.helpmanualmodal.two.views.the.concept.graph.and.259e1d0")}>
            <svg viewBox="0 0 320 150" width="100%" fill="none" stroke="currentColor">
              <g strokeWidth="1.3" opacity="0.7">
                <circle cx="70" cy="75" r="10" /><circle cx="40" cy="40" r="6" /><circle cx="42" cy="112" r="7" /><circle cx="105" cy="48" r="6" /><circle cx="110" cy="108" r="7" />
                <path d="M70 75l-27-33M70 75l-26 35M70 75l33-25M70 75l38 31" strokeOpacity="0.5" />
              </g>
              <g strokeWidth="1.3" opacity="0.85" transform="translate(190 20)">
                <path d="M60 0l55 95H5z" strokeOpacity="0.5" />
                <path d="M22 60h76M38 90h44" strokeOpacity="0.5" />
                <circle cx="60" cy="26" r="3" fill="currentColor" />
              </g>
            </svg>
          </Shot>
          <FeatRow badge={<IconBrain2 />} title={tr("ui.helpmanualmodal.learns.continuously.235af69")} desc={tr("ui.helpmanualmodal.turns.meaningful.moments.in.conversation.into.4cfbc2b")} />
          <FeatRow badge={<IconBrain2 />} title={tr("ui.helpmanualmodal.recalls.across.chats.b99a5d3")} desc={tr("ui.helpmanualmodal.next.time.it.pulls.in.your.cfe2980")} />
          <FeatRow badge={<IconBrain2 />} title={tr("ui.helpmanualmodal.gets.richer.with.use.ff687a3")} desc={tr("ui.helpmanualmodal.memory.isn.capped.by.single.conversation.3cabd10")} />
          <Tip tone="pro">{tr("ui.helpmanualmodal.brain.network.is.pro.feature.open.429f9a6")}</Tip>
        </>
      ),
    },
    {
      id: "palace",
      icon: IconPalace,
      label: tr("ui.helpmanualmodal.knowledge.palace.cefdce2"),
      body: (
        <>
          <div className="guide-protag">Pro</div>
          <p className="guide-lead">{tr("ui.helpmanualmodal.point.wuwei.at.folder.of.your.b9e50ae")}</p>
          <h4>{tr("ui.helpmanualmodal.set.it.up.5f8b381")}</h4>
          <div className="guide-flow">
            <div className="guide-flow__step"><span>1</span>{tr("ui.helpmanualmodal.settings.brain.network.document.library.dadbbfd")}</div>
            <div className="guide-flow__arrow">→</div>
            <div className="guide-flow__step"><span>2</span>{tr("ui.helpmanualmodal.browse.to.your.folder.click.build.866ec6f")}</div>
            <div className="guide-flow__arrow">→</div>
            <div className="guide-flow__step"><span>3</span>{tr("ui.helpmanualmodal.rebuild.whenever.the.docs.change.138a9c3")}</div>
          </div>
          <FeatRow badge={<IconPalace2 />} title={tr("ui.helpmanualmodal.indexing.scan.vectorize.271c65f")} desc={tr("ui.helpmanualmodal.it.scans.every.document.and.builds.ad2e0d2")} />
          <FeatRow badge={<IconPalace2 />} title={tr("ui.helpmanualmodal.concept.extraction.optional.d622644")} desc={tr("ui.helpmanualmodal.pull.concepts.and.relations.out.of.1c45441")} />
          <FeatRow badge={<IconPalace2 />} title={tr("set.brain.scanDocsTitle")} desc={tr("ui.helpmanualmodal.keep.this.sub.toggle.on.when.f4bd455")} />
          <Tip tone="pro">{tr("ui.helpmanualmodal.at.work.time.it.stays.lean.da2d17c")}</Tip>
        </>
      ),
    },
    {
      id: "coins",
      icon: IconCoins,
      label: tr("ui.helpmanualmodal.coins.membership.6d03059"),
      body: (
        <>
          <p className="guide-lead">{tr("ui.helpmanualmodal.hosted.models.run.on.coins.you.7c376ef")}</p>
          <FeatRow badge={<IconCheck />} title={tr("ui.helpmanualmodal.daily.check.in.8f1db86")} desc={tr("ui.helpmanualmodal.open.the.account.panel.and.check.59a3a1a")} />
          <div className="guide-plans">
            <div className="guide-plan"><b>Pro</b><span>¥29 · $6.99/mo</span><em>{tr("ui.helpmanualmodal.monthly.quota.day.check.in.d96f21e")}</em></div>
            <div className="guide-plan guide-plan--rec"><b>Plus</b><span>¥99 · $19.99/mo</span><em>{tr("ui.helpmanualmodal.quota.day.2649c39")}</em></div>
            <div className="guide-plan"><b>{tr("ui.helpmanualmodal.max.70a555c")}</b><span>¥899 · $199/mo</span><em>{tr("ui.helpmanualmodal.quota.day.8837799")}</em></div>
          </div>
          <Tip>{tr("ui.helpmanualmodal.membership.also.unlocks.the.brain.network.edc977f")}</Tip>
        </>
      ),
    },
    {
      id: "help",
      icon: IconHelp,
      label: tr("ui.helpmanualmodal.messages.support.feedback.f0ee650"),
      body: (
        <>
          <p className="guide-lead">{tr("ui.helpmanualmodal.everything.lives.in.the.account.menu.3ccb862")}</p>
          <FeatRow badge={<IconBell />} title={tr("ui.app.message.center.914789a")} desc={tr("ui.helpmanualmodal.rewards.activities.system.notices.and.replies.805ac45")} />
          <FeatRow badge={<IconHelp2 />} title={tr("pay.support.title")} desc={tr("ui.helpmanualmodal.opens.live.chat.window.send.and.51416b0")} />
          <FeatRow badge={<IconChat />} title={tr("ui.helpmanualmodal.feedback.for.rewards.7926022")} desc={tr("ui.helpmanualmodal.leave.suggestion.or.bug.report.if.e35679a")} />
          <Tip>{tr("ui.helpmanualmodal.adopted.feedback.really.does.get.rewarded.3fc592b")}</Tip>
        </>
      ),
    },
    {
      id: "settings",
      icon: IconSettings,
      label: tr("ui.helpmanualmodal.settings.walkthrough.c994daf"),
      body: (
        <>
          <p className="guide-lead">{tr("ui.helpmanualmodal.open.settings.from.the.account.menu.5d65172")}</p>

          <h4>{tr("set.tab.general")}</h4>
          <FeatRow badge={<IconSettings2 />} title={tr("acct.language")} desc={tr("ui.helpmanualmodal.switch.the.whole.app.between.english.48e02ab")} />
          <FeatRow badge={<IconSettings2 />} title={tr("set.g.grouping")} desc={tr("ui.helpmanualmodal.manual.drag.right.click.into.groups.d64e347")} />
          <FeatRow badge={<IconSettings2 />} title={tr("set.g.compaction")} desc={tr("ui.helpmanualmodal.when.chat.gets.long.older.messages.5e321f4")} />
          <FeatRow badge={<IconSettings2 />} title={tr("ui.helpmanualmodal.full.history.archive.b3bbaac")} desc={tr("ui.helpmanualmodal.pre.compaction.originals.are.archived.right.b354ad7")} />
          <FeatRow badge={<IconSettings2 />} title={tr("ui.helpmanualmodal.thinking.depth.picker.3adaaa3")} desc={tr("ui.helpmanualmodal.toggle.the.fast.balanced.deep.selector.945b44e")} />

          <h4>{tr("set.tab.display")}</h4>
          <FeatRow badge={<IconSettings2 />} title={tr("set.d.output")} desc={tr("ui.helpmanualmodal.choose.how.replies.appear.stream.shown.3ba9535")} />

          <h4>{tr("ui.helpmanualmodal.model.platforms.e473354")}</h4>
          <FeatRow badge={<IconSettings2 />} title={tr("set.m.model")} desc={tr("ui.helpmanualmodal.pick.the.active.provider.model.and.f4a668e")} />
          <FeatRow badge={<IconSettings2 />} title={tr("ui.helpmanualmodal.platform.management.e2c38bd")} desc={tr("ui.helpmanualmodal.reorder.edit.delete.or.hide.any.99c8853")} />

          <h4>{tr("ui.helpmanualmodal.personalization.9d1124b")}</h4>
          <FeatRow badge={<IconSettings2 />} title={tr("ui.helpmanualmodal.system.prompt.you.re.in.full.ba94e6b")} desc={tr("ui.helpmanualmodal.global.instruction.that.shapes.how.the.7147516")} />
          <FeatRow badge={<IconSettings2 />} title={tr("set.tab.memory")} desc={tr("ui.helpmanualmodal.facts.you.want.it.to.always.466aa54")} />
          <FeatRow badge={<IconSettings2 />} title={tr("ui.helpmanualmodal.brain.network.pro.c646a6b")} desc={tr("ui.helpmanualmodal.the.auto.learning.long.term.memory.f915691")} />

          <h4>{tr("ui.helpmanualmodal.power.tools.e2c2702")}</h4>
          <FeatRow badge={<IconSettings2 />} title={tr("set.tools.badgeMcp")} desc={tr("ui.helpmanualmodal.connect.mcp.servers.to.extend.what.cd8d8b8")} />
          <FeatRow badge={<IconSettings2 />} title={tr("set.tab.tools")} desc={tr("ui.helpmanualmodal.turn.built.in.tools.on.off.221bcb4")} />
          <FeatRow badge={<IconSettings2 />} title={tr("ui.helpmanualmodal.secrets.keys.691b847")} desc={tr("ui.helpmanualmodal.local.secret.manager.it.can.detect.ac4d70b")} />

          <Tip>{tr("ui.helpmanualmodal.on.claude.subscription.the.usable.context.ed2766d")}</Tip>
        </>
      ),
    },
  ];

  const cur = sections.find((s) => s.id === active) || sections[0];

  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        {/* 左：导航 */}
        <aside className="guide-nav">
          <div className="guide-nav__brand">
            <div className="guide-nav__brandttl">{tr("ui.app.user.guide.f2562f4")}</div>
            <div className="guide-nav__brandsub">{tr("ui.helpmanualmodal.master.wuwei.from.zero.cb74ee0")}</div>
          </div>
          <nav className="guide-nav__list">
            {sections.map((s) => (
              <button key={s.id} className={"guide-nav__it" + (s.id === active ? " on" : "")} onClick={() => setActive(s.id)}>
                <span className="guide-nav__ico">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
        </aside>
        {/* 右：内容 */}
        <section className="guide-body">
          <header className="guide-body__head">
            <span className="guide-body__ico">{cur.icon}</span>
            <h3>{cur.label}</h3>
            <button className="guide-x" onClick={onClose} aria-label={tr("msg.close")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>
          <div key={cur.id} className="guide-body__scroll">{cur.body}</div>
        </section>
      </div>
    </div>
  );
}

// —— 内容里复用的小图标（16px 线性）——
function IconGoal2() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /></svg>; }
function IconHandoff() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7l-4 4 4 4" /><path d="M5 11h9a5 5 0 0 1 5 5v1" /></svg>; }
function IconDiscuss() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" /></svg>; }
function IconPlusSm() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>; }
function IconHist() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v11.5a1.5 1.5 0 0 1-1.5 1.5H7a3 3 0 0 1-3-3V5.5z" /><path d="M8 8.5h8M8 12h8M8 15.5h5" /></svg>; }
function IconCheck() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5 11-11" /></svg>; }
function IconPrio() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4M5 4l11 3-4 4 4 4-11 3" /></svg>; }
function IconGroup() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h7l2 2h9v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" /></svg>; }
function IconBrain2() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.4" /><path d="M12 5v4M12 15v4M5 12h4M15 12h4M7 7l2.4 2.4M14.6 14.6L17 17M17 7l-2.4 2.4M9.4 14.6L7 17" /></svg>; }
function IconPalace2() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M4 21V9.5l8-5 8 5V21" /><path d="M9 21v-6h6v6" /></svg>; }
function IconBell() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>; }
function IconHelp2() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="13" width="4" height="6" rx="1.5" /><rect x="17" y="13" width="4" height="6" rx="1.5" /><path d="M20 19a4 4 0 0 1-4 4h-2" /></svg>; }
function IconChat() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-11.7 7.9L4 20l1.4-4A8.5 8.5 0 1 1 21 11.5z" /></svg>; }
function IconSettings2() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6 6l1.5 1.5M16.5 16.5L18 18M18 6l-1.5 1.5M7.5 16.5L6 18" /></svg>; }
