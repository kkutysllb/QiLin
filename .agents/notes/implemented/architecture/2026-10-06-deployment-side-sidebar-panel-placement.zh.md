# Agent Note: 侧栏面板行的位置由部署方摆放

Status: implemented

[English](2026-10-06-deployment-side-sidebar-panel-placement.md) | 中文

## Problem

侧栏全局面板的位置一直是**插件自己写的**。插件把图标行注册进 root 作用域的 `sidebar.panellist` list，可带 `order`；`ui-sidebar` 按 `order` 升序投影这些注册，同值时以注册顺序打破平局，外壳照该序列渲染。于是**叠加在部署之上的任何包都能决定自己出现在哪里**：一个自带 `order: 120` 的面板，会落进部署自己占据 100 到 150 的菜单序列里——正好排在 120 与 130 两行之间。部署方可以为自己未注册的行**加标签**（`sidebar.section.assignments`），但无法**摆放**它：分区面只把行 id 映射为标签，序列仍由 `order` 决定；而契约里没有任何东西能把「部署自己的菜单」与「叠加在它之上的面板」区分开。一个想让自己的菜单序列保持连续、把用户后来装的面板排在其后的产品，找不到能表达这件事的席位。

## Decision

新增 root 作用域 list 席位 `sidebar.panel.placement`，由本包的 `sidebar` 入口在 `sidebar.panellist` 与 `sidebar.section.assignments` 之旁声明。每个占用项的 inject face 返回 `rows`——部署方自己排布的行 id，按显示顺序——以及可选的 `trailingSection` 标签。投影据此分两段排序：**已列出的行在前**，按席位给出的顺序，其自身的 `order` 不再生效；**席位未列出的每一行都在其后**，按自身 `order` 升序、同值以注册顺序打破平局。未列出的行在席位给出 `trailingSection` 时取该分区（优先于行自身的 `section`，与分区指派同级），于是整个尾段由**一个**分区头开启。多个占用项按条目顺序合并，同一 id **首次出现者胜**。没有占用项时，投影与既有行为完全一致：`order` 升序、同值按注册顺序。

该席位是**新增**而非扩展现有 `sidebar.section.assignments`：后者名字所声明的正是它唯一的职责，且已有兄弟产品在向它贡献；改名会让那份贡献在**加载期**失败，而不是在评审期被看见。摆放是**部署方声明**的，而非**探测来源**得来的：侧栏从不追问某行由哪个 bundle 注册，因此不承担对客户端插件清单的依赖；而部署真正要表达的规则是「这些是我的菜单，其余跟随其后」。

`tests/panel-list.client.spec.tsx` 用真实渲染器钉住渲染序列与唯一的尾部区头，其中未列出的行**故意**带 `order: 0` 且自带分区；`tests/apply.client.spec.tsx` 钉住投影、合并规则，以及**不带 inject face** 的席位。把投影退回旧排序，恰好这两组用例变红。新增席位已重新生成 `packages/extensions/kylin-client-runner/src/client/slot-catalog.ts`。

## Consequences

- 部署方自己的菜单序列保持连续，其菜单顺序不再受任何已装插件所选 `order` 影响；已装面板统一收进部署方命名的尾部一段。
- 部署方必须列出自己的行，包括它并不拥有的引擎行（`plugins`、`schedules`）。它**忘记**列出的行既不会丢、也不会被静默错放——它会出现在尾段里，与它所隐藏的功能在同一眼就能看见。
- 已列出的行，其自身的 `order` 不再决定位置；因此部署方若想把某插件的面板纳入自己的序列，必须显式列出它，插件无法再靠换个数字自行移动。
- 多占用项合并保持「首次出现者胜」，一个部署方的列表仍是权威，同时允许第二个占用项补充它自己拥有的行。
- `packages/client/ui-sidebar/src/client/index.ts` 不在逐文件覆盖率门禁内（插件外壳需要浏览器级靶子），因此该行为由上述两支组件用例钉住，而非由覆盖率钉住。

## Alternatives considered

**按分区排序，并给尾段一个分区标签。** 否决：分区指派以行 id 为键，而**已装面板的 id 正是部署方事先不可能知道的**；序列仍来自插件自己写的 `order`，也就是缺陷本身。

**把缺失或默认的 `order` 视为最后。** 否决：这等于把「值不存在」当成一条策略，并破坏每一个**故意**用 `order: 0` 抢占顶部的插件——侧栏自己的引擎行用的就是 0 与 10。

**探测注册者的 bundle，把来自用户安装 bundle 的行降级到最后。** 否决：这会让侧栏耦合上客户端半边并不拥有的插件清单，而且在回答一个部署方从未提出的问题。「我的菜单在前，其余随后」不需要任何来源事实，且对部署方**有意安装**的面板同样成立。

**要求已装插件自己写一个更大的 `order`。** 作为产品规则否决：正确性将取决于每个第三方作者的配合，而且对方的下一次发布会把它静默改回去。

**让部署方用 `sidebar.section.assignments` 为每个已装行 id 指定尾段分区。** 否决：它需要同一份不可知的 id 清单，而且即便点名成功，也仍然无法排序。

## Related

[Global main panels](2026-09-08-global-main-panels.zh.md) 负责该 list 的存在、id 与主面板的配对，以及空列表行为；[Plugin management moves to the Web sidebar](2026-09-09-plugin-management-in-the-web-sidebar.zh.md) 负责第一条实际上线的行。两篇都**未**规定行序，因此本决策是新增席位，而非取代既有席位。
