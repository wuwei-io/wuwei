import base64
import hashlib
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('mirror', Path(__file__).parents[1] / 'scripts/china-download-mirror.py')
mirror = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror)


class MirrorTest(unittest.TestCase):
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
