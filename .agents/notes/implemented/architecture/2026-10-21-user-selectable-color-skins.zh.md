# Agent Note：用户可选的配色包作为第二条调色轴

Status: implemented

[English](2026-10-21-user-selectable-color-skins.md) | 中文

## Problem

QiLin 只有一套品牌配色，而且是无条件应用的：`ui-theme-brand` 加载时直接调用 `ctx.theme.overrideTokens`，凡是挂载该包的 profile 都会换色，与用户是否想要无关。用户唯一的选择是 `light`、`dark` 或 `system`。

增加配色没有正确的落点。再写一个同样覆盖 token 的品牌包，会按插件加载顺序叠加上去，而且用户无法取消某个配色；改用 `ctx.theme.register()`/`setTheme()` 更糟：`ThemeDefinition` 自带固定的 `colorScheme`，且只有三个内置偏好能跨过设置 schema，自定义 id 只存在于进程内，刷新即丢失。

## Decision

**配色包是与明暗偏好相互正交的第二条轴。** `ThemeSkin` 为 `{ id, label, tokens }`，由 `ThemeRuntime.registerSkin` 与 `setSkin` 拥有；持久选择放在 `ui-theme` 命名空间新增的 `skin` 字段，而不是 `preference`。每个 token 都声明两套方案，因此一套配色包可与用户选定的任意明暗方案组合。

**配色包按调色板命名，不按产品命名。** bundle 随附三套：玄金（`qilin`）、黑白（`mono`）、墨绿（`verdant`）。id 与名称描述颜色，组合可以提供其中任意一套而界面不暴露使用者；产品自有包携带自己的印章令牌，中性包把该令牌留给基础配色。

**叠加顺序为：明暗基础调色 → 配色包 → 显式覆盖层。** 配色包永远是最低层；`overrideTokens` 层仍然优先，部署强制指定的 token 不会被用户的选择推翻。既无配色包也无覆盖层时，活动定义按同一性透传——运行时规格钉住了这一点。

**卸载保留持久选择。** 提供方卸载只移除注册并重新发布；未注册的选择生效值回落到底色调色板，而持久值保留，重新启用插件后恢复用户的选择。只有 `setSkin` 写该字段，与 `setTheme` 及字体设置方法的单一写入口规则一致。

**标签是提供方自有的多语言文本。** `label` 为 `LocalizedText`，在外观行镜像同步时按活动语言链解析，语言切换时重新解析，因此产品名不会变成 ui-theme 必须拥有的文案。

**配色包的宿主侧提供插件前的画布底色。** `ui-theme` 提供 Host 侧的 `themeBoot` 注册表；提供方在这里注册浅色与深色底色，index 渲染会在任何浏览器插件加载之前画出选中配色的画布。提供方被禁用的选择回落到平台画布，即既有引导代码声明的底色。

**外观行只在已注册配色包达到两套及以上时出现。** 只有一套时它就是产品自己的调色，没有可选项，整行不渲染。QiLin 通过 [web-brand 补丁](../../../../packages/bundle/web-brand/cordis.patch.yml) 在 `ui-theme` 行设置 `skin: qilin` 保持现有视觉，走的是设置 schema 默认值，而不是代码分支。

## Verification

`pnpm run test:gui` 覆盖注册、选择、持久化、提供方缺失回退、显式覆盖层之下的层次、令牌目录、外观行的隐藏/显示，以及语言切换后的标签重解析；两个主题包仍满足逐文件 100% 覆盖率门禁。品牌规格钉住每个随附包的 id、名称、画布底色、双 scheme 取值与共享语义覆盖面，再通过注册、切换与卸载重新钉住玄金令牌，外观行规格证明 chip 行的选中与写回路径，bundle 规格断言产品补丁设置 `skin: qilin`。`pnpm run typecheck` 与 `QILIN_SNAPSHOT=replay pnpm run test:web` 覆盖客户端树与回放浏览器场景。

## Alternatives considered

**复用 `register()` 与 `setTheme()`，每套配色一个 id。** 主题轴自带 `colorScheme`，且只有内置偏好会持久化，选择刷新即丢失，每套配色还要拆成浅色、深色两个 id。

**每套配色注册一个覆盖层，按注册顺序叠加。** 用户永远无法取消某个调色，且胜出的颜色取决于插件加载顺序而非存储的选择。

**把选择存进每个提供方自己的命名空间。** 外观行必须逐个读取提供方的命名空间，而且选择会随提供方一起消失，无法在禁用后保留。

**把配色做成构建期的产品选择，每个产品一个 bundle。** 那回答的是另一个需求：多个安装包各自固定配色。它无法让同一产品提供多套可选调色，而产品默认值本来就只需一行 patch 表达。

## Consequences

- 组合注册两套及以上配色包后，设置界面多出一行 chip；QiLin 只有一套，在第二套发布前外观不变。
- 提供方已挂载时，首帧即使用选中配色的底色；提供方被禁用时，该帧使用基础方案底色。
- 第三方主题 id 仍是进程内扩展；持久化的是配色包这条轴。
