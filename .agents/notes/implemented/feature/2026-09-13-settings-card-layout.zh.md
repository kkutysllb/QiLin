# Agent Note: 设置卡片布局与 QiLin 项目标识

Status: implemented

[English](2026-09-13-settings-card-layout.md) | 中文

## Problem

设置详情需要受控的展示宽度，以便在宽窗口上保持可读，并提供明确的返回工作区路径。外壳还需要一个自有的 About 页面，用于介绍当前项目并携带 QiLin 身份。

现有 QiLin 品牌提供方拥有一枚包含两个汉字轮廓的矢量印章，但设置域没有类型化的品牌标识席位。因此设置专用回退内容必须有明确规则：可见的项目身份必须同时包含「麒」和「麟」，不能用单个汉字近似。

## Decision

`ui-settings-general` 中的 `sidebar.settings` 占位者会把当前 `settings.section` 贡献渲染在居中的 `.sectionCard` 中。布局保持在外壳本地，不新增共享的 `SettingsCard` primitive。

外壳以 `10_000` 顺序注册 `about` 分区，把该行从主导航列表中移出并固定在底部。About 分区组件通过 `PropsRuntime<'settings.section'>`、`PropsRenderSlots<'settings.about.mark'>` 与 `PropsLocale<'settings'>` 组合；它的本地化介绍和签名属于外壳文案。

页眉渲染本地化的**返回工作区**胶囊按钮，其 handler 就是已有的 `onClose` 回调。因此按钮、遮罩、关闭图标和 Escape 监听会通过同一条状态转换离开设置面板。

`@qilin/client-ui-settings` 声明 `SettingsMarkOwnerProps`，并声明一个根作用域的单值席位：`settings.about.mark`。QiLin 品牌提供方通过感知声明的链把 `QilinSealArtist` 注册到该席位，因此设置注册不依赖侧边栏或会话 hero 的声明。品牌席位为空时，本地化的 `about.logoMark` 回退值严格为「麒麟」，并以两个汉字显示。

所有新增可见文案、无障碍名称和回退文字都位于类型化的 `settings` 字典中。分区卡片样式使用既有 `--dsw-*` token，并满足仓库对 elevation、corner-shape 与 0.5px 中性边框的约束。

## Alternatives considered

**创建共享的 `SettingsCard` primitive。** 否决。现有[共享客户端控件决策](../architecture/2026-09-05-shared-client-control-primitives.zh.md)已经记录不同功能包中的设置卡片具有不同交互语义；本外壳只需要本地布局，因此新增跨包 primitive 会在没有第二个当前消费者时扩展 API。

**把 About 做成功能贡献。** 否决。About 介绍当前项目，拥有不属于任何单一功能的文案。把它留在 `ui-settings-general` 中可以让外壳稳定拥有底部入口，同时仍通过 slot 替换品牌标识。

**使用单汉字标识回退。** 否决。单个字不够明确，也不代表所需的麒麟身份。渲染出的品牌标识与本地化回退都包含「麒」和「麟」。

**给返回胶囊另设关闭回调。** 否决。外壳已经拥有遮罩、关闭按钮和 Escape 监听共用的关闭转换；增加另一条回调会让焦点恢复和 open 状态清理产生分歧。

## Consequences

设置详情现在具有受控的视觉宽度，并在任意宽度下保持单列路径。即使功能行发生变化，导航仍有稳定的外壳自有 About 目的地。其他品牌提供方可以替换 About 标识，而无需修改外壳组件。

标识席位是根作用域的单值席位；即使组合没有加载品牌提供方，也会得到明确的双字回退，而不是空白或单字标识。

## Testing

组件测试覆盖本地化 About 文案、72px 标识 owner 请求、提供方和回退渲染、底部导航位置、About 选择以及返回工作区操作。注册测试覆盖 About 分区子声明、品牌席位 dispose 和感知声明后的重新注册。GUI 测试 lane 覆盖 elevation 与 corner-shape 样式契约。
