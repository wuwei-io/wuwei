# Codex 订阅生图：独立 HTTP 实现

2026-10-04 已实测：无为可以直接调用 Codex 订阅图片服务，无需安装或启动 Codex、Codex CLI、ChatGPT。运行时只有 Node 内置模块；桌面版由 Electron 自带 Node。

## 已确认的协议

通过官方 `openai/codex` 源码 commit `b8dceb0d4f29e49e73daa08f57fcf5181186f354` 定位：

- [生图工具](https://github.com/openai/codex/blob/b8dceb0d4f29e49e73daa08f57fcf5181186f354/codex-rs/ext/image-generation/src/tool.rs)：模型 `gpt-image-2`，`background`、`quality=auto`、`size=auto`，最多5张参考图。
- [ImagesClient](https://github.com/openai/codex/blob/b8dceb0d4f29e49e73daa08f57fcf5181186f354/codex-rs/codex-api/src/endpoint/images.rs)：生成 POST `images/generations`；编辑 POST `images/edits`，JSON请求及JSON响应。
- [订阅地址选择](https://github.com/openai/codex/blob/b8dceb0d4f29e49e73daa08f57fcf5181186f354/codex-rs/model-provider-info/src/lib.rs)：ChatGPT登录选择 `https://chatgpt.com/backend-api/codex`。
- [鉴权](https://github.com/openai/codex/blob/b8dceb0d4f29e49e73daa08f57fcf5181186f354/codex-rs/model-provider/src/bearer_auth_provider.rs)：`Authorization: Bearer <access_token>` 与 `ChatGPT-Account-ID`。
- [图片请求附加头](https://github.com/openai/codex/blob/b8dceb0d4f29e49e73daa08f57fcf5181186f354/codex-rs/ext/image-generation/src/backend.rs)：`originator` 与 `x-codex-image-turn-id`。

生成请求：

```http
POST https://chatgpt.com/backend-api/codex/images/generations
Authorization: Bearer <当前会话的订阅access_token>
ChatGPT-Account-ID: <当前会话的account_id>
originator: codex_cli_rs
x-codex-image-turn-id: <UUID>
Content-Type: application/json
```

```json
{"model":"gpt-image-2","prompt":"图片描述","background":"opaque","quality":"auto","size":"auto"}
```

透明背景把 `background` 改为 `transparent`。编辑改为 `/images/edits`，增加 `images: [{"image_url":"data:image/png;base64,..."}]`。返回 `data[0].b64_json`，解码为PNG；可从响应头提取 `x-codex-imagegen-request-id`。

这是 Codex 的订阅服务地址，使用账号的 Codex 额度。[官方额度说明](https://learn.chatgpt.com/docs/image-generation)。实测确认了订阅鉴权成功和图片返回，未测量本次额度减少的具体数值。

此前依据新 SIWC 公共 Responses API 的不支持生图说明得出“无法独立调用”的判断过早。那个接口与此处 Codex 自己使用的 ImagesClient 地址不同。不要把订阅token当作公共 `api.openai.com/v1/images` 的API key。

## 无为默认接入

`src/imagegen/subscription.mjs` 实现独立图片请求；`CodexProvider.generateImage` 绑定无为已有的登录凭证，不调用本机Codex进程。无为已有 `desktop/main/codex-oauth.ts` 自行完成订阅登录，因此没有桌面程序安装依赖。

`codex_imagegen` 已注册进核心工具。Agent按本轮实际provider的能力决定是否暴露它：切到Codex订阅即提供，切到其它平台即隐藏。执行时绑定发起该轮请求的provider，界面切换或员工并发不会把图片发到另一个账号。员工设置了工具白名单时仍需纳入此工具，权限模式也沿用原有规则。

```json
{"prompt":"一张蓝色机器人插画","out":"E:/output/robot.png","transparent_background":false}
```

工具输出包含文件路径、尺寸、字节数、请求ID，并通过 `displayImage` 展示在对话里；大图不回灌每轮模型上下文。自v1.7.35接入，旧安装版需要更新客户端才能获得原生工具。

## 独立代码和脚本

```js
import { generateSubscriptionImage } from './src/imagegen/subscription.mjs';

const result = await generateSubscriptionImage({
  prompt: '可爱的蓝色机器人，无文字',
  accessToken: subscriptionCredentials.accessToken,
  accountId: subscriptionCredentials.accountId,
  out: 'E:/output/robot.png',
  // references: ['E:/assets/reference.png'],
  // transparentBackground: true,
});
console.log(result.path);
```

```powershell
node scripts/codex-imagegen.mjs --doctor
node scripts/codex-imagegen.mjs --prompt "可爱的蓝色机器人" --out E:/output/robot.png
node scripts/codex-imagegen.mjs --prompt "保持主体，把背景换成浅蓝色" --ref E:/assets/reference.png --out E:/output/edited.png
```

脚本凭证来自 `CODEX_ACCESS_TOKEN` + `CODEX_ACCOUNT_ID`，或无为登录保存的 `~/.codex/auth.json`；可用 `--auth-file FILE` 指定其它凭证文件。该目录名是现有登录存储位置，不要求安装Codex。`--doctor` 只检查凭证存在，不发请求、不声称已验证权限。

独立使用时将脚本和模块复制到自己的工具目录，并相应调整脚本的相对import路径即可；不需要额外安装Codex或ChatGPT。

## 实测及限制

2026-10-04 单次 Node HTTP 请求返回HTTP 200，耗时22875ms，生成1254×1254 PNG，1146504字节：

测试图片保存在验证机器的无为输出目录。这次请求没有启动Codex CLI，也没有调用本聊天的imagegen工具。

这属于Codex客户端使用的接口，未来可能变化；实测支持当前账号，不承诺所有计划和账号一定有权限。过期凭证返回重新登录提示，额度/速率受限返回明确错误。没有自动重试、API付费回退或凭证上传到无为服务器；取消/超时可能发生在服务已经执行后，不能据此断言未扣额度。

封装仅向明确的官方HTTPS订阅地址发凭证，拒绝重定向及其它域名。PNG验证通过后才保存，已有文件不覆盖；响应、参考图和解压数据有大小限制。错误不输出原始服务正文或凭证。

验证：`node --import tsx --test tests/subscription-imagegen.test.mjs tests/subscription-image-routing.test.mjs`、`npm run typecheck`、`npm run desktop:build`。
