import base64
import hashlib
import importlib.util
from pathlib import Path
import unittest
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('mirror', Path(__file__).parents[1] / 'scripts/china-download-mirror.py')
mirror = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror)


class MirrorTest(unittest.TestCase):
    def test_windows_and_website_installers_precede_mac_update_zips(self):
        names = ['wuwei-1.7.81-arm64-mac.zip', 'wuwei-1.7.81.dmg', 'wuwei-1.7.81-setup.exe.blockmap', 'wuwei-1.7.81-setup.exe', 'wuwei-1.7.81-arm64.dmg']
        ordered = mirror.asset_order(names)
        self.assertEqual(ordered[:2], ['wuwei-1.7.81-setup.exe', 'wuwei-1.7.81-setup.exe.blockmap'])
        self.assertEqual(ordered[-1], 'wuwei-1.7.81-arm64-mac.zip')

    def test_existing_website_file_reuses_same_public_oss_object(self):
        asset = {'size': 100, 'digest': 'sha256:'+'a'*64, 'browser_download_url':'https://github.com/payload.exe'}
        bucket = SimpleNamespace(object_exists=lambda key:True, head_object=lambda key:SimpleNamespace(headers={'Content-Length':'100','x-oss-meta-sha256':'a'*64}))
        exists, url = mirror.mirror_source(bucket, 'installers/1.7.81/payload.exe', asset)
        self.assertTrue(exists)
        self.assertEqual(url, mirror.BASE+'installers/1.7.81/payload.exe')

    def test_missing_object_is_fetched_from_github(self):
        asset = {'browser_download_url':'https://github.com/payload.exe'}
        bucket = SimpleNamespace(object_exists=lambda key:False)
        self.assertEqual(mirror.mirror_source(bucket,'missing',asset),(False,asset['browser_download_url']))

    def test_existing_conflicting_object_is_not_replaced(self):
        asset = {'size':100,'digest':'sha256:'+'a'*64}
        bucket = SimpleNamespace(object_exists=lambda key:True,head_object=lambda key:SimpleNamespace(headers={'Content-Length':'100','x-oss-meta-sha256':'b'*64}))
        with self.assertRaises(ValueError): mirror.mirror_source(bucket,'conflict',asset)

    def fixture(self):
        sha512 = base64.b64encode(hashlib.sha512(b'signed payload').digest()).decode()
        name = 'wuwei-1.7.81-setup.exe'
        url = f'https://github.com/wuwei-io/wuwei/releases/download/v1.7.81/{name}'
        data = {'version': '1.7.81', 'files': [{'url': url, 'size': 14, 'sha512': sha512}], 'path': url, 'sha512': sha512}
        assets = {name: {'size': 14, 'sha512': sha512}}
        return data, assets

    def test_rewrite_keeps_signed_payload_hashes(self):
        data, assets = self.fixture()
        result = mirror.mirror_manifest(data, '1.7.81', assets)
        self.assertEqual(result['files'][0]['sha512'], data['files'][0]['sha512'])
        self.assertEqual(result['path'], mirror.BASE + 'installers/1.7.81/wuwei-1.7.81-setup.exe')
        self.assertTrue(data['path'].startswith('https://github.com/'))

    def test_wrong_version_rejected(self):
        data, assets = self.fixture()
        with self.assertRaises(ValueError): mirror.mirror_manifest(data, '1.7.82', assets)

    def test_unverified_payload_rejected(self):
        data, assets = self.fixture()
        for field, value in [('size', 100), ('sha512', 'wrong')]:
            original = data['files'][0][field]
            data['files'][0][field] = value
            with self.assertRaises(ValueError): mirror.mirror_manifest(data, '1.7.81', assets)
            data['files'][0][field] = original

    def test_foreign_origin_and_missing_files_rejected(self):
        data, assets = self.fixture()
        data['files'][0]['url'] = 'https://example.com/payload.exe'
        with self.assertRaises(ValueError): mirror.mirror_manifest(data, '1.7.81', assets)
        data, _ = self.fixture()
        with self.assertRaises(ValueError): mirror.mirror_manifest(data, '1.7.81', {})


if __name__ == '__main__': unittest.main()
