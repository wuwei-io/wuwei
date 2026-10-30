const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const ts=require('typescript'),root=path.resolve(__dirname,'..'),stage=path.join(root,'desktop/main/mobile-remote');
const source=fs.readFileSync(path.join(root,'desktop/main/index.ts'),'utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);let callback;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='setRemoteRequestHandler'){assert.equal(callback,undefined);callback=ts.transpileModule('('+n.arguments[0].getText(ast)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}ts.forEachChild(n,visit);}visit(ast);
let fixtureRevision=0;
function fixture(options={}){
 const mtimeMs=++fixtureRevision;
 let reads=0;
 const employees=[{id:'e',name:'小笨',title:'开发工程师',blurb:'软件开发'},{id:'other',name:'小美',title:'设计师'}];
 const sessions=options.metas||Array.from({length:25},(_,i)=>({id:'s'+i,title:'Chat '+i,updatedAt:100-i})).concat([{id:'employee-chat',employeeId:'e',updatedAt:120}]);
 const rooms=[{id:'dm',name:'私聊',type:'dm',members:['e','other']},{id:'group',name:'项目组',type:'group',members:['e','other']}];
 const messages=Array.from({length:45},(_,i)=>({id:'m'+i,speaker:{id:'e',name:'小笨',kind:'agent'},text:'Message '+i,steps:i===44?[{name:'read_file',input:{path:'a'},result:'ok'}]:undefined,thought:i===44?'Plan the next step':undefined}));
 const deps={require:createRequire(stage+'/out/main/index.cjs'),console,teamEnabled:()=>true,loadSettings:()=>({}),loadEmployees:()=>employees,listSessions:()=>sessions,loadRooms:()=>rooms,loadDepartments:()=>[],curProviderId:()=> 'codex',loadConfig:()=>({model:'test-model'}),loadTree:()=>[{id:'root',kind:'folder',name:'目录',children:[{id:'sop',kind:'sop',name:'发版步骤'}]}],loadSchedules:()=>[{id:'schedule',name:'Daily',employeeId:'e',trigger:{kind:'daily',hour:9}}],loadTeamConfig:()=>({}),DIR$4:stage+'/missing-fixture-data',electron:{nativeImage:{createFromDataURL:()=>({isEmpty:()=>true})}},agents:new Map(),runs:new Map(),isRoomRunning:()=>false,loadRoomMessages:()=>messages,loadMessages:()=>{reads++;return[{role:'user',content:[{type:'text',text:'Question'}]},{role:'assistant',content:[{type:'text',text:'Answer'}]}];},remoteHistoryBounds:(total,p)=>{const end=Math.max(0,total-(p.offset||0)),start=Math.max(0,end-(p.limit||20));return{start,end,total,hasMore:start>0,nextOffset:total-start};},node_fs:{statSync:()=>({size:100,mtimeMs})},node_path:require('node:path'),SDIR:stage,forceStopRoom:()=>{throw Error('Must not stop real execution');}};
 Object.assign(deps, {sopLoadTree:deps.loadTree,nativeImage:deps.electron.nativeImage,statSync:deps.node_fs.statSync,join:path.join,homedir:()=>stage,DATA_DIR_NAME:'fixture',abortRoom:deps.forceStopRoom});
 for (const [name, key] of Object.entries({'history':'mobileHistory','read':'mobileRead','paged-workspace':'mobilePagedWorkspace','team-directory':'mobileTeamDirectory','workspace':'mobileWorkspace','employee-workspace':'mobileEmployeeWorkspace','collaboration':'mobileCollaboration'})) deps[key]=require(path.join(stage,'wuwei-remote-'+name+'.cjs'));
 if(options.images){deps.loadMessages=()=>{reads++;return options.images;};deps.nativeImage={createFromDataURL:()=>({isEmpty:()=>false,getSize:()=>({width:2048,height:1024}),resize:()=>({toJPEG:()=>Buffer.from('PREVIEW')})})};}
 return{call:vm.runInNewContext(callback,deps),reads:()=>reads,messages};
}
test('actual new handler paginates session lists without reading any conversation body',async()=>{
 const f=fixture(),first=await f.call('sessions.list',{limit:10});assert.equal(first.sessions.length,10);assert.equal(first.total,25);assert.ok(first.nextCursor);
 const second=await f.call('sessions.list',{limit:10,cursor:first.nextCursor});assert.equal(second.sessions.length,10);assert.equal(second.sessions.some(s=>first.sessions.some(t=>t.id===s.id)),false);
 const same=await f.call('sessions.list',{limit:10,sinceRevision:first.revision});assert.equal(same.unchanged,true);assert.equal(same.sessions.length,0);assert.equal(f.reads(),0);
});

test('purpose metadata comes from the conversation configuration and never guesses from titles or attachments',async()=>{
 const f=fixture({metas:[{id:'text',title:'图片和视频',updatedAt:3},{id:'image',imageSku:'flux',updatedAt:2},{id:'video',conversationType:'video',updatedAt:1}]}),page=await f.call('sessions.list',{});
 assert.deepEqual(Array.from(page.sessions,s=>s.conversationType),['text','image','video']);assert.equal(f.reads(),0);
});
test('actual lazy preview route returns a bounded assistant cover with original reference and rejects foreign sessions',async()=>{
 const f=fixture({images:[{role:'user',content:[{type:'image',dataUrl:'data:image/png;base64,USER'}]},{role:'assistant',content:[{type:'image',dataUrl:'data:image/png;base64,ASSISTANT'}]}]}),preview=await f.call('sessions.preview',{sessionId:'s0'});
 assert.equal(preview.count,1);assert.ok(preview.images[0].startsWith('data:image/jpeg;base64,'));assert.ok(preview.images[0].length<35000);assert.equal((await f.call('sessions.image',{sessionId:'s0',messageId:preview.messageId,sourceKey:preview.sourceKey,imageKey:preview.imageKey})).dataUrl,'data:image/png;base64,ASSISTANT');assert.equal(f.reads(),1);await assert.rejects(()=>f.call('sessions.preview',{sessionId:'foreign'}));
});
test('reference-only user images do not become generated covers',async()=>{
 const f=fixture({images:[{role:'user',content:[{type:'image',dataUrl:'data:image/png;base64,USERONLY'}]}]}),preview=await f.call('sessions.preview',{sessionId:'s1'});assert.equal(preview.count,0);assert.equal(preview.images.length,0);
});
test('actual workspace, employee, DM, group, SOP and schedule read routes all work',async()=>{
 const f=fixture();
 const e=await f.call('workspace.page',{kind:'employees',limit:10});assert.equal(e.items[0].title,'开发工程师');assert.equal(e.items[0].name,'小笨');
 assert.equal((await f.call('workspace.page',{kind:'groups'})).items[0].id,'group');
 assert.equal((await f.call('workspace.page',{kind:'sop'})).items[0].id,'sop');
 assert.equal((await f.call('team.employee.records',{employeeId:'e',kind:'sessions'})).items[0].id,'employee-chat');
 assert.equal((await f.call('team.employee.records',{employeeId:'e',kind:'dms'})).items[0].id,'dm');
 assert.equal((await f.call('team.employee.records',{employeeId:'e',kind:'schedules'})).items[0].id,'schedule');
 assert.equal((await f.call('team.schedule.detail',{id:'schedule'})).employeeId,'e');
 for(const [method,params]of [['team.dm.messages',{roomId:'dm',employeeId:'e'}],['team.room.messages',{roomId:'group'}]]){
  const page=await f.call(method,{...params,limit:10});assert.equal(page.messages.length,10);assert.equal(page.hasMore,true);assert.equal(page.messages.at(-1).steps[0].input,undefined);assert.equal(page.messages.at(-1).hasThought,true);
  const same=await f.call(method,{...params,limit:10,sinceRevision:page.revision});assert.equal(same.unchanged,true);assert.equal(same.messages.length,0);
  const details=await f.call('team.room.message.details',{roomId:params.roomId,messageId:'m44',detailRevision:page.messages.at(-1).detailRevision});assert.equal(details.steps[0].name,'read_file');assert.equal(details.thought,'Plan the next step');
 }
 await assert.rejects(()=>f.call('team.dm.messages',{roomId:'group',employeeId:'e'}));
 await assert.rejects(()=>f.call('team.employee.records',{employeeId:'missing',kind:'sessions'}));
});
test('session history reads are cached and unchanged revisions return no messages',async()=>{
 const f=fixture(),page=await f.call('sessions.messages',{sessionId:'s0',limit:10});assert.equal(page.messages.length,2);
 const same=await f.call('sessions.messages',{sessionId:'s0',limit:10,sinceRevision:page.revision});assert.equal(same.unchanged,true);assert.equal(same.messages.length,0);assert.equal(f.reads(),1);
 await assert.rejects(()=>f.call('sessions.messages',{sessionId:'missing'}));
});

test('actual sessions.image route returns the referenced original and rejects stale or foreign references',async()=>{
 const image='data:image/png;base64,ORIGINAL',messages=[{role:'assistant',content:[{type:'image',dataUrl:image}]}],row=require(path.join(stage,'wuwei-remote-history.cjs')).project(messages,false)[0];
 const f=fixture({images:messages}),params={sessionId:'s24',messageId:row.id,sourceKey:row.sourceKey,imageKey:row.imageKeys[0]};
 assert.equal((await f.call('sessions.image',params)).dataUrl,image);
 await assert.rejects(()=>f.call('sessions.image',{...params,sessionId:'foreign-session'}));
 await assert.rejects(()=>f.call('sessions.image',{...params,sourceKey:'stale'}));
});
test('room capabilities expose correct member identity and reject cross-room controls',async()=>{
 const f=fixture(),cap=await f.call('team.room.capabilities',{roomId:'dm'});assert.equal(cap.participation,true);assert.equal(cap.memberStop,true);
 assert.equal((await f.call('team.room.executions',{roomId:'dm'})).employees.length,2);
 await assert.rejects(()=>f.call('team.room.stop-member',{roomId:'dm',employeeId:'intruder'}));
});
test('remote IDs are stable across launches and distinct for formal, test and development installs',()=>{
 const {remoteIdentity:id}=require(path.join(stage,'wuwei-remote-identity.cjs')),base={deviceId:'wd_hardware',edition:'wuwei',packaged:true,installPath:'D:\\Program Files\\wuwei\\wuwei.exe',platform:'win32'};
 assert.equal(id(base),id({...base,installPath:'d:/program files/wuwei/wuwei.exe'}));
 assert.notEqual(id(base),id({...base,edition:'test'}));assert.notEqual(id(base),id({...base,packaged:false,installPath:'E:/3.git/wuwei'}));assert.notEqual(id(base),id({...base,deviceId:'wd_another'}));
 const relay=fs.readFileSync(path.join(root,'desktop/main/relay-client.ts'),'utf8');
 assert.ok(relay.includes('deviceId: getRemoteDeviceId()'));
 assert.ok(relay.includes('deviceId: getDeviceId(), edition: EDITION'));
 assert.ok(relay.includes('protocolVersion: 2'));
});
test('production bundle contains the mobile protocol adapters without external helper paths', {skip: !fs.existsSync(path.join(root,'out/main/index.cjs'))}, ()=>{
 const bundle=fs.readFileSync(path.join(root,'out/main/index.cjs'),'utf8');
 for(const method of ['workspace.page','team.employee.records','team.dm.messages','team.room.capabilities'])assert.ok(bundle.includes(method),method);
 assert.equal(bundle.includes('require("../../wuwei-remote-'),false);
});

