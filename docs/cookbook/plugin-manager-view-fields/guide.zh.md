# Cookbook：插件管理视图字段

[English](guide.md) | 中文

**插件**页面渲染 Host 的 `pluginManager` Remote 返回的内容；页面从不读取的字段是线上载荷里的冗余。本页列出页面从 [`plugin-manager`](../../../packages/boot/plugin-manager/README.zh.md) 消费的字段，改动任何一侧时对照本页。

## 组合包行

| 字段 | 页面显示位置 |
|---|---|
| `name`、`version`、`source`、`installTarget` | 卡片标题、来源信息区的 spec 与当前版本，以及按需官方组合包提供的版本。 |
| `meta.title`、`meta.description`、`meta.icon` | 卡片与页面的展示文案和插画，按当前语言。 |
| `description` | 没有本地化展示文案时使用的清单一句话描述。 |
| `enabled`、`installed`、`optional`、`removable`、`readOnlyReason` | 开关、移除，以及控件被锁定的原因。 |
| `availability`、`official` | 官方与已安装标签页、文件缺失状态，以及页面是否从 npm 读取详细介绍。 |
| `updatable` | 页面是否读取 `listVersions` 并显示版本区与**更新**。 |
| `error`、`rows`、`overrides` | 异常标签、组件行，以及组合包 patch 未声明却改动的行。 |
| `readDetail`（Remote） | Markdown 详细介绍文档及其图片。 |

## 版本字段

`listVersions` 返回 `PluginVersionList`。页面从最新的、声明了组合包、没有 `deprecated` 文案、不是 `prerelease`、且没有 `incompatible` 记录的 `versions` 条目提供更新；`tags`、`publishedAt`、`omitted` 与 `attempts` 用来说明该列表，`registry` 是更新必须先询问的注册表。

## 更新字段

`updateBundle` 返回 `PluginUpdateResult`：`from` 与 `to` 是版本，`step` 说明停在哪一步，`result` 携带该步的 `ChangeResult`，`restore` 报告被移除版本的重新安装。`plugin-manager/update-state` 为对话框的步骤列表宣告 `checking`、`removing`、`installing` 与 `restoring`。
