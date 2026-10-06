import type {Tool} from '../types.js';
export const platformImageTool:Tool={
 name:'platform_imagegen',get description(){return process.env.WUWEI_LANG==='en'
  ? 'Built-in hosted image service. Call catalog to choose a SKU, then generate with the prompt. Generate confirms the fee with the user before ordering. No separate ask_user confirmation. displayed:true means the image is already visible: finish with a brief reply, never call send_image again. An unknown/pending order is not success. Recover the original order only; never regenerate automatically. Billing uses the official cost without markup.'
  : '内置托管生图服务。先 catalog 获取规格，再 generate 传提示词；工具会确认费用，批准后才下单，无需另用 ask_user。displayed:true 表示图片已展示，简短回复即可，不要再调用 send_image。unknown/pending 不表示成功；中断后只处理原订单，禁止自动重新生图。按官方实费结算，不加价。';},
 readOnly:false,inputSchema:{type:'object',properties:{sku_id:{type:'string'},prompt:{type:'string',maxLength:1000},order_id:{type:'string'},recovery_key:{type:'string',description:'断线后已保存的幂等key；只查询原订单，不重新下单'},action:{type:'string',enum:['catalog','generate','query','settle','reauthorize']}},additionalProperties:false},
 async run(input,ctx){if(!ctx.platformImage)return {content:'当前会话不是平台托管生图路径，订阅/BYOK不得调用平台计费。',isError:true};return ctx.platformImage(input,ctx);},
};
