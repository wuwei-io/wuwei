const assert=require('node:assert/strict');
module.exports=async function({run,provider,model,catalog,settings,delay}){
  const codex={...provider('codex',false,[model('gpt-6.2-sol',false,false)]),label:'Codex subscription',hosted:false,kind:'codex'};
  const options={settings:{...settings('codex','gpt-6.2-sol'),kind:'codex',effort:'high'},modelCatalog:[...catalog,codex],connResult:{status:'red',reason:'Missing credentials / API Key / 未授权'},connDelay:120};
  for(const lang of ['zh','en'])await run('发布关键：codex-auth-refresh-current-chat-'+lang,{...options,lang,codexLoginStaleCheck:true},async f=>{
    await f.wait('!!document.querySelector(".err-auth .allow")');
    await f.click('.err-auth .allow');
    await f.wait('!document.querySelector(".err-auth") && !!document.querySelector(".conn-green")');
    await delay(250);
    assert.equal(await f.js('!!document.querySelector(".err-auth")'),false);
    assert.equal(f.state.settings.model,'gpt-6.2-sol');assert.equal(f.state.settings.effort,'high');
    await f.send();assert.deepEqual(f.state.sent,['gpt-6.2-sol']);
  });
  await run('发布关键：codex-auth-cancel-keeps-recovery',{...options,codexLoginResult:false},async f=>{
    await f.wait('!!document.querySelector(".err-auth .allow")');
    await f.click('.err-auth .allow');await delay(200);
    assert.equal(await f.js('!!document.querySelector(".err-auth")'),true);
    assert.deepEqual(f.state.sent,[]);
  });
};
