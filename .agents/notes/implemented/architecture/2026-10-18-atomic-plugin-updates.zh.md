# Agent Note: 就地更新已安装的插件

Status: implemented

[English](2026-10-18-atomic-plugin-updates.md) | 中文

## 问题

插件页面拒绝安装 profile 已经声明的包。Plugin Manager 在运行 pnpm 之前抛出 `already-installed`，输入框说明必须先卸载该包，而唯一的升级路径是「卸载再安装」：两次发布，该插件包的所有插件停止两次。这一拒绝源于 [profile resolution generation](2026-09-09-profile-resolution-generations.zh.md) 会拒绝任何改变保留映射目录的后继 generation，而从另一个位置重新安装正是这种改动。运行 HMR 的 profile 本就能在停止被替换的插件之后采纳后继 generation，因此这一拒绝把运行时本可应用的升级变成了一次重启或两段式替换。

## 决定

对已安装的依赖，只要 spec 在运行 pnpm 之前就能解析出同名包，`installBundle()` 就在它上面安装：spec 可以是 registry 包名、本地目录，或保存依赖时使用的 git 或 tarball spec。pnpm 就地替换该依赖的文件，保存的 spec 变为解析出的版本，组合包保持选入，调用方在运行结束后只发布一个后继 generation。有 HMR 时，重新组合替换已加载文件发生变化的运行中插件，因此新版本无需重启即生效；没有 HMR 时，运行中的插件保持旧版本，直到结果报告的重启。解析出的 spec 与版本都已被 profile 保存时不会改动任何东西，并答复 `upToDate`，既不选入、也不重载或重启。安装失败、被取消或未声明组合包时，仍然像以前一样恢复 `package.json` 与 `pnpm-lock.yaml`。

`ResolutionRouter.replace()` 采纳真实目录已变化的保留 profile 映射：把旧目录记录进 `MovedDirectories`，把 Node 先前从该目录选中的文件重定向到当前目录，然后发布后继 generation。Node 会保留它最初解析到的真实路径，因此正是这条记录让当前文件被加载。

安全边界保持不变。安装映射改变目录、声明者、版本或作用域，或离开映射表时，仍然抛出 `ResolutionRestartRequired`：实际加载的是 QiLin 安装自带的副本，插件层面的更改不得替换它。覆盖既有映射的新本地包名仍被拒绝。`inspect()` 与 `installBundle()` 在运行 pnpm 之前就拒绝 QiLin 安装或选中的本地组合包提供的名称，有无 HMR 的 profile 都是如此。

## 考虑过的替代方案

**保留拒绝，只让 Web 页面的「更新」作为升级路径。** 「更新」本就先卸载再安装，所以其他调用方只能照做或失败。一次版本变更要付出两次发布和两次插件停止，而无法删除的包（例如带有插件管理的组合包）根本不能升级。

**采纳所有映射的目录变化，包括安装映射。** QiLin 自带的包解析到别处，要么是安装已损坏，要么是在替换随发版提供的文件；这两种都不是运行中的进程应当采纳的变更。

**对重复安装答复失败。** 把同一版本当作错误，会让每个调用方自己比较版本，并把一次幂等请求当成失误。`upToDate` 用事实陈述这一点，不引入错误路径。

**通过比较文件判断是否变化。** 在运行前后比较包文件，与重新组合在已加载模块上已经做的事重复，而且无法说明保存的依赖是否发生了移动。

## 影响

一次调用即可升级已安装的插件：人们重新安装同一个包名，运行中的 profile 无需重启即运行新版本。代价是从另一个位置重新安装会静默变成一次目录移动，因此只有旧目录才有的文件仍按 Node 选中的位置保留，而插件先前导入的模块要等到该插件重启才会更换 identity。`inspect()` 现在会为 profile 已声明的名称询问注册表，因此离线 profile 看到的是注册表的失败，而不是立即拒绝。

## 测试

`packages/boot/plugin-manager/tests/package-reload.spec.ts` 先安装组合包的版本 1，再在它上面安装版本 2，经由真实 Loader 与 HMR 断言只发布一次、新版本正在运行、依赖与选入状态已保存，且没有重启原因；它还断言重新安装已保存的版本不会发布任何东西。`packages/boot/app-boot/tests/profile-resolution.spec.ts` 发布一个移动到其他目录的 profile 映射，再经由旧目录解析文件，并断言安装映射的移动与本地覆盖仍然抛出 `ResolutionRestartRequired`。
