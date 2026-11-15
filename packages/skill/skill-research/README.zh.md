---
description: "随包提供的科研工作流：从选题、文献综述到实验、统计、写作、图表、同行评审、引用审计与基金申请。"
kind: "package-reference"
---

# @qilin-agent/skill-research

[English](README.md) | 中文

## 概述

agent 可按需加载十个科研工作流：端到端项目编排、证据驱动写作、文献综述、论文评审、实验设计、统计分析、出版级图表、引用审计、深度网络研究与基金申请。每个 body 自包含，只使用部署已有的文件、shell、web 与 Python 工具；本包只发布指令，不附带可执行辅助程序。只有在与 skill 注册表和面向模型的 skill 工具一起挂载时，提供方才贡献目录条目。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将提供方与 `@qilin-agent/skill`、`@qilin-agent/tool-skill` 一起挂载。Web bundle 默认挂载本提供方，因此 Web 与 Desktop profile 会获得目录；Headless 或 SDK 部署需显式增加该行。

```yaml
- name: '@qilin-agent/skill-research'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `assetRoot` | 随包 `assets/` | 包含十个 skill 目录的绝对路径；打包载体可将其放在应用归档之外。 |

| skill | 用途 |
|---|---|
| `scientific-research` | 端到端或整篇稿件：范围、产物、阶段门、路由与完成审计。 |
| `research-writing` | 起草或修订章节、摘要、论文与学位论文，组织证据驱动段落与自然学术表达。 |
| `literature-review` | 检索日志、筛选、证据地图、主题综合与研究空白论证。 |
| `academic-paper-review` | 结构化审稿报告，或投稿前的对抗式自审。 |
| `experiment-design` | 假设、协议、对照、样本量、方法到实验的可追溯性、规划数据与可复现性。 |
| `statistical-analysis` | 检验或模型选择、假设、效应量、置信区间、多重比较与报告。 |
| `scientific-figures` | 数据清单、出版级图表、无障碍配色、示意图规范与图注。 |
| `citation-audit` | 记录核验、断言级支撑、撤稿检查、重复检测与格式一致性。 |
| `deep-research` | 当前多源网络研究：角度映射、全文阅读、交叉验证与带日期的来源。 |
| `grant-writing` | 资助匹配、一页概念、具体目标、研究策略、预算、评审标准与再提交。 |

当项目没有既有论文布局时，skill 默认把产物写到 `research/`：`plan/` 存放范围、进度、证据地图、实验协议与评审；`refs/` 存放检索日志与文献记录；`data/` 与 `figures/` 存放可复现分析与图表；`chapters/` 或 `manuscript/` 存放正文。若项目已有布局，编排 skill 会记录并使用该布局。

指令使用 `web_search` 与 `web_fetch` 获取外部来源，使用部署的 Python 环境做统计与绘图。缺少依赖时会报告，或在用户同意后安装；任何 skill 都不假定固定的 conda 环境或内置的学术 API 客户端。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内幕——点击展开</summary>

激活时读取每个随包 `SKILL.md` 的 frontmatter；缺失 skill、缺失 description 或相对 assetRoot 都会直接失败。提供方按打包档位为每个 skill 注册一个 `bundled` candidate，并同时启用模型与用户调用。skill 工具按需加载 body；提供方去掉 frontmatter 后返回 Markdown 正文。body 自包含，因此 candidate 的资源基址是不透明描述，而不是需要模型读取的目录。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供方注册、资源校验与 frontmatter 解析。 |
| [`assets/`](assets/) | 十个指令 body，每个 skill 一个目录。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Skill 注册表](../skill/README.zh.md) — 发现、优先级与提供方契约。
- [Skill 工具](../tool-skill/README.zh.md) — 会话目录与面向模型的加载器。
- [Office skills](../skill-office/README.zh.md) — 文档创作与结构检查。
- [Web 工具](../../web/tool-web/README.zh.md) — 研究指令调用的搜索与抓取工具。
- [工作区依赖](../tool-workspace-dependencies/README.zh.md) — 定位部署的 Python 与 Node payload。

-----

<a id="model-experience"></a>
## 模型体验

经 `qilin-tool-skill` 间接呈现：它渲染目录条目与被选中的指令 body。

#### KV Cache 影响

挂载提供方会在既有 skill 目录上下文中追加十个目录条目。加载 skill 时，其指令 body 追加在 skill 工具的插入点；两条路径都不会替换更早的 prompt 段。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 本包不提供学术数据库 API 客户端。文献检索使用部署的 web 工具与公开端点；离线部署无法检索。
- 引用核验依赖可访问的 DOI、PubMed、arXiv 或出版方记录。无法解析的来源保持未核验，不得当作已检查。
- 统计与绘图指令需要 `numpy`、`scipy`、`statsmodels`、`pingouin` 或 `matplotlib` 等包。本包不安装它们，随包 Python payload 也可能不包含全部依赖。
- skill 是指令而非校验器。它不能证明引用存在、统计检验已运行或图表已渲染；agent 必须执行并观察这些检查。
- 领域特定的报告规范与资助方规则因期刊、会议和项目而异，且会变化。agent 必须阅读当前的作者指南或招标要求，不能只依赖通用清单。
- 提供方不附带项目专用模板、数据集连接器或文献管理器集成。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

随包 body 改编自 MIT 许可的 `research-writing-skill` 项目、内部 KSkills 科研技能集、`academic-research-skills` 与 `Scientific Agent Skills` 的研究方法。署名与许可证文本见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。直接编辑 `assets/*/SKILL.md`；提供方在激活与加载时读取它们，包测试会校验目录顺序、body 预算与畸形资源拒绝。

</details>
