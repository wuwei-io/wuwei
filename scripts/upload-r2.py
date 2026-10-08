"""Release upload to dedicated production R2 bucket. Credentials only via env.
Upload immutable artifacts, validate manifest SHA512, then publish manifests.
No retention deletion: preserve rollback/differential bases.
"""
import os, pathlib, hashlib, base64, mimetypes, sys
import boto3, yaml
from botocore.config import Config
root=pathlib.Path('release')
for key in ('R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'):
    if not os.environ.get(key): raise RuntimeError('Missing '+key)
s3=boto3.client('s3',endpoint_url='https://a2b61083a4855bf3229cd176003d3c5f.r2.cloudflarestorage.com',region_name='auto',aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],config=Config(retries={'max_attempts':5,'mode':'standard'},connect_timeout=30,read_timeout=300,request_checksum_calculation='when_required',response_checksum_validation='when_required'))
bucket='wuwei-download'
allowed={'.exe','.dmg','.appimage','.deb','.zip','.blockmap','.yml'}
files=sorted(p for p in root.iterdir() if p.is_file() and p.suffix.lower() in allowed and (p.name.startswith('wuwei') or p.name.startswith('latest')))
manifests=[p for p in files if p.name.startswith('latest') and p.suffix=='.yml']
if not manifests: raise RuntimeError('No platform update manifest')
for manifest in manifests:
    data=yaml.safe_load(manifest.read_text(encoding='utf-8'))
    for item in data['files']:
        name=item['url']
        if pathlib.Path(name).name!=name or '/' in name or '\\' in name: raise RuntimeError('Manifest must use local relative filenames')
        local=root/name
        h=hashlib.sha512()
        with local.open('rb') as f:
            for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
        if base64.b64encode(h.digest()).decode()!=item['sha512']: raise RuntimeError('SHA512 mismatch '+name)
        if local.stat().st_size!=item['size']: raise RuntimeError('Size mismatch '+name)
if '--oss-manifests-only' in sys.argv:
    # Old clients still fetch a tiny R2 manifest; all binaries and blockmaps come from OSS.
    oss='https://wuwei-repo.oss-cn-hangzhou.aliyuncs.com/updates/'
    for manifest in manifests:
        data=yaml.safe_load(manifest.read_text(encoding='utf-8'))
        for item in data['files']: item['url']=oss+item['url']
        if data.get('path'): data['path']=oss+data['path']
        for package in data.get('packages',{}).values():
            if package.get('path'): package['path']=oss+package['path']
        body=yaml.safe_dump(data,sort_keys=False).encode('utf-8')
        s3.put_object(Bucket=bucket,Key=manifest.name,Body=body,ContentType='text/yaml',CacheControl='no-store, max-age=0')
        if s3.get_object(Bucket=bucket,Key=manifest.name)['Body'].read()!=body: raise RuntimeError('Compatibility manifest verification failed '+manifest.name)
        print('[compatibility] OSS download URLs published:',manifest.name,flush=True)
    sys.exit(0)
for p in [p for p in files if p not in manifests]+manifests:
    manifest=p in manifests
    cache='no-store, max-age=0' if manifest else 'public, max-age=31536000, immutable'
    s3.upload_file(str(p),bucket,p.name,ExtraArgs={'ContentType':'text/yaml' if manifest else mimetypes.guess_type(p.name)[0] or 'application/octet-stream','CacheControl':cache})
    obj=s3.head_object(Bucket=bucket,Key=p.name)
    if obj['ContentLength']!=p.stat().st_size: raise RuntimeError('Remote size mismatch '+p.name)
    print('[r2] uploaded and size-verified:',p.name,flush=True)
