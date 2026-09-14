# Agent Note: 源码与构建产物平面验证

Status: implemented

[English](2026-09-14-source-artifact-verification.md) | 中文

## 问题

TypeScript 源码检查通过 `src` 解析工作区包，而构建会把 JavaScript 和声明文件发射到 `lib`。如果编译产物误写进 `src`，测试就可能加载第二份实现或依赖陈旧的生成文件。

## 决策

[`scripts/verify-source-artifacts.ts`](../../../../scripts/verify-source-artifacts.ts) 扫描仓库支持的源码根目录，并拒绝 `src` 下的 JavaScript、source map，以及与 TypeScript 源文件同名的声明文件。它通过源码根目录的显式列表避开构建目录，同时保留 `css-modules.d.ts`、`vite-env.d.ts` 等环境声明。检查通过 `pnpm run verify-source-artifacts` 暴露，并加入共享 static 与 `check:all` 门禁清单。

检查只报告路径，不会删除文件。`pnpm run clean` 仍是显式清理操作，源码测试必须在验证通过后运行。

## 验证

[`scripts/verify-source-artifacts.spec.ts`](../../../../scripts/verify-source-artifacts.spec.ts) 覆盖已发射 JavaScript、source map、同名声明文件、环境声明和嵌套 `lib/types/src` 产物。static 门禁调用与本地开发和 CI 相同的命令。

## 曾考虑的替代方案

- **扩展 `pnpm run clean` 去删除源码平面的产物** —— `clean` 依据 TypeScript project-reference 图规划删除并整目录移除；删除与手写源码同目录的单个文件需要拒绝路径，而且静默清理会抹掉指向错误配置命令的证据。
- **把 `src` 下的生成扩展名加入 gitignore** —— 忽略只是让版本控制系统看不到事故，陈旧实现仍会被源码测试加载；缺陷在于文件存在，而非其跟踪状态。
- **通过 `git status` 未跟踪文件检测** —— 门禁还必须拒绝被误提交的产物，因此检查不能依赖 git 脏状态约定。

## 后果

如果编译器或打包器向源码目录写入产物，干净检出会 fail closed。构建产物继续位于 `lib` 供产物消费者使用，源码测试保持单一解析平面。
