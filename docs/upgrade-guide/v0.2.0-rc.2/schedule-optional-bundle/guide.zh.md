---
kind: upgrade-guide
description: "QiLin 通过可选 bundle `@qilin-agent/experimental-schedule-bundle` 提供 Schedule、其时钟读数与页面，而不是通过 Web 组合。"
---

# Schedule 以可选 bundle 提供

[English](guide.md) | 中文

## 变更

上游在 0.2.1-alpha.1 移除了其实验性 Schedule bundle，把该能力移入 Web 组合与预设：`@deepseek-ai/dsh-web-app` 在每个 Web profile 中挂载 `schedule` 服务与 `ui-schedule` 页面，其 `standard`、`cordis` 与 `ptc` 预设声明时钟读数及四个 `schedule_*` 工具。QiLin 保留较早的供给形态。

`@qilin-agent/experimental-schedule-bundle` 列在 `packages/boot/app-boot/src/profile.ts` 的 `OPTIONAL_BUNDLES` 中，因此每次安装都随附但默认关闭，插件管理页在“官方”分组以“自动化任务”提供它。启用后，该包被追加到 profile 的 `qilin.profile.bundles` 列表，其 patch 在 profile 根插入 `time-context`、`schedule` 与 `ui-schedule` 行。随发行版交付的 Web 组合不含这三行中的任何一行；随发行版交付的 `ptc` 预设声明 `tool-schedule` 行，后者仅在 `schedule` 服务处于作用域内时注册这四个工具。

使用者可观察到的、与上游形态的差异：

- 关闭 bundle 时，随发行的 Web profile 没有“自动化任务”页面、没有 Session 提醒目录、没有时钟读数、也没有提醒工具。页面与目录是缺席，而不是空状态。
- 时钟行在此处是 profile 根行，因此顶层的 `- id: time-context` 覆盖能命中它。上游把时钟行声明在 Web 预设中，顶层覆盖匹配不到任何行。
- 该版本中 QiLin 只交付一个预设 `ptc`。上游的 `standard`、`cordis` 与 `ptc` 预设声明时钟行与四个工具，`minimal` 两者都不声明。
- 选择状态存放在 `qilin.profile.bundles`；在插件管理页关闭该 bundle 会移除它。

[bundle README](../../../../packages/experimental/schedule-bundle/README.zh.md) 记录了本部署为何保留该 bundle，而不是把三行并入 Web 组合。

## 迁移

1. 在插件管理页的“官方”→“自动化任务”中启用该 bundle；[用户指南](../../../user/guide/schedule.zh.md#create-reminders)负责启用方式与创建第一条提醒的说明。由其他工具写入的 profile 清单，可通过把 `@qilin-agent/experimental-schedule-bundle` 加入 `qilin.profile.bundles` 来选择它。
2. 不要套用上游的退役步骤。放弃 bundle 选择、依赖 Web 组合的行，会让 QiLin 没有 `schedule` 服务，于是页面、目录、时钟读数与工具都保持缺席。
3. 把 `schedule` 与 `ui-schedule` 的覆盖放在 `cordis.patch.yml` 或 `--patch` overlay 中。只有在选中该 bundle 时它们才生效，因为随发行版的组合不声明这两行。顶层的 `time-context` 覆盖同样只在选中该 bundle 时生效。
4. 自行声明时钟行或提醒工具行的预设仍会挂载它们。在 `schedule` 服务缺席时，预设的 `tool-schedule` 行不注册任何工具，因此该 bundle 仍是随发行版提供该服务与页面的方式。
5. 确认：侧边栏出现“自动化任务”，存在活动提醒时 Session 头部显示时钟，模型收到 `schedule_create`、`schedule_list`、`schedule_update` 与 `schedule_delete`。关闭 bundle 会移除这四个工具，并把已存任务与投递记录保留在磁盘上，下次启用时继续使用。
