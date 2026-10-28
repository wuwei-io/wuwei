'use strict';
const { historyPage } = require('./wuwei-remote-history.cjs');
const { sessionPreview } = require('./wuwei-remote-summary.cjs');
const { digest } = require('./wuwei-remote-history.cjs');
const bodies = new Map(), previews = new Map(), pages = new WeakMap();
const maxBytes = 32 * 1024 * 1024;
function stamp(id, deps) { try {
    const s = deps.stat(id);
    return { s: s.size, tag: s.size + ':' + s.mtimeMs };
}
catch {
    return { s: 0, tag: 'missing' };
} }
function history(id, deps) {
    const active = deps.live(id);
    if (active)
        return active;
    const meta = stamp(id, deps), hit = bodies.get(id);
    if (hit?.tag === meta.tag) {
        bodies.delete(id);
        bodies.set(id, hit);
        return hit.rows;
    }
    const rows = deps.load(id);
    bodies.delete(id);
    if (meta.s <= maxBytes) {
        bodies.set(id, { tag: meta.tag, rows, size: meta.s });
        let used = [...bodies.values()].reduce((sum, x) => sum + x.size, 0);
        for (const [key, value] of bodies) {
            if (used <= maxBytes && bodies.size <= 16)
                break;
            bodies.delete(key);
            used -= value.size;
        }
    }
    return rows;
}
function summary(rows) { for (let i = rows.length - 1; i >= 0; i--) {
    const blocks = rows[i]?.content || [];
    for (let j = blocks.length - 1; j >= 0; j--)
        if (blocks[j]?.type === 'text') {
            const result = sessionPreview(blocks[j].text || '');
            if (result)
                return result;
        }
} return ''; }
function sessions(metas, deps, params = {}) {
    const known = new Set(metas.map(s => s.id));
    for (const id of previews.keys())
        if (!known.has(id))
            previews.delete(id);
    const rows = metas.filter(s => !s.employeeId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(s => {
        const active = deps.running(s.id), tag = stamp(s.id, deps).tag + ':' + s.updatedAt;
        let entry = previews.get(s.id);
        if (active || entry?.tag !== tag) {
            entry = { tag, text: summary(history(s.id, deps)) };
            previews.set(s.id, entry);
        }
        return { id: s.id, title: s.title || '新对话', updatedAt: s.updatedAt || 0, run: active ? 'running' : 'idle', model: s.model, providerId: s.providerId, lastMessage: entry.text };
    });
    const revision = digest(rows);
    return params.sinceRevision === revision ? { revision, unchanged: true } : { sessions: rows, revision };
}
function page(all, bounds, params, id, running, decode) {
    const key = id + ':' + bounds.start + ':' + bounds.end;
    let memo = pages.get(all);
    const prior = memo?.get(key);
    if (!running && prior) {
        if (params.sinceRevision === prior.revision)
            return { ...prior, messages: [], incremental: true, unchanged: true, removedIds: [] };
        if (!params.sinceRevision)
            return prior;
    }
    const value = historyPage(all, bounds, params, id, running, decode);
    if (!running && !value.incremental) {
        if (!memo) {
            memo = new Map();
            pages.set(all, memo);
        }
        memo.set(key, value);
        while (memo.size > 8)
            memo.delete(memo.keys().next().value);
    }
    return value;
}
module.exports = { history, sessions, page };
