# 促融共竞 · Icebreaker-Games

> [!IMPORTANT]
> 非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。游戏素材与数据的版权归原权利人所有，不适用本项目的代码许可证，详见 [NOTICE.md](NOTICE.md)。

![license](https://img.shields.io/badge/code%20license-AGPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)
[![CI](https://github.com/Cloudnyco/Icebreaker-Games/actions/workflows/ci.yml/badge.svg)](https://github.com/Cloudnyco/Icebreaker-Games/actions/workflows/ci.yml)

《明日方舟》限时玩法「促融共竞」（国际服名 *Icebreaker Games*）的同人复刻：两名玩家在同一张地图上实时合作。战斗跑在 [明日方舟通用引擎](https://github.com/Cloudnyco/Arknights-Universal-Engine) 上，画面、镜头和战斗界面按原版还原。

**现状**（2026-10-16）：两名玩家在局域网里组队参赛：一人创建房间，另一人用房间编号加入，确认项目、分配干员、组建上场阵容，然后打完整局双人合作对局（一局两个阶段），全程帧同步、由服务器复算。第一个目标是「常规项目」的双人局域网对局（MVP）。

- **对局**：服务器的战斗房间与复算、断线重连（带 kit 的对局从第 0 帧重放）、开局等待协作者、二倍速与暂停、费用请求；可玩的关卡有 IG-1 逃离火线、IG-10 匪帮集会、IG-S-2 爬高上低等四关。关卡装置有模型时画成模型（山海密语仪），没有素材时画成方块（城防路障），血条按所属阵营着色。
- **页面**：真 3D 战场与 Spine 模型、原样式的战斗界面（部署卡与召唤物卡、费用、技能、方向选择、任务与阶段横幅），没有素材时用页面自带的简易界面。
- **画面设置**：帧率上限、清晰度、攻击特效、帧率显示由玩家选择，保存在本机，不设统一上限（引擎 ADR 0059，[页面-1](docs/spec/page.md)）。
- **组队参赛**（[房间](docs/spec/room.md)）：房间编号与 15 分钟存在时间、项目调整与项目确认、赛前编队（常规队：高顺位最多 10 名、低顺位最多 20 名、至少 20 名；比赛风格）、高顺位干员协调（先-后-后-先轮流选取，可让出一次）、组建上场阵容（6–10 名，含临时招募干员）、准备就绪后开赛，比赛结束回到项目调整。时限、人数和临时招募干员取自活动表。
- **box 与存档**：干员 box 手动录入（精英化、等级、潜能、信赖、技能等级、模组阶段，按每名干员的上限），保存在本机浏览器，可以导出、导入为文本。
- **干员**：引擎的兼容层运行 Stronghold Protocol 的干员 kit，逐个与 Stronghold 对照、所有技能一致后启用（引擎 ADR 0058）；72 个全部启用，其中 7 个的差异登记在引擎的已知差异表里。没有 kit 的干员按引擎自己的实现作战，72 个职业分支的特性引擎都已实现（含战术家的战术点、傀儡师的替身）。
- **比赛风格**：基础、驻场、游走、攻坚、支援，各自的增益与代价只作用于选它的玩家，并带一个携带物卡（赛场啦啦队、护具分发员、混乱烟花箱、猛兽能量饮料、喷射汽水机；引擎 符文-1…6、装置-6）。
- **声音**：素材里有的原版战斗音效（部署、撤退、阵亡、技能、合作的申请与结算等）按原版的音效库播放，战斗音乐用关卡自己的曲子，素材里没有时用默认战斗曲；没有的声音空着（引擎 音频-1…3、ADR 0024；页面-4）。音乐、音效音量在画面设置里调。

## 结构

| 位置 | 内容 |
|---|---|
| `engine/` | 引擎（git 子模块，固定在引擎的某个提交，发布时为标签） |
| `packages/server` | 页面与模块服务（改写导入）、kit 服务、大厅与房间、各房间的战斗实例、服务器复算 |
| `packages/client` | 页面：房间页（组队流程、box 录入、本地存档）、对局画面与界面、画面设置 |
| `packages/mode-regular` | 常规项目：项目、各步骤的时限、临时招募干员、赛前编队的规则、比赛风格（取自活动表） |

## 开发

需要 Node.js 22.12 以上和 pnpm（版本由 `package.json` 的 `packageManager` 固定；有 corepack 时会自动使用，没有时运行 `npx pnpm@11.28.0`）。

```sh
git clone --recurse-submodules https://github.com/Cloudnyco/Icebreaker-Games.git
# 已经克隆过的：git submodule update --init
pnpm install
pnpm run ci
```

组队参赛（默认只绑定 127.0.0.1）：

```sh
AUE_ASSETS_DIR=<素材目录> node packages/server/src/main.js --port 8700
# 浏览器打开 http://127.0.0.1:8700/ ：房间页。两个标签页就是两名玩家
```

局域网里两台电脑对战：加 `--host 0.0.0.0`，另一台电脑打开 `http://<这台电脑的局域网 IP>:8700/`（防火墙要放行这个端口）。房间页先在 box 里录入干员、编好常规队（「随机填满常规队」可以一键填入 20 名满练度的六星），再创建或加入房间。

直接开一局（不经过房间）：加 `--match <对局设定.json>`，浏览器打开 `http://127.0.0.1:8700/?seat=0` 和 `?seat=1`。`packages/server/matches/` 里有可玩关卡的对局设定（`ig-1.json`、`ig-10.json`、`ig-s-2.json`，两边都是精英 2 的六星），例如 `--match packages/server/matches/ig-s-2.json`。种子决定关卡的随机变体：IG-S-2 第一阶段有山海众（八成）和越狱两种，山海密语仪有 3 个或 5 个；`ig-s-2.json` 的种子抽到的是山海众和 3 个密语仪。

常规项目的数据（`packages/mode-regular/data/act1multi.json`）由 `node tools/extract-activity.js --gamedata <ArknightsGameData 目录>` 从活动表生成。

素材由维护者另行准备（引擎 ADR 0018）；没有素材时页面不画战场，对局照常进行。端到端测试：`pnpm run e2e`（`E2E_CHROME` 指定 Chrome，`E2E_FULL=1` 加跑整局）。

升级引擎：在 `engine/` 里切换到要用的提交（发布时用标签），提交子模块的变化，然后跑 CI 和端到端测试。不要直接修改 `engine/` 里的文件，引擎的改动提交到引擎仓库。

干员 kit（可选，引擎 ADR 0058）：取得引擎固定的 Stronghold Protocol 提交，用 `AUE_KITS_DIR` 指给服务器；没有时，干员按引擎自己的实现作战。

```sh
git clone https://github.com/sganggs/Stronghold-Protocol.git <dir>
git -C <dir> checkout <sha>   # 引擎 packages/content/data/kits.json 的 source.sha
AUE_KITS_DIR=<dir> node packages/server/src/main.js
```

参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

本项目自己编写的代码以 [AGPL-3.0-or-later](LICENSE) 发布；引擎以 GPL-3.0-or-later 发布。游戏素材与数据不在其中，见 [NOTICE.md](NOTICE.md)。
