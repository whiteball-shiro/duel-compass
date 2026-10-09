# Duel Compass / 决斗罗盘

面向 AI Agent 的游戏王 MCP 工具集：查卡与异画展示、禁限表、来源可追溯的 OCG 规则检索、卡组学习、录像分析和本地决斗引擎。

Duel Compass is a local Yu-Gi-Oh! MCP server for card research, evidence retrieval, deck learning, replay analysis and engine-backed play. It extends [inoribea/ygo-ai](https://github.com/inoribea/ygo-ai), retaining original authorship and licenses. This is an independent community project, not an official Konami product.

**版本：1.4.0-beta.1，首发预览版。** 资料检索提供证据；最终裁定需要结合完整场面核实。

## 安装

需要 Node.js 22 或 24，以及可访问 npm、GitHub 和资料源的网络。

```sh
git clone https://github.com/whiteball-shiro/duel-compass.git
cd duel-compass
npm ci
npm run data:init
```

初始化下载第三方卡库、脚本与规则资料。仓库不携带完整卡库、官方问答快照、卡图、个人录像或学习记录。默认数据目录为用户主目录下的 `.duel-compass`；环境变量 `DUEL_COMPASS_DATA_DIR` 可更换位置。资料来源见 [资料说明](docs/DATA_SOURCES.md)。初始化可能需要数分钟，失败返回非零状态，可检查网络后重试。只初始化其中一类：`npm run data:init -- --cards-only` 或 `--rulings-only`。

如果 CDN 无法下载，可使用已有的兼容 Koishi/YGOPro 数据目录：`npm run data:init -- --from "/path/to/lib"`。目录需包含 cards.cdb，建议同时包含配套 ygopro-scripts、strings.conf 与 lflist.conf。导入仅允许使用新的数据目录，不会覆盖已有资料。仅查卡可以使用卡库；决斗需要完整匹配的脚本，禁限查询需要禁限表。离线导入时加 `--cards-only`，规则资料可随后单独初始化。

## 连接 MCP

替换下面的绝对路径。需要支持 stdio MCP 的客户端；卡片交互组件需要 MCP Apps 支持，不支持时仍可读取工具文本。

```json
{
  "mcpServers": {
    "duel-compass": {
      "command": "node",
      "args": ["/absolute/path/to/duel-compass/mcp/server.mjs"],
      "env": {"DUEL_COMPASS_DATA_DIR": "/absolute/path/to/your/data"}
    }
  }
}
```

先调用 `manageEngineSession` 的 `status`；引擎按需启动，默认端口 19981，只允许回环地址。不同版本同时运行时设置不同的 `YGO_ENGINE_HOST_PORT`，避免复用旧进程。使用管理工具关闭会话或引擎，不要强行结束正在使用的对局。

## 能力与边界

- `queryCards`：搜索与精确查卡、完整卡文、卡图、同名异画。多卡展示使用一次 search 的结果列表；后续查询替换前一批，连续 get 不累积。连接怪兽显示 LINK 与箭头，不显示守备力。
- `queryRulings`：检索和分页读取规则证据。具体互动用完整卡名、问题和 `live:true`；实时来源可能是镜像，不能宣称已核验官方网站。问答索引、社区整理、官方来源快照分别标记。
- `manageRulingSources`：检查资料和显式刷新。默认 OCG，历史与 TCG 资料需显式启用；超过 7 天提示核实，导入时间不等于原文更新时间。
- 卡组和录像：加载、修改、分析卡组、复盘录像，`learnDeck` 保存与卡组身份绑定的策略笔记。记录保存在用户数据目录。
- 决斗：本地引擎验证、操作、展开与自动策略。引擎行为不能替代官方裁定，未验证路线不能当作确定结果。

共 17 个公共工具，完整输入规范由 MCP 的 tools/list 返回。兼容原项目的 YGO_* 环境变量，不需要另一个模型 API 密钥。

YGOPro2 / WindBot 桥接是可选能力，需要自行安装兼容的外部程序并配置路径；此仓库不分发其二进制。默认 JavaScript 引擎无需这些程序。原有桥接与工具文档位于 skill 目录。

## 开发与验证

```sh
npm test
npm run test:integration
npm pack
```

默认测试使用独立合成资料，不下载卡库。集成测试要求已初始化真实资料，涵盖真实异画、裁定索引及录像。CI 在 Windows / Linux、Node 22 / 24 运行默认检查。版本标签触发打包、校验和与 GitHub 预览版本。

源码采用 0BSD，少量复用检索模块保留 MIT 许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。外部资料版权与代码许可独立。
