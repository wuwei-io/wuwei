import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAnnouncementBody, splitAnnouncementHeading } from "../desktop/renderer/src/components/announcementContent.js";

test("splits a version token from the announcement title", () => {
  assert.deepEqual(splitAnnouncementHeading("无为 v1.8.0 产品更新", "1.7.0"), {
    title: "无为 产品更新",
    version: "v1.8.0",
  });
  assert.deepEqual(splitAnnouncementHeading("产品更新", "1.8.1"), {
    title: "产品更新",
    version: "v1.8.1",
  });
});

test("parses blank-line sections with short first lines into feature cards", () => {
  assert.deepEqual(parseAnnouncementBody("一人公司\n让 AI 员工分工协作，任务进展更清晰。\n\n生图模型\n新增更快、更稳定的图片生成体验。"), {
    kind: "cards",
    cards: [
      { title: "一人公司", summary: "让 AI 员工分工协作，任务进展更清晰。", icon: "company" },
      { title: "生图模型", summary: "新增更快、更稳定的图片生成体验。", icon: "image" },
    ],
  });
});

test("keeps ordinary or ambiguous announcements as readable paragraphs", () => {
  assert.deepEqual(parseAnnouncementBody("今晚 22:00 至 23:00 进行例行维护。\n\n维护期间部分功能可能短暂不可用，请提前保存工作。"), {
    kind: "plain",
    paragraphs: ["今晚 22:00 至 23:00 进行例行维护。", "维护期间部分功能可能短暂不可用，请提前保存工作。"],
  });
  assert.deepEqual(parseAnnouncementBody("感谢你的支持。"), {
    kind: "plain",
    paragraphs: ["感谢你的支持。"],
  });
});
