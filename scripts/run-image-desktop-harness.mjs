// Actual application main/preload/React/IPC with a dedicated production fixture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
if(!process.argv.includes('--production-fixture'))throw Error('Explicit fixture mode required');
const repo=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'wuwei-image-desktop-'));
const profile=path.join(root,'profile'),dir=path.join(profile,'.wuwei-test');fs.mkdirSync(dir,{recursive:true});
const ssh=spawnSync('ssh',['-o','ServerAliveInterval=15','-o','ServerAliveCountMax=4','-i','C:/Users/Administrator/.ssh/wuwei_gw_deploy','root@47.85.61.227','cat /opt/pg-backup/image-live-20261006/desktop-test-account.json'],{encoding:'utf8',windowsHide:true});
if(ssh.status!==0)throw Error('Dedicated fixture unavailable');
const {owner}=JSON.parse(ssh.stdout);if(!owner.token || !owner.refresh)throw Error('Fixture closed');
fs.writeFileSync(path.join(dir,'auth.json'),JSON.stringify({access_token:owner.token,refresh_token:owner.refresh,expires_at:owner.expires}),{mode:0o600});
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({kind:'openai',providerId:'wuwei-free',model:'glm-4.7-flash',apiKey:owner.token,baseUrl:'https://gw.wuweiai.io/api/gateway/v1',app:{lang:'en',teamEnabled:true,telemetry:false,brainEnabled:false,claudeAutoRefresh:false,resumeDetect:false,remoteEnabled:false},permissions:{mode:'auto'}}));
const evidence=path.join(repo,'docs/verification/image-team-20261006');
const env={...process.env,USERPROFILE:profile,WUWEI_EDITION:'test',IMAGE_UI_ROOT:root,IMAGE_UI_REPO:repo,IMAGE_UI_EVIDENCE:evidence,IMAGE_UI_SKU:process.argv.find(a=>a.startsWith('--sku='))?.slice(6)||'openai-gpt-image-1-low'};
if(process.argv.includes('--cancel-only'))env.IMAGE_UI_CANCEL_ONLY='1';
for(const k of Object.keys(env))if(/API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CODEX_HOME|CLAUDE_CONFIG|MINICC_|ANTHROPIC_|EXPO_TOKEN|WUWEI_SITE_URL|WUWEI_DATA_DIR_NAME|ELECTRON_RUN_AS_NODE|ELECTRON_RENDERER_URL/i.test(k))delete env[k];
const run=spawnSync(path.join(repo,'node_modules/electron/dist/electron.exe'),[path.join(repo,'scripts/image-desktop-electron.cjs')],{cwd:repo,env,encoding:'utf8',timeout:480000,windowsHide:true,stdio:['ignore','inherit','inherit']});
// App logs contain no credentials, but do not persist private environment/config.
console.log((run.stdout||'')+(run.stderr||'')+'\nEXIT='+run.status);
fs.writeFileSync(path.join(dir,'auth.json'),'{}');
if(run.status!==0)process.exit(1);
