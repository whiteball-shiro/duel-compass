# 第三方代码与资料说明

## 代码基础

Duel Compass 基于 [inoribea/ygo-ai](https://github.com/inoribea/ygo-ai) 扩展，基准提交为 `60dde4b53ef5e7bfa1a1e7e86269551c8e6659ea`。原有 0BSD 许可及版权声明保留在根目录的 `LICENSE` 中；Duel Compass 修改部分的版权声明为 Copyright (C) 2026 whiteball-shiro。

## 复用的规则检索模块

`skill/backend/ruling-vendor` 下的三个模块来自 [coldiceh/ocg-ruling-assistant](https://github.com/coldiceh/ocg-ruling-assistant)，固定提交为 `83372752dc517b93f22ad4d85e46082f235cc16d`：

- `rulebookPassageRetriever.mjs`：规则段落检索。
- `evidenceQuestionTypeClassifier.mjs`：问题类型识别。
- `liveOfficialQaProvider.mjs`：实时问答检索。

这些文件继续采用 MIT 许可，原文保留在同目录的 `LICENSE`，具体说明见同目录的 `README.md`。根目录的 0BSD 许可不替代这份 MIT 许可。Duel Compass 接入上述检索模块，未接入上游的模型回答生成流程。

## 运行依赖

运行依赖通过 npm 安装，仓库不携带 `node_modules`。依赖包括 `@modelcontextprotocol/sdk`、`koishipro-core.js`、`sql.js`、`jszip`、`ygopro-msg-encode` 和 `ygopro-yrp-encode`，各自保留其许可；间接依赖的许可见所安装的软件包及其元数据。

## 外部资料

规则检索资料来自 `coldiceh/ocg-ruling-assistant` 的资料快照，其中包括 [lucays/OCG-Rule-documentation](https://github.com/lucays/OCG-Rule-documentation) 的社区规则整理。首次安装从固定版本的 `inoribea/ygo-ai` 获取卡库、禁限表与配套脚本；后续显式刷新使用 Koishi / YGOPro CDN 与 [Smile-DK/ygopro-scripts](https://github.com/Smile-DK/ygopro-scripts)。实时问答检索使用 [YGOResources](https://db.ygoresources.com/) 镜像，并保留官方来源链接。

完整卡库、外部卡片脚本、卡图、规则原文、官方问答快照和第三方决斗程序不包含在本项目的源码与安装包中。外部资料的权利仍属于各自作者和权利人；工具代码的许可不代表这些资料也采用相同许可。下载方式与使用范围见 [资料来源说明](docs/DATA_SOURCES.md)。游戏王及相关商标属于 Konami 与相应权利人。
