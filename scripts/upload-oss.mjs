// CI-only release upload. Credentials remain in Actions environment variables.
import OSS from 'ali-oss';
import { uploadReleaseFiles } from './lib/oss-release-upload.mjs';
const accessKeyId = process.env.OSS_KEY_ID, accessKeySecret = process.env.OSS_KEY_SECRET;
if (!accessKeyId || !accessKeySecret) {
  console.error('[oss] Missing upload credentials; publishing stopped'); process.exit(1);
}
const client = new OSS({
  endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  accessKeyId, accessKeySecret, bucket: 'wuwei-repo', secure: true,
  timeout: 120000, retryMax: 0,
});
try {
  const files = await uploadReleaseFiles(client, 'release');
  console.log(`[oss] Complete: ${files.length} files. Existing releases retained.`);
} catch (error) {
  console.error(`[oss] Publishing stopped: ${error.code || error.name || 'UploadError'}`);
  process.exit(1);
}
