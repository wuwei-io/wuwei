const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const snapshots = new Map(), digest = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);
const clean = text => String(text || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/<\/?[^>]+>/g, '').slice(0, 180);
function triggerLabel(t = {}) { const hh = String(t.hour ?? 0).padStart(2, '0'), mm = String(t.minute ?? 0).padStart(2, '0'); return t.kind === 'daily' ? `每天 ${hh}:${mm}` : t.kind === 'weekly' ? `每${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][t.weekday]} ${hh}:${mm}` : t.kind === 'monthly' ? `每月 ${t.day} 日 ${hh}:${mm}` : t.kind === 'interval' ? `每 ${t.everyMinutes} 分钟` : '触发规则未配置'; }
function counts(employeeId, input) { return { sessions: input.sessions.filter(s => s.employeeId === employeeId).length, dms: input.rooms.filter(r => r.type === 'dm' && r.members?.includes(employeeId)).length, schedules: input.schedules.filter(s => s.employeeId === employeeId).length }; }
function records(input, params = {}) {
    const employee = input.employees.find(e => e.id === params.employeeId);
    if (!employee)
        throw Error('员工已不存在');
    const kind = params.kind;
    if (!['sessions', 'dms', 'schedules'].includes(kind))
        throw Error('记录类型无效');
    const limit = Math.max(1, Math.min(10, Number(params.limit) || 10));
    let rows;
    if (kind === 'sessions')
        rows = input.sessions.filter(s => s.employeeId === employee.id).map(s => ({ id: s.id, title: s.title || '新对话', summary: clean(s.lastMessage), updatedAt: s.updatedAt || 0, employeeId: employee.id }));
    if (kind === 'dms')
        rows = input.rooms.filter(r => r.type === 'dm' && r.members?.includes(employee.id)).map(r => ({ id: r.id, title: r.name || '员工私聊', summary: clean(r.lastText), updatedAt: r.updatedAt || 0, memberIds: r.members, employeeId: employee.id }));
    if (kind === 'schedules')
        rows = input.schedules.filter(s => s.employeeId === employee.id).map(s => ({ id: s.id, title: s.name, summary: triggerLabel(s.trigger), updatedAt: s.lastRunAt || s.createdAt || 0, employeeId: s.employeeId, enabled: s.enabled !== false, nextRunAt: s.nextRunAt, lastRunAt: s.lastRunAt, globalEnabled: input.globalEnabled !== false }));
    rows.sort((a, b) => b.updatedAt - a.updatedAt || String(a.id).localeCompare(String(b.id)));
    const revision = digest(rows), key = employee.id + ':' + kind, prior = params.sinceRevision ? snapshots.get(key + ':' + params.sinceRevision) : null;
    let cursor;
    if (params.cursor) {
        if (typeof params.cursor !== 'string' || params.cursor.length > 256)
            throw Error('分页标识无效');
        try {
            cursor = JSON.parse(Buffer.from(params.cursor, 'base64url').toString('utf8'));
        }
        catch {
            throw Error('分页标识无效');
        }
        if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isFinite(cursor[0]) || typeof cursor[1] !== 'string')
            throw Error('分页标识无效');
    }
    const available = cursor ? rows.filter(r => r.updatedAt < cursor[0] || r.updatedAt === cursor[0] && String(r.id).localeCompare(cursor[1]) > 0) : rows;
    const selected = available.slice(0, limit), tail = selected.at(-1), nextCursor = available.length > selected.length && tail ? Buffer.from(JSON.stringify([tail.updatedAt, tail.id])).toString('base64url') : undefined;
    const ids = new Set(rows.map(r => r.id)), known = Array.isArray(params.knownIds) ? params.knownIds.slice(0, 1000) : prior, removedIds = known ? [...known].filter(id => !ids.has(id)) : [];
    if (!params.cursor) {
        snapshots.set(key + ':' + revision, ids);
        while (snapshots.size > 64)
            snapshots.delete(snapshots.keys().next().value);
    }
    return { items: !cursor && params.sinceRevision === revision ? [] : selected, total: rows.length, nextCursor, revision, incremental: !cursor && !!params.sinceRevision, unchanged: !cursor && params.sinceRevision === revision, removedIds };
}
function readRuns(directory) { try {
    const rows = JSON.parse(fs.readFileSync(path.join(directory, 'mobile-schedule-runs.json'), 'utf8'));
    if (!Array.isArray(rows))
        throw Error('Invalid schedule receipt format');
    return rows;
}
catch (e) {
    if (e.code === 'ENOENT')
        return [];
    throw e;
} }
function recordTrigger(directory, entry, now = Date.now()) {
    if (!['scheduleId', 'employeeId', 'sessionId'].every(k => typeof entry[k] === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(entry[k])))
        throw Error('定时执行关联标识无效');
    const rows = readRuns(directory);
    rows.unshift({ id: crypto.randomUUID(), scheduleId: entry.scheduleId, employeeId: entry.employeeId, sessionId: entry.sessionId, triggeredAt: now });
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'mobile-schedule-runs.json'), temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(rows.slice(0, 200)));
    fs.renameSync(temp, file);
}
function scheduleDetail(input, id, runs = []) {
    const task = input.schedules.find(t => t.id === id);
    if (!task || !input.employees.some(e => e.id === task.employeeId))
        throw Error('定时任务已不存在');
    return { id: task.id, title: task.name, employeeId: task.employeeId, enabled: task.enabled !== false, globalEnabled: input.globalEnabled !== false, trigger: task.trigger, triggerLabel: triggerLabel(task.trigger), lastRunAt: task.lastRunAt, nextRunAt: task.nextRunAt, sopId: task.sopId, doc: (task.doc || '').slice(0, 128000), contentTruncated: (task.doc || '').length > 128000, runs: runs.filter(r => r.scheduleId === task.id && r.employeeId === task.employeeId).slice(0, 20).map(r => ({ ...r, sessionAvailable: input.sessions.some(s => s.id === r.sessionId && s.employeeId === task.employeeId) })) };
}
module.exports = { counts, records, triggerLabel, recordTrigger, readRuns, scheduleDetail };
