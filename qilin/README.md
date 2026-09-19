# QiLin 3.0.0 开发与验证指南

本文件只描述 QiLin 3.0.0 分支的运行方式；上游 qilin 的通用开发说明见 docs/development.md。
下面每条命令都在本机实测过，实测环境为 Node v24.18.0 与 pnpm 11.7.0。

## 1. 前置要求

| 项目 | 要求 | 本机实测值 |
|---|---|---|
| Node | ^22.19.0 或 >=24.0.0 | v24.18.0 |
| pnpm | 11.7.0（package.json 的 packageManager 固定） | 11.7.0 |

## 2. 取得分支

```sh
git fetch origin
git checkout 3.0.0
git pull
```

## 3. 首次准备（必须，且只需一次）

```sh
pnpm install
pnpm run build
```

构建产出两类产物，缺一不可：apps/web/dist 是浏览器外壳，packages/*/lib 是宿主与客户端插件产物。
想要带 QiLin 客户端构建画像的产物（QILIN_CLIENT_BUILD_PROFILE 为 qilin、QILIN_CLIENT_TITLE 为 QiLin）可改用：

```sh
pnpm run build:qilin
```

## 4. 启动产品

```sh
pnpm qilin --port 3090
```

启动后终端打印一行带令牌的地址，用**完整地址**打开浏览器：

```
qilin: http://127.0.0.1:3090/?token=<一次性令牌>
```

不带 profile 的 `qilin` 直接启动产品 profile（`qilin`），等效于 `pnpm qilin --profile qilin`；`qilin web` 则启动无品牌的上游形态。首次运行会在 QiLin home 下自动生成该 profile，模板已内置，无需手工创建。

常用参数：`--no-open` 不自动打开浏览器；`--port <n>` 指定端口。

首次进入界面会弹出 API Key 引导，点「稍后配置」跳过即可。
没有配置 API Key 时无法跑通真实对话，但界面四区可以完整验证。

### 用户数据目录

QiLin 的默认数据目录是 `~/.qilin`（上游 qilin 用的是 `~/.qilin`，本分支已改为 QiLin 自己的目录）。
profile、设置、凭据、附件、技能与会话日志都在这一棵树下：

```
~/.qilin/
  profiles/qilin/     启动时自动生成的 qilin profile
  settings.yaml       外观、模型等设置
  storages/           工作区注册表等
  attachments/v1/     内容寻址的上传附件
  skills/             用户级技能
  sessions/           会话日志
```

两种覆盖方式，优先级从高到低：显式配置的 home、环境变量 `QILIN_HOME`、默认 `~/.qilin`。
想隔离到仓库内（例如并行验证多份状态）：

```sh
QILIN_HOME="$PWD/.qilin-home" pnpm qilin --port 3090
```

`.qilin-home/` 已在 .gitignore 中。想让 QiLin 复用一份已有的 qilin 数据，把 `QILIN_HOME` 指过去即可。

### 项目级目录

技能的项目级目录同样用 `.qilin`：`<projectRoot>/.qilin/skills`（上游 qilin 用的是 `.qilin/skills`）。
三层技能根按优先级叠加，项目级覆盖用户级：

| 优先级 | 来源 | 位置 |
|---|---|---|
| 100 | `project-qilin` | `<projectRoot>/.qilin/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 400 | `user-qilin` | `<qilinHome>/skills`，默认即 `~/.qilin/skills` |
| 500 | `user-agents` | `<agentsHome>/skills`，默认即 `~/.agents/skills` |

来源标识仍是上游的 `project-qilin` / `user-qilin` 字符串，尚未改名。

## 5. 开发态（改代码即时生效）

开两个终端：

```sh
# 终端 A：监听并重建浏览器要读的全部产物
pnpm run dev:web

# 终端 B：启动产品
pnpm qilin --port 3090
```

三条来自实测的约束：

1. 必须先成功跑过一次 `pnpm run build`。dev:web 是增量构建，它不会自举一棵缺失的产物树，缺阶段时不会报错，只会静默使用旧产物，表现为改了代码没反应。
2. 不要与 `pnpm run build` 并发运行：两者都写 lib/ 与 apps/web/dist/。
3. dev:web 本身不做刷新广播；运行中的 `qilin` 的 web 服务器会轮询它服务的产物并广播 rebuilt 帧，所以浏览器会自行重载。改动后仍无变化时，先看终端 A 是否真的重跑了三个阶段。

## 6. 验收清单

| 目标项 | 在浏览器里怎么核对 |
|---|---|
| 品牌 | 侧边栏与首页 hero 显示麒麟印章；品牌行为「印章 + QiLin + 构建版本徽章」；标签页标题为 QiLin |
| 配色 | 开发者工具中 body 的 --dsw-alias-brand-primary 为 #0b7a5a（浅色）与 #3fd6a0（深色） |
| 侧边栏 | 工作区树、会话行、底部设置入口 |
| 输入框 | 可输入草稿；模式与模型选择器可见 |
| 消息渲染 | 空态显示 hero；配置 API Key 后发消息可看渲染与工具卡片 |
| 交付物 | 让 agent 写一个文件，完成后出现 produced files 行 |
| 物理路径 | 界面与接口中不再出现 /mnt/user-data（该机制在 3.0.0 已不存在） |

自动化检查：

```sh
pnpm run typecheck      # 0 错误
pnpm run test:gui       # 377 个文件、5348 项通过
pnpm run test:snapshot  # 免密钥录制回放，132 项中 127 项通过
```

## 7. 已知现象（不是故障）

- 构建输出里的 `Some chunks are larger than 500 kB after minification` 是 Vite 的体积警告，不是错误；构建本身以 `✓ built in` 结束即为成功。
- `pnpm run test:snapshot` 有 3 项失败（bash-tool、persistent-tools、session-sandbox-root），`test:web` 有 12 个文件失败；这些用例依赖 qilin 内部的 macOS Seatbelt 沙箱，在外层沙箱下会因 sandbox-exec 被拒而失败。已在原始基线提交的独立 worktree 上复跑确认，失败数与本次重构无关。
- 未配置 API Key 时，界面会一直停留在 API Key 引导；点稍后配置即可跳过并浏览四区。

## 8. 发布状态：暂不发布到 npm

**结论：本分支不做 npm 发布，只在本地构建并运行 Web 服务；包作用域保持 `@qilin`。**

本地起服务：

```sh
pnpm qilin                 # 产品 profile（qilin，含 QiLin 品牌层），默认自动开浏览器
pnpm qilin --no-open       # 不自动开浏览器
pnpm qilin --port 3090     # 指定端口
```

终端打印的地址必须整行使用：令牌一次性，且是进入 workspace 的凭据。首次运行会先过一次 pnpm 依赖校验，网络慢时约一分钟。

### 8.1 为什么不发

1. **`@qilin` 作用域已被他人占用。** npm 上存在 `https://www.npmjs.com/org/qilin`（当前 0 个包），但本账号不属于它：`npm team ls qilin` 返回 403 Forbidden；granular access token 表单的「Select organizations」列表为空；账号头像菜单的 Organizations 里也没有它。向 `@qilin/*` 发布需要该 org 的所有权。
2. **账号的 2FA 模式使命令行发布必须逐次 OTP。** `npm profile get` 显示 `tfa.mode = auth-and-writes`。仓库 `~/.npmrc` 里原有的 `//registry.npmjs.org/:_authToken`、以及 `npm login --registry=https://registry.npmjs.org --auth-type=web` 之后拿到的凭据，在 `npm publish` 时都返回 `EOTP`；npm 11 在非交互调用下只打印浏览器授权链接、不等待授权完成。304 + 9 个包逐次输入动态码不可行。
3. **换作用域会影响下游产品。** `@qilin/` 在本仓出现 31,514 处、覆盖 4,903 个文件。当前有两个产品基于本引擎开发，改名会同时改掉它们的依赖名，代价不在本轮范围。实测可用的替代名有 `@kqilin`、`@qilin-harness`、`@qilin-ai`、`@qilinkit` 等，但属于产品决策。

另外，npm 自 2026-07-31 起限制 bypass-2FA granular token 的账户类操作，并计划 2027-01 取消其直接发布权，推荐迁移到 trusted publishing (OIDC) 或 staged publishing。即使作用域问题解决，自动化发布也应走 OIDC 而不是长期 token。

### 8.2 发布链路仍然保留

它们与「是否发布」正交，且都已实测可跑：

| 能力 | 命令 | 状态 |
|---|---|---|
| 把版本写进全家族 manifest 与 lockfile | `pnpm run release:qilin <version>` | 已用过，自动提交 |
| official 构建画像门禁 | `pnpm run build:official`，`pnpm run release:verify --family <qilin\|vendor>` | 通过 |
| 打包 | `pnpm run release:pack --family <qilin\|vendor> --out <dir>` | 304 + 9 个 tarball |
| 安装后起 Web 的机器证据 | `pnpm run release:verify-packed-install --family qilin --from …` | 通过：装出来的 CLI 报版本，并服务 `/` 与 `/workspace?token=…` |
| 发布到 registry | `pnpm run release:publish --family <qilin\|vendor> --from <dir>` | **未执行**，卡在 8.1 的第 1、2 条 |

两条仍然成立的前提：发布门禁要求客户端产物来自 official 画像（`packages/client/ui-brand-official` 只在 `QILIN_CLIENT_BUILD_PROFILE === 'official'` 时注册官方品牌插件），因此打包前必须 `pnpm run build:official`；本机 `npm config get registry` 指向 npmmirror，若将来发布需显式加 `npm_config_registry=https://registry.npmjs.org`，该变量同时覆盖发布与脚本内部的查重调用。

### 8.3 如果将来要发布

1. 先解决作用域归属：新建一个属于本账号的 org（`@kqilin`、`@qilin-harness` 等实测可用），或与 `@qilin` 的持有者协商；
2. 把发布迁到 trusted publishing (OIDC)：`.github/workflows/release-publish.yml` 增加 `permissions: id-token: write`，在 npm 侧配置 trusted publisher，移除长期 token；
3. 换作用域意味着 4,903 个文件的机械改名，并需同步两个下游产品的依赖名后重建重打包。

另有两条与本决策无关、已在 3.0.4 完成的历史项：native 加装包族已改名为 `@qilin/node-addon-system*` 并可用 musl 工具链逐架构构建（darwin-arm64 / linux-arm64 / linux-x64，含 glibc 与 musl 两个 addon）；`pnpm run constraints`、`pnpm run hygiene`、`pnpm run test:docs` 现均通过。
