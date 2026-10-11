# 一套部署服务多人

[English](tenancy.md) | 中文

`qilin tenants serve` 在一个共享的 harness home 上为每个账户各运行一个引擎运行时。会话、任务、工作区与附件属于创建它们的账户，而插件、模型设置、凭据、技能与预设仍是同一份部署，因此新增一个账户不需要任何自己的配置。每个运行时都保留账号门，并且只接纳它服务的那个账户。

## 创建账户

名册是 `$QILIN_HOME/auth/accounts.json`，由所有运行时共享。租户运行时关闭注册，因此它自己的 Web 界面无法创建第二个账户；扩充、重新设置密码与注销账户都靠下面这些命令。

```sh
qilin tenants accounts                                  # who is in this home
qilin tenants add alice                                 # prompts twice, without echoing
printf '%s\n' "$PASSWORD" | qilin tenants add bob --password-stdin
qilin tenants passwd alice                              # re-key; issued sessions stop verifying
qilin tenants remove alice [--purge-data]               # retire; keep Sessions unless purged
```

## 启动 hub

```sh
qilin tenants serve
```

hub 会打印自己的 URL（默认 loopback 与 8790 端口），在有人打开某个账户的链接时启动对应运行时，并回收没人使用的运行时。`--idle-ms` 设定这个空闲窗口，`0` 表示让每个运行时都保持存活。`--max-tenants` 通过回收最久未使用的那个来限定同时存活的运行时数量。`--restart-backoff-ms` 设定启动失败的运行时第一次重试前的等待；每次连续失败该等待翻倍，而 `/status` 会报告失败次数与最早的重试时间。

## 把浏览器交给某个账户

打开 `<hub>/t/<用户名>`。默认情况下 hub 会把浏览器重定向到该账户自己的运行时端口：每个账户各登录一次，而同一个浏览器可以在不同标签页里同时持有多个账户。

`--single-origin` 则让浏览器留在 hub 上。跳转会种下一枚路由 cookie，此后每个请求——应用文档、`/api`、mux 升级与带 Range 的媒体读取——都被转发到该 cookie 命名的账户，并把运行时自己的 authority 顶替掉 hub 的，从而让它的会话 cookie 始终绑定在签发它的那个运行时上。该模式下同一个浏览器一次只服务一个账户，`/healthz` 与 `/status` 仍归 hub 自己读取，而回收统计的是被代理的流量而不是一次跳转。

## 查看名册与注销账户

`qilin tenants remove` 把账户从名册中移除，并把它的会话留在磁盘上；加上 `--purge-data` 会连同该账户的租户目录一起删除，那些会话也就随之消失。已经在提供服务的运行时会继续应答，直到它被回收或 hub 重启。此后启动的运行时会在加载时失败，因为它的覆盖层接纳的是一个文件里已不存在的账户——这是刻意的，也正是它让「注销」这件事可见而不是静默。

## 哪些共享，哪些不共享

| 状态 | 归属 |
|---|---|
| 会话、任务、工作区、附件 | 创建它们的那个账户 |
| 插件、模型设置、凭据、MCP 服务器、技能、预设 | 这套部署 |

## 部署前须知

- **文件系统不是边界。** 每个运行时都以同一个操作系统用户运行，因此 agent 的 shell 与文件工具可以读取其他账户的目录和共享的凭据文件。同一套部署上的账户是协作方。
- **一把 provider key 服务所有人。** 目前没有任何东西按账户归集用量，因此没有配额与计费。
- **安装插件是共享写。** 多个运行时同时安装需要单写者，或者加锁。
- **每个账户是一个进程。** 内存与端口随同时存活的运行时数量增长，空闲窗口与并发上限正是为此存在。
- **一次升级同时影响所有账户。** 这通常正是你要的，但它使升级成为一次部署级操作。

## 延伸阅读

- [`qilin tenants` 命令参考](../../../apps/cli/README.zh.md)
- [多租户改造计划与执行记录](../../../plans/2026-10-11-multi-user-tenancy.md)
- [多用户租户边界决策](../../../.agents/notes/implemented/architecture/2026-10-11-multi-user-tenancy.zh.md)
