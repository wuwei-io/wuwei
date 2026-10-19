# macOS 自动签名与公证

桌面官网包使用 Developer ID Application 签名，由 Apple notarytool 公证，并将公证票据 stapling 到应用。Intel 和 Apple Silicon 的 ZIP、DMG 内实际应用都须通过 codesign、stapler、Gatekeeper 检查后才能上传 OSS / GitHub。DMG 容器本身也签名；应用在打包 DMG / ZIP 之前已完成公证和票据附加，不在生成更新清单后改包。

## 已确认和已配置（2026-10-20）

- 复用手机端 Apple 团队 `R5AM5T3LFU`，不需要再次购买会员。
- 从现有 Expo 手机端项目找到 App Store Connect 团队 API Key，已在 Mac 上实际调用 `notarytool history` 成功验证公证认证，然后写入桌面仓库的 GitHub Secrets。
- 可访问的 Mac 钥匙串当前只有 Apple Development 身份。找到的 Sign in with Apple 密钥用于业务登录，不能代替公证密钥。尚未找到可用的 Developer ID Application 证书及私钥。
- 已在原 Mac 生成申请所需 RSA 私钥和 CSR，私钥保留在权限受限的 `~/.config/wuwei-secrets/macos-developer-id/developer-id.key`；不要删除它，下载的 `.cer` 必须与该私钥配对。
- CSR：同目录 `Wuwei-Developer-ID.certSigningRequest`，另有一份公开 CSR 交付给用户。
- 当前已发布的 1.7.52 保持原产物，本配置用于包含本提交的后续新版本。

## 申请缺少的桌面证书

1. 打开 [Apple Certificates](https://developer.apple.com/account/resources/certificates/list)，选择团队 `R5AM5T3LFU`。
2. 点 `+`，选择 **Developer ID Application**。它用于官网分发的 Mac 应用；不选 Apple Development、Apple Distribution 或 Developer ID Installer。已有开发者会员无需再次缴纳会员费。
3. 如果页面要求证书类型 / 中间证书版本，按 Apple 当前页面为所用 Xcode 选择受支持版本。
4. 上传已准备的 `Wuwei-Developer-ID.certSigningRequest`，继续并下载 `.cer` 到原 Mac 的“下载”目录。
5. 不需要撤销或替换手机端证书，也不需要为桌面版重新注册开发者账号。

[Apple 的证书申请说明](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)。若改用钥匙串创建 CSR，必须用那份 CSR 对应的私钥导出 P12；不能与本次准备的私钥混用。

## 只剩两个 GitHub Secrets 需要填写

仓库入口：[wuwei → Settings → Secrets and variables → Actions](https://github.com/wuwei-io/wuwei/settings/secrets/actions)，点 **New repository secret**。目前公证凭证已配置，无需重新下载或发送 API 私钥。

| 类型 | 名称 | 内容 / 当前状态 |
| --- | --- | --- |
| Secret | `MAC_CSC_LINK` | **待填**：包含证书和对应私钥的 `.p12` 文件的 Base64 全文 |
| Secret | `MAC_CSC_KEY_PASSWORD` | **待填**：导出该 `.p12` 时设置的密码 |
| Secret | `APPLE_API_KEY_P8` | **已配置并验证**：现有 App Store Connect API 私钥 PEM 全文 |
| Secret | `APPLE_API_KEY_ID` | **已配置**：现有公证 API Key ID |
| Secret | `APPLE_API_ISSUER` | **已配置**：对应的 Issuer ID |
| Repository variable | `APPLE_TEAM_ID` | **已配置**：`R5AM5T3LFU`，在 Variables 页，不是 Secrets 页 |

### 使用本次准备的 CSR 导出 P12

在原 Mac 终端执行以下命令。第一条证书文件路径请替换为刚下载的真实 `.cer` 路径。OpenSSL 导出时会交互要求设置密码，该密码就是 `MAC_CSC_KEY_PASSWORD`。

```sh
signing_dir="$HOME/.config/wuwei-secrets/macos-developer-id"
openssl x509 -inform DER -in "$HOME/Downloads/developerID_application.cer" -out "$signing_dir/developer-id.pem"
openssl pkcs12 -export -inkey "$signing_dir/developer-id.key" -in "$signing_dir/developer-id.pem" -out "$signing_dir/developer-id.p12"
base64 < "$signing_dir/developer-id.p12" | tr -d '\n' | pbcopy
```

最后一条会把 Base64 放入剪贴板，将它粘贴到 `MAC_CSC_LINK`。不要把 `.cer` 文件内容直接填进该 Secret。若希望由助手完成导出与填写，只需告知证书在 Mac 上的保存路径，已有私钥和 GitHub 授权即可继续；不需要在聊天发送密码或私钥。

已有证书且私钥位于钥匙串时，也可在“我的证书”中选中 Developer ID Application 及其私钥，导出为 `.p12`，再进行 Base64 编码。

## 发布前后流程与验证边界

`release.yml` 在 macOS runner 上先检查凭证完整性、P12 私钥配对、证书类型、团队与有效期，再实际检查公证认证。签名时强制 `forceCodeSigning=true`，启用 Hardened Runtime 与公证；electron-builder 会将票据附加到应用。

上传前解开两种架构 ZIP，挂载两种 DMG，分别检查应用签名、Team ID、Bundle ID、CPU 架构、Hardened Runtime、时间戳、公证票据和 Gatekeeper 接受结果。任一失败都会阻断该 macOS job 的上传。凭证临时文件会清理；Windows/Linux 原有发布逻辑保留。

本次已完成 Windows / Mac 流程回归和真实公证认证。没有 Developer ID Application 证书之前，无法完成真正的签名打包和 Gatekeeper 成品验收。测试用自签名夹具只验证 P12 解析与失败处理，不代表 Apple 签名成功。

不要重用 `v1.7.52` 标签或覆盖该版本已发布的文件。证书补齐后先在 Mac 构建包含本配置的新版本，验证通过再按既有新版本发版流程发布。

参考：[Apple Developer ID](https://developer.apple.com/developer-id/)、[electron-builder v26 macOS 配置](https://www.electron.build/v26/docs/mac/)、[GitHub Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)。
