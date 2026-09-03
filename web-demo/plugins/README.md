# 插件宿主运行时目录（plugins/）

本目录是 QiLin DSH 插件宿主的 **server 侧安装区 + 运行时清单**，整体
gitignore（本 README 除外）——安装状态不入库：clone 即净、安装即用，
与 DSH 官方「文件 + manifest + 重启」安装模型同构，且与用户本机
DSH 的 `~/.dsh` 插件世界完全隔离（QiLin 从不读写该目录）。

## 布局

    plugins/
    ├── README.md              # 本文件（唯一被跟踪的内容）
    ├── manifest.json          # 运行时清单（gitignored，由宿主自动维护）
    └── <plugin-id>/           # 每插件一目录（gitignored）
        ├── entry.js           #   server 半（ESM，cordis 惯例 inject/apply）
        ├── vendor/            #   自带 vendor（如 kcoder-terminal 的 xterm）
        └── <内容目录>/        #   随 server 半分发的内容目录（如 skills 包）

client 半在 `../public/plugins/<id>/client.js`（同样 gitignored），由 Next
`public/` 静态服务为同源 `/plugins/<id>/client.js` 注入。

## 清单 schema（manifest.json）

    {
      "plugins": [
        {
          "id": "kcoder-git-panel",
          "version": "0.1.0",
          "source": "npm:@kcoder/git-panel@0.1.0",
          "script": "/plugins/kcoder-git-panel/client.js",
          "server": "plugins/kcoder-git-panel/entry.js",
          "disabled": false
        }
      ]
    }

`script`/`server` 分别标注 client/server 半；纯 server 半插件（如
kcoder-language）无 `script`。`disabled` 只是跳过，不清文件。

## 生命周期

- **安装 / 升级 / 卸载 / 停用 / 启用**：`node scripts/plugin.mjs add|remove|upgrade|enable|disable|list`
  或 `/workspace/plugins` 管理页（POST /qilin-plugins/api）——两者共用
  `plugins-host-runtime.mjs` 的单一实现，manifest 自动维护；npm 安装走
  `$TMPDIR` 私有 staging（`--cache` 也指向 staging，不碰 `~/.npm`）。
- **启动**：`server.js` 调 `initPluginServers()` 按 manifest 挂载 server 半；
  浏览器端 `PluginHostBoot` 经 **GET /qilin-plugins/manifest** 取清单并
  注入 client 半。该路由与 `/qilin-plugins/api` 同族，仅自定义 server
  提供——插件宿主依赖 server.js（裸 `next dev` 下插件面整体不启，客户端
  boot 失败已被优雅捕获，不影响外壳）。
- **任何变更后需重启 web-demo**（DSH 同构，无热插拔）。
