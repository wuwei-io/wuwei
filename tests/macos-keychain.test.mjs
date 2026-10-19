import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { repairKeychainPassword } from '../scripts/fix-macos-keychain.mjs';
const require = createRequire(import.meta.url);
test('keychain unlock uses its generated password and certificate import retains its password', () => {
  const original = readFileSync(require.resolve('app-builder-lib/out/codeSign/macCodeSign.js'), 'utf8');
  const fixed = repairKeychainPassword(original);
  assert.match(fixed, /importCerts\(keychainFile, certPaths, cscPasswords, keychainPassword\)/);
  assert.match(fixed, /"-k", keychainPassword, keychainFile/);
  assert.match(fixed, /"-P", password/);
  assert.equal(repairKeychainPassword(fixed), fixed);
  assert.throws(() => repairKeychainPassword('unexpected upstream version'), /Unexpected/);
});
