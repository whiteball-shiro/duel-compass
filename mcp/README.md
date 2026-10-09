# Duel Compass MCP / 决斗罗盘

基于上游 YGO AI 扩展的 MCP 宿主，可在 Codex、Goose 和其他支持 stdio MCP 的客户端使用。
当前版本 1.4.0，提供 17 个工具，包括卡片展示、卡组学习和规则/问答证据检索。

## 文件

- `server.mjs` — MCP stdio server，暴露 17 个工具，转发到持久引擎 `127.0.0.1:19981`。
- `test-client.mjs` — 端到端冒烟测试 `node test-client.mjs`。
- `package.json` + `node_modules/` — 仅 `@modelcontextprotocol/sdk`。

## 工作原理

1. Goose 启动时用 `cmd: node args:[server.mjs]` 拉起本 MCP 进程。
2. 首次工具调用，`createPersistentEngineClient` 自动 spawn 一个 detached 的引擎主机
   （`../skill/backend/persistent-engine-server.mjs`，端口默认 `YGO_ENGINE_HOST_PORT` 或 19981）。
3. 引擎主机跨 MCP 重启 / Goose 重启保留（detached 进程），会话按 `YGO_MCP_SESSION_ID`（默认 `default`）。
4. 工具 schema 直接来自 `../skill/backend/tool-schemas.mjs`（权威校验在引擎端）。

## 已注册（Goose 中调用为 `YgoTools.<tool>`）

queryCards · manageCardDataSources · manageYgoPro2 · getBanlistContext ·
manageSessionDeck · resetGame · observeDuel · executeAction · simulateActions ·
manageCheckpoint · analyzeReplay · analyzeCombo · saveArtifact · manageEngineSession ·
learnDeck · queryRulings · manageRulingSources

## Goose 配置示例

```yaml
extensions:
  duel-compass:
    enabled: true
    type: stdio
    name: duel-compass
    description: Yu-Gi-Oh card research, deck analysis, verified OCG duel simulation, replay analysis, and YGOPro2 bridging.
    cmd: node
    args:
    - <项目绝对路径>/duel-compass/mcp/server.mjs
    envs: {}
    env_keys: []
    headers: {}
    timeout: 300
    socket: null
    cwd: <项目绝对路径>/duel-compass
    bundled: null
```

> 路径用正斜杠，避免 Windows YAML 反斜杠转义。若换机器/目录，改 `args` 与 `cwd`。

## Goose skill

`AppData\Roaming\Block\goose\config\skills\ygo-tools\SKILL.md`：镜像原插件技能说明，用 `YgoTools.*` 引用。

## 使用

```
1. 启动 goose（会拉起扩展，但引擎按需启动，不占用）。
2. 任意 YGO 任务先 YgoTools.manageEngineSession({action:"status"})。
3. 例：YgoTools.queryCards({action:"get", id:89631139})  → 青眼白龙。
4. 结束用 YgoTools.manageEngineSession({action:"shutdown",confirm:true}) 清引擎进程。
```

## 接 YGOPro2（真实 AI.Server 桥）

1. 需要一份 YGOPro2 安装，含 `AI.Server.exe`、`cards.cdb`、`script/`、`WindBot.exe` + `Decks/AI_*.ydk`。
2. 指向安装：`YgoTools.manageYgoPro2({action:"discover", roots:["<盘符:\\路径>"]})`，或设环境变量 `YGO_YGOPRO2_ROOT`/`YGOPRO2_ROOT`。
3. 确认 `found:true` 且 `bridgeLaunchReady:true`；非真实桥 `liveDuelBridge:false`，勿当真实对局。
4. `YgoTools.manageSessionDeck` 装卡组 → `YgoTools.resetGame({duelBackend:"ygopro2", ygoPro2Root:"…", opponentAiProfile:"…", playerTurnOrder:"first"|"second"})`。
5. `YgoTools.manageYgoPro2({action:"status"})` 出现 `liveDuelBridge:true` 才算接上。
6. 真实对局不可固定起手/模拟/检查点/回滚；结束导出用 `YgoTools.saveArtifact({action:"replay",surrenderIfRunning:true,...})`。

## 注意

- 引擎是 detached 后台进程，goose 退出后可能残留；用 shutdown 显式清理。
- 单用户单会话用 `default`；多会话并发会共享引擎状态。
- 跨盘 EXDEV：自定义 cache/replays/routes/decks 目录须与 `skill/resources` 同盘。
- 依赖 Node >= 20.11（实测 v24.19 正常）；`koishipro-core.js`（WASM 核心）与卡库已在 `skill/`。

## 验证

```powershell
cd mcp
node test-client.mjs
```
应打印 17 个工具名 + 青眼白龙卡文 + deck 往返结果。完整测试可在项目根目录运行 `node --test tests/*.test.mjs`。
