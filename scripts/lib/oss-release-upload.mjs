import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const allowed = new Set(['.exe', '.dmg', '.appimage', '.deb', '.zip', '.blockmap', '.yml']);

export async function uploadReleaseFiles(client, directory, {
  log = console.log, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = 8, heartbeatMs = 30000,
} = {}) {
  const files = readdirSync(directory).filter(name =>
    statSync(join(directory, name)).isFile() && allowed.has(extname(name).toLowerCase()));
  if (!files.length) throw new Error('No release artifacts to upload');
  files.sort((a, b) => Number(a.endsWith('.yml')) - Number(b.endsWith('.yml')) || a.localeCompare(b));
  for (const name of files) {
    const key = `updates/${name}`, local = join(directory, name), size = statSync(local).size;
    let checkpoint, percentage = 0, lastLogged = -10;
    log(`[oss] Start ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    const heartbeat = setInterval(() => log(`[oss] ${name}: ${percentage}%`), heartbeatMs);
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          if (size > 8 * 1024 * 1024) {
            await client.multipartUpload(key, local, {
              parallel: 3, partSize: 1024 * 1024, timeout: 120000, checkpoint,
              progress: async (fraction, next) => {
                if (next) checkpoint = next;
                percentage = Math.floor(fraction * 100);
                if (percentage >= lastLogged + 10) {
                  log(`[oss] ${name}: ${percentage}%`); lastLogged = percentage;
                }
              },
            });
          } else {
            await client.put(key, local, { timeout: 120000 });
          }
          const result = await client.head(key, { timeout: 120000 });
          if (Number(result.res.headers['content-length']) !== size) throw new Error('Uploaded size mismatch');
          log(`[oss] Complete ${name} (${size} bytes)`);
          break;
        } catch (error) {
          // Authentication/configuration errors need correction, not repeated requests.
          const permanent = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
          const missingCheckpoint = error.code === 'NoSuchUpload' || error.name === 'NoSuchUploadError';
          if (attempt >= attempts || (permanent && !missingCheckpoint)) throw error;
          if (missingCheckpoint) checkpoint = undefined;
          // Never print request objects, signed URLs or credential-bearing error messages.
          log(`[oss] Retry ${name} ${attempt}/${attempts}: ${error.code || error.name || 'UploadError'}, resume=${Boolean(checkpoint)}`);
          await sleep(Math.min(attempt * 5000, 30000));
        }
      }
    } finally {
      clearInterval(heartbeat);
    }
  }
  return files;
}
