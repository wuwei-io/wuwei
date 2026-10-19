import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Commands can contain authentication arguments. Never include command lines or
// tool output in errors (notarytool and openssl can echo credential material).
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed; check credentials or macOS signing requirements`);
  return `${result.stdout || ''}${result.stderr || ''}`;
}

export function credentials(env) {
  for (const name of ['MAC_CSC_LINK', 'MAC_CSC_KEY_PASSWORD', 'APPLE_TEAM_ID']) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}; see docs/macos-signing.md`);
  }
  if (!/^[A-Z0-9]{10}$/.test(env.APPLE_TEAM_ID)) throw new Error('Invalid APPLE_TEAM_ID');
  const apiNames = ['APPLE_API_KEY_P8', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'];
  const useApi = apiNames.some(name => env[name]?.trim());
  const names = useApi ? apiNames : ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD'];
  for (const name of names) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}; see docs/macos-signing.md`);
  }
  if (useApi) {
    try {
      const key = createPrivateKey(env.APPLE_API_KEY_P8);
      if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error();
    } catch { throw new Error('APPLE_API_KEY_P8 must contain an App Store Connect EC private key in PEM format'); }
    if (!/^[A-Z0-9]{10}$/.test(env.APPLE_API_KEY_ID)) throw new Error('Invalid APPLE_API_KEY_ID');
    if (!/^[a-f0-9-]{36}$/i.test(env.APPLE_API_ISSUER)) throw new Error('Invalid APPLE_API_ISSUER');
  }
  const encoded = env.MAC_CSC_LINK.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || Buffer.from(encoded, 'base64').toString('base64') !== encoded) {
    throw new Error('MAC_CSC_LINK must contain the base64-encoded .p12 file');
  }
  return { useApi, certificate: Buffer.from(encoded, 'base64') };
}

export function checkCertificate(pem, privatePem, team, now = Date.now()) {
  let cert;
  try {
    cert = new X509Certificate(pem);
    if (!cert.checkPrivateKey(createPrivateKey(privatePem))) throw new Error();
  } catch { throw new Error('The .p12 must contain a certificate and its matching private key'); }
  const fields = cert.subject.split('\n');
  if (!fields.some(field => field.startsWith('CN=Developer ID Application: '))) {
    throw new Error('A Developer ID Application certificate is required; an iOS/Apple Development certificate cannot be used');
  }
  if (!fields.includes(`OU=${team}`)) throw new Error('The certificate does not belong to APPLE_TEAM_ID');
  if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) <= now) throw new Error('The signing certificate is not currently valid');
}

export function prepare(env = process.env, exec = run) {
  const config = credentials(env);
  if (!env.RUNNER_TEMP || !env.GITHUB_ENV) throw new Error('RUNNER_TEMP and GITHUB_ENV are required');
  const directory = mkdtempSync(join(env.RUNNER_TEMP, 'wuwei-macos-signing-'));
  try {
    const certificate = join(directory, 'developer-id.p12');
    writeFileSync(certificate, config.certificate, { mode: 0o600 });
    const common = ['pkcs12', '-in', certificate, '-passin', 'env:MAC_CSC_KEY_PASSWORD'];
    const certificatePem = exec('openssl', [...common, '-clcerts', '-nokeys'], { env });
    const privatePem = exec('openssl', [...common, '-nocerts', '-nodes'], { env });
    checkCertificate(certificatePem, privatePem, env.APPLE_TEAM_ID);
    const additions = { CSC_LINK: certificate, WUWEI_MAC_SIGNING_DIR: directory };
    let auth;
    if (config.useApi) {
      const key = join(directory, 'AuthKey.p8');
      writeFileSync(key, env.APPLE_API_KEY_P8, { mode: 0o600 });
      additions.APPLE_API_KEY = key; // electron-builder expects a file path, not PEM/base64.
      // API authentication takes precedence over any legacy Apple ID secrets.
      additions.APPLE_ID = '';
      additions.APPLE_APP_SPECIFIC_PASSWORD = '';
      auth = ['--key', key, '--key-id', env.APPLE_API_KEY_ID, '--issuer', env.APPLE_API_ISSUER];
    } else {
      additions.APPLE_ID = env.APPLE_ID;
      additions.APPLE_APP_SPECIFIC_PASSWORD = env.APPLE_APP_SPECIFIC_PASSWORD;
      auth = ['--apple-id', env.APPLE_ID, '--password', env.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', env.APPLE_TEAM_ID];
    }
    exec('xcrun', ['notarytool', 'history', ...auth, '--output-format', 'json'], { env });
    for (const [name, value] of Object.entries(additions)) {
      if (/[\r\n]/.test(value)) throw new Error('Invalid runner temporary path');
      appendFileSync(env.GITHUB_ENV, `${name}=${value}\n`);
    }
    console.log('Developer ID certificate and notarization authentication validated');
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function checkSignatureDetails(details, team, app = true) {
  if (!details.includes('Authority=Developer ID Application: ') || !details.split(/\r?\n/).includes(`TeamIdentifier=${team}`)) {
    throw new Error('Release signature must use Developer ID Application from APPLE_TEAM_ID');
  }
  if (app && (!/flags=.*\bruntime\b/.test(details) || !/^Timestamp=/m.test(details))) {
    throw new Error('Release apps must use Hardened Runtime and a secure timestamp');
  }
}

export function verifyApp(app, arch, team, exec = run) {
  exec('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  checkSignatureDetails(exec('codesign', ['--display', '--verbose=4', app]), team);
  const info = join(app, 'Contents', 'Info.plist');
  if (exec('/usr/libexec/PlistBuddy', ['-c', 'Print:CFBundleIdentifier', info]).trim() !== 'com.wuwei.app') {
    throw new Error('Unexpected macOS application bundle identifier');
  }
  const binary = join(app, 'Contents', 'MacOS', 'wuwei');
  if (!exec('lipo', ['-archs', binary]).trim().split(/\s+/).includes(arch)) throw new Error(`Missing ${arch} executable`);
  exec('xcrun', ['stapler', 'validate', app]);
  const assessment = exec('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
  if (!assessment.includes('source=Notarized Developer ID')) throw new Error('Gatekeeper did not accept this app as Notarized Developer ID');
}

export function verify(env = process.env, exec = run, project = process.cwd()) {
  if (!/^[A-Z0-9]{10}$/.test(env.APPLE_TEAM_ID || '')) throw new Error('Missing or invalid APPLE_TEAM_ID');
  const version = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')).version;
  const output = join(project, 'release');
  for (const [suffix, arch] of [['', 'x86_64'], ['-arm64', 'arm64']]) {
    const zip = join(output, `wuwei-${version}${suffix}-mac.zip`);
    const dmg = join(output, `wuwei-${version}${suffix}.dmg`);
    if (!existsSync(zip) || !existsSync(dmg)) throw new Error(`Missing ${arch} release archive`);
    const extracted = mkdtempSync(join(env.RUNNER_TEMP, 'wuwei-macos-verify-'));
    try {
      exec('ditto', ['-xk', zip, extracted]);
      verifyApp(join(extracted, 'wuwei.app'), arch, env.APPLE_TEAM_ID, exec);
    } finally { rmSync(extracted, { recursive: true, force: true }); }
    exec('codesign', ['--verify', '--strict', dmg]);
    checkSignatureDetails(exec('codesign', ['--display', '--verbose=4', dmg]), env.APPLE_TEAM_ID, false);
    const mount = mkdtempSync(join(env.RUNNER_TEMP, 'wuwei-macos-mount-'));
    let attached = false;
    try {
      exec('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
      attached = true;
      const apps = readdirSync(mount).filter(name => name.endsWith('.app'));
      if (apps.length !== 1 || apps[0] !== 'wuwei.app') throw new Error('Unexpected DMG application contents');
      verifyApp(join(mount, 'wuwei.app'), arch, env.APPLE_TEAM_ID, exec);
    } finally {
      // Never recursively remove a mounted filesystem, even when detach fails.
      if (attached) exec('hdiutil', ['detach', mount]);
      rmdirSync(mount);
    }
    console.log(`${arch}: ZIP and signed DMG contain an accepted, stapled Developer ID app`);
  }
}

export function cleanup(env = process.env) {
  if (!env.WUWEI_MAC_SIGNING_DIR) return;
  const directory = resolve(env.WUWEI_MAC_SIGNING_DIR);
  const parent = resolve(env.RUNNER_TEMP || '');
  if (dirname(directory) !== parent || !directory.startsWith(`${parent}${sep}wuwei-macos-signing-`)) {
    throw new Error('Refusing to remove an unexpected signing directory');
  }
  rmSync(directory, { recursive: true, force: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== 'darwin') throw new Error('macOS release signing must run on a Mac');
    const command = { prepare, verify, cleanup }[process.argv[2]];
    if (!command) throw new Error('Usage: node scripts/macos-release.mjs prepare|verify|cleanup');
    command();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
