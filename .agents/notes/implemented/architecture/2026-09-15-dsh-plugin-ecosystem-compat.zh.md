# Agent Note: DSH 插件兼容与按 profile 管理用户插件

Status: implemented

[English](2026-09-15-dsh-plugin-ecosystem-compat.md) | 中文

## Problem

QiLin 需要加载使用 dsh.bundle 与 dsh.client manifest、请求 @deepseek-ai/dsh-* 浏览器模块名、并通过旧 peer 名称导入宿主包的 DSH 时代插件。设置页也需要让用户安装、升级和卸载 profile 插件，同时区分 profile 文件变更与运行中的 Loader 状态。

## Decision

QiLin 优先读取 qilin 元数据，再回退到 dsh 元数据。app-boot 模块 fallback 将 DSH 依赖名规范化到已安装的 QiLin 包目录，并同时发布两个名称，使旧宿主导入继续使用同一个 QiLin 引擎实例。被翻译的名称会复用**已经为它的 QiLin 对应名选定的目录**——安装遍历如此，bundle 遍历也如此（后者从安装遍历接收这些选定结果）——因为再次从声明方锚点解析对应名可能落到同一个包的第二个副本上，从而使"共用实例"失效。客户端模块图和静态种子别名使用同一兼容映射。

`loadLayeredEnv` 还会把 `DSH_HOME` 钉定为解析出的 Harness 主目录，作为高于继承环境和两个 `.env` 层的 `dsh-compat` 层。为 DSH 编写的插件通过该变量解析自己的数据目录，而共同安装的 DSH 进程导出的值指向本 harness 既不读取也不拥有的主目录——插件把预设发布到那里，扫描 Harness 主目录的预设名册就看不到它。`QILIN_HOME` 仍是用户自己的根目录覆盖入口。

协调 profile 已安装依赖时会拒绝安装了上游 DSH 时代引擎包的 profile。这类副本从 profile 解析，优先于兼容层 fallback，激活它会加载第二份引擎实例，插件注册会以 `cannot get property "skills" without inject` 一类错误失败。CLI 与 Web 插件管理器经由同一个 reconcile 到达该拒绝，因此任一侧都无法激活第二份引擎；诊断会指明每个冲突包、它映射到的 QiLin 包与 `qilin plugin remove` 命令，bundle 列表保持不变。被改名的引擎名解析失败时，会在插件导入处报告同一映射，因为启动器只为已选插件声明的名称发布旧名。

可管理的插件行只有一个实现（`readProfilePluginRows`）：`qilin plugin list` 打印它们，设置面背后的管理器在 `listBundles` 回答里读取同一份 profile 清单，因此两者不会在层序、实装版本、来源或可卸载性上产生分歧。`qilin plugin doctor` 以单个包为单位回答同一组兼容问题且不执行任何东西——它会报告：包在从不读取 `DSH_HOME`/`QILIN_HOME` 的情况下自建 DSH 时代主目录、安装了引擎包（上游 DSH 名称，或本安装已经提供的名称）、导入了从未声明为 peer 的引擎名、或注入了兼容层不映射的客户端模块名。报告是建议性的，仅在发现会阻断激活时才以非零码结束。

profile 变更由 `@qilin/plugin-manager`（`packages/boot/plugin-manager`）负责，它从已退役的 `@qilin/host-plugin-manager` 手上接管了这条通道（[对齐说明](2026-09-17-upstream-dsh-0.1.6-alpha.2-alignment.zh.md)）。pluginManager Remote 经共享的包操作在启动 profile 中运行 pnpm，应用 bundle 激活，限制保留输出，并报告 restart-required，因为当前启动的 bundle 组合已经冻结。

