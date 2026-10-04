import type {Tool} from '../types.js';
export const platformImageTool:Tool={
 name:'platform_imagegen',description:'平台API生图：仅托管会话可用。先查看目录获取SKU，生成前向用户确认预计预占及最高授权。最终按官方实费扣会员额度/无为币，不加价。查询原订单不重新生图，失败不自动重试。',
 readOnly:false,inputSchema:{type:'object',properties:{sku_id:{type:'string'},prompt:{type:'string',maxLength:1000},order_id:{type:'string'},action:{type:'string',enum:['catalog','generate','query']}},additionalProperties:false},
 async run(input,ctx){if(!ctx.platformImage)return {content:'当前会话不是平台托管生图路径，订阅/BYOK不得调用平台计费。',isError:true};return ctx.platformImage(input,ctx);},
};
