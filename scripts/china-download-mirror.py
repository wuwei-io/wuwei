"""Mirror verified release assets and publish a separate domestic update feed.

GitHub and legacy OSS/R2 feeds remain unchanged. Feed publication happens only
after every Windows/macOS update payload is independently verified publicly.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import requests
import oss2
import yaml

REPO = 'wuwei-io/wuwei'
BASE = 'https://wuwei-repo.oss-cn-hangzhou.aliyuncs.com/'


def mirror_manifest(data, version, assets):
    if str(data.get('version')) != version or not data.get('files'):
        raise ValueError('Wrong or empty update manifest')
    data = json.loads(json.dumps(data))
    def rewrite(value):
        prefix = f'https://github.com/{REPO}/releases/download/v{version}/'
        if not value.startswith(prefix):
            raise ValueError('Unexpected update payload origin')
        name = value[len(prefix):]
        if '/' in name or name not in assets:
            raise ValueError('Missing or unsafe update payload')
        return BASE + f'installers/{version}/{name}'
    for item in data['files']:
        original = item['url']
        item['url'] = rewrite(original)
        entry = assets[original.rsplit('/', 1)[-1]]
        if item.get('size') != entry['size'] or item.get('sha512') != entry['sha512']:
            raise ValueError('Update payload SHA512/length mismatch')
    data['path'] = rewrite(data['path'])
    return data

def main():
    info = json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/releases/latest'], text=True))
    tag = info['tag_name']
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag) or info['draft'] or info['prerelease']:
        raise ValueError('Expected a public stable release')
    version = tag[1:]
    installers = {f'wuwei-{version}-setup.exe', f'wuwei-{version}.dmg', f'wuwei-{version}-arm64.dmg'}
    wanted = installers | {f'wuwei-{version}-mac.zip', f'wuwei-{version}-arm64-mac.zip'}
    assets = {a['name']: a for a in info['assets']}
    if not (wanted | {'latest.yml', 'latest-mac.yml'}).issubset(assets):
        raise ValueError('Incomplete Windows/macOS release')
    wanted |= {name for name in assets if name.endswith('.blockmap') and name.removesuffix('.blockmap') in wanted}
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
            h512 = hashlib.sha512()
            with requests.get(asset['browser_download_url'], stream=True, timeout=(30, 180)) as response:
                response.raise_for_status()
                with path.open('wb') as stream:
                    for chunk in response.iter_content(1024 * 1024):
                        stream.write(chunk)
                        h.update(chunk)
                        h512.update(chunk)
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
            report['files'][name] = {'url': BASE + key, 'sha256': h.hexdigest(), 'sha512': base64.b64encode(h512.digest()).decode(), 'size': count}
            print('Verified mirror:', name, count, flush=True)
        manifests = {}
        for name in ('latest.yml', 'latest-mac.yml'):
            asset = assets[name]
            response = requests.get(asset['browser_download_url'], timeout=30)
            response.raise_for_status()
            if 'sha256:' + hashlib.sha256(response.content).hexdigest() != asset.get('digest'):
                raise ValueError('Manifest GitHub digest mismatch')
            manifests[name] = yaml.safe_dump(mirror_manifest(yaml.safe_load(response.content), version, report['files']), sort_keys=False).encode()
        # Recheck latest before publishing readiness and mutable feed pointers.
        current = json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/releases/latest'], text=True))
        if current['tag_name'] != tag:
            raise ValueError('Latest release changed; rerun')
        headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-oss-object-acl': 'public-read'}
        # Preserve the existing website's three-installer readiness contract.
        website_report = {**report, 'files': {name: report['files'][name] for name in sorted(installers)}}
        bucket.put_object(f'installers/{version}/verified.json', json.dumps(website_report).encode(), headers=headers)
        for name, body in manifests.items():
            feed_headers = {**headers, 'Content-Type': 'application/yaml'}
            bucket.put_object(f'updates-cn/{version}/{name}', body, headers=feed_headers)
            bucket.put_object(f'updates-cn/{name}', body, headers=feed_headers)
            response = requests.get(BASE + f'updates-cn/{name}', timeout=30)
            response.raise_for_status()
            if response.content != body:
                raise ValueError('Public update feed readback mismatch')
        report['updateFeeds'] = {name: BASE + f'updates-cn/{name}' for name in manifests}
        Path('mirror-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
