# Agent Note：headless 任务不挂载交互式凭据存储

Status: implemented

[English](2026-10-17-headless-credential-isolation.md) | 中文

## 问题

用户经 GUI 保存的凭据对每个挂载存储的 profile 都会生效。共享同一 harness home 的 headless 一次性任务会因此用 GUI 保存的密钥认证，而不是调用方为本次任务提供的密钥——对 CI 步骤与批量流水线而言这是错误的行为者；当任务启动之后 GUI 会话才保存密钥时，这种意外更难排查。

## 决策

随附的 headless bundle 禁用 base 的 credentials 行（`packages/bundle/headless/cordis.patch.yml`），一次性任务只从启动快照解析密钥：进程环境，其次调用目录的 `.env`，再次 `$QILIN_HOME/.env`。该 profile 从不读取、迁移、写入或删除 `.credentials.yaml`。麒麟的 base 组合不挂载 authorization 或账号消费者，因此无需禁用其他行。`apps/cli/tests/profiles/headless/tests/credentials.e2e.ts` 覆盖三层环境、命名与原生 pi-ai 认证、缺失与空密钥、被忽略的损坏存储，以及经 `--patch` 覆盖层的恢复路径。headless README 的 Credentials 节是面向用户的恢复说明。

## 已考虑的替代方案

**只依赖全局的「环境优先」解析。** 不禁用该行时，启动环境没有密钥的任务仍会读取已保存凭据，隔离将依赖每个调用方在每次调用前 unset 变量。

**给共享存储增加优先级模式。** 这会把组合策略塞进共享 provider，而 profile patch 已经能提供所需行为。

## 后果

- headless 忽略已保存的 API 密钥、provider 记录与授权态。需要存储登录态的 provider 会失败，直到用户按文档恢复该行；恢复后启动环境仍按 credentials-local 的解析顺序保持优先。
- 环境与外部提供方凭据链（如 AWS profile）仍然可用。会话、设置与工具照常组合；省略存储不限制工具的文件系统读取。
- Web、SDK 与 ACP profile 保留凭据存储；其认证、登录与刷新流程不变。
