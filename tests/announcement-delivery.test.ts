import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnnouncementDelivery, ANNOUNCEMENT_READ_KEY, type UnreadAnnouncement } from "../desktop/renderer/src/components/announcementDelivery.js";
import { fetchAnnouncement } from "../desktop/main/announcement.js";

const announcement: UnreadAnnouncement = { active: true, appVersion: "1.7.45", version: "notice-1", titleZh: "更新", bodyZh: "详情" };
function fixture(values = new Map<string, string>()) {
  let current: UnreadAnnouncement | null = null;
  let remote = { ...announcement };
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const delivery = createAnnouncementDelivery({ fetch: async () => remote, storage, show: a => { current = a; } });
  return { delivery, values, current: () => current, remote: (a: UnreadAnnouncement) => { remote = a; } };
}

test("first install shows; acknowledgement survives restart of same app and notice", async () => {
  const f = fixture();
  await f.delivery.check(true);
  assert.deepEqual(f.current(), announcement);
  f.delivery.acknowledge(announcement);
  assert.equal(f.current(), null);
  f.delivery.stop();
  const restarted = fixture(f.values);
  try { await restarted.delivery.check(true); assert.equal(restarted.current(), null); } finally { restarted.delivery.stop(); }
});

test("app upgrade alone or notice update alone prompts again", async () => {
  for (const update of [{ appVersion: "1.7.46" }, { version: "notice-2" }]) {
    const f = fixture();
    try {
      f.delivery.acknowledge(announcement);
      f.remote({ ...announcement, ...update });
      await f.delivery.check(true);
      assert.deepEqual(f.current(), { ...announcement, ...update });
    } finally { f.delivery.stop(); }
  }
});

test("temporary close suppresses this session only; update still prompts", async () => {
  const f = fixture();
  await f.delivery.check(true);
  f.delivery.dismiss(announcement);
  await f.delivery.check(true);
  assert.equal(f.current(), null);
  assert.equal(f.values.has(ANNOUNCEMENT_READ_KEY), false);
  f.remote({ ...announcement, version: "notice-2" });
  await f.delivery.check(true);
  assert.equal(f.current()?.version, "notice-2");
  f.delivery.stop();
  const restarted = fixture(f.values);
  try { await restarted.delivery.check(true); assert.deepEqual(restarted.current(), announcement); } finally { restarted.delivery.stop(); }
});

test("legacy receipt cannot suppress unread installed app version", async () => {
  const f = fixture(new Map([["wuwei_seen_announcement", announcement.version]]));
  try { await f.delivery.check(true); assert.deepEqual(f.current(), announcement); } finally { f.delivery.stop(); }
});

test("withdrawn notice closes and does not write read receipt", async () => {
  const f = fixture();
  try {
    await f.delivery.check(true);
    f.remote({ ...announcement, active: false });
    await f.delivery.check(true);
    assert.equal(f.current(), null);
    assert.equal(f.values.size, 0);
  } finally { f.delivery.stop(); }
});

test("startup outage retries automatically without restart", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let shown: unknown;
  const d = createAnnouncementDelivery({ fetch: async () => { if (++calls === 1) throw Error("offline"); return announcement; }, storage: { getItem: () => null, setItem: () => {} }, show: a => { shown = a; } });
  try {
    await d.check(true);
    assert.equal(shown, undefined);
    t.mock.timers.tick(15_000);
    await Promise.resolve();
    assert.deepEqual(shown, announcement);
    assert.equal(calls, 2);
  } finally { d.stop(); }
});

test("in-flight calls coalesce and stopped controller cannot open modal", async () => {
  let resolve!: (a: UnreadAnnouncement) => void;
  let calls = 0;
  let shown = false;
  const d = createAnnouncementDelivery({ fetch: () => { calls++; return new Promise(r => { resolve = r; }); }, storage: { getItem: () => null, setItem: () => {} }, show: () => { shown = true; } });
  const pending = d.check(true);
  await d.check(true);
  assert.equal(calls, 1);
  d.stop();
  resolve(announcement);
  await pending;
  assert.equal(shown, false);
});

test("transport uses a deadline and no cache; distinguishes outage and withdrawal", async () => {
  let init: RequestInit | undefined;
  const fetcher = (async (_url, options) => { init = options; return Response.json(announcement); }) as typeof fetch;
  const result = await fetchAnnouncement(fetcher, "https://example.com/");
  assert.equal(result.version, announcement.version);
  assert.equal(init?.cache, "no-store");
  assert.ok(init?.signal);
  await assert.rejects(fetchAnnouncement(async () => new Response("down", { status: 503 }), "https://example.com"));
  await assert.rejects(fetchAnnouncement(async () => Response.json({ active: true }), "https://example.com"));
  assert.deepEqual(await fetchAnnouncement(async () => Response.json({ active: false }), "https://example.com"), { active: false });
});
