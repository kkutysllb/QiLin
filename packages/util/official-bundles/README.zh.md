---
description: "宿主准入与插件页渲染共用的、由安装方持有的 bundle 名单，任何消费方都不再保留自己的副本。"
kind: "package-reference"
---

# @qilin-agent/official-bundles

[English](README.md) | 中文

## 概述

`@qilin-agent/official-bundles` 持有 QiLin 安装方按名字持有的每一份 bundle 名单：插件页隐藏的内建 profile 层、主列表与「更多」列表排序的可选 bundle、标记为实验性的 bundle、不再随发行版分发的名字，以及按需安装的公开发布包。宿主从这些名单准入 bundle，插件页从同一份名单渲染，因此在名单里加一个包名会同时到达两侧，而不会在宿主名单与客户端副本之间漂移。本模块只持有普通字符串与集合，不含注册表、服务或运行时状态。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 在插件页安置官方 bundle

`EXTENSION_BUNDLES` 按顺序列出主列表始终持有的可选 bundle；`MORE_BUNDLES` 列出留待 profile 启用后才进主列表的实验性 bundle，「更多」列表把它们排在最后；`HIDDEN_BUNDLES` 列出没有自身页面的层：内建 profile 层、由会话标题栏开关控制的 Agent Teams 组合包，以及始终开启的自动化任务层。插件页从这些名单推导位置，因此新增可选 bundle 时改动这里的 `EXTENSION_BUNDLES`，而不是某个包内的副本。位置同时取决于准入： 「更多」列表只放实验性 bundle，`EXPERIMENTAL_BUNDLES` 之外的可选 bundle 一律留在主列表，因此把名字从该集合移除即把它转正到主列表。

### 判断 bundle 是否实验性、隐藏或按需

`isExperimentalBundle(name)` 依据 `EXPERIMENTAL_BUNDLES` 作答，因此徽标跟随准入结果而不是包名前缀：仅以 `experimental-` 开头的包不会被标记。`isHiddenBundle(name)` 与 `isOnDemandBundle(name)` 在同一批名单上回答另外两个问题。

### 退役不再随发行版分发的 bundle

`RETIRED_BUNDLES` 列出产品不再随发行版分发的 bundle。仍选中其名字的 profile 照常启动：[`@qilin-agent/app-boot`](../../boot/app-boot/README.zh.md#profiles) 在加载 profile 时把该名字从 `qilin.profile.bundles` 移除并报告这次移除，而不是因为一个无处安装的 bundle 启动失败。该集合不影响插件页位置：退役名字不出现在任何提供列表中。

### 重命名迁移过的 bundle

`RENAMED_BUNDLES` 把迁移后不再使用的包名映射到替代它的 bundle。app-boot 在加载 profile 时改写 `qilin.profile.bundles` 中的名字以及对应的 `dependencies` 键，写回清单并在 stderr 报告一次。迁移前创建的 profile 因此仍能在发行版携带的替代包上启动，而不是解析旧名字失败；已经列出替代名字的 profile 只保留一行。

### 准入一个按需安装的发布包

`ON_DEMAND_BUNDLES` 列出插件页按需安装的公开发布包；其中任何包都不随发行版一起分发。`@qilin-agent/app-boot` 里生成的离线目录为每个准入名字携带一条元数据，其新鲜度检查会拒绝与这份名单不一致的目录。QiLin 不提供按需提供方后端时该名单为空，此时所有消费方都不提供任何条目，也不展示按需入口。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本模块是一张数据表加三个查询：三个 `ReadonlySet`（含退役名单）与三个 `readonly string[]`，包外无任何导入。两个名单用有序数组是因为位置按下标排序；三个成员判断读集合。测试断言消费方依赖的不变量：每个可选名字在两个有序名单中只出现一次、每个可选名字要么实验性、要么是主列表内建条目、要么按需、任何隐藏层都不出现在可选名单里、退役名字不出现在任何名单里。

### 源码地图

| 文件 | 作用 |
|---|---|
| [`src/bundles.ts`](src/bundles.ts) | 名单：隐藏层、主列表与「更多」列表选项、实验性准入、退役名字与按需准入 |
| [`src/placement.ts`](src/placement.ts) | 基于这些名单的三个成员判断 |
| [`src/index.ts`](src/index.ts) | 包导出 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [App boot](../../boot/app-boot/README.zh.md)——profile 层、可选 bundle 准入与生成的按需目录。
- [插件管理器](../../boot/plugin-manager/README.zh.md)——列出、安装与开关这些 bundle 的宿主服务。
- [插件管理页](../../client/ui-plugin-manager/README.zh.md)——渲染这些名单的插件页。

-----

<a id="model-experience"></a>
## 模型体验

无。这份由安装方持有的 bundle 名单只命名宿主准入、插件页渲染的包。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **实验性徽标跟随本名单而不是包名**——不在 `EXPERIMENTAL_BUNDLES` 里的已安装包，即使名字以 `experimental-` 开头也不会带徽标；它成为可选 bundle 时请把名字加到这里。
- **每个条目是一个精确包名**——名单持有 npm 包名，不接受范围或模式形式，因为决定准入的是名单存在性而不是版本解析。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

名单放在 util 包而不是宿主里：插件页运行在浏览器，不能值导入宿主包，只放在宿主里的表会迫使插件页保留第二份副本——本包正是为消除这种漂移而存在。由于运行时面是不带模块身份的静态数据，本包列入 `DUPLICATE_SAFE_PACKAGES`，因此两份已安装副本可以互换。

</details>
