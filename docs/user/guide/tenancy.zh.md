# 一套部署服务多人

[English](tenancy.md) | 中文

会服务浏览器的 profile——`qilin` 与 `qilin web`——在一个地址上服务整套部署：访客在该地址登录，每个账户在 `$QILIN_HOME/tenants/<账户 id>/` 下得到自己的引擎运行时——自己的会话、任务、工作区、附件、插件、模型设置、凭据、技能与预设。只有账户名册是共享的。每个运行时都保留账号门，并且只接纳它服务的那个账户。

## 创建账户

名册是 `$QILIN_HOME/auth/accounts.json`，由入口与所有运行时共享。运行时关闭注册，因此它自己的 Web 界面无法创建第二个账户；扩充、重新设置密码与注销账户都靠下面这些命令。

```sh
qilin tenants accounts                                  # who is in this home
qilin tenants add alice                                 # prompts twice, without echoing
printf '%s\n' "$PASSWORD" | qilin tenants add bob --password-stdin
qilin tenants passwd alice                              # re-key; issued sessions stop verifying
qilin tenants remove alice [--purge-data]               # retire; keep Sessions unless purged
```

## 启动整套部署

```sh
qilin --port 8790
```

入口会打印自己的 URL（默认 loopback 与 8790 端口），在请求指名某个账户时启动它的运行时，并回收没人使用的运行时。入口自己不作画：落地页、登录表单与注册都归每个运行时内部的应用所有。`--idle-ms` 设定这个空闲窗口，`0` 表示让每个运行时都保持存活。`--max-tenants` 通过回收最久未使用的那个来限定同时存活的运行时数量。`--restart-backoff-ms` 设定启动失败的运行时第一次重试前的等待；每次连续失败该等待翻倍，而 `/status` 会报告失败次数与最早的重试时间。

## 在这个地址登录

名册里有了第一个账户之后，`/` 会重定向到该账户的路径 `/t/<账户>/`，由它自己的运行时来服务；而名册尚空时，每个路径都交给首启运行时，由它那一层通过产品自己的表单创建第一个账户。部署从不列出自己有哪些账户。一次登录提交由被指名账户自己的运行时校验：相关路径送到那里，它签发的会话 cookie 回到浏览器，另有一枚路由 cookie 此后分派每个请求——应用文档、`/api`、mux 升级与带 Range 的媒体读取——都被分派给那个运行时，同时把运行时自己的 authority 顶替掉入口的，从而让它的会话 cookie 始终绑定在签发它的那个运行时上。

同一个浏览器一次只服务一个账户；`/healthz` 与 `/status` 仍归入口自己读取，而回收统计的是被代理的流量。运行时只绑 loopback，因此浏览器需要的地址只有入口那一个。

## 查看名册与注销账户

`qilin tenants remove` 把账户从名册中移除，并把它的会话留在磁盘上；加上 `--purge-data` 会连同该账户的租户目录一起删除，那些会话也就随之消失。已经在提供服务的运行时会继续应答，直到它被回收或整套部署重启。此后启动的运行时会在加载时失败，因为它的覆盖层接纳的是一个文件里已不存在的账户——这是刻意的，也正是它让「注销」这件事可见而不是静默。

## 哪些共享，哪些不共享

| 状态 | 归属 |
|---|---|
| 会话、任务、工作区、附件、插件、模型设置、凭据、技能、预设 | 创建它们的那个账户 |
| 账户名册（`$QILIN_HOME/auth/accounts.json`） | 这套部署 |

## 部署前须知

- **文件系统不是边界。** 每个运行时都以同一个操作系统用户运行，因此 agent 的 shell 与文件工具可以读取其他账户的目录和共享的凭据文件。同一套部署上的账户是协作方。
- **每个账户配置自己的 provider。** 模型凭据存在账户自己的 home 里，因此一把 key 只属于一个账户，除此之外没有任何按账户的用量归集。
- **安装插件按账户进行。** 每个运行时都装进自己的 home；不存在需要加锁的部署级插件集。
- **每个账户是一个进程。** 内存与端口随同时存活的运行时数量增长，空闲窗口与并发上限正是为此存在。
- **一次升级同时影响所有账户。** 这通常正是你要的，但它使升级成为一次部署级操作。

## 延伸阅读

- [`qilin tenants` 命令参考](../../../apps/cli/README.zh.md)
- [多租户改造计划与执行记录](../../../plans/2026-10-11-multi-user-tenancy.md)
- [多用户租户边界决策](../../../.agents/notes/implemented/architecture/2026-10-11-multi-user-tenancy.zh.md)
