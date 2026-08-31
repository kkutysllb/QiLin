# QiLin DSH 插件宿主（dsh-plugin-host）—— 无缝兼容 DSH 插件生态

> 由来：better-sidebar 案例验证了「直接装不可行」的三重宿主绑定（cordis 安装机制 /
> client 运行时依赖 / Typert 数据面）→ 用户定调总体要求：QiLin web 升级为 DSH 插件
> 生态的宿主——第三方 DSH 插件可在麒麟安装、使用、升级、卸载。

## 已定决策（用户拍板 2026-08-31）

- **安装模式**：装/卸/升级需**重启并重建 web bundle**——与 DSH 官方同构（构建期
  patch + inject），可靠性优先，不做运行时热插拔。
- **兼容分期**：先做**面板类插件**（sidebar tab / file viewer / dock——对用户最可见）；
  agent 运行时类（language / skills）后续按「一切皆 port」的要求封装成不同类型的
  port 插件。
- **版本基线**：锚定 **dsh 0.1.2-alpha.2**，长期实时跟踪上游。契约层（宿主 API 面）
  不变的版本，插件零适配；上游破坏性变更届时逐个分析。

## Task List

### H0 兼容性盘点 —— 进行中
- [ ] 8 插件 × 宿主 API 面矩阵（inject / patch / mount 点 / host 半 / 数据源）
- [ ] 插件分级：纯面板类 / 重 host 能力类 / agent 运行时类；选金丝雀
- [ ] @deepseek-ai 运行时包可得性确认（npm 公共源 / 本地 checkout）

### H1 最小宿主内核
- [ ] web-demo 内嵌 cordis + DSH client 运行时（0.1.2-alpha.2 面）
- [ ] 插件清单 + 构建期注入（安装 = 改清单 + 重建 bundle + 重启）
- [ ] 自研 hello-tab 样例插件自测兼容层
- [ ] 第三方金丝雀插件在麒麟跑通（渲染 + 卸载干净）

### H2 Typert 能力桥
- [ ] gateway 实现 api-remotes 协议端点（翻译层，南向接 QiLin 现有 API）
- [ ] fs → files API（已有）、pty → ports（已有）、git → 新增评估

### H3 生命周期管理
- [ ] 等价 `dsh plugin add/remove/upgrade` 的麒麟命令或 UI
- [ ] semver + dsh 版本兼容声明检查
- [ ] 插件管理面板（清单/启停/卸载）

### H4 面板类挂点铺开
- [ ] sidebar tab / file viewer / dock 挂点对齐 0.1.2-alpha.2 契约
- [ ] conversation turnTail 链（后置，依赖聊天 UI 插槽对齐）

### H5 agent 运行时 port 化（远期）
- [ ] language（system-prompt section）/ skills 按「一切皆 port」封装为 port 型插件

## Findings

（H0 盘点矩阵待填）

## Progress Log

- 2026-08-31: 计划创建。三项决策落定（同构安装模式 / 面板类先行+运行时类 port 化 /
  锚定 0.1.2-alpha.2 长期跟踪）。开工 H0。

## Errors
