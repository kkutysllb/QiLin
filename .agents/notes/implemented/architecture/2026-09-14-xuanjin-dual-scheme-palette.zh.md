# Agent Note：玄金双配色方案（Web 客户端）

Status: implemented

[English](2026-09-14-xuanjin-dual-scheme-palette.md) | 中文

## Problem

产品的三个可见表面在品牌配色上互相矛盾。会话前文档（landing 与 auth）通过样式表中的 `--ql-*` 令牌承载「玄金」暗金 VI，而 workspace 仍保留平台的冷灰蓝表面与绿色强调色（`--dsw-alias-brand-primary` 浅色 `#0b7a5a` / 深色 `#3fd6a0`，来自 [2026-09-13](../bug-fix/2026-09-13-qilin-brand-surfaces-and-settings-entry-point.zh.md) 三个令牌的品牌层）。访客从 landing 进入控制台，就从暖金黑跨入了冷灰绿。

landing VI 只有一套配色，任何地方都不存在浅色来源：一旦 workspace 的浅色也要遵循同一 VI，推导一套浅色就是前置条件。

landing 页没有任何主题控制，而 auth 页与 landing 共用令牌名，只给其中一页加开关会让另一页的存储选择悬空。

## Decision

**landing 令牌是唯一色源，品牌层为整个表面栈声明双 scheme。** [tokens.ts](../../../../packages/client/ui-theme-brand/src/client/tokens.ts) 的 `QILIN_TOKENS` 从三个令牌扩展到五十五个，按族分组。深色值逐字移植 landing 配色：画布 `#0d0b09`、卡面 `#16130f`/`#1d1915`、推导的第三层 `#26211c`、墨阶 `#efe9df`/`#a89f90`/`#857c6c`、强调色 gold-500 `#c9a24a`。浅色值推导暖纸对应版：纸白画布 `#f8f5ee`、暖白卡面 `#fdfbf5`、暖近黑墨色 `#221d15`、强调色 gold-700 `#8f6f2e`。每个被覆盖的令牌都有真实组件消费者；无当前消费者的令牌（brand-text、module-platform、multi-select 等）留在基础配色。

**对比度决策来自计算而非目测。** 浅色链接金 `#7d6126` 是推导值而非 VI 的 gold-700：gold-700 在纸白画布上只有 4.3:1，`#7d6126` 保持 5.3:1（被替换的蓝色链接是 4.2:1）。浅色主按钮为 gold-700 搭配配色自带的白色前景，4.7:1；深色主按钮为 gold-500 搭配深色配色的近黑前景，7.9:1——正是 landing CTA 的配对。`--dsw-alias-label-primary-foreground` 刻意不覆盖：勾选框配对（label-primary 填充 + 前景对钩）依赖它，gold-700 让该配对原样成立，无需改任何组件。悬停遵循各平台惯例——深色变亮（gold-500 到 gold-300，即 landing CTA 自身的悬停），浅色变深（gold-700 到推导链接金）。

**状态色与进行中蓝保留。** 错误红、成功绿、警告琥珀、信息蓝，以及 state-business 蓝族（进行中圆点、turn navigator、用户气泡引用 chip）保持基础值：gold-500 与警告琥珀 `#f59e0b` 的色相与明度都接近，把「进行中」并入品牌金会让两种状态难以区分。

**会话前两页共享一个切换。** 两份文档默认暗金，通过 `html[data-ql-theme='light']` 翻转，选择以 `ql-theme` 存储键持久化。每页 `<head>` 内联一段绘制前脚本，存储的浅色选择在首帧前生效；点击行为在共享模块 [theme-preference.ts](../../../../apps/web/src/theme-preference.ts)，由两个页面模块各自引入；标签与图形留在各页 html。landing 样式表镜像 workspace 的推导（纸白画布、暖墨、双 scheme 均为 gold-500 CTA 配 `#141006` 文字），装饰性的白色 alpha 洗改基暖墨；auth 卡片获得同样的浅色变体与角落控件。workspace 自身的 light/dark/system 偏好保持独立：那是持久产品设置，而 `ql-theme` 是会话前页面选择。

## Verification

品牌令牌规格让覆盖层跑在生产 `ThemeRuntime` 及其覆盖栈上：钉住 landing 值（深色强调 gold-500、深色画布 `#0d0b09`、链接对），证明装载与卸载还原，并放宽接受 `rgba()` 细线值，同时仍要求每个令牌双 mode 且两 mode 相异。承重对比度对在定值前按 WCAG 相对亮度公式计算；记录的比率位于 tokens.ts 头部注释。`pnpm run test:gui`、`pnpm run typecheck`、`QILIN_SNAPSHOT=replay pnpm run test:web` 覆盖客户端套件、两份页面文档与回放浏览器场景。

## Alternatives considered

**覆盖 `label-primary-foreground` 为 CTA 墨色，让浅色主按钮用 gold-500 填充。** 前景令牌同时绘制勾选框内的对钩，而勾选框填充是 `label-primary`；近黑前景落在浅色勾选框的近黑填充上会让对钩不可见。gold-700 配既有白前景可触达所有主表面而不动配对。

**浅色强调色全面用 gold-500 以求 VI 忠实。** gold-500 文字在纸面上是 2.2:1，焦点环与开关轨道也低于浅色表面 3:1 的非文字下限。深金是 VI 自身的第三档色阶，色族并未破坏。

**把进行中蓝并入品牌金。** gold-500 与警告琥珀的色相明度都太近，「运行中」与「警告」需要第二线索才能区分。保留蓝维护状态色语义。

**改 design-platform 色阶。** `--dsw-static-*` 表是平台复制层；品牌覆盖层的存在正是为了让产品重述自己的令牌，卸载即还原平台配色。重涂色阶会让换肤不可逆。

**首访按 `prefers-color-scheme` 解析 landing 主题。** 暗 VI 是该页的品牌宣言；产品决策（用户确认）为默认暗金、切换持久化选择。

## Consequences

双 scheme 下所有 `--dsw-alias-*` 消费者整体变暖，零组件改动——正是 tokens-only 样式规则把 workspace 侧的改动收敛在一个文件。侧栏双 scheme 并入画布族（浅 `#f1ece0`、深 `#0d0b09`），取代 2026-09-13 笔记的中性侧栏决策；该笔记已就地更新并链接至此。

会话前切换与 workspace 主题偏好相互独立：访客的 landing 选择不会进入产品外观设置，设置也不会影响登出页。

`ql-theme` 是静态文档上的浏览器本地键；workspace 外壳从不读取它，内联脚本在存储不可用时向暗金默认值失败收敛。

这套浅色推导自此成为 VI 任何后续浅色表面的参照：纸白画布 `#f8f5ee`、暖墨 `#221d15`、gold-700 强调、推导链接金 `#7d6126`。第二个浅色消费者应从本层取值，而不是重新推导。
