import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// electron-builder 26.15.3 creates a random keychain password but passes the
// certificate password to set-key-partition-list. Forward the keychain password.
export function repairKeychainPassword(source) {
  const edits = [
    ['return await importCerts(keychainFile, certPaths, cscPasswords);', 'return await importCerts(keychainFile, certPaths, cscPasswords, keychainPassword);'],
    ['async function importCerts(keychainFile, paths, keyPasswords) {', 'async function importCerts(keychainFile, paths, keyPasswords, keychainPassword) {'],
    ['["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile]', '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychainFile]'],
  ];
  if (edits.every(([, fixed]) => source.includes(fixed))) return source;
  for (const [old] of edits) {
    if (source.split(old).length !== 2) throw new Error('Unexpected electron-builder keychain implementation; review before packaging');
  }
  return edits.reduce((text, [old, fixed]) => text.replace(old, fixed), source);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const require = createRequire(import.meta.url);
  const file = require.resolve('app-builder-lib/out/codeSign/macCodeSign.js');
  writeFileSync(file, repairKeychainPassword(readFileSync(file, 'utf8')));
  console.log('macOS keychain password repair applied; certificate password remains used for import only');
}
