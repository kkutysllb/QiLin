# 第三方插件兼容规范（插件作者契约）

- 状态：草案（2026-09-16）
- 适用对象：任何想同时面向 DSH 与 QiLin 的**第三方插件包**（不适用于 QiLin 内置插件包，内置包由 QiLin 自行维护）
- 配套计划：[第三方用户插件兼容 — 设计与实施计划](2026-09-16-third-party-plugin-compat.md)

一句话：**不硬编码 home、引擎包一律走 peer、包内资产自解析、只用别名表覆盖的引擎名。**

## 契约

### 1. home 目录解析（必须）

按优先级读环境变量，最后由 DSH 时代的默认值兜底：

```js
const home = process.env.QILIN_HOME ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
```

- **为什么**：QiLin 把 `DSH_HOME` 强制注入为自己的 home（默认 `~/.qilin`），插件读 env 就等于自动落到正确世界。
- **DSH 侧**：`QILIN_HOME` 不存在、`DSH_HOME` 缺省 → 仍解析到 `~/.dsh`，行为完全不变。
- **反例**：`resolve(homedir(), '.dsh', ...)` 直接拼路径。这类写法在 QiLin 里会写到 DSH 的目录树（或反过来），且不报错、静默错位。

### 2. 引擎包一律 `peerDependencies`（必须）

宿主提供的引擎包只放 `peerDependencies`，**绝不**放 `dependencies` 或 `optionalDependencies`。

- **为什么**：QiLin 的安装期校验会把“profile 内出现上游引擎包”判为硬失败——profile-local 的解析优先级高于兼容层 fallback，一旦真装进上游包，同进程就会出现两套 cordis，症状是 `cannot get property "skills" without inject` 这类难定位的故障。
- **DSH 侧**：不变，`autoInstallPeers` 两侧都关闭，peer 由宿主提供。
- **实测**：现有 12 个第三方插件**没有一个**违反此条，硬依赖只有 `diff`、`zod`、`codemirror`、`@aiden0z/pptx-renderer` 这类真第三方库。

### 3. 引擎名白名单（必须）

只用别名表覆盖的引擎名；两侧引用同一批名字：

| 插件里写的名字 | QiLin 侧解析到 |
|---|---|
| `@deepseek-ai/dsh-<x>` | `@qilin/<x>`（前缀规则，含子路径） |
| `@deepseek-ai/dsh-client-runtime[/...]` | `@qilin/client-modules[/...]`（例外重命名） |
| `@deepseek-ai/cordis`、裸 `cordis` | `@qilin/kylin` |
| `@deepseek-ai/dsh-client-store` / `-ui-slots` / `-ui-primitives` / `-ui-dockkit` | `@qilin/client-store` / `-ui-slots` / `-ui-primitives` / `-ui-dockkit`（精确表） |
| `@qilin/schemastery`、`@qilin/cosmokit` | 保持原名（QiLin 不重命名） |

- **为什么**：别名表是单一真源，改名后只需维护一处；表外的名字会在 QiLin 里解析失败。
- **注意**：新增引擎依赖前先确认 QiLin 侧有对应包（现有已全部覆盖：`tools`、`session`、`subagent`、`settings`、`llm`、`typert-protocol`、`typert-registry`、`atomic-write`、`client-ui-*`、`client-modules` 等）。

### 4. bundle 与 client 声明（推荐 `qilin` 优先，至少声明一个通道）

- 宿主层：`qilin.bundle.patch` 优先，`dsh.bundle.patch` 兼容读取；两键同形。
- 客户端层：`qilin.client` 优先，`dsh.client` 兼容；`inject` 里的名字会被别名表规整。
- **保留 `dsh.*` 是安全的**——QiLin 双通道读取，去掉反而丢掉 DSH 侧兼容。

### 5. 包内资产自解析（必须）

skills、模板、资源一律相对模块自身定位：

```js
const packageRoot = fileURLToPath(new URL('.', import.meta.url))
```

- **为什么**：插件安装位置随 profile 变化，`process.cwd()` 是用户工作区、`profile` 名也不固定。
- **反例**：依赖 cwd、依赖 `profiles/web` 这种写死的 profile 名。

### 6. 不假设 profile 名（必须）

profile 名由用户决定（本机为 `qilin`，模板里还有 `web`/`headless`/`acp`）。需要 profile 目录时，唯一可靠做法是从自身模块路径向上探测，探测失败再退到 `$DSH_HOME/profiles/<name>`，并且必须允许失败返回 `null`（`dsh-terminal` 的 `findProfileDir` 是正面样板）。

### 7. 扩展点只经 `ctx`（推荐）

tools / skills / systemPrompt / webServer / storage / hooks 等全部经 cordis `ctx` 注册与注入，不直接 import 引擎实现包。这样引擎内部重构对插件透明，也是 L2 承诺“扩展点全生效”的前提。

## 自检清单（与 `qilin plugin doctor` 四项一一对应）

1. 包内不存在 `homedir()` 直接拼 `.dsh` 的写法 → 契约 1。
2. `dependencies` / `optionalDependencies` 里没有 `@deepseek-ai/*`、`@qilin/*` → 契约 2。
3. 代码里出现的每个 `@deepseek-ai/...` import 都在 `peerDependencies` 里声明，且在别名表白名单内 → 契约 3。
4. bundle / client 声明至少有一个通道，`inject` 名命中别名表 → 契约 4。
5. 资产路径全部由 `import.meta.url` 派生 → 契约 5。
6. 不写死 profile 名，探测失败可返回 `null` → 契约 6。

## 迁移样例（B 档插件的最小改动）

```diff
-const userPresetDir = resolve(homedir(), '.dsh', '.agent-presets', 'super-ppts')
+const home = process.env.QILIN_HOME ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
+const userPresetDir = resolve(home, '.agent-presets', 'super-ppts')
```

存储根同理（`~/.dsh/super-ppts/` → `${home}/super-ppts/`）。DSH 侧无任何行为变化。

## 已知降级（本规范暂不覆盖）

- 依赖 Electron bridge 的能力。
- 依赖上游某个具体服务 API 签名的插件（改名层只对齐模块标识，不对齐方法签名）。
- 既硬编码 `~/.dsh`、又不读 env、且不属于自有仓库的第三方插件——由 `doctor` 标为“降级”，并提示作者按契约 1 改造。
