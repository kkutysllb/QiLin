# plans/2026-10-20-issue-19-fail-loud-decision.md

## Issue #19 决策：严格启动 + 显式容错恢复口（(b)，2026-10-20）

### 背景
app-boot 的 loadProfileDirectory 已改为严格（不可解析/无 bundle manifest 的 qilin.profile.bundles 层启动即抛错）。这会让 plugin-manager 的 10 个「启动时带损坏 bundle → 列表/移除以恢复」测试失败。

### 决策：不选「全部严格 (a)」，选「严格默认 + 显式容错口 (b)」

理由：
- 若用户安装了损坏 bundle，严格启动会让应用拒绝启动，而**能移除它的 GUI 恰好不可达**——fail-loud 会把「可修复的配置错误」变成「砖化的安装」；
- Issue #19 的诉求是「静默跳层」变「可诊断」，而非「任何情况下都拒启」；
- 恢复路径是产品内合法的容错场景，应有显式、被文档化的 opt-in。

### 实现约定
1. `loadProfileDirectory(..., { tolerateSkippedBundles: true })` 显式容错；默认严格，抛错诊断需含：包名、原因、恢复动作（移除/替换该 bundle）。
2. 容错口仅用于：plugin-manager 恢复路径、HMR 重组合（运行中应用需在坏 bundle 下存活）；boot / CLI / desktop 一律严格。
3. 测试矩阵：严格模式（损坏 bundle 抛错）+ 容错模式（同一组合加载成功并把该 bundle 记为 skipped）+ 原 10 个 manager 恢复测试改走容错模式。
4. 文档：JSDoc + package README（EN/zh，再生 pairing 哈希）说明严格/容错边界与理由。

### 状态
- **已按本决策落地**：严格默认 + `tolerateSkippedBundles` 显式容错口（plugin-manager 重组合与 HMR 走容错）；严格/容错测试矩阵、app-boot 与 sdk-runtime 双语 README、二层（installAnchor 口径）决策措辞均已写入；app-boot 711 绿、host tsc 0、runtime-closure 与 pairing 通过。
