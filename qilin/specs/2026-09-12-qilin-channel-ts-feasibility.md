# QiLin 渠道 TS 重写可行性核查

状态：仅完成 SDK 可用性核查，未做深入 API 验证，也未开始实现
日期：2026-09-12

## 核验口径

- 2.x 实现规模取自 main 分支 app/channels 下的行数。
- TS SDK 只核查「是否存在、是否官方、连接方式」，不包含版本与 API 细节验证。
- 官方性以厂商文档或厂商 GitHub 组织为准；社区库标注为社区。

## 核查结果

| 渠道 | 2.x 规模 | TS 侧 SDK | 官方性 | 连接方式 | 风险 |
|---|---|---|---|---|---|
| 飞书 | 1157 行 | @larksuiteoapi/node-sdk | 官方 | 事件订阅 | 低 |
| 钉钉 | 1106 行 | dingtalk-stream-sdk-nodejs | 官方（open-dingtalk 组织） | Stream 模式 | 低 |
| 企业微信 | 464 行 | 官方文档与 wecom npm 组织 | 官方 | 回调与应用消息 | 中 |
| 微信 | 1510 行 | 无官方个人号机器人 API | — | 仅第三方通道 | 高 |
| Slack | 446 行 | @slack/bolt | 官方 | Socket Mode 或 HTTP | 低 |
| Telegram | 897 行 | grammY 或 telegraf | 社区（成熟） | 长轮询或 Webhook | 低 |
| Discord | 656 行 | discord.js | 社区（成熟） | Gateway | 低 |
| GitHub | 115 行 | octokit | 官方 | Webhook | 低 |

来源：

- 飞书服务端 Node.js SDK：<https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/invoke-server-api>
- 钉钉 Stream SDK：<https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs>
- 企业微信开发者文档：<https://developer.work.weixin.qq.com/document/path/101833> 与 <https://www.npmjs.com/org/wecom>
- Slack Bolt for JavaScript 的 Socket Mode：<https://docs.slack.dev/tools/bolt-js/concepts/socket-mode/>
- Telegram 库对比：<https://npm-compare.com/discord.js,grammy,telegraf>
- Octokit：<https://github.com/octokit/octokit.js>

## 关键结论

1. 8 个渠道中 7 个在 TS 侧有可用 SDK；GitHub 更进一步，dsh 已经自带 webhook-github 适配器，应优先复用而不是重写。
2. 微信是唯一的高风险项：没有官方个人号机器人 API，2.x 的 1510 行实现很可能依赖非官方通道；这一项的取舍必须由产品侧决定，不能默认平移。
3. dsh 已经提供 webhook 家族作为外部事件入口（ctx.webhookRuntime 与 webhook-github 适配器），TS 渠道应作为该 seam 的适配器实现，而不是另起一套连接层。

## 建议的实施顺序

1. 先做 Telegram 或 Slack：SDK 成熟、协议简单、2.x 逻辑规模适中，用来验证渠道 seam 的设计。
2. 再做飞书与钉钉：官方 SDK 齐全，但事件订阅与 Stream 模式需要各自验证重连与去重语义。
3. 企业微信次之；微信最后，且必须先有产品结论。
4. GitHub 优先评估复用 dsh 现有适配器的可能性，可能无需重写。

## 未覆盖的内容

- 各 SDK 的具体版本、鉴权模型、速率限制与重连语义。
- 2.x 渠道层里的去重、连接身份与运行策略逻辑如何映射到新 seam。
- 多租户与凭据存储（2.x 的 channel_connections 持久化）。
