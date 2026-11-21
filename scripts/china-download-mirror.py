"""Mirror published, digest-verified installers to Hangzhou OSS; never alter update feeds."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import requests
import oss2

REPO = 'wuwei-io/wuwei'
BASE = 'https://wuwei-repo.oss-cn-hangzhou.aliyuncs.com/'

def main():
    info = json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/releases/latest'], text=True))
    tag = info['tag_name']
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag) or info['draft'] or info['prerelease']:
        raise ValueError('Expected a public stable release')
    version = tag[1:]
    wanted = {f'wuwei-{version}-setup.exe', f'wuwei-{version}.dmg', f'wuwei-{version}-arm64.dmg'}
    assets = {a['name']: a for a in info['assets']}
    if not wanted.issubset(assets):
        raise ValueError('Incomplete installers')
    bucket = oss2.Bucket(oss2.Auth(os.environ['OSS_ACCESS_KEY_ID'], os.environ['OSS_ACCESS_KEY_SECRET']), 'https://oss-cn-hangzhou.aliyuncs.com', 'wuwei-repo')
    report = {'version': version, 'files': {}}
    with tempfile.TemporaryDirectory() as directory:
        for name in sorted(wanted):
            asset = assets[name]
            expected = asset.get('digest', '')
            if not re.fullmatch(r'sha256:[a-f0-9]{64}', expected):
                raise ValueError('Missing authoritative SHA256')
            key = 'installers/' + version + '/' + name
            path = Path(directory) / name
            h = hashlib.sha256()
            with requests.get(asset['browser_download_url'], stream=True, timeout=(30, 180)) as response:
                response.raise_for_status()
                with path.open('wb') as stream:
                    for chunk in response.iter_content(1024 * 1024):
                        stream.write(chunk)
                        h.update(chunk)
            if path.stat().st_size != asset['size'] or 'sha256:' + h.hexdigest() != expected:
                raise ValueError('GitHub payload digest mismatch')
            if bucket.object_exists(key):
                head = bucket.head_object(key)
                if int(head.headers['Content-Length']) != asset['size'] or head.headers.get('x-oss-meta-sha256') != h.hexdigest():
                    raise ValueError('Refusing to overwrite conflicting mirror')
            else:
                bucket.put_object_from_file(key, str(path), headers={'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Disposition': f'attachment; filename="{name}"', 'x-oss-meta-sha256': h.hexdigest(), 'x-oss-object-acl': 'public-read'})
            # Verify public full GET, not only metadata.
            remote = hashlib.sha256()
            count = 0
            with requests.get(BASE + key, stream=True, timeout=(30, 180)) as response:
                response.raise_for_status()
                for chunk in response.iter_content(1024 * 1024):
                    remote.update(chunk)
                    count += len(chunk)
            if remote.hexdigest() != h.hexdigest() or count != asset['size']:
                raise ValueError('Public OSS mirror mismatch')
            with requests.get(BASE + key, headers={'Range': 'bytes=0-1023'}, stream=True, timeout=30) as response:
                if response.status_code != 206 or len(response.content) != 1024:
                    raise ValueError('Range download unavailable')
            report['files'][name] = {'url': BASE + key, 'sha256': h.hexdigest(), 'size': count}
            print('Verified mirror:', name, count, flush=True)
        # Recheck latest before publishing a readiness marker. Version-specific marker only.
        current = json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/releases/latest'], text=True))
        if current['tag_name'] != tag:
            raise ValueError('Latest release changed; rerun')
        bucket.put_object(f'installers/{version}/verified.json', json.dumps(report).encode(), headers={'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-oss-object-acl': 'public-read'})
        Path('mirror-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
