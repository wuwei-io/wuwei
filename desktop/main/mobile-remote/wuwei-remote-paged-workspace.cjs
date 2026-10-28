'use strict';
const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
function paginate(rows, params = {}, project = row => row) {
    const limit = Math.max(1, Math.min(10, Number(params.limit) || 10));
    let cursor;
    if (params.cursor) {
        try {
            if (typeof params.cursor !== 'string' || params.cursor.length > 1024)
                throw Error();
            cursor = JSON.parse(params.cursor);
            if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isFinite(cursor[0]) || typeof cursor[1] !== 'string')
                throw Error();
        }
        catch {
            throw Error('Invalid page cursor');
        }
    }
    const query = String(params.query || '').trim().toLowerCase().slice(0, 160);
    const sorted = rows.filter(r => !query || String(r.search || r.title || r.name || '').toLowerCase().includes(query)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || String(a.id).localeCompare(String(b.id)));
    const revision = digest(sorted), ids = new Set(sorted.map(r => r.id));
    const removedIds = Array.isArray(params.knownIds) ? params.knownIds.slice(0, 1000).filter(id => typeof id === 'string' && !ids.has(id)) : [];
    if (!cursor && params.sinceRevision === revision)
        return { items: [], revision, total: sorted.length, unchanged: true, incremental: true, removedIds };
    const available = cursor ? sorted.filter(r => (r.updatedAt || 0) < cursor[0] || ((r.updatedAt || 0) === cursor[0] && String(r.id).localeCompare(cursor[1]) > 0)) : sorted;
    const selected = available.slice(0, limit), tail = selected.at(-1);
    return { items: selected.map(project), total: sorted.length, revision, incremental: !!params.sinceRevision, removedIds, nextCursor: tail && available.length > selected.length ? JSON.stringify([tail.updatedAt || 0, tail.id]) : undefined };
}
function conversationType(meta) {
    if (['text','image','video'].includes(meta.conversationType)) return meta.conversationType;
    return meta.videoSku || meta.videoMode ? 'video' : meta.imageSku || meta.imageMode ? 'image' : 'text';
}
function sessions(metas, deps, params = {}) {
    // Lists never stat, parse, decode images, or load conversation bodies.
    const rows = metas.filter(s => !s.employeeId).map(s => ({ id: s.id, conversationType: conversationType(s), imageSku: s.imageSku, done: s.done === true, title: s.title || '新对话', updatedAt: s.updatedAt || 0, run: deps.running(s.id) ? 'running' : 'idle', model: s.model, providerId: s.providerId, lastMessage: String(s.lastMessage || s.preview || '').slice(0, 180) }));
    // Keep legacy callers compatible; the paged phone explicitly supplies a limit.
    if (params.limit === undefined && !params.cursor && !params.query)
        return { sessions: rows.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), revision: digest(rows), total: rows.length };
    const page = paginate(rows, params);
    return { ...page, sessions: page.items, items: undefined };
}
function workspace(kind, input, params, helpers) {
    if (kind === 'employees') {
        const latest = new Map();
        for (const s of input.sessions || []) {
            const old = latest.get(s.employeeId);
            if (!old || (s.updatedAt || 0) > (old.updatedAt || 0))
                latest.set(s.employeeId, s);
        }
        const rows = input.employees.map(e => ({ id: e.id, name: e.name, title: e.title || '', blurb: e.blurb || '', search: [e.name, e.title, e.blurb].join(' '), updatedAt: 0 }));
        const byId = new Map(input.employees.map(e => [e.id, e]));
        return { enabled: input.enabled, ...paginate(rows, params, row => { const e = byId.get(row.id), directory = helpers.directory([e], {}, helpers.decode, true); return { ...directory.employees[0], sessionId: latest.get(e.id)?.id || '', model: e.model || input.defaultModel }; }) };
    }
    if (kind === 'groups') {
        const rows = input.rooms.filter(r => r.type !== 'dm').map(r => ({ id: r.id, name: r.name, memberIds: r.members || [], lastText: String(r.lastText || '').slice(0, 180), updatedAt: r.updatedAt || 0, search: [r.name, r.lastText].join(' ') }));
        return { enabled: input.enabled, ...paginate(rows, params, row => { const members = input.employees.filter(e => row.memberIds.includes(e.id)); return { ...row, search: undefined, members: helpers.directory(members.slice(0, 4), {}, helpers.decode, true).employees }; }) };
    }
    if (kind === 'sop') {
        const nodes = new Map(), paths = new Map();
        function walk(list, path = '', seen = new Set()) { for (const n of list) {
            if (seen.has(n.id))
                continue;
            seen.add(n.id);
            nodes.set(n.id, n);
            paths.set(n.id, path);
            if (n.children)
                walk(n.children, [path, n.name].filter(Boolean).join(' / '), seen);
        } }
        walk(input.tree || []);
        const rows = [...nodes.values()].filter(n => n.kind === 'sop').map(n => { const parents = [], seen = new Set([n.id]); let p = n.parentId; while (p && !seen.has(p)) {
            seen.add(p);
            const parent = nodes.get(p);
            if (!parent)
                break;
            parents.unshift(parent.name);
            p = parent.parentId;
        } const path = paths.get(n.id) || parents.join(' / '); return { id: n.id, name: n.name, kind: n.kind, summary: String(n.summary || '').slice(0, 180), path, updatedAt: n.updatedAt || 0, search: [n.name, n.summary, path].join(' ') }; });
        return paginate(rows, params, row => ({ ...row, search: undefined }));
    }
    throw Error('Invalid workspace list');
}
module.exports = { paginate, sessions, workspace };
