# 促融共竞 · Icebreaker-Games

> [!IMPORTANT]
> 非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。游戏素材与数据的版权归原权利人所有，不适用本项目的代码许可证，详见 [NOTICE.md](NOTICE.md)。

![license](https://img.shields.io/badge/code%20license-AGPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)
[![CI](https://github.com/Cloudnyco/Icebreaker-Games/actions/workflows/ci.yml/badge.svg)](https://github.com/Cloudnyco/Icebreaker-Games/actions/workflows/ci.yml)

《明日方舟》限时玩法「促融共竞」（国际服名 *Icebreaker Games*）的同人复刻：两名玩家在同一张地图上实时合作。战斗跑在 [明日方舟通用引擎](https://github.com/Cloudnyco/Arknights-Universal-Engine) 上，画面、镜头和战斗界面按原版还原。

**现状**：起步阶段。仓库骨架和引擎接入已经就位，第一个目标是"常规项目"的双人局域网对局（MVP）。

## 结构

| 位置 | 内容 |
|---|---|
| `engine/` | 引擎（git 子模块，固定在某个发布标签） |
| `packages/server` | 网关、战斗实例、服务器复算、大厅和房间、素材服务 |
| `packages/client` | 页面：加载、各个流程、本地存档、box 录入 |
| `packages/mode-regular` | 常规项目：关卡目标、一局两关、嘉奖印章、比赛风格 |

## 开发

需要 Node.js 22.12 以上和 pnpm（版本由 `package.json` 的 `packageManager` 固定；有 corepack 时会自动使用，没有时运行 `npx pnpm@11.28.0`）。

```sh
git clone --recurse-submodules https://github.com/Cloudnyco/Icebreaker-Games.git
# 已经克隆过的：git submodule update --init
pnpm install
pnpm run ci
```

升级引擎：在 `engine/` 里切换到新的发布标签，提交子模块的变化，然后跑 CI。不要直接修改 `engine/` 里的文件，引擎的改动提交到引擎仓库。

参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

本项目自己编写的代码以 [AGPL-3.0-or-later](LICENSE) 发布；引擎以 GPL-3.0-or-later 发布。游戏素材与数据不在其中，见 [NOTICE.md](NOTICE.md)。
