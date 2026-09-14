# 用 Kylin 工具扩展运行中的智能体

[English](dynamic-kylin.md) | 中文

本实战指南启用 [`@qilin/tool-kylin`](../../../../packages/extensions/tool-kylin/README.zh.md)。智能体可以检查当前 Kylin 进程，并在内存中挂载或卸载模型编写的插件。临时插件会在卸载或进程退出时消失，并可能影响同一进程中的其他会话。

## 运行

使用仓库内 overlay 启动浏览器界面：

```sh
pnpm qilin web --patch apps/cli/config/examples/cordis/cordis.yml
```

该命令需要模型凭据。[Kylin 工具参考](../../../../packages/extensions/tool-kylin/README.zh.md)定义了四类约定：工具参数、存续时间、清理行为和安全性。
