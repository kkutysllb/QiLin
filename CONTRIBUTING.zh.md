# 贡献

[English](CONTRIBUTING.md) | 中文

感谢你愿意为 QiLin 作出贡献！

我们深信开源社区的力量，这份信念从项目最初就塑造着 QiLin。

QiLin 仍处于早期阶段，并在积极开发中。很抱歉，我们目前无法接受外部 PR（Pull Request）。不过，贡献代码远非帮助本仓库建设的唯一途径。你还可以通过许多其他方式参与进来：

- 在 GitHub Discussions 中发现并报告问题或 bug：
  - 为你希望引起团队关注的讨论投票。我们的团队规模很小，可能无法回复每个帖子，但我们会持续关注，并在分配资源时将这些讨论纳入考虑。
- 为生态系统作出贡献：
  - 创建令你感兴趣的插件，并分享给其他人：
    - 为你的 GitHub 项目添加 `qilin-plugin` 话题，让其他人更容易找到你的插件。
  - 撰写有关 QiLin 的博客文章和操作指南。
  - 回答问题并帮助其他社区成员。

QiLin 的设计支持深度定制。我们并不认为官方仓库中的包天然就比社区开发的包更重要。你可以将本仓库看作一种理念、一份官方示例以及一处灵感来源，而不是我们要求社区遵循的方向。

我们已经看到社区中涌现出令人期待的项目，也希望生态系统继续沿着自己的方向发展。

## 如何解读 PR 上的 CI 结果

PR 跑到的每一条检查，都应当能由 PR 自身的内容解释。对基础设施前置条件敏感的工作流按以下方式降级（细节见各工作流头部注释）：

- `E2E (real DeepSeek API)`：本仓库未配置 `DEEPSEEK_API_KEY_EXTERNAL` 时跳过并给出提示；fork 与 Dependabot 的 PR 因 GitHub 不下发密钥而始终跳过。
- 治理机器人（`Issue policy`、`Issue lifecycle`）：本部署未配置 issue-management 应用时跳过。
- 发布排练与 Cloudflare 预览：仅在构建输入变化（`apps/**`、`packages/**`、`vendor/**`、`native/**`、`scripts/**`、manifest、lockfile、工作流自身）时运行。
- `CI`：默认使用维护者私有 runner 池；仓库变量 `QILIN_CI_FAILOVER_LINUX` 与 `QILIN_CI_PUBLIC_RUNNER` 选择 `.github/workflows/ci.yml` 中注明的回退层级。

如果某条检查因基础设施缺失而失败，请提 issue——那是仓库配置问题，不是对这次改动的评审信号。

探索未至之境。
