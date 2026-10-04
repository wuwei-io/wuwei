import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, realpathSync, statSync, openSync, closeSync, readSync } from 'node:fs';
import { basename, join, relative, isAbsolute, resolve, extname } from 'node:path';
import type { TaskReportScope } from '../../src/types.js';

export type FileArtifact = { id: string; name: string; kind: 'file'; bytes: number; md5: string; mimeType: string; createdAt: number; origin: TaskReportScope['origin']; turnId: string };
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);
const MAX_FILE = 32 * 1024 * 1024;
const MAX_CACHE = 128 * 1024 * 1024;
const mimes: Record<string, string> = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.zip': 'application/zip' };

/** Export only explicitly delivered files. Requests use opaque IDs, never caller-supplied paths. */
export class RemoteArtifacts {
  private files: FileArtifact[] = [];
  constructor(private root: string) {
    try { const rows = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')); this.files = Array.isArray(rows) ? rows.filter(r => validId(r.id) && Number.isSafeInteger(r.bytes) && r.bytes >= 0 && r.bytes <= MAX_FILE) : []; } catch { /* no exports yet */ }
  }
  private path(id: string) { if (!validId(id)) throw new Error('文件编号无效'); return join(this.root, `${id}.blob`); }
  private save() { mkdirSync(this.root, { recursive: true }); const path = join(this.root, 'index.json'); writeFileSync(`${path}.tmp`, JSON.stringify(this.files)); renameSync(`${path}.tmp`, path); }
  publish(path: string, allowedRoots: string[], origin: FileArtifact['origin'], turnId: string): FileArtifact {
    const actual = realpathSync(resolve(path));
    const allowed = allowedRoots.some(root => { try { const rel = relative(realpathSync(root), actual); return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel); } catch { return false; } });
    if (!allowed) throw new Error('只能交付当前工作目录或无为 output 目录内的文件');
    const stat = statSync(actual);
    if (!stat.isFile() || stat.size > MAX_FILE) throw new Error('仅支持不超过 32 MiB 的普通文件');
    const content = readFileSync(actual);
    if (content.length > MAX_FILE) throw new Error('文件超过 32 MiB');
    const artifact: FileArtifact = { id: randomUUID(), name: basename(actual), kind: 'file', bytes: content.length,
      md5: createHash('md5').update(content).digest('hex'), mimeType: mimes[extname(actual).toLowerCase()] || 'application/octet-stream', createdAt: Date.now(), origin, turnId };
    mkdirSync(this.root, { recursive: true }); writeFileSync(this.path(artifact.id), content, { flag: 'wx' });
    this.files.push(artifact);
    while (this.files.length > 100 || this.files.reduce((sum, f) => sum + f.bytes, 0) > MAX_CACHE) {
      const old = this.files.shift()!; try { unlinkSync(this.path(old.id)); } catch { /* already removed */ }
    }
    this.save(); return { ...artifact };
  }
  listTurn(turnId: string) { return this.files.filter(f => f.turnId === turnId).map(f => ({ ...f })); }
  read(id: string, origin: FileArtifact['origin'], offset: number, length = 128 * 1024) {
    const file = this.files.find(f => f.id === id && f.origin.kind === origin.kind && f.origin.id === origin.id);
    if (!file) throw new Error('该文件不属于此任务，或已过期');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.bytes || !Number.isSafeInteger(length) || length < 1 || length > 128 * 1024) throw new Error('文件分片范围无效');
    const fd = openSync(this.path(id), 'r');
    try {
      const buffer = Buffer.alloc(Math.min(length, file.bytes - offset));
      const read = readSync(fd, buffer, 0, buffer.length, offset);
      if (read !== buffer.length) throw new Error('文件已变化，请重新读取任务产出');
      return { id, offset, bytes: file.bytes, md5: file.md5, data: buffer.toString('base64'), nextOffset: offset + read, done: offset + read === file.bytes };
    } finally { closeSync(fd); }
  }
}
