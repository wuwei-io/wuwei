const { teamDirectory } = require('./wuwei-remote-team-directory.cjs');
const { digest, thumbnail } = require('./wuwei-remote-history.cjs');
const roomSnapshots = new Map();
function overview(input, decode) {
    const latest = new Map();
    for (const s of input.sessions) {
        const prior = latest.get(s.employeeId);
        if (!prior || (s.updatedAt || 0) > (prior.updatedAt || 0))
            latest.set(s.employeeId, s);
    }
    const directory = teamDirectory(input.employees, {}, decode, input.enabled), byId = new Map(input.employees.map(e => [e.id, e]));
    return { enabled: input.enabled, employees: directory.employees.map(e => ({ ...e, sessionId: latest.get(e.id)?.id || '', model: byId.get(e.id).model || input.defaultModel })), groups: input.enabled ? input.groups.filter(r => r.type !== 'dm').map(r => ({ id: r.id, name: r.name, memberIds: r.members || [], lastText: (r.lastText || '').slice(0, 180) })) : [], departments: input.enabled ? input.departments : [] };
}
function roomPage(all, bounds, params, roomId, running, decode) {
    const rows = all.map((m, i) => ({ id: m.id, speaker: m.speaker?.name || '', kind: m.speaker?.kind || 'agent', text: m.text || '', images: m.images, speakerId: m.speaker?.id, stopped: !!m.stopped, steps: Array.isArray(m.steps) ? m.steps.slice(-30).map(s => ({ name: String(s.name || "tool").slice(0, 120), isError: !!s.isError })) : undefined, hasThought: typeof m.thought === "string" && !!m.thought.trim() && m.thought.trim() !== String(m.text || "").trim(), detailRevision: detailRevision(m), error: !!m.error, order: i }));
    const hashes = new Map(rows.map(m => [m.id, digest(m)])), revision = digest([...hashes]);
    const prior = params.sinceRevision ? roomSnapshots.get(roomId + ':' + params.sinceRevision) : null;
    const incremental = !!prior && all.length >= prior.total, start = incremental ? prior.start : bounds.start;
    const selected = incremental ? rows.filter(m => m.order >= start && prior.hashes.get(m.id) !== hashes.get(m.id)) : rows.slice(bounds.start, bounds.end);
    const removedIds = incremental ? [...prior.hashes.keys()].filter(id => !hashes.has(id)) : [];
    if (!params.offset) {
        roomSnapshots.set(roomId + ':' + revision, { hashes, total: all.length, start });
        while (roomSnapshots.size > 32)
            roomSnapshots.delete(roomSnapshots.keys().next().value);
    }
    return { messages: selected.map(m => ({ ...m, images: m.images?.map(uri => thumbnail(uri, decode)).filter(Boolean) })), running: !!running, revision, incremental, unchanged: incremental && !selected.length && !removedIds.length, removedIds, total: all.length, hasMore: start > 0, nextOffset: all.length - start };
}
module.exports = { overview, roomPage };
function detailRevision(message) { return digest({ steps: message.steps, thought: message.thought }); }
function messageDetails(all, params) { const m = all.find(row => row.id === params?.messageId); if (!m)
    throw Error("Message unavailable"); const revision = detailRevision(m); if (params?.detailRevision !== revision)
    throw Error("MESSAGE_DETAILS_CHANGED"); return { detailRevision: revision, steps: Array.isArray(m.steps) ? m.steps.slice(-30).map(s => ({ name: String(s.name || "tool").slice(0, 120), input: (typeof s.input === "string" ? s.input : JSON.stringify(s.input ?? {})).slice(0, 2000), result: (typeof s.result === "string" ? s.result : JSON.stringify(s.result ?? "")).slice(0, 2000), isError: !!s.isError })) : [], thought: typeof m.thought === "string" && m.thought.trim() !== String(m.text || "").trim() ? m.thought.slice(0, 8000) : undefined }; }
module.exports.messageDetails = messageDetails;
