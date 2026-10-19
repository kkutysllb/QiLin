# plans/2026-10-19-web-e2e-scaffold-settings-gate.md

## web e2e scaffold/settings 门控修复（独立批次 B4b）

日期：2026-10-19 · 上游参照：tag `dsh-v0.2.1-rc.2` scaffold（导出件 /tmp/us-rc2/scaffold.ts）· 前序：plans/2026-10-19-upstream-0.2.1-rc.2-models-domain-alignment.md §4-§4.2

## 1. 问题（HEAD 既有缺陷）

base bundle 的 settings 行 `disabled: !!js "!ctx.get('profileContext')"` 要求 profile 才启用 settings 服务；麒麟 apps/web/tests/scaffold.ts 仅在场景显式传 `profile:` 选项时才 provide profileContext。不传的场景（models-settings、deepseek-messages-settings、onboarding-deepseek-config、onboarding-usable-provider 等）走直挂分支 → settings 恒缺 → 模型页必红（「settings service is absent」）。上游 rc.2 的 scaffold **无条件** provide profileContext。

## 2. B4a 教训（已回退，见前计划 §4.1-§4.2）

上游式全面改装（formDefaults 部署默认层 + 全场景改走 profile 挂载）修好四场景（23/23）但打破 8+ 其余场景（client-plugin-live、plugin-manager、sidebar-right、voice-download 等），修复代价不成比例，已整体回退。

## 3. 本批方案：最小供给（minimal provision）

只改供给、不改组合：非 profile 分支**保留直挂 cordis:include + 原 patches**，仅补两个 provide——

1. 构造最小 profileContext（dir=profileDir、patchPath=profile.patchPath、installAnchor、cwd/home、startedBundles=[base, web-app]、overlays=场景 overlay 列表）；
2. 一并 provide `appReady`（HMR 行随 profileContext 启用后依赖它；缺省会挂死引导）。

**不改**：挂载方式、patches 顺序、无 formDefaults bundle、场景文件零改动、goldens 零刷新（理论）。

## 4. 验收

- 四目标场景绿：models-settings、deepseek-messages-settings、onboarding-deepseek-config、onboarding-usable-provider；
- 非设置场景无回归：declared-reasoning（小型探针）保持基线；
- 全量 web 通道不劣于基线（基线本身红面另测，见 §5）。

## 5. 已知未决

- 真实 HEAD 基线的全量红面未测（B4a 期间的失败清单混杂了改装波及与既有红）；本批以「不劣于基线」为约束，逐文件差异需在全量轮里归因；
- settings 写入落点随 profileContext 就位改为 profile 的 cordis.patch.yml，凡断言 `$QILIN_HOME/settings.yaml` 的场景（如 settings-chrome）可能需按上游语义跟进——本批只记录不顺手改。

## 6. 最小供给探针（2026-10-19 晚，两轮，均已回退）

- 第一轮（provide profileContext+appReady，保留直挂）：5 文件 18 败/5 过，全部超时（420s）——对照场景 declared-reasoning 也红。
- 第二轮（补 initProfile+manifest 写盘）：models-settings 12 败/2 过/2 跳，314s 超时，对照仍红。
- 结论：**杂交形态不成立**——profileContext 与直挂 cordis:include 并存时插件管理器/HMR/config-editor 走 profile 语义而组合层不匹配；上游式**挂载转换是必需项**，不是可选项。
- 下一步（留给本批后续）：沿 B4a 的完整改装路线（mountRootInclude + formDefaults + manifest），把 §4.1 的 8+ 波及文件逐个归因修复；每轮以单场景快探（<1 min）迭代，全量轮只在收敛后跑。
