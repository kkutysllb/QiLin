---
description: "按注册表门禁要求的顺序，用两个手动工作流把 qilin 发布家族发布到 npm。"
---

# 手册：把发布版本发布到 npm

[English](releasing-to-npm.md) | 中文

## 概述

在发布提交落到 `main` 之后使用本教程。发布是两条独立序列：当发布清单引用了注册表尚无的 vendor 版本时，先发布内置框架（vendor）家族；产品家族随后发布，它的最后一步只有在每个声明的 `@qilin-agent` 范围都能在注册表解析时才通过。两个工作流都是手动触发；推送不会触发任何发布。

## 目录

- [1. 检查本次发布引用了什么](#check)
- [2. 先发布 vendor 家族](#vendor)
- [3. 发布产品家族](#product)
- [4. 读懂门禁的报错](#diagnose)
- [开发备注](#dev-note)

-----

<a id="check"></a>
## 1. 检查本次发布引用了什么

列出产品家族的 vendor 侧范围并与注册表对照：

```sh
pnpm run release:verify --family qilin
npm view @qilin-agent/kylin versions --json
npm view @qilin-agent/schemastery versions --json
```

直接查注册表，不要用 `npm view <package> version`：`latest` 标签是缓存读取，刚发布的版本可能在那里缺席，而注册表其实已经有它。

每个范围都能解析时，直接发布产品家族。某个范围指向注册表没有的版本时，先切 vendor 发布。

<a id="vendor"></a>
## 2. 先发布 vendor 家族

只升自上一个 `vendor-<package>-v*` 标签以来有改动的包；命令写入清单版本与锁文件并提交：

```sh
pnpm run release:vendor
```

按命令逐条打印的标签名给每个成员打 annotated 标签，并推送 `main` 与标签：

```sh
git push origin main
git tag vendor-cordis-v4.0.7 && git push origin vendor-cordis-v4.0.7
```

升级命令会为每个被抬升的成员打印确切标签；对每一个重复上面这行标签与推送。

从其中任意一个标签发起发布。这个 fork 默认关停该工作流，所以运行前启用、结束后再关停：

```sh
gh workflow enable "Release publish (vendor)"
gh workflow run "Release publish (vendor)" --ref vendor-cordis-v4.0.7
gh run watch
gh workflow disable "Release publish (vendor)"
```

<a id="product"></a>
## 3. 发布产品家族

```sh
gh workflow run "Release publish (qilin)" --ref v3.1.8
gh run watch
```

该运行会打包源码树、按依赖顺序发布，最后对上传的 tarball 执行 `release:verify-published`。需要在本地取得独立证据时，用该运行的产物重跑同一道门：

```sh
gh run download <run-id> -n qilin-npm-tarballs -D dist/npm
pnpm run release:verify-published --family qilin --from dist/npm
```

重新触发是安全的：发布步骤会跳过注册表已有的版本，因此发布中途失败的运行会从剩余成员继续。

<a id="diagnose"></a>
## 4. 读懂门禁的报错

```
release verify-published: UNRESOLVED @qilin-agent/session-snapshot@3.1.8 peerDependencies @qilin-agent/kylin@~4.0.6-alpha.2 — no satisfying registry version; publish the referenced family or fix the range
```

产品 tarball 已经发布，但它引用的某个家族在注册表缺席。看范围：`@qilin-agent/kylin*` 与 `@qilin-agent/kylin-plugin-*` 是内置框架，`@qilin-agent/schemastery` 是内置包，两者都通过 `Release publish (vendor)` 发布。一次只升了 vendor 版本却没有切标签、没有发布的改动，只会在这一步暴露——因为版本升级只改清单。

补发缺失的家族后，重新触发产品工作流。改范围属于清单变更，应放进新的发布提交。

<a id="dev-note"></a>
## 开发备注

无。
