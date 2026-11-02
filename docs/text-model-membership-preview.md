# 文字模型会员入口：本地预览

用户确认仅限制截图箭头所指7个托管模型，所有有效付费会员（含Mini）可用：

- wuwei-claude/claude-fable-5-1
- wuwei-claude/claude-fable-5
- wuwei-claude/claude-opus-5-5
- wuwei-claude/claude-opus-5
- wuwei-gpt/gpt-6-1-sol
- wuwei-gpt/gpt-6-sol
- wuwei-gpt/gpt-6-astra

模型名称旁显示12px金色皇冠。非会员/过期账号点击直接进入现有套餐升级页，不切模型、不发请求、不生成支付订单；游客沿用登录后升级流程。有效会员保留原高价确认与按量计费，币包余额不替代会员资格。Kimi、GPT-6 Luna、其他未指定模型、自接API保留原行为。

主选择器、员工模型选择均传入实际会员状态；手动/自动切换和旧会话发送入口复核会员到期时间。原草稿在发送前拦截时保留。目录selection预留membershipRequired（member/pro/null）可选字段；缺失时使用明确的7个模型默认集合，null可取消某个默认门槛。

范围：本轮只更新独立客户端分支与本地dev。后台、生产网关、生产目录和正式客户端未修改，此版本的点击/发送检查不构成服务端权限边界。后续若正式启用限制，须在发布安排中补齐同源的服务端模型权限校验，不能宣称当前网关已限制旧客户端或直接API调用。

验证：12项模型选择/定价确认/权限单元检查，6项实际App隔离界面检查，构建（18语言包）与desktop类型检查通过。真实登录dev展示7个皇冠，点击受限模型打开套餐页且未切换模型；没有点击任何购买按钮。证据 outputs/text-model-membership-20261102/completion.json。
