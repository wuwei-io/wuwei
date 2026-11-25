import {loadConfig} from '../src/config.ts';
import {makeProvider} from '../src/agent/provider.ts';
for(const model of ['gpt-6.2-sol','gpt-6.2-astra']) {
  process.env.MINICC_PROVIDER='codex';process.env.MINICC_MODEL=model;process.env.MINICC_EFFORT='low';
  const cfg=loadConfig();
  if(!cfg.codexToken||!cfg.codexAccountId){console.log(JSON.stringify({model,available:false,reason:'not_authenticated'}));continue;}
  const start=Date.now();
  try {
    const value=await makeProvider(cfg).complete('Call verify_connection with value READY.',[{role:'user',content:[{type:'text',text:'Verify this model integration now.'}]}],[{name:'verify_connection',description:'Verify model tool support.',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value']}}],{signal:AbortSignal.timeout(60000)});
    console.log(JSON.stringify({model,provider:'Codex subscription',effort:cfg.effort,available:value.content.some(x=>x.type==='tool_use'&&x.name==='verify_connection'),toolNames:value.content.filter(x=>x.type==='tool_use').map(x=>x.name),elapsedMs:Date.now()-start}));
  } catch(e) { let error=String(e.message);for(const secret of [cfg.codexToken,cfg.codexAccountId])if(secret)error=error.replaceAll(secret,'[redacted]');console.log(JSON.stringify({model,available:false,error})); }
}
