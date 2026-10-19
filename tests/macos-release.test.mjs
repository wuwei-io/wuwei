import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { credentials, prepare, checkSignatureDetails, verifyApp, verify, cleanup, run } from '../scripts/macos-release.mjs';

const team = 'R5AM5T3LFU';
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const base = {
  APPLE_TEAM_ID: team, MAC_CSC_LINK: Buffer.from('test-p12').toString('base64'), MAC_CSC_KEY_PASSWORD: 'test-password',
  APPLE_API_KEY_P8: pem, APPLE_API_KEY_ID: 'ABCDEFGHIJ', APPLE_API_ISSUER: '36f34f05-e577-484d-b36e-b5210d7d5a88',
};
const signature = `Authority=Developer ID Application: Test (${team})\nTeamIdentifier=${team}\nflags=0x10000(runtime)\nTimestamp=Oct 20, 2026\n`;
function accepted(command, args) {
  if (command === 'codesign' && args.includes('--display')) return signature;
  if (command.includes('PlistBuddy')) return 'com.wuwei.app\n';
  if (command === 'lipo') return args.at(-1).includes('arm64') ? 'arm64\n' : 'x86_64\n';
  if (command === 'spctl') return 'accepted\nsource=Notarized Developer ID\n';
  return '';
}

test('missing certificate, malformed base64 and incomplete notary credentials block signing', () => {
  for (const name of ['MAC_CSC_LINK', 'MAC_CSC_KEY_PASSWORD', 'APPLE_TEAM_ID', 'APPLE_API_KEY_P8', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
    assert.throws(() => credentials({ ...base, [name]: '' }), new RegExp(name));
  }
  assert.throws(() => credentials({ ...base, MAC_CSC_LINK: 'https://untrusted/cert.p12' }), /base64/);
  assert.throws(() => credentials({ ...base, APPLE_API_KEY_P8: 'bad-key' }), /PEM/);
  assert.throws(() => credentials({ ...base, APPLE_TEAM_ID: 'wrong-team' }), /TEAM_ID/);
  assert.equal(credentials(base).useApi, true);
});

test('API authentication takes precedence; Apple ID fallback requires both fields', () => {
  assert.equal(credentials({ ...base, APPLE_ID: 'unused', APPLE_APP_SPECIFIC_PASSWORD: 'unused' }).useApi, true);
  const fallback = { ...base, APPLE_API_KEY_P8: '', APPLE_API_KEY_ID: '', APPLE_API_ISSUER: '', APPLE_ID: 'test@example.invalid', APPLE_APP_SPECIFIC_PASSWORD: 'test-only' };
  assert.equal(credentials(fallback).useApi, false);
  assert.throws(() => credentials({ ...fallback, APPLE_APP_SPECIFIC_PASSWORD: '' }), /APPLE_APP_SPECIFIC_PASSWORD/);
});

test('failed certificate parsing cleans temporary private material and exports no signing environment', () => {
  const root = mkdtempSync(join(tmpdir(), 'wuwei-signing-test-'));
  const githubEnv = join(root, 'github-env');
  try {
    writeFileSync(githubEnv, '');
    assert.throws(() => prepare({ ...base, RUNNER_TEMP: root, GITHUB_ENV: githubEnv }, () => 'bad certificate'), /matching private key/);
    assert.equal(readFileSync(githubEnv, 'utf8'), '');
    assert.deepEqual(readdirSync(root), ['github-env']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('ad-hoc, development, wrong-team, unhardened and untimestamped apps are rejected', () => {
  checkSignatureDetails(signature, team);
  for (const bad of [
    'Signature=adhoc\nTeamIdentifier=not set',
    signature.replace('Developer ID Application:', 'Apple Development:'),
    signature.replace(`TeamIdentifier=${team}`, 'TeamIdentifier=WRONGTEAM1'),
    signature.replace('flags=0x10000(runtime)', 'flags=0x0(none)'),
    signature.replace('Timestamp=', 'Signed Time='),
  ]) assert.throws(() => checkSignatureDetails(bad, team));
});

test('app verification requires a stapled ticket, correct architecture and Gatekeeper acceptance', () => {
  verifyApp('/test/wuwei.app', 'x86_64', team, accepted);
  for (const failure of ['codesign', 'stapler', 'bundle', 'architecture', 'gatekeeper']) {
    const rejected = (command, args) => {
      if (failure === 'codesign' && command === 'codesign' && args.includes('--verify')) throw new Error('bad signature');
      if (failure === 'stapler' && command === 'xcrun') throw new Error('no ticket');
      if (failure === 'bundle' && command.includes('PlistBuddy')) return 'another.app';
      if (failure === 'architecture' && command === 'lipo') return 'arm64';
      if (failure === 'gatekeeper' && command === 'spctl') return 'source=Unnotarized Developer ID';
      return accepted(command, args);
    };
    assert.throws(() => verifyApp('/test/wuwei.app', 'x86_64', team, rejected), undefined, failure);
  }
});

test('both ZIP and mounted DMG payloads are verified for both architectures', () => {
  const root = mkdtempSync(join(tmpdir(), 'wuwei-archives-test-'));
  const calls = [];
  try {
    mkdirSync(join(root, 'release'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    for (const suffix of ['', '-arm64']) for (const ext of ['-mac.zip', '.dmg']) writeFileSync(join(root, 'release', `wuwei-1.2.3${suffix}${ext}`), 'fixture');
    let arch;
    const exec = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'ditto') arch = args[1].includes('arm64') ? 'arm64' : 'x86_64';
      if (command === 'hdiutil' && args[0] === 'attach') mkdirSync(join(args[4], 'wuwei.app'));
      if (command === 'hdiutil' && args[0] === 'detach') rmSync(join(args[1], 'wuwei.app'), { recursive: true });
      if (command === 'lipo') return arch;
      return accepted(command, args);
    };
    verify({ APPLE_TEAM_ID: team, RUNNER_TEMP: root }, exec, root);
    assert.equal(calls.filter(c => c[0] === 'spctl').length, 4);
    assert.equal(calls.filter(c => c[0] === 'hdiutil' && c[1] === 'detach').length, 2);
    assert.equal(calls.filter(c => c[0] === 'xcrun' && c[1] === 'stapler').length, 4);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('cleanup refuses paths outside the runner signing directory', () => {
  assert.throws(() => cleanup({ RUNNER_TEMP: '/tmp/runner', WUWEI_MAC_SIGNING_DIR: '/Users/someone' }), /Refusing/);
  assert.throws(() => cleanup({ RUNNER_TEMP: '/tmp/runner', WUWEI_MAC_SIGNING_DIR: '/tmp/runner' }), /Refusing/);
});

test('failed commands do not leak arguments or tool output in errors', () => {
  assert.throws(() => run(process.execPath, ['-e', 'console.error("private-key-secret");process.exit(1)']), error => {
    assert.doesNotMatch(error.message, /private-key-secret/);
    return true;
  });
});

test('native macOS PKCS12 parsing validates identity, private key and exported builder environment', { skip: process.platform !== 'darwin' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'wuwei-native-signing-test-'));
  try {
    const key = join(root, 'test.key'), cert = join(root, 'test.pem'), p12 = join(root, 'test.p12');
    const githubEnv = join(root, 'github-env');
    writeFileSync(githubEnv, '');
    run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=Developer ID Application: Test Fixture/OU=${team}`]);
    const env = { ...process.env, ...base, RUNNER_TEMP: root, GITHUB_ENV: githubEnv };
    run('openssl', ['pkcs12', '-export', '-inkey', key, '-in', cert, '-out', p12, '-passout', 'env:MAC_CSC_KEY_PASSWORD'], { env });
    env.MAC_CSC_LINK = readFileSync(p12).toString('base64');
    let authenticated = false;
    const exec = (command, args, options) => {
      if (command === 'xcrun') {
        assert.deepEqual(args.slice(0, 2), ['notarytool', 'history']);
        assert.equal(readFileSync(args[3], 'utf8'), pem);
        authenticated = true;
        return '{}'; // Only the notary service is simulated; no submission is made.
      }
      return run(command, args, options);
    };
    prepare(env, exec);
    assert.equal(authenticated, true);
    const exported = Object.fromEntries(readFileSync(githubEnv, 'utf8').trimEnd().split('\n').map(line => {
      const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
    }));
    assert.equal(readFileSync(exported.APPLE_API_KEY, 'utf8'), pem);
    assert.equal(exported.APPLE_ID, '');
    assert.equal(exported.APPLE_APP_SPECIFIC_PASSWORD, '');
    assert.equal(readFileSync(exported.CSC_LINK).toString('base64'), env.MAC_CSC_LINK);
    cleanup({ ...env, ...exported });
    assert.throws(() => prepare({ ...env, APPLE_TEAM_ID: 'WRONGTEAM1' }, exec), /does not belong/);
    run('openssl', ['req', '-x509', '-new', '-key', key, '-out', cert, '-days', '1', '-subj', `/CN=Apple Development: Test Fixture/OU=${team}`]);
    run('openssl', ['pkcs12', '-export', '-inkey', key, '-in', cert, '-out', p12, '-passout', 'env:MAC_CSC_KEY_PASSWORD'], { env });
    assert.throws(() => prepare({ ...env, MAC_CSC_LINK: readFileSync(p12).toString('base64') }, exec), /Developer ID Application certificate is required/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
