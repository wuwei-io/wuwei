import base64
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml

spec = importlib.util.spec_from_file_location('github_release', Path(__file__).parents[1] / 'scripts/github-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.tag = 'v1.2.3'
        groups = {
            'latest.yml': ['wuwei-1.2.3-setup.exe'],
            'latest-mac.yml': ['wuwei-1.2.3-mac.zip', 'wuwei-1.2.3-arm64-mac.zip', 'wuwei-1.2.3.dmg', 'wuwei-1.2.3-arm64.dmg'],
            'latest-linux.yml': ['wuwei-1.2.3.AppImage'],
        }
        for manifest, names in groups.items():
            items = []
            for name in names:
                body = ('signed fixture ' + name).encode()
                (self.root / name).write_bytes(body)
                items.append({'url': name, 'size': len(body), 'sha512': base64.b64encode(hashlib.sha512(body).digest()).decode()})
            data = {'version': '1.2.3', 'files': items, 'path': names[0], 'sha512': items[0]['sha512']}
            (self.root / manifest).write_text(yaml.safe_dump(data), encoding='utf-8')

    def test_absolute_tagged_urls_preserve_hashes_and_binaries(self):
        before = {p.name: p.read_bytes() for p in self.root.iterdir() if p.suffix != '.yml'}
        original = yaml.safe_load((self.root / 'latest.yml').read_text())
        release.prepare(self.root, self.tag)
        data = yaml.safe_load((self.root / 'latest.yml').read_text())
        self.assertEqual(data['files'][0]['url'], release.asset_base(self.tag) + 'wuwei-1.2.3-setup.exe')
        self.assertEqual(data['files'][0]['sha512'], original['files'][0]['sha512'])
        self.assertEqual(data['path'], data['files'][0]['url'])
        self.assertEqual(before, {name: (self.root / name).read_bytes() for name in before})
        release.prepare(self.root, self.tag)  # safe retry of an already converted manifest

    def test_corrupt_signed_file_never_reaches_upload(self):
        (self.root / 'wuwei-1.2.3-setup.exe').write_bytes(b'tampered')
        with patch.object(release, 'gh') as gh, self.assertRaises(ValueError):
            release.publish(self.root, self.tag)
        gh.assert_not_called()

    def test_missing_mac_architecture_is_rejected(self):
        path = self.root / 'latest-mac.yml'
        data = yaml.safe_load(path.read_text())
        data['files'] = data['files'][1:]
        path.write_text(yaml.safe_dump(data))
        with self.assertRaisesRegex(ValueError, 'Incomplete platform'):
            release.prepare(self.root, self.tag)

    def test_mixed_platform_versions_are_rejected(self):
        path = self.root / 'latest-linux.yml'
        path.write_text(path.read_text().replace('version: 1.2.3', 'version: 1.2.2'))
        with self.assertRaisesRegex(ValueError, 'Wrong or empty'):
            release.prepare(self.root, self.tag)

    def test_missing_platform_is_rejected(self):
        (self.root / 'latest-linux.yml').unlink()
        with self.assertRaises(FileNotFoundError):
            release.prepare(self.root, self.tag)

    def test_untrusted_asset_paths_are_rejected(self):
        for value in ('../wuwei-1.2.3-setup.exe', 'https://evil.example/wuwei-1.2.3-setup.exe', 'wuwei-1.2.3-setup.exe?token=x'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                release.filename(value)

    def test_windows_mac_release_requires_both_mac_architectures_without_linux(self):
        (self.root / 'latest-linux.yml').unlink()
        (self.root / 'wuwei-1.2.3.AppImage').unlink()
        files = release.prepare(self.root, self.tag, ('windows', 'macos'))
        self.assertEqual({p.name for p in files if p.suffix == '.yml'}, {'latest.yml', 'latest-mac.yml'})
        (self.root / 'wuwei-1.2.3-arm64-mac.zip').unlink()
        with self.assertRaises(FileNotFoundError):
            release.prepare(self.root, self.tag, ('windows', 'macos'))

    def test_linux_feed_preserves_previous_version_urls_and_bytes(self):
        from types import SimpleNamespace
        old = 'https://github.com/wuwei-io/wuwei/releases/download/v1.2.2/wuwei-1.2.2.AppImage'
        body = yaml.safe_dump({'version': '1.2.2', 'files': [{'url': old, 'size': 42, 'sha512': 'original'}], 'path': old}).encode()
        response = SimpleNamespace(content=body, raise_for_status=lambda: None)
        with patch.object(release.requests, 'get', return_value=response), patch.object(release, 'public_head') as head:
            path = release.preserve_linux_feed(self.root, self.tag)
        self.assertEqual(path.read_bytes(), body)
        head.assert_called_once_with(old, 42)
        response.content = body.replace(b'v1.2.2/', b'v1.2.3/')
        with patch.object(release.requests, 'get', return_value=response), self.assertRaisesRegex(ValueError, 'untrusted'):
            release.preserve_linux_feed(self.root, self.tag)

    def test_compatibility_selection_leaves_linux_untouched(self):
        self.assertEqual(release.selected_manifests(('windows', 'macos')), ('latest.yml', 'latest-mac.yml'))
        for invalid in ((), ('windows', 'windows'), ('unknown',)):
            with self.assertRaises(ValueError):
                release.selected_manifests(invalid)

    def test_stable_version_required(self):
        for value in ('v1.2.3-beta', 'not-a-tag', '1.2.3/anything'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                release.version_tuple(value)

    def test_legacy_feeds_are_only_changed_after_publication_validation(self):
        with patch.object(release, 'publish', side_effect=RuntimeError('public asset unavailable')), patch.object(release, 'compatibility') as compat, patch('sys.argv', ['github-release.py', 'publish', '--tag', self.tag, '--directory', str(self.root)]):
            with self.assertRaises(RuntimeError):
                release.main()
        compat.assert_not_called()


if __name__ == '__main__':
    unittest.main()
