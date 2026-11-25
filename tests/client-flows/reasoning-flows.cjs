// Isolated flows for the real built renderer; no production accounts or model calls.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
module.exports=async function({run,provider,model,catalog,settings,evidence,delay}) {
  const newModels=[provider('wuwei-gpt',false,[model('gpt-6-2-sol',false,false,{category:'premium',rank:-600},{input:1519.2,output:7596}),model('gpt-6-2-astra',false,false,{category:'premium',rank:-599},{input:6076.8,output:30384})]),
    {...provider('codex',false,[model('gpt-6.2-sol',false,false,{rank:100}),model('gpt-6.2-astra',false,false,{rank:101})]),hosted:false,kind:'codex'},
    {...provider('claude-oauth',false,[model('claude-opus-5-5',false,false,{rank:-900})]),hosted:false,kind:'anthropic-oauth'}];
  const providerLabels={'wuwei-free':'免费体验（无需登录）','wuwei-mimo':'小米 MiMo','wuwei-claude':'无为托管 · Claude','wuwei-gpt':'无为托管 · GPT',codex:'Codex subscription',anthropic:'Claude API Key (Anthropic)','claude-oauth':'Claude subscription'};
  for(const p of [...catalog,...newModels]) if(providerLabels[p.id]) p.label=p.labelEn=providerLabels[p.id];
  for(const p of newModels) for(const m of p.models) if(m.id.startsWith('gpt-')) m.label=m.labelEn=m.id.replace('gpt-6-2-','GPT-6.2 ').replace('gpt-6.2-','GPT-6.2 ').replace(/\b(sol|astra)\b/g,v=>v[0].toUpperCase()+v.slice(1));
  for(const lang of ['zh','en'])await run('发布关键：reasoning-control-and-defaults-'+lang,{lang,settings:{...settings('codex','gpt-6.2-sol'),kind:'codex',effort:'medium',creds:{codex:{model:'gpt-6.2-sol'}}},modelCatalog:[...catalog,...newModels]},async f=>{
    await f.wait('!!document.querySelector(".mq-eff")');
    await f.click('.mq-eff');await f.wait('document.querySelectorAll(".mq-menu-eff .mq-item").length===5');
    await f.js('document.querySelectorAll(".mq-menu-eff .mq-item")[3].click()');
    await f.wait('!document.querySelector(".mq-menu-eff")');
    assert.equal(f.state.settings.effort,'xhigh');
    fs.writeFileSync(path.join(evidence,'reasoning-control-'+lang+'.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await f.click('.mq-select');await f.click('.model-picker footer button');await f.wait('!!document.querySelector(".settings")');
    const platforms=await f.js('[...document.querySelectorAll(".prov-name")].map(e=>e.textContent)');
    assert(platforms.includes('GPT'));assert(!platforms.some(name=>/GPT-6|gpt-6|claude-opus/.test(name)));
    fs.writeFileSync(path.join(evidence,'platforms-'+lang+'.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await f.click('[data-testid=settings-tab-reasoning]');await f.wait('!!document.querySelector(".model-reasoning-defaults")');
    const selector='.model-reasoning-defaults select[aria-label^="GPT-6.2 Sol"]';
    await f.js(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.closest('label').textContent.includes('Codex')||el.closest('label').textContent.includes('codex'))||document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(el,'high');el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await f.wait('!!document.querySelector(".model-reasoning-defaults select[value=high]") || ![...document.querySelectorAll(".model-reasoning-defaults select")].some(el=>el.disabled)');
    await delay(120);
    assert(Object.entries(f.state.settings.modelEffortDefaults||{}).some(([key,value])=>key.endsWith('gpt-6.2-sol')&&value==='high'));
    await f.js('document.querySelector(".model-reasoning-defaults").scrollIntoView({block:"center"})');
    await delay(250);
    fs.writeFileSync(path.join(evidence,'reasoning-defaults-'+lang+'.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await f.click('.set-win-btn:last-child');await f.wait('!document.querySelector(".settings")');
    await f.click('.mq-select');await f.wait('!!document.querySelector(".model-picker")');
    const keys=await f.js('[...document.querySelectorAll("[data-model-key]")].map(e=>e.dataset.modelKey)');
    assert(keys.indexOf('codex/gpt-6.2-sol')<keys.indexOf('claude-oauth/claude-opus-5-5'));
    assert(keys.includes('codex/gpt-6.2-astra'));
    fs.writeFileSync(path.join(evidence,'my-connections-gpt-first-'+lang+'.png'),(await f.state.win.webContents.capturePage()).toPNG());
    await f.click('[data-model-key="codex/gpt-6.2-astra"]');await f.wait('!document.querySelector(".model-picker")');
    assert.equal(f.state.settings.model,'gpt-6.2-astra');assert.equal(f.state.settings.effort,'medium');
    await f.click('.mq-select');await f.click('.model-picker footer button');await f.wait('!!document.querySelector(".settings")');
    await f.click('[data-testid=settings-tab-reasoning]');await f.wait('!!document.querySelector(".model-reasoning-defaults")');
    await f.js(`(()=>{const el=[...document.querySelectorAll('.model-reasoning-defaults select[aria-label^="GPT-6.2 Astra"]')].find(el=>el.closest('label').textContent.includes('Codex'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'max');el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await f.wait('document.querySelector(".model-reasoning-defaults") && ![...document.querySelectorAll(".model-reasoning-defaults select")].some(el=>el.disabled)');await delay(100);
    assert.equal(f.state.settings.modelEffortDefaults['codex/gpt-6.2-astra'],'max');
    await f.click('.set-win-btn:last-child');await f.wait('!document.querySelector(".settings")');
    for(const [modelId,level] of [['gpt-6.2-sol','high'],['gpt-6.2-astra','max']]){
      await f.click('.mq-select');await f.wait('!!document.querySelector(".model-picker")');await f.click('[data-model-key="codex/'+modelId+'"]');await f.wait('!document.querySelector(".model-picker")');
      assert.equal(f.state.settings.model,modelId);assert.equal(f.state.settings.effort,level);
    }

  });

};
