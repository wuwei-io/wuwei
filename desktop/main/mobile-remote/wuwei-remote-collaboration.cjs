'use strict';
const jobs = new Map();
function recordKey(room, employee) { return JSON.stringify([room, employee]); }
async function runEmployee(args, execute) {
    const room = args.reportOrigin?.kind === 'room' ? args.reportOrigin.id : args.taskReportScope?.origin?.kind === 'room' ? args.taskReportScope.origin.id : null;
    if (!room || !args.employee?.id)
        return execute(args);
    const controller = new AbortController(), job = { room, employeeId: args.employee.id, id: require('node:crypto').randomUUID(), state: 'running', controller, text: '', updatedAt: Date.now() };
    const key = recordKey(room, args.employee.id), bucket = jobs.get(key) || new Set();
    bucket.add(job);
    jobs.set(key, bucket);
    const abortParent = () => controller.abort();
    args.signal?.addEventListener('abort', abortParent, { once: true });
    if (args.signal?.aborted)
        controller.abort();
    try {
        controller.signal.throwIfAborted();
        const output = await execute({ ...args, signal: controller.signal, onProgress: event => { if (event.kind === 'text')
                job.text = (job.text + (event.delta || '')).slice(-160000); args.onProgress?.(event); } });
        if (job.state === 'stop-requested') {
            if (!job.text && typeof output === 'string')
                job.text = output.slice(-160000);
            throw Error('member stopped');
        }
        return output;
    }
    catch (error) {
        if (job.state === 'stop-requested') {
            const stopped = new Error('本次执行已停止');
            stopped.code = 'WUWEI_EMPLOYEE_STOPPED';
            stopped.partialText = job.text;
            throw stopped;
        }
        throw error;
    }
    finally {
        args.signal?.removeEventListener('abort', abortParent);
        job.state = job.state === 'stop-requested' ? 'stopped' : 'finished';
        job.updatedAt = Date.now();
        job.controller = null;
        job.text = '';
        // Keep only the most recent completion per member, alongside live executions.
        const done = [...bucket].filter(j => !j.controller).sort((a, b) => b.updatedAt - a.updatedAt);
        done.slice(1).forEach(j => bucket.delete(j));
        if (jobs.size > 256)
            for (const [id, items] of jobs) {
                if ([...items].every(j => !j.controller)) {
                    jobs.delete(id);
                    if (jobs.size <= 256)
                        break;
                }
            }
    }
}
function stopMember(room, employee) { const bucket = jobs.get(recordKey(room, employee)); let requested = 0; for (const job of bucket || []) {
    if (job.controller && !job.controller.signal.aborted) {
        job.state = 'stop-requested';
        job.updatedAt = Date.now();
        job.controller.abort();
        requested++;
    }
} return { requested }; }
function state(room, members) { return members.map(employee => { const all = [...(jobs.get(recordKey(room, employee.id)) || [])], live = all.filter(j => j.controller), last = all.sort((a, b) => b.updatedAt - a.updatedAt)[0]; return { employeeId: employee.id, state: live.some(j => j.state === 'stop-requested') ? 'stopping' : live.length ? 'running' : last?.state === 'stopped' ? 'stopped' : 'idle', activeCount: live.length }; }); }
module.exports = { runEmployee, stopMember, state };
