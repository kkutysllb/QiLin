# Agent Note: 以可选组合包交付实验能力

Status: implemented

[English](2026-09-21-experimental-capabilities-as-optional-bundles.md) | 中文

## 问题

Web 插件页此前提供三个可选组合包：Agent Teams 的 Host 层、Web 面板和语音输入。Auto review 和 Inspector 虽已作为实验包发布，且早已声明 bundle patch 或提供可挂载的 overlay，但用户仍需按名安装或手写 profile patch 才能启用。

## 决策

`OPTIONAL_BUNDLES` 收录 Agent Teams Host 层、其 Web 面板、语音输入和 Auto review。每个可选组合包必须声明 `icon` 并导出带 `meta.title` 与 `meta.description` 的 `./locale/*.json`，Official 分组据此渲染本地化的标题、描述与图标；`verify-default-product-isolation` 拒绝缺失项。Inspector 的 `cordis.patch.yml` 改为写包名而非构建产物路径，同一文件既是 bundle patch，也是构建版 Web 启动所需的 `--patch` overlay。

可选组合包是安装的运行时依赖，其依赖图会随每一次 qilin 安装下载。因此清单只收录依赖图本就在安装闭包内的包；Auto review 不引入任何新依赖。Inspector 仍通过显式安装提供，不出现在默认插件清单中。browser-use 与 computer-use 的 provider 保持显式组合：Playwright MCP、Chrome DevTools MCP 与原生 Cua Driver 的运行时二进制会为每次安装增加约 85 MB 和 21 个包，而无论组合包是否启用；交付 Cua Driver MCP 开关等于承诺一个安装里并不携带可执行文件的能力。这些 provider 包保留供组件行使用的 locale 展示元数据。另有三个包因其他原因不收录：`ptc-runtime-python` 会替换 PTC 运行时；`workflow-ptc` 在加载时拒绝非 TypeScript 运行时，而 Web 预设携带的 `workflow-ptc` 行是 bundle patch 无法触及的；`browser-use-stagehand-native` 在 schema 校验时就要求原生模型名与 API key，而页面上没有对应的配置表单。

## 已考虑的替代方案

**把每个 provider 都做成可选组合包。** 组合与展示都没问题，但会为多数安装永不开启的能力引入 provider 运行时；语音输入的 `sherpa-onnx-node` 是唯一被接受的先例。

**把仅注册用的 `computer-use` 与 `browser-use` 服务挂进 `@qilin/base`。** 共享组合会携带只有可选 provider 组合包需要的行；provider 组合包完全可以在自己的 patch 与依赖里插入服务行。

## 后果

Official 分组增至四项，均以 experimental 命名标记为实验性。安装的运行时依赖闭包不变。browser-use 或 computer-use 的 provider 仍需要其 Service Definition，以及 profile patch 或组合中的 provider 行。
