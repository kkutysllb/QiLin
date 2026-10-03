# lint 存量债清理轮（2026-10-03）

主 CI 自 2026-09-12 起未再运行，`pnpm run lint`（oxlint 全仓）在 3.0.9 发布态上留下 91 处错误：发布改过的文件占 4 处（已在发布提交里清掉），其余 **87 处**落在发布从未改动的文件里，即本轮清理对象。

## 一、口径与复现

- 复现：`npx tsx scripts/run-oxlint.ts .` → `Found 0 warnings and 87 errors`（4808 文件 / 90 规则）。
- 规则分布：`restrict-plus-operands` 42、`no-unsafe-*` 30、`no-unnecessary-type-assertion` 10、`unbound-method` 7、`no-unnecessary-condition` 2、`no-unnecessary-type-parameters` 1、`no-base-to-string` 1、`require-await` 1。
- 命中集中在四处：`packages/client/ui-trajectory` 两个 SVG 路径生成器 40 处、`packages/experimental/webworker-runtime` 的 Buffer 差分用例 20 处、`packages/api/gateway` 5 处、`apps/web` 的账号 e2e 3 处；余下 19 处散在 16 个文件。

## 二、两处不是「样式」的根因

- `apps/web/tests/accounts-auth.e2e.ts` 被客户端工程 `apps/web/tsconfig.json` 的 `exclude` 排除，却不在宿主聚合 `tsconfig.host.json` 的 include 里，因此**不属于任何类型程序** —— oxlint 对它只能看到 error 类型。已补进宿主聚合；同一镜像列表里指向已删除文件的 `tests/user-plugins-settings.e2e.ts` 条目一并删除。
- `packages/api/gateway` 读 `ctx.get('appReady')` 时缺少 `@qilin/cmdline` 的类型增强边，`ready` 退化成 `any`（连带 `ready.onReady` 成为不安全调用）。按 `packages/boot/hmr` 的既有做法补 `import type {} from '@qilin/cmdline'`、devDependency 与宿主工程引用，`ready` 恢复为 `AppReady | undefined`。

## 三、其余修法

- SVG 路径拼接 40 处改为模板字面量，输出字节不变。
- Buffer 差分用例把 `Buffer.prototype` 显式别名为 `Buffer`（`Function.prototype` 带来的 `any` 是根因），恢复原型方法类型；捕获原生方法、随后 `.call` 到目标 buffer 的写法用一条带理由的 `oxlint-disable typescript/unbound-method` 覆盖（与 `webworker-runtime` 内既有同类豁免一致）。
- 十处多余断言/类型参数、两处多余条件、一处 `String(unknown)` 的无基类型字符串化、一处 `require-await` 按各自语义收敛；`SessionManager.handleControlFrame` 落成 switch + `assertNever` 的穷尽形态。

## 四、验证

| 项 | 结果 |
|---|---|
| oxlint 全仓 | 0 error / 0 warning（4808 文件 / 90 规则） |
| typecheck | `tsc -b tsconfig.host.json` 0；`tsc -b tsconfig.client.json` 0 |
| 受影响用例 | 12 个包 + `apps/cli` + 两个脚本规格：228 文件 / 4097 例通过（1 skip） |
| 依赖与锁 | `verify-package-dependencies` 78 包合规；`pnpm-lock.yaml` 同步新增的 `@qilin/cmdline` 边 |
| 其他门禁 | `verify-typert-face-dependencies`、`verify-source-artifacts` 绿；`jscpd` 克隆数与本轮改动前一致（18） |

## 五、本轮未动的同链预存红

- `duplication`：18 处克隆（上游同配置为 0），逐条与本轮改动无关。
- `verify-module-graph`：产物缺 `sidebar-opens` 与 `client-ui-agent-opens` 两个包，属发布批次的漏再生成。
- `doc-sync` 与 `hygiene` 各 1 红、coverage 面 `workspace-files` 3 行未覆盖，均为上一轮已登记的预存项。
