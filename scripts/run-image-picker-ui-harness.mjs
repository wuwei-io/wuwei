// Actual Electron main/preload/React/IPC; synthetic HTTP responses, no production orders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const repo=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'wuwei-image-picker-ui-'));
const profile=path.join(root,'profile'),dir=path.join(profile,'.wuwei-test');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'auth.json'),JSON.stringify({access_token:'image-ui-fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600}));
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({kind:'openai',providerId:'wuwei-free',model:'glm-4.7-flash',apiKey:'image-ui-fixture',baseUrl:'https://gw.wuweiai.io/api/gateway/v1',imageMode:true,imageSku:'openai-gpt-image-1-low',app:{lang:'zh',teamEnabled:false,telemetry:false,brainEnabled:false,claudeAutoRefresh:false,resumeDetect:false,remoteEnabled:false},permissions:{mode:'auto'}}));
const evidence=path.join(repo,'docs/verification/image-picker-20261007');fs.mkdirSync(evidence,{recursive:true});
const env={...process.env,USERPROFILE:profile,WUWEI_EDITION:'test',IMAGE_PICKER_ROOT:root,IMAGE_PICKER_REPO:repo,IMAGE_PICKER_EVIDENCE:evidence};
for(const key of Object.keys(env))if(/API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CODEX_HOME|CLAUDE_CONFIG|MINICC_|ANTHROPIC_|EXPO_TOKEN|WUWEI_SITE_URL|WUWEI_DATA_DIR_NAME|ELECTRON_RUN_AS_NODE|ELECTRON_RENDERER_URL/i.test(key))delete env[key];
const result=spawnSync(path.join(repo,'node_modules/electron/dist/electron.exe'),[path.join(repo,'scripts/image-picker-ui-electron.cjs')],{cwd:root,env,encoding:'utf8',timeout:120000,windowsHide:true});
const log=(result.stdout||'')+(result.stderr||'')+'\nEXIT='+result.status+'\n';
fs.writeFileSync(path.join(evidence,'desktop-ui.txt'),log);console.log(log);
if(result.status!==0)process.exit(1);
