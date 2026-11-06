# Agent Note: 发布仅记账变化的 DSH 时代别名

Status: implemented

[English](2026-11-06-dsh-alias-bookkeeping-publishes.md) | 中文

## 问题

对任何声明了改组名前 `@deepseek-ai/*` 名称的组合包执行安装、开启、关闭与卸载，Plugin Manager 都会以 `package-moved` 报告 `restart-required`，于是每次这类操作都告诉用户重启 QiLin，尽管插件已经可以运行。

[运行时 generation](../architecture/2026-09-09-profile-resolution-generations.zh.md) 为每个作用域分别发布别名条目。安装自带 QiLin 包的别名由安装发布（`scope: 'installation'`，由安装清单声明），而选中组合包的清单只要声明了该 DSH 时代拼写，就会把同一目录的别名重新发布到 profile 作用域（`scope: 'profile'`，由该组合包声明）。因此选入或取消选入该组合包会在两种作用域之间改变答复该名称的条目——同名条目的最后一条生效——而 `ResolutionRouter.replace()` 会拒绝目录、声明者、作用域或版本发生移动的保留映射。`app-boot` 的发布把该拒绝转成 `package-moved`，于是一个前后由同一目录提供同一版本的变更也需要等待重启。

## 决策

- `ResolutionRouter.replace()` 按真实包目录与记录的版本来比较保留映射。两者不变时，无论作用域与声明者变成什么都会发布：同一个物理包答复这两种记账形式，不会改变已加载模块、缓存条目或对象引用。
- 真实目录发生变化的保留映射仍要求重启，安装映射的版本变化同样如此。不属于 profile 作用域的映射被移除、以及新的 profile 本地名称覆盖安装自带的包，也仍要求重启：这些变化决定进程接下来会加载哪些文件，而新装的插件带来安装自带包的同名副本正是重启可以避免的第二份实例。
- profile 映射解析到另一个目录时仍按移动采纳，Node 先前从旧目录选中的文件改从当前目录加载。

## 备选方案

**安装已发布该名称时不再在 profile 作用域发布别名。** 每个名称只留一条条目即可消除这次翻转。它同时抹掉了"哪份清单声明了该名称"的记录，而该记录是解析这个包自身依赖时的原生锚点，也是 profile 自有链接的来源，materializer 与 HMR 的映射目录都得随之改动。让"同一目录与同一版本即同一个包"由比较规则判定，比改动遍历更贴合职责。

**把作用域变化记作目录移动。** `MovedDirectories` 把 Node 先前从旧目录选中的文件改指当前目录。这里目录没有变，没有可记录的迁移。

**继续整条比较条目。** 这正是被报告的行为：任何已加载模块都无法观察到差异，却仍要付出一次重启，而声明 DSH 时代名称的组合包永远无法在运行中的会话里开启。

## 测试

| 证据 | 行为 |
|---|---|
| [profile-resolution.spec.ts](../../../../packages/boot/app-boot/tests/profile-resolution.spec.ts) | 未选入组合包的 generation 把别名记为安装自带，选入后记为同一目录同一版本的 profile 映射；两份后继 generation 都发布，且别名仍解析到该目录。从另一个目录重新发布该别名的组合包会被拒绝。 |
| [package-reload.spec.ts](../../../../packages/boot/plugin-manager/tests/package-reload.spec.ts) | 安装、关闭、开启与卸载声明该改组前名称的组合包都报告 `applied`，别名在两种作用域间移动，插件在同一会话中启动与停止。 |

## 影响

- DSH 时代组合包可以在不重启的情况下安装、开启、关闭与卸载，插件在改动 profile 的那个会话中运行。
- 两个组合包以不同声明者声明同一别名时仍按目录与版本比较，生效的那条条目决定解析该包自身依赖所用的锚点。通过该比较的别名，其每个锚点都把该包解析到同一个目录。
- 发布的 generation 会在两种作用域中同时列出一名称；条目表保留最后一条，与改动之前相同。

## 相关

- [不可变的 profile 解析 generation](../architecture/2026-09-09-profile-resolution-generations.zh.md) 持有发布规则，其增量变更一节描述本条比较。
- [就地更新已安装的插件](../architecture/2026-10-18-atomic-plugin-updates.zh.md) 持有重装所产生的 profile 映射移动。
