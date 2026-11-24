"""Mirror verified release assets and publish a separate domestic update feed.

GitHub and legacy OSS/R2 feeds remain unchanged. Feed publication happens only
after the corresponding platform's update payloads are verified publicly.
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


def asset_order(names):
    def key(name):
        base = name.removesuffix('.blockmap')
        priority = 0 if base.endswith('.exe') else 1 if base.endswith('.dmg') else 2
        return priority, base, name.endswith('.blockmap')
    return sorted(names, key=key)


def mirror_source(bucket, key, asset):
    exists = bucket.object_exists(key)
    if exists:
        head = bucket.head_object(key)
        if int(head.headers['Content-Length']) != asset['size'] or head.headers.get('x-oss-meta-sha256') != asset['digest'].removeprefix('sha256:'):
            raise ValueError('Refusing to overwrite conflicting mirror')
    return exists, BASE + key if exists else asset['browser_download_url']


def ensure_current(tag):
    current = json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/releases/latest'], text=True))
    if current['tag_name'] != tag:
        raise ValueError('Latest release changed; rerun')


def publish_manifest(bucket, name, info, assets, report):
    asset = assets[name]
    response = requests.get(asset['browser_download_url'], timeout=30)
    response.raise_for_status()
    if 'sha256:' + hashlib.sha256(response.content).hexdigest() != asset.get('digest'):
        raise ValueError('Manifest GitHub digest mismatch')
    version = report['version']
    body = yaml.safe_dump(mirror_manifest(yaml.safe_load(response.content), version, report['files']), sort_keys=False).encode()
    ensure_current(info['tag_name'])
    headers = {'Content-Type': 'application/yaml', 'Cache-Control': 'no-cache', 'x-oss-object-acl': 'public-read'}
    bucket.put_object(f'updates-cn/{version}/{name}', body, headers=headers)
    bucket.put_object(f'updates-cn/{name}', body, headers=headers)
    response = requests.get(BASE + f'updates-cn/{name}', timeout=30)
    response.raise_for_status()
    if response.content != body:
        raise ValueError('Public update feed readback mismatch')
    report['updateFeeds'][name] = BASE + f'updates-cn/{name}'
    print('Published platform feed:', name, version, flush=True)


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
    report = {'version': version, 'files': {}, 'updateFeeds': {}}
    website_ready = False
    windows_ready = {f'wuwei-{version}-setup.exe'}
    if f'wuwei-{version}-setup.exe.blockmap' in wanted:
        windows_ready.add(f'wuwei-{version}-setup.exe.blockmap')
    with tempfile.TemporaryDirectory() as directory:
        for name in asset_order(wanted):
            asset = assets[name]
            expected = asset.get('digest', '')
            if not re.fullmatch(r'sha256:[a-f0-9]{64}', expected):
                raise ValueError('Missing authoritative SHA256')
            key = 'installers/' + version + '/' + name
            exists, source = mirror_source(bucket, key, asset)
            print('Verifying existing OSS file:' if exists else 'Fetching GitHub asset:', name, flush=True)
            path = Path(directory) / name
            h = hashlib.sha256()
            h512 = hashlib.sha512()
            with requests.get(source, stream=True, timeout=(30, 180)) as response:
                response.raise_for_status()
                with path.open('wb') as stream:
                    for chunk in response.iter_content(1024 * 1024):
                        stream.write(chunk)
                        h.update(chunk)
                        h512.update(chunk)
            if path.stat().st_size != asset['size'] or 'sha256:' + h.hexdigest() != expected:
                raise ValueError('GitHub payload digest mismatch')
            if not exists:
                bucket.put_object_from_file(key, str(path), headers={'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Disposition': f'attachment; filename="{name}"', 'x-oss-meta-sha256': h.hexdigest(), 'x-oss-object-acl': 'public-read'})
            # Existing files were already verified by a full public OSS GET.
            count = path.stat().st_size
            if not exists:
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
            if windows_ready.issubset(report['files']) and 'latest.yml' not in report['updateFeeds']:
                publish_manifest(bucket, 'latest.yml', info, assets, report)
            if not website_ready and installers.issubset(report['files']):
                ensure_current(tag)
                headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-oss-object-acl': 'public-read'}
                website_report = {'version': version, 'files': {n: report['files'][n] for n in sorted(installers)}}
                bucket.put_object(f'installers/{version}/verified.json', json.dumps(website_report).encode(), headers=headers)
                website_ready = True
                print('Published existing website installer readiness:', version, flush=True)
        publish_manifest(bucket, 'latest-mac.yml', info, assets, report)
        Path('mirror-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
