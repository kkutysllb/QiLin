# Agent Note: 桌面快捷键偏好保持设备本地，先落盘再生效

Status: implemented

[English](2026-09-20-device-local-shortcut-preferences.md) | 中文

## Problem

键盘绑定依赖接收设备的操作系统与浏览器限制。一个 Host 可以同时服务多台设备，而用户录完新组合后本地保存仍可能失败。未落盘就生效会让界面与下次启动的应用不一致。改写不可读或未来版本的偏好文件，可能毁掉旧客户端无法解读的用户选择。

## Decision

[快捷键服务](../../../../packages/client/shortcuts/README.zh.md) 只按 runtime/platform 存储带版本号的覆盖项。Web 拥有源本地的浏览器存储；Electron main 拥有 `userData/keybindings.json`，与 QiLin home 相互独立。两个适配器共享校验与事务逻辑。持久化成功后发布唯一一份已接受配置，命令匹配、键帽展示与原生截获都从它推导。

缺失的命令保留休眠覆盖。显式覆盖胜过新引入的默认；相互冲突的显式覆盖全部禁用。不可读的配置阻止普通编辑并保留最近接受的值。全部恢复默认只清空当前接受的 profile，不会改写不可读或未来版本的数据。

## Alternatives considered

**Host 设置。** 服务器的操作系统与设置作用域无法识别访客设备及其浏览器限制；Host 存储还会把远程访客的偏好耦合在一起。

**乐观生效。** 持久化之前先更新绑定，会让失败的保存看起来成功，并使重启后的行为与可见控件不一致。

**跨标签页原子合并。** localStorage 没有 compare-and-swap 事务。Web 在每次操作前重读并拒绝已知过期草稿，但对并发写入接受 last-writer-wins。Electron main 串行化编辑并拒绝过期 revision。

## Consequences

设备之间、Web 与 Desktop 之间不自动同步绑定。修复不可读的偏好需要直接修正存储文档；应用内编辑保留这些字节。浏览器并发不承诺无损合并。Desktop 的原子替换复用共享写入器的 Windows 重试行为，不承诺 fsync 持久性。确定性的事务、浏览器存储与 Desktop 文件测试覆盖失败保留、冲突、过期草稿与拒绝改写不可读数据；平台键盘接受度与持久化正确性分别验证。
