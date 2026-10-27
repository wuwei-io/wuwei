// Editable sample content, rather than model instructions or generation requests.
// Other interface languages use the English samples as a fallback.
export const STUDIO_EXAMPLES = [
 {id:'ecommerce',
  image:{zh:'电商商品主图：一只奶油白色不锈钢保温杯，杯盖放在旁边，纯白背景，柔和棚拍光，清楚呈现金属质感和杯口细节，主体完整、画面干净，不添加文字。',en:'An ecommerce listing photo of a cream-white stainless steel travel tumbler, with its lid beside it. Pure white background, soft studio lighting, crisp metal texture and rim details. Show the complete product with a clean composition and no text.'},
  video:{zh:'电商商品展示：一只奶油白色保温杯立在浅灰色台面上，镜头缓缓绕杯身移动，柔和光线掠过金属表面，突出杯盖和防滑底座细节，真实商业广告质感，单一连续镜头。',en:'An ecommerce product showcase: a cream-white travel tumbler on a light gray surface. The camera slowly moves around it as soft light reveals the metal finish, lid and nonslip base. Realistic commercial photography in one continuous shot.'}},
 {id:'restaurant',
  image:{zh:'餐饮菜单配图：一碗番茄牛肉意面放在深色木桌上，酱汁浓郁，点缀新鲜罗勒和少量芝士，侧面自然光，食材细节清晰，热气轻盈，诱人的真实美食摄影。',en:'A restaurant menu photo of tomato beef pasta on a dark wooden table. Rich sauce, fresh basil and a light sprinkling of cheese. Natural side lighting, detailed ingredients and a hint of steam. Appetizing, realistic food photography.'},
  video:{zh:'餐厅新品短片：一碗刚出锅的番茄牛肉意面，细腻热气缓缓上升，镜头从桌面高度轻轻推进，罗勒、酱汁和芝士细节逐渐清晰，温暖自然光，真实美食广告风格。',en:'A restaurant special: freshly served tomato beef pasta with gentle steam rising. Slowly push the camera forward from table height, revealing basil, rich sauce and cheese details. Warm natural lighting and realistic food advertising style.'}},
 {id:'real-estate',
  image:{zh:'房产经纪人房源展示图：一间采光充足的现代两居室客厅，米色沙发、原木茶几、绿植和落地窗，空间整洁，窗外有城市绿景，真实室内摄影，垂直线自然，避免夸张广角。',en:'A real estate listing photo of a bright modern apartment living room. Beige sofa, oak coffee table, green plants and floor-to-ceiling windows overlooking urban greenery. Tidy, realistic interior photography with natural vertical lines and restrained wide-angle perspective.'},
  video:{zh:'房产看房短片：从明亮客厅入口缓缓向落地窗推进，经过米色沙发和原木茶几，窗外绿景逐渐展开，午后自然光，稳定平滑的镜头，真实呈现房间尺度。',en:'A real estate walkthrough: move slowly from a bright living room entrance toward floor-to-ceiling windows, passing a beige sofa and oak coffee table. Reveal the green view outside. Soft afternoon daylight, stable camera movement and realistic room proportions.'}},
 {id:'beauty',
  image:{zh:'护肤品牌社交媒体配图：一瓶琥珀色玻璃精华液放在浅米色石台上，旁边是透明水滴和一片绿叶，柔和侧光，玻璃反射细腻，简洁高级的商业静物摄影，右侧留出文案空间，不生成文字。',en:'A skincare social media image: an amber glass serum bottle on a pale beige stone pedestal, with clear water droplets and a green leaf beside it. Soft side lighting and delicate glass reflections. Refined commercial still life, with copy space on the right and no text.'},
  video:{zh:'护肤产品细节短片：琥珀色精华瓶旁，一支玻璃滴管缓慢落下一滴透明精华，水滴落在浅色石台上，镜头近距离固定拍摄，柔和光线，质地通透，干净的商业广告画面。',en:'A skincare detail shot: beside an amber serum bottle, a glass dropper slowly releases one clear drop onto a pale stone surface. Fixed close-up camera, soft lighting and translucent texture. Clean, realistic beauty advertising.'}},
 {id:'fashion',
  image:{zh:'服装店上新配图：一件浅蓝色亚麻衬衫挂在原木衣架上，米白色墙面背景，袖口自然垂落，窗边柔光突出面料纹理和缝线，清爽简约的服饰商品摄影。',en:'A fashion shop new-arrival photo: a pale blue linen shirt on a wooden hanger against an off-white wall. Naturally draped sleeves, soft window light revealing the fabric weave and stitching. Fresh, minimal apparel product photography.'},
  video:{zh:'服装上新展示短片：浅蓝色亚麻衬衫挂在窗边，轻风让衣摆轻轻摆动，镜头缓慢从领口下移到袖口，突出亚麻纹理、纽扣和走线，自然日光，真实清爽。',en:'A fashion new-arrival clip: a pale blue linen shirt hangs beside a window, its hem moving gently in a breeze. Slowly move the camera from the collar down toward the cuff, showing the linen weave, buttons and stitching in natural daylight.'}},
 {id:'local-business',
  image:{zh:'社区咖啡店宣传配图：一间街角咖啡店的开放门面，木质吧台、暖色吊灯和几盆绿植，清晨阳光洒进店内，氛围亲切温暖，真实街景摄影，门头不出现可读文字。',en:'A neighborhood cafe promotional photo: an inviting street-corner storefront with a wooden counter, warm pendant lights and green plants. Morning sunlight enters the cafe. Welcoming, realistic street photography, without readable lettering on the storefront.'},
  video:{zh:'咖啡店社交平台短片：近距离拍摄咖啡师向白色瓷杯中倒入牛奶，拿铁表面形成简洁心形拉花，背景是虚化的暖色吧台，镜头稳定，动作自然，营造温暖的日常氛围。',en:'A cafe social media clip: a close-up of a barista pouring milk into a white cup, forming a simple heart in the latte. A softly blurred, warmly lit counter in the background. Stable camera and natural movement, with a cozy everyday atmosphere.'}},
 {id:'travel-creator',
  image:{zh:'旅行博主封面图：清晨海边的蜿蜒木栈道通向远处灯塔，海面薄雾、柔和日出和浅蓝天空，一位背着小背包的旅行者作为远景点缀，画面有层次，上方留出标题空间，不添加文字。',en:'A travel creator cover image: a winding seaside boardwalk leading toward a distant lighthouse at dawn. Light sea mist, soft sunrise and a pale blue sky, with a small backpacker in the distance. Layered composition with title space above and no text.'},
  video:{zh:'旅行博主开场镜头：清晨沿海木栈道延伸向远处灯塔，镜头平稳向前滑行，薄雾轻轻飘动，海浪拍打岸边，柔和日出映在海面，安静、有空间层次的真实旅行影像。',en:'A travel creator opening shot: glide smoothly forward along a coastal boardwalk toward a distant lighthouse at dawn. Thin mist drifts, waves reach the shore and soft sunrise reflects on the water. Quiet, realistic travel footage with a strong sense of depth.'}},
 {id:'education',
  image:{zh:'小学自然课课件插图：展示一颗豆子从种子、发芽到长出两片叶子的三个阶段，土层使用简洁剖面呈现，根系清楚，柔和绿色与米色，白色背景，清晰的科普绘本风格，不添加文字和标签。',en:'An elementary science lesson illustration showing three stages of a bean plant: seed, germination and two young leaves. A simple soil cross-section reveals the roots. Soft greens and beige on white, in a clear educational picture-book style, without text or labels.'},
  video:{zh:'自然课科普短片：土壤中的一株小豆芽，以延时摄影的方式缓缓挺直茎干、舒展两片嫩叶，浅色背景，柔和自然光，镜头固定，突出植物生长过程，不添加文字。',en:'A science lesson clip: a small bean sprout in soil slowly straightens its stem and unfolds two young leaves in a time-lapse style. Pale background, soft natural light and a fixed camera emphasizing plant growth, without text.'}},
 {id:'business',
  image:{zh:'企业物流方案演示配图：现代整洁仓库中的自动传送带、纸箱与货架，少量工作人员作为尺度参照，明亮中性色，真实商业摄影，突出有序高效的工作环境，左侧留出标题空间，不添加文字。',en:'A business presentation image of an organized modern warehouse with automated conveyor belts, cardboard parcels and shelving. A few workers provide scale. Bright neutral colors and realistic commercial photography, with title space on the left and no text.'},
  video:{zh:'企业物流服务宣传短片：整洁仓库里，一只封好的纸箱沿传送带平稳前进，镜头从侧面缓慢跟随，背景货架有序排列，明亮自然的工业照明，专业、可靠的真实商业影像。',en:'A logistics service promotional clip: a sealed cardboard parcel moves steadily along a conveyor in a tidy warehouse. The camera slowly tracks beside it, with organized shelves behind. Bright, natural-looking industrial lighting and professional, realistic commercial footage.'}},
 {id:'personal-event',
  image:{zh:'家庭生日聚会邀请配图：花园里的小圆桌上摆着草莓蛋糕、鲜花和浅色餐具，背景是虚化的彩色气球与绿树，温暖午后阳光，清新温馨的生活摄影，上方留出邀请文案位置，不添加文字。',en:'A family birthday invitation image: a small garden table with a strawberry cake, flowers and pastel tableware. Softly blurred balloons and green trees behind, in warm afternoon sunlight. Fresh, welcoming lifestyle photography, with invitation copy space above and no text.'},
  video:{zh:'家庭生日祝福短片：草莓蛋糕上的蜡烛轻轻摇曳，背景是柔焦鲜花和彩色气球，镜头缓缓靠近蛋糕，暖色自然光，温馨真实的家庭聚会氛围，不添加文字。',en:'A family birthday greeting clip: candle flames flicker gently on a strawberry cake, with softly blurred flowers and colorful balloons behind. Slowly move the camera toward the cake in warm natural light. A cozy, realistic celebration without text.'}}
] as const;

export function createStudioExamplePicker(kind:'image'|'video',random:()=>number=Math.random){
 let remaining:number[]=[],previous=-1;
 return (language:string)=>{
  if(!remaining.length){
   remaining=STUDIO_EXAMPLES.map((_,index)=>index);
   for(let index=remaining.length-1;index>0;index--){const other=Math.floor(random()*(index+1));[remaining[index],remaining[other]]=[remaining[other],remaining[index]]}
   if(remaining[0]===previous)[remaining[0],remaining[1]]=[remaining[1],remaining[0]];
  }
  previous=remaining.shift()!;
  const example=STUDIO_EXAMPLES[previous];
  return {id:example.id,prompt:example[kind][language.toLowerCase().startsWith('zh')?'zh':'en']};
 };
}
