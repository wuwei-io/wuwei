# 客户端账号底栏双版本（2026-10-30，分支预览）

状态：本地实现与隔离预览，未发版、未安装或重启正式客户端。

原版 checkpoint：`c224353`；标记 `account-footer-classic-20261030`；分支 `checkpoint/account-footer-classic-20261030`。
功能分支：`feat/account-wallet-switch-20261030`。
基线含正式 1.7.72 与已存在的移动兼容/工具自动放行修复 68ed6e6、703cff9，未混入共享开发区的其他改动。

## 切换

后台配套分支 `feat/account-wallet-control-20261030`，配置键 `app.account_footer`，仅接受 `{"layout":"classic"}` / `{"layout":"wallet"}`。
原版保持默认。公共配置不返回用户信息或私人开关；客户端沿用 `/api/billing/client-config` 的一分钟轮询与焦点刷新。
不识别的配置回原版；断网保留最后一次成功读取的样式，首次启动为原版。不按账户缓存钱包明细到磁盘。
选择新版时显示升级按钮、币数与加号、头像；加号/升级共用既有付费弹窗，消费详情打开既有账本。
原版触发按钮及菜单 JSX 保留；新版头像复用同一菜单和业务事件，签到、设置、消息、手册、客服、反馈、更新、退出仍可用。
悬停、焦点、Esc、空白处关闭及浮层内点击均可使用；只在新版侧栏允许浮层跨出侧栏，避免被裁切。

## 钱包

新增主进程固定 allowlist action `wallet`，仍从主进程带 token 请求，不把凭证交给渲染层。
服务端 `/api/billing/wallet` 只认登录 token 的账号，忽略调用者指定的账号。
复用现有 `billing_account` 懒结算，然后从私有只读 `account_wallet_snapshot_v1` 读取一致快照；没有新增结算/发币/扣费写入器。
按真实剩余批次和到期时间分组；永久余额=可用余额−有期限批次。Infinity 批次不被当作会员到期。
当前计划只认生效中的已付订阅，排除未来续期和已取消订阅；兼容会员单独标识，不靠签到额猜计划。
余额与批次不平、RPC 失败或跨账号响应时明确提示不可用；不虚构零余额、过期规则或新赠币。
中英文新文案已提供；其他现有语言包的新文案使用英文回退，正式发行前可继续本地化。

## 本地预览

真实 dev 可设置 `RENDERER_VITE_ACCOUNT_FOOTER=wallet`（或 `classic`）后运行 `npm run desktop:dev:test`；只在 DEV 生效，远端配置与正式构建不受影响。去掉环境变量并重启 dev 即恢复后台控制。沿用测试版账号及会话，不使用隔离示例数据。

运行本工作区 `tests/client-flows/account-wallet.cjs`，设置 `WUWEI_WALLET_PREVIEW=1`、`WUWEI_QA_OUTPUT`、`WUWEI_QA_PROFILE`。
根工作区 outputs/account-wallet-implementation-20261030/打开客户端预览.cmd 已写好路径。
使用实际编译的 App 渲染器和隔离 IPC 示例账户，外网请求默认拦截；菜单“打开后台配置预览”可以用实际 ConfigPanel 保存并切换本地客户端。
预览中的付款、账本和账号均为内存示例，不涉及正式账号或真实付款。

## 上线与回退

先部署后台配套 migration、钱包读取路由及配置 UI，保持 classic，再按正式发行 SOP 发布包含此功能的客户端。只改变后台配置不能让未包含此代码的旧客户端获得新版。
需要回退时后台选 classic；一分钟内/重新聚焦生效，不改用户数据，也无需卸载客户端。
源码回退可切到原版 checkpoint 独立工作树；不要对共享工作区执行 reset --hard。
本轮没有执行上线或发行。
