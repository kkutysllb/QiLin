# Agent Note: Conversation content width and leading settings rows

Status: implemented

[English](2026-09-15-conversation-content-width-and-leading-settings.md) | 中文

## 问题

会话区域有两个可调尺寸却没有任何用户入口。正文宽度此前只存在于矩形拖拽手柄写入的浏览器本地值里，设置页看不到它，浏览器存储清空后也会静默丢失。消息行高则完全固定——Markdown 行距阶梯随字号缩放，却没有任何用户调节；而字号行已经证明设置表有容纳排版轴的空间。

需求：设置页面「通用」中出现一张可调整消息区域宽度与行间距的卡片，与现有卡片风格一致。

## 决策

行，而不是卡片。设置页由 `settings.general.item` 注册者组合出已上线的卡片，因此两项调整以现有通用卡片内的行交付：`content-width`（`ui-conversation`，order 14）与 `line-spacing`（`ui-theme`，order 13）。两者复用字号行的 stepper 药丸节奏与共享的 `settings-row.module.css`。

**宽度——一项设置、一个归属。** `ui-conversation` 的设置命名空间新增 `contentWidth: number` 字段（`640..2400`，步长 20，默认 `0`）。`0` 是自适应哨兵：schemastery 没有 nullable 选项，`null` 会短路进 fallback，因此持久化边界是显式的非负整数，`0` 表示"保持列宽 clamp"（`clamp(680px, 列宽 64%, 920px)`）。新增的 `ConversationLayoutPolicy` 持有该值：包装 settings scope，向 hooks compartment 发布实时 `SnapshotStore<number>`，并以 bound-actions face 同时注入通用区行的 ContentWidthRow 与会话根的拖拽手柄。手柄提交路径（`resolveContentWidth`——取整、按 `列宽 − 176` 收敛）与 `setContentWidth` 写同一个可往返的存储值；根在每次发布后应用 `explicitWidth(stored)`。浏览器本地键 `qilin.conversation.contentWidth` 仅在首次种子时读取一次，升入命名空间并删除——一次性迁移；损坏值被静默丢弃，自适应默认生效。

**行间——每种字号层级的增量，不是宽度。** 「行间距」即行高，作用于消息正文。`ui-theme` 的命名空间新增 `leading: number`（`-2..8`，步长 1，默认 `0`，单位 px）。`gradient-shadow-text.css` 中 Markdown 阶梯的每个行距项变为 `calc(<层级 px> + 字号 delta + var(--qilin-content-leading))`，标题层级与字号行的耦合得以保留，且 `0` 与今天逐像素相同。`--qilin-content-leading: 0px` 声明 body 默认；`ThemeRuntime.setLeading` 校验区间并由 Host 持久化，`theme-presenter.ts` 以与字号相同的 snapshot-apply/dispose 规则向变量发布 `${leading}px`。

**首帧不闪烁。** `boot-theme.ts` 的内联脚本在预绘制的偏好与字号变量旁一并设置 `--qilin-content-leading`，存储的行间在首帧前生效。宽度变量仍留在 `ConversationRoot` 中并在设置镜像加载后落定——自定义宽度页面加载晚一帧。

**模型可见面。** `setLeading` 加入 Client theme Service 与生成的 inspect 目录；`snapshot.leading` 加入 `ThemeSnapshot`。

全部文案位于 `conversation` 与 `settings.theme` 类型化字典；全部样式使用 `--dsw-*` token。

## 已考虑的替代方案

**新建设置卡片容器。** 否决：现有通用卡片内的行匹配已上线的组合模型，且 [设置卡片布局](2026-09-13-settings-card-layout.zh.md) note 已否决共享卡片原语。

**`null` 表示自适应宽度。** 否决：schemastery 无 nullable 字段，nullable 输入会穿透 `Schema.resolve` 落入默认值，使"无宽度"与"未设置"不可区分。`0` 哨兵保持单一数值与单一分支。

**在 `--qilin-chat-content-width` 旁增设独立全局变量。** 否决：设置表与拖拽手柄将争夺两个归属，正是本 note 收拢为一处值的分裂。

**绝对行高设置。** 否决：绝对值会随字号层级与标题层级不同地裁切或拉伸；加性增量保留所有比例并把当前默认精确压在 0。

**仅 localStorage、不进设置行。** 针对宽度否决：那是原始机制且对设置面不可见；只保留为一次性迁移来源，随后移除。

## 后果

宽度设置与拖拽手柄是同一控件：拖拽提交进命名空间，设置行使与手柄相同的 `setContentWidth`。清空浏览器存储不再丢失自定义宽度。遗留 localStorage 键已消失——依赖它的会话迁移一次后即不可达。

宽度值在自定义宽度加载后晚一帧回放，因为设置镜像晚于挂载到达；行间变量在首帧前绘制。

`ThemeSnapshot` 与 inspect 目录新增 `leading`/`setLeading`，打包检查现在要求这些面的消费者接受它们。`0` 哨兵意味着存储值 `0` 无法表达"自定义 0px 宽度"——本来就超出 clamp 下限（`640px`），无关紧要。

## 测试

行渲染器 spec 覆盖本地化文案、stepper 边界、自适应哨兵（含上箭头在下限时的行为）与重置操作。`ConversationLayoutPolicy` spec 覆盖种子、覆盖优先级、自适应 unset、遗留键迁移及其损坏值路径、pendingSeed 替代。根 spec 覆盖宽度变量发布与手柄提交往返。Theme spec 覆盖行间种子、越界 `-2..8` 拒绝、快照采用、以及内联 boot 脚本的行间赋值。接线 spec 固定注册名册与共享绑定扇出。