每行的权限跟随其解析通道。内置层永不可卸载，且 profile 不拥有其中任何一层：内置插件通道退役后 `PROFILE_OWNED_BUNDLES` 为空，因此每个内置层都随安装实例整体升级，既不可更新也不可卸载。Remote 方法名必须避开客户端 namespace service 自身的表面——它保留了 `install`、`remove` 等字段与成员；管理器暴露 `listPlugins`、`listBundles`、`inspect`、`checkUpdates`、`catalog`、`installBundle`、`setBundleEnabled`、`setPluginEnabled`、`removeBundle` 与 `cancelInstall`，并由 `isRemoteMethodNameAvailable` 作为共享判据固定该规则。

设置面不再有 user-plugins 标签：侧栏 Plugins 页（`@qilin/client-ui-plugin-manager`）经 manager Remote 管理 profile 的 bundle，`ui-settings-plugin-inventory` 保留内置组合未列出的 bundle 的只读清单。所有文案经过本地化，版本与来源来自同一个 Remote，registry 升级检查与 GitHub `topic:dsh-plugin` 发现分别走它的 `checkUpdates` 与 `catalog`。

## Alternatives considered

- 不扩展 plugin-inventory，因为它是只读 Loader 投影，变更会混淆所有权。
- 不热挂载新安装 bundle，因为 composeLive 复用启动时 patch，会产生第二个组合真源。
- 不只保留客户端别名，因为 DSH 宿主包也会通过 Node 解析导入旧名称。
- 不放任继承来的 `DSH_HOME`，因为插件数据目录与其发布的预设会落到共同安装的 DSH 的主目录，而不是本 harness 读取的那个。
- 不在安装被污染后改写 profile 的依赖边：profile 是用户自己的项目，静默改写会掩盖冲突而不是报告它，下一次安装还会重新引入。
- 不在 CLI 侧另算一份插件行：两个界面会在版本解析、来源与可卸载性上逐渐分叉；行由 app-boot 拥有，两个消费方只做投影。
- 不通过加载插件来判断其兼容性：报告必须在安装或启动之前就能给出，为判断而执行第三方代码会破坏这一前提。

## Consequences

依赖已重命名 QiLin API、Electron bridge 或不兼容 resource scheme 的 DSH 包仍需逐个验证。在 `.env` 中声明 `DSH_HOME` 会被记入其所在层但永远不会胜出；迁移根目录是 `QILIN_HOME` 的职责。被拒绝的安装会把冲突引擎包留在磁盘上，直到操作者执行打印出的清除命令，因为启动器从不改写 profile 的依赖。doctor 读取源码文本而不执行插件，因此包可能通过检查却在运行期因 API 改名失败；其引擎重复告警只覆盖安装实例自身的目录树，不含通过 `NODE_PATH` 可达的包。包操作要求 pnpm 和可写 profile，成功变更必须重启进程后才会激活。浏览器级安装与重启验收仍依赖部署环境。

## Verification

兼容层、profile、manager 与客户端模块测试通过；Host/Client TypeScript 聚合、客户端包检查、本地化、导出 JSDoc、包路径、GUI、生成产物和空白检查通过。launch-environment 规约覆盖该钉定相对其替换层的优先级，DSH 主目录钉定规约在钉定被移除时会失败。profile 规约覆盖冲突列表、拒绝行为与不变的 bundle 列表，plugin manager 规约覆盖 Web 路径上的同一拒绝。解析规约覆盖 ESM 与 CommonJS 上的 DSH 时代名称诊断，并让未翻译的名称继续使用 Node 自己的错误；移除该诊断会使它失败。doctor 规约覆盖四项检查、源码扫描的排除规则与每种严重级别的判定。profile 级兼容规约把一个 DSH 形态的插件装进 profile、经 Loader 启动，并断言发布的旧名指向安装实例的副本；在上文"复用同一目录"规则之前它会失败，之后通过。当 `QILIN_DSH_PLUGIN_FIXTURES` 指出本地镜像的真实插件目录时，它还会用 doctor 检查这些插件，否则跳过该段。依赖策略仍有一个与本次无关的既存 @qilin/fs#FsVersion 分类问题。
