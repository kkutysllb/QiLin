# Agent Note：内置科学研究技能

Status: implemented

[English](2026-11-15-bundled-scientific-research-skills.md) | 中文

## 问题

科研任务横跨文献检索、证据综合、实验设计、统计分析、图表、稿件写作、引用核验、同行评审与基金申请。引擎此前只有文档创作技能，没有科研工作流，agent 只能自行发明维持论文可追溯性的证据与评审门。按项目安装第三方技能包还会让可用目录依赖用户的本地配置。

## 决策

[科研提供方](../../../../packages/skill/skill-research/README.zh.md)在打包档位贡献十个自包含技能：`scientific-research`、`research-writing`、`literature-review`、`academic-paper-review`、`experiment-design`、`statistical-analysis`、`scientific-figures`、`citation-audit`、`deep-research` 与 `grant-writing`。Web bundle 挂载该提供方，因此 Web 与 Desktop profile 会获得目录。Headless 与 SDK profile 保持精简，只有部署显式增加该行时才承担目录开销。

body 是自包含 Markdown，资源基址为不透明描述；提供方在激活时读取每个 description，在加载时读取对应 body。包内不含脚本、数据库客户端或 Python 环境。指令使用部署已有的文件、web、shell 与 Python 工具，并写明科研任务必须产出的门与产物。可配置的绝对 `assetRoot` 支持应用归档无法被模型文件工具读取的载体；包测试覆盖资源迁移、畸形元数据、目录顺序、释放与 body 预算。

方法改编自 MIT 许可的 [research-writing-skill](https://github.com/norman-bury/research-writing-skill)、内部 KSkills 科研技能集、[academic-research-skills](https://github.com/VincenzoImp/academic-research-skills) 与 [Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills)。署名与许可证文本随包放在 `THIRD_PARTY_NOTICES.md`。

## 备选方案

**逐字复制上游技能树。** 上游包带有平台专用 hook、脚本与嵌套模块路由，不适合 QiLin 的 skill 提供方；复制还会引入第二套需要维护的工作流系统。新 body 保留方法，同时维持单一目录形态。

**随包提供文献检索 Python 脚本。** 上游脚本依赖外部 API 与随包运行时并不保证的 Python 包。科研指令改为通过既有 web 工具访问同样的公开端点，并如实报告缺少网络或依赖。

**每个科研 skill 一个包。** 十个小包会放大 bundle 行、manifest 与测试，却没有独立生命周期。单个提供方把目录与署名放在一处；某个 skill 仍可在不改提供方的情况下编辑或移除。

**现在就增加专用学术检索工具。** 面向模型的工具可以减少查询构造工作，但会引入限流、凭据与结果整形契约。当前 skill 可通过 `web_fetch` 访问 Crossref、PubMed、arXiv 与 Semantic Scholar；专用工具仍是独立的能力决策。

## 影响

Web 与 Desktop profile 会增加十个目录条目及其 description；加载 skill 只追加对应 body。Headless 与 SDK profile 不变，除非它们挂载该行。skill 不能证明引用存在、检验已运行或图表已渲染，agent 必须执行并观察这些检查。离线部署无法检索；统计或绘图代码依赖随包 Python 可能未包含的包。更新方法需要编辑随包 asset 及其测试，不会自动同步上游。
