# Agent Note：凭据脱敏落在用户文本投影内

Status: implemented

[English](2026-10-15-credential-masking-in-user-text-projection.md) | 中文

## 问题

粘贴进消息的凭据在用户回看处保持可读：已发送气泡、队列行预览与 goal 命令回显都逐字渲染它。提供方以可识别格式发布这类值——密钥或令牌前缀、JSON Web Token、PEM 私钥块、带凭据地址的口令——写在其中任一种格式里的密钥无需用户逐条决定即可遮住。

上游 DSH 用两层收口：`ui-conversation` 内的规则注册表（`ctx.uiConversation.userText.register(rule)` 与 keyed slot `conversation.user.text.node`），以及配套的 `packages/client/ui-secret-mask` 插件，注册一条 `secret` 规则与一个节点渲染器。QiLin 的用户文本不是注册表。[`projectUserText`](../../../../packages/client/ui-primitives/src/user-text.tsx) 是 `ui-primitives` 内的纯投影，它的四类装饰源——wire 会话形式、相邻 recall 提供的会话标签、裸 `@name` token、调用方点名的 `/name` token——都从消费者插件已持有的数据派生。

## 决定

凭据识别与掩码留在 `ui-primitives` 内、紧邻使用它们的投影，共四个模块：[`credential-formats.ts`](../../../../packages/client/ui-primitives/src/credential-formats.ts) 以数据形式持有已公布的前缀格式；[`credential-scanner.ts`](../../../../packages/client/ui-primitives/src/credential-scanner.ts) 找出候选、按各自格式校验、把重叠候选并入起始最早的那一段并返回掩码区间；[`credential-masks.ts`](../../../../packages/client/ui-primitives/src/credential-masks.ts) 构造各掩码形态；[`SecretText.tsx`](../../../../packages/client/ui-primitives/src/SecretText.tsx) 渲染一段掩码与它的显示控件。四者都不导出：投影是它们唯一的消费者，同包 spec 经源码路径直接引用。

`projectUserText` 增第五类装饰源 `secret`，以及可选的 `UserTextSecretLabels`。掩码区间渲染为掩码文本而非引用 chip，并且凭据优先于与它共享文本的每一类引用装饰：扫描器的掩码胜出，故名字本身就是密钥的 `@name` token、或标签本身是密钥的 wire 会话形式，都不能把该密钥当作 chip 标签原样渲染。仅与凭据相邻的装饰区间保留各自的 chip。

只有显示改变。日志文本、复制内容与模型输入保持原字符；掩码从不回写任何会话事件、请求或持久化状态，且掩码字符留在 DOM 中以供复制与辅助技术读取，由样式表把它们画成居中的方块。

显示控件用的是传入文案，不是自有文案。`projectUserText` 的 `UserTextSecretLabels` 为可选，`SecretText` 仅在收到它时渲染该控件：已发送气泡传入 `ui-chat` 本地化的 `secret.reveal` 与 `secret.hide`，不提供显示控件的面——队列预览与 goal 命令回显——不传，保持遮住。

已公布的前缀表与掩码形态逐值照搬上游：同样的字面量（`sk-`、`AIza`、`ghp_`、`github_pat_`、`glpat-`、`npm_`、`hf_`、`AKIA`/`ASIA`/`LTAI`/`AKID`、`xox*` 系列、`sk_live_`/`sk_test_`/`rk_live_`/`rk_test_`、`whsec_`、`eyJ`）、同样的游程校验、前缀型密钥同样保留前八字符、私钥块同样保留 BEGIN/END 行、带凭据地址同样只掩口令。QiLin 用正则校验它们，而非上游的记忆化字符表。

## 备选方案

**整放上游的规则注册表与它的 keyed slot。** `ui-goal`、`ui-reference`、`ui-skill` 各注册一条规则，投影变成可变规则集之上的求值器。注册表的存在理由是让功能插件在投影不知情时认领文本区间；在 QiLin 里这些装饰已由调用方数据传来（`sessionLabels`、`slashNames`），故整放要把四条已工作的装饰源重写成规则、引入一个除内置四条外没有当前消费者的插件缝，并让共享基线模块为自身扫描器反向依赖功能包。[`packages/AGENTS.md`](../../../../packages/AGENTS.md) 要求每个抽象都有当前所有者与需求，而 QiLin 没有等待用户文本规则的第三方插件。

**照搬上游的扫描器实现。** 它的表驱动、记忆化推导为热匹配路径而建；它自带的 `regex-oracle` 等价测试把正则校验当作该行为的参考。QiLin 每条消息渲染一次，故同样的格式、同样的掩码来自更短的校验，且能守住每文件 100% 覆盖率门槛。

**单独发 `packages/client/ui-secret-mask` 插件包。** 扫描器只有一个消费者——投影——而该消费者是每个浏览器 bundle 都会内联的静态基线模块。功能包要么内联自己的一份扫描器，要么反转依赖方向；把四个模块留在 `ui-primitives` 内部不新增包、不新增清单行、不新增模块表请求。

**在起点相同的并列裁决里给凭据排序。** 凭据的起点从不会与引用 token 重合——没有凭据字面量以 `@` 或 `/` 开头，而 token 匹配器正从这两个字符开始——所以 `rankOf` 里的 secret 分支是不可达逻辑。优先级属于更上一层：渲染前丢弃与之重叠的装饰。

## 后果

已发送用户文本中的凭据在每个投影用户文本的面上都画成掩码，消息气泡另提供按值显示，并在重挂载与同位置换值时复位。识别由格式驱动：自由形式口令、`name=value` 赋值、未登记前缀都保持原样，故该能力从不猜测某个值是否敏感。缺少页脚的私钥块掩码到文本末尾，而不是让正文保持可读。

代价是前缀表的维护：新增一个提供方格式就是 `credential-formats.ts` 里的一行，而掩码形态读的正是同一张表。`ui-primitives` 增加四个内部模块，不新增依赖、导出、清单条目或包。

## 测试

[`credential-scanner.client.spec.ts`](../../../../packages/client/ui-primitives/tests/credential-scanner.client.spec.ts) 覆盖每个已公布前缀族、近似值不得命中的格式（无数字的 `sk-`、数字超出窗口、超过上限或被词字符收尾的 `bounded` 游程、非法 PEM 头、损坏的 JSON Web Token）、各掩码形态（含换行与代理对），以及两个方向的合并。[`secret-text.client.spec.tsx`](../../../../packages/client/ui-primitives/tests/secret-text.client.spec.tsx) 覆盖显示往返、无控件文案的值、同位置换值后重新遮住。[`user-text.client.spec.tsx`](../../../../packages/client/ui-primitives/tests/user-text.client.spec.tsx) 覆盖投影：无控件文案时的掩码输出、有文案时的显示控件、与凭据并存的斜杠 chip，以及被凭据抑制的三类装饰。`pnpm run test:gui` 运行它们，四个源文件都在该包的每文件 100% 覆盖率门槛内。

## 关联

- [本地化文案归客户端 UI 所有](2026-08-23-locale-owned-client-ui-copy.zh.md) —— 为何显示文案经组合插件以 prop 传入，而不是在 primitive 内建字典。
- [上游 0.2.1-alpha.3 对齐计划](../../../../plans/2026-10-15-upstream-0.2.1-alpha.3-alignment.md) —— 本决定收口的增量与它所属的窗口。
