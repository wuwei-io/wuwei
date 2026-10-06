import type {Tool} from '../types.js';
export const platformImageTool:Tool={
 name:'platform_imagegen',get description(){return process.env.WUWEI_LANG==='en'
  ? 'Built-in hosted image service. Call catalog to choose a SKU, then generate with the prompt. Calling generate opens the tool’s cost confirmation; it does not place an order until the user approves. Do not ask for a separate text confirmation or stop after catalog. Billing uses the official cost without markup. Query existing orders after interruptions; never automatically create replacement orders.'
  : '内置托管生图服务。先调用 catalog 获取 SKU，再调用 generate 传入提示词。generate 会先弹出工具自带的费用确认，用户批准后才下单；无需另用文字询问，不要查完目录就停下。按官方实费结算，不加价。中断后查询原订单，禁止自动重新下单。';},
 readOnly:false,inputSchema:{type:'object',properties:{sku_id:{type:'string'},prompt:{type:'string',maxLength:1000},order_id:{type:'string'},recovery_key:{type:'string',description:'断线后已保存的幂等key；只查询原订单，不重新下单'},action:{type:'string',enum:['catalog','generate','query','settle','reauthorize']}},additionalProperties:false},
 async run(input,ctx){if(!ctx.platformImage)return {content:'当前会话不是平台托管生图路径，订阅/BYOK不得调用平台计费。',isError:true};return ctx.platformImage(input,ctx);},
};
