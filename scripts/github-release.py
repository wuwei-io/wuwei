"""Publish verified binaries to GitHub; legacy stores receive only tiny manifests.

No installer is uploaded to OSS/R2. Existing binaries are retained for rollback.
The public release must be complete before any legacy update feed is changed.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

import requests
import yaml

REPO = 'wuwei-io/wuwei'
OSS_BASE = 'https://wuwei-repo.oss-cn-hangzhou.aliyuncs.com/updates/'
MANIFESTS = ('latest.yml', 'latest-mac.yml', 'latest-linux.yml')
SUFFIXES = {'.exe', '.dmg', '.zip', '.blockmap', '.appimage', '.deb'}


def version_tuple(tag):
    match = re.fullmatch(r'v?(\d+)\.(\d+)\.(\d+)', tag)
    if not match:
        raise ValueError('A stable vX.Y.Z release is required')
    return tuple(map(int, match.groups()))


def asset_base(tag):
    version_tuple(tag)
    return f'https://github.com/{REPO}/releases/download/{tag}/'


def filename(value):
    # Backfill accepts either original relative names or already migrated URLs.
    name = value.rsplit('/', 1)[-1]
    if not re.fullmatch(r'wuwei[-_][A-Za-z0-9_.-]+', name):
        raise ValueError('Unsafe release asset name')
    if '/' not in value and name != value:
        raise ValueError('Unsafe release asset name')
    if '/' in value and not (value.startswith(OSS_BASE) or value.startswith(f'https://github.com/{REPO}/releases/download/')):
        raise ValueError('Untrusted release URL')
    return name


def digest(path, algorithm='sha512'):
    h = hashlib.new(algorithm)
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.digest()


def load_manifests(root, tag):
    version = tag.removeprefix('v')
    version_tuple(tag)
    result = {}
    for name in MANIFESTS:
        path = root / name
        data = yaml.safe_load(path.read_text(encoding='utf-8'))
        if str(data.get('version')) != version or not data.get('files'):
            raise ValueError(f'Wrong or empty platform manifest: {name}')
        result[name] = data
    # Prevent publishing a release with a missing platform/architecture.
    required = {
        'latest.yml': {f'wuwei-{version}-setup.exe'},
        'latest-mac.yml': {f'wuwei-{version}-mac.zip', f'wuwei-{version}-arm64-mac.zip', f'wuwei-{version}.dmg', f'wuwei-{version}-arm64.dmg'},
        'latest-linux.yml': {f'wuwei-{version}.AppImage'},
    }
    for name, expected in required.items():
        if not expected.issubset({filename(item['url']) for item in result[name]['files']}):
            raise ValueError(f'Incomplete platform manifest: {name}')
    return result


def prepare(root, tag):
    manifests = load_manifests(root, tag)
    base = asset_base(tag)
    for name, data in manifests.items():
        for item in data['files']:
            local = root / filename(item['url'])
            if local.stat().st_size != item['size'] or base64.b64encode(digest(local)).decode() != item['sha512']:
                raise ValueError(f'Artifact size/SHA512 mismatch: {local.name}')
            item['url'] = base + local.name
        if data.get('path'):
            data['path'] = base + filename(data['path'])
        for package in data.get('packages', {}).values():
            local = root / filename(package['path'])
            if not local.is_file():
                raise ValueError('Missing package artifact')
            if package.get('sha512') and base64.b64encode(digest(local)).decode() != package['sha512']:
                raise ValueError('Package SHA512 mismatch')
            package['path'] = base + local.name
        (root / name).write_text(yaml.safe_dump(data, sort_keys=False), encoding='utf-8')
    files = sorted(p for p in root.iterdir() if p.is_file() and
                   (p.name in MANIFESTS or (p.name.startswith('wuwei') and p.suffix.lower() in SUFFIXES)))
    if any(p.stat().st_size >= 2 * 1024 ** 3 for p in files):
        raise ValueError('GitHub release asset must be under 2 GiB')
    return files


def gh(*args, allow_failure=False):
    result = subprocess.run(['gh', *args, '--repo', REPO], capture_output=True, text=True, encoding='utf-8')
    if result.returncode and not allow_failure:
        # Do not print credential-bearing request objects or redirected URLs.
        raise RuntimeError(f'GitHub command failed: {args[0]} {args[1]}')
    return result


def release_info(tag):
    result = gh('release', 'view', tag, '--json', 'tagName,isDraft,assets', allow_failure=True)
    return json.loads(result.stdout) if result.returncode == 0 else None


def public_head(url, size):
    for attempt in range(6):
        try:
            response = requests.head(url, allow_redirects=True, timeout=45)
            if response.status_code == 200 and int(response.headers.get('Content-Length', -1)) == size:
                return
        except requests.RequestException:
            pass
        time.sleep(min(2 ** attempt, 15))
    raise RuntimeError(f'Anonymous download validation failed: {url.rsplit("/", 1)[-1]}')


def publish(root, tag):
    files = prepare(root, tag)
    latest = gh('release', 'view', '--json', 'tagName', allow_failure=True)
    if latest.returncode == 0 and version_tuple(json.loads(latest.stdout)['tagName']) > version_tuple(tag):
        raise ValueError('Refusing to replace a newer stable release')
    current = release_info(tag)
    if current is None:
        notes = root / 'release-notes.txt'
        notes.write_text('下载与自动更新体验优化。\nImproved downloads and automatic updates.', encoding='utf-8')
        gh('release', 'create', tag, '--draft', '--verify-tag', '--title', f'无为 {tag}', '--notes-file', str(notes))
        current = release_info(tag)
    assets = {item['name']: item for item in current['assets']}
    for path in files:
        existing = assets.get(path.name)
        if existing and path.name not in MANIFESTS:
            expected = 'sha256:' + digest(path, 'sha256').hex()
            if existing['size'] != path.stat().st_size or existing.get('digest') != expected:
                raise ValueError(f'Refusing to overwrite a different existing binary: {path.name}')
            continue
        gh('release', 'upload', tag, str(path), '--clobber')
        print('[github] uploaded:', path.name, flush=True)
    uploaded = {item['name']: item for item in release_info(tag)['assets']}
    for path in files:
        item = uploaded.get(path.name)
        if not item or item['size'] != path.stat().st_size or item.get('digest') != 'sha256:' + digest(path, 'sha256').hex():
            raise ValueError(f'GitHub upload digest mismatch: {path.name}')
    # A draft never becomes latest until all three signed platform builds exist.
    gh('release', 'edit', tag, '--draft=false', '--latest')
    for path in files:
        public_head(asset_base(tag) + path.name, path.stat().st_size)
    print('[github] all assets anonymously accessible and size/digest verified', flush=True)


def compatibility(root, tag, backup_root):
    import oss2
    import boto3
    from botocore.config import Config
    required = ('OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY')
    if any(not os.environ.get(key) for key in required):
        raise RuntimeError('Missing legacy manifest credentials')
    bucket = oss2.Bucket(oss2.Auth(os.environ[required[0]], os.environ[required[1]]),
                        'https://oss-cn-hangzhou.aliyuncs.com', 'wuwei-repo')
    r2 = boto3.client('s3', endpoint_url='https://a2b61083a4855bf3229cd176003d3c5f.r2.cloudflarestorage.com',
                     region_name='auto', aws_access_key_id=os.environ[required[2]], aws_secret_access_key=os.environ[required[3]],
                     config=Config(retries={'max_attempts': 4, 'mode': 'standard'}, request_checksum_calculation='when_required', response_checksum_validation='when_required'))
    stores = {
        'oss': (lambda name: bucket.get_object('updates/' + name).read(),
                lambda name, body: bucket.put_object('updates/' + name, body, headers={'Content-Type': 'text/yaml', 'Cache-Control': 'no-store, max-age=0'})),
        'r2': (lambda name: r2.get_object(Bucket='wuwei-download', Key=name)['Body'].read(),
               lambda name, body: r2.put_object(Bucket='wuwei-download', Key=name, Body=body, ContentType='text/yaml', CacheControl='no-store, max-age=0')),
    }
    bodies = {}
    for name in MANIFESTS:
        body = (root / name).read_bytes()
        data = yaml.safe_load(body)
        if len(body) > 256 * 1024 or str(data.get('version')) != tag.removeprefix('v'):
            raise ValueError('Unsafe compatibility manifest')
        for item in data['files']:
            if item['url'] != asset_base(tag) + filename(item['url']):
                raise ValueError('Compatibility manifest must point to tagged GitHub assets')
            public_head(item['url'], item['size'])
        bodies[name] = body
    backups = {}
    backup_root.mkdir(parents=True, exist_ok=True)
    for label, (read, _) in stores.items():
        for name in MANIFESTS:
            old = read(name)
            if version_tuple(str(yaml.safe_load(old)['version'])) > version_tuple(tag):
                raise ValueError('Refusing to downgrade a legacy feed')
            backups[label, name] = old
            (backup_root / f'{label}-{name}').write_bytes(old)
    changed = []
    try:
        for label, (read, write) in stores.items():
            for name, body in bodies.items():
                changed.append((label, name))
                write(name, body)
                if read(name) != body:
                    raise RuntimeError('Legacy manifest read-back mismatch')
                print(f'[compatibility] {label}/{name}: GitHub URLs verified', flush=True)
    except Exception:
        for label, name in reversed(changed):
            read, write = stores[label]
            if read(name) == bodies[name]:
                write(name, backups[label, name])
        raise


def backfill(root, tag):
    """Fetch existing public binaries from GitHub; fetch only missing ZIPs/maps from OSS."""
    root.mkdir(parents=True, exist_ok=True)
    for name in MANIFESTS:
        response = requests.get(OSS_BASE + name, timeout=45)
        response.raise_for_status()
        (root / name).write_bytes(response.content)
    manifests = load_manifests(root, tag)
    current = release_info(tag)
    if not current or current['isDraft']:
        raise ValueError('Backfill requires an existing public release')
    assets = {item['name']: item for item in current['assets']}
    wanted = {filename(item['url']) for data in manifests.values() for item in data['files']}
    wanted.update(name for name in assets if name.startswith('wuwei') and Path(name).suffix.lower() in SUFFIXES)
    for name in list(wanted):
        if Path(name).suffix in ('.exe', '.zip'):
            map_name = name + '.blockmap'
            if requests.head(OSS_BASE + map_name, timeout=30).status_code == 200:
                wanted.add(map_name)
    for name in sorted(wanted):
        path = root / name
        source = asset_base(tag) + name if name in assets else OSS_BASE + name
        with requests.get(source, stream=True, timeout=(30, 180)) as response:
            response.raise_for_status()
            with path.open('wb') as stream:
                for chunk in response.iter_content(1024 * 1024):
                    stream.write(chunk)
        print('[backfill] fetched:', name, path.stat().st_size, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=('publish', 'backfill', 'prepare'))
    parser.add_argument('--tag', required=True)
    parser.add_argument('--directory', type=Path, default=Path('release'))
    args = parser.parse_args()
    version_tuple(args.tag)
    if args.command == 'backfill':
        backfill(args.directory, args.tag)
    if args.command == 'prepare':
        prepare(args.directory, args.tag)
        return
    publish(args.directory, args.tag)
    compatibility(args.directory, args.tag, Path('compatibility-backup'))


if __name__ == '__main__':
    main()
