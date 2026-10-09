# YGO Tools for DSH — 研究报告与 Goose 移植方案

> 研究对象：https://github.com/mellfy-puppy/ygo-tools-for-dsh
> 版本：v1.2.0（本地 clone，主分支）
> 研究日期：2026-09-08
> 验证环境：Windows / Node v24.19.0 / goose 运行于 `C:\Users\inori\goose`

---

## 1. 这是什么

一个 **面向 DeepSeek Harness（DSH）的游戏王（Yu-Gi-Oh / OCG）研究工具插件**。
它把「卡片数据库 + 禁限表 + 卡组管理 + OCG 规则引擎（真实决斗模拟 + Combo 推演 + 录像复盘 + YGOPro2 桥接）」接进 DSH，让模型能做**可验证的**游戏王研究工作，而不是纯文本臆测。

一句话：**不是查卡 App，是一整套能跑真实 OC G规则引擎的工具集。**

## 2. 三层架构（关键）

```
DSH 宿主进程（薄）
  └─ lib/index.js            注册 14 个工具 + 1 个 skill；只有 schema + HTTP 客户端
        │
  持久引擎主机进程（detached，127.0.0.1:19981，按需启动、跨 DSH 重启保留）
  └─ skill/backend/
        ├─ persistent-engine-server.mjs   HTTP server：/health /tools /execute
        ├─ model-tool-host.mjs            会话隔离 + 14 工具分发
        ├─ tool-schemas.mjs               工具 JSON Schema + 描述（权威校验）
        └─ source-adapter.mjs / factory.mjs / *.tool 业务实现
        │
  真实 OCG 内核（依赖）
  └─ skill/vendor/node_modules/koishipro-core.js  WASM 版 ocgcore（libocgcore.wasm 1.1MB）
      + sql.js 读 cards.cdb + ygopro-msg-encode / ygopro-yrp-encode / jszip / nfkit
```

- **热启动**：挂载插件本身不启动引擎；第一次调用 YGO 工具时 `createPersistentEngineClient` 用 `spawn(detached)` 拉起引擎主机。
- **崩溃自愈**：客户端每次调用会先 `health()`，挂了就重新拉一个（旧会话丢失）。
- **会话隔离**：按 `sessionId` 走，DSH 用 `dsh-<agentId>`。
- **dsl→schema**：`lib/index.js` 里 `translateParameters()` 把后端 JSON Schema 转成 DSH 参数 DSL（min/max 等被丢弃，权威校验在引擎端）。

## 3. 14 个聚合工具（v1.1.0 起收敛）

| 类别 | 工具 | action |
| :--- | :--- | :--- |
| 卡片 | `queryCards` | get / search |
| 卡片 | `manageCardDataSources` | inspect / refresh |
| 卡片 | `getBanlistContext` | — |
| 卡组 | `manageSessionDeck` | set / get / check / edit / export |
| 决斗 | `resetGame` | —（含 fixedOpening） |
| 决斗 | `observeDuel` | state / actions |
| 决斗 | `executeAction` | — |
| 决斗 | `simulateActions` | — |
| 状态 | `manageCheckpoint` | save / restore / list / delete |
| 状态 | `manageEngineSession` | status / clear / shutdown |
| 分析 | `analyzeReplay` | parse / context / analyze |
| 分析 | `analyzeCombo` | parse / adapt |
| 分析 | `saveArtifact` | replay / route |
| 桥接 | `manageYgoPro2` | discover / status |

底层其实是 30 个后端命令（`TOOL_DESCRIPTIONS` 里能看到 `getCardEffect`/`searchCards`/`setSessionDeck`/`resetGame`/`executeAction` 等），由 `model-tool-host.mjs` 按 `action` 统一分发，收敛成 14 个模型可见工具以降低 schema 负担。

## 4. 关键数据资源（仓库自带）

- `skill/resources/lib/cards.cdb` — 7.9MB 正式卡库。
- `skill/resources/lib/lflist.conf` — 679KB 禁限表；`strings.conf` 48KB。
- `skill/resources/lib/prerelease/` — 先行/测试卡库 + `id-migrations.json`（多效果卡编号映射）。
- `skill/resources/ygopro2-bridge/windbot/` — 大量 WindBot deck/profile 数据。
- `skill/runtime/` — Combo 模拟器、native/wasm 双后端 runner、replay 引擎、card-data-updater（可从 koishipro CDN 拉更新）。

## 5. 可行性验证（已实测通过）

用 `createPersistentEngineClient`（等价于 DSH 插件的调用路径）在本地跑了一次冒烟测试：

- 自动拉起引擎主机，`/tools` 返回 14 个工具名。
- `queryCards({action:"get", id:89631139})` → 返回**青眼白龙**：
  - `name`、`effectText`（中文卡文）、`type: Monster/Normal`、`attribute: Light`、`race: Dragon`、`atk: 3000 / def: 2500`、`level: 8`。
  - `banlistStatus`（**2026.7 表**，unlimited，quantity 3）+ `listHash` + `sourcePath`。
  - `dataSource`（指向仓库自带 cards.cdb + prerelease 测试库）。
  - `sameName`（同名 17 个 id 全列出）。

**结论：整套引擎在 goose 环境下能原样跑，WASM 核心与卡库都在仓库里，移植是纯「换宿主」工作，不涉及重写规则引擎。**

## 6. DSH 插件 → Goose 的差异

| 维度 | DSH | Goose |
| :--- | :--- | :--- |
| 宿主插件 API | `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` 的 `defineTool` | MCP 扩展（`type: stdio` 或 `streamable_http`）→ 工具成 `namespace__tool` 函数 |
| schema 传递 | JSON Schema → 转 DSH 参数 DSL | MCP 直接用 JSON Schema |
| 会话 id | `dsh-<agentId>` | goose 侧无原生 id → 用固定/default 会话（单用户够用） |
| skill | `skillRegistry.register`（markdown + references 资源基目录） | `.config/goose/skills/<name>/SKILL.md` |
| 配置 | `agent.cordis.yml` 挂载 | `config.yaml` 的 `extensions:` 注册 |
| 运行时 | DSH 启动 | goose 通过 `cmd`/`args` 拉起 MCP 子进程 |

## 7. 移植方案（推荐）

**保留整个 `skill/` 引擎不动，新增一层 goose MCP 扩展壳。**

```
thoughts/research/ygo-tools-for-dsh/
  mcp/
    package.json            @modelcontextprotocol/sdk
    server.mjs              薄 MCP server：暴露 14 工具 → 转发到持久引擎 /execute
  （复用）skill/backend/…   引擎（不动）
```

`server.mjs` 逻辑：用 `createPersistentEngineClient` 连 `127.0.0.1:19981`；每个 `tools/call` 转成 `{call:{name,input}, sessionId}` 发给 `/execute`，把 `result.result` 序列化成 MCP text content。工具 schema 直接从 `tool-schemas.mjs` 的 `PUBLIC_TOOL_NAMES`/`PUBLIC_TOOL_DESCRIPTIONS`/`getPublicToolInputSchema` 读取。

### 配置（config.yaml）
```yaml
extensions:
  ygo_tools:
    enabled: true
    type: stdio
    name: ygo_tools
    description: Yu-Gi-Oh card research, deck analysis, verified duel simulation (YGO Tools engine)
    cmd: node
    args:
      - <abs-path>/thoughts/research/ygo-tools-for-dsh/mcp/server.mjs
    timeout: 300
    cwd: <abs-path>/thoughts/research/ygo-tools-for-dsh
```

### Goose skill
`.config/goose/skills/ygo-tools/SKILL.md`：镜像 `lib/dsh-skill.md`，写「先 `manageEngineSession(status)` → 用聚合工具 → 输出以工具为准 → 默认纯内存」等硬性规则。

## 8. 风险与注意

1. **跨盘 EXDEV**：引擎的原子 rename 在 Windows 上要求数据目录与资源同盘（DSH 用 `DSH_HOME` 保证）。goose 移植时若自定义 cache/replays/routes/decks 目录，务必与 `skill/resources` 同盘。
2. **进程生命周期**：引擎是 detached 后台进程，goose 退出后可能残留（按设计如此），需要 `manageEngineSession({action:"shutdown",confirm:true})` 手动清。
3. **Vendor 依赖**：`skill/vendor/node_modules` 已随仓库打包；确保 node>=20.11（实测 v24 正常）。
4. **会话共享**：单用户单会话用 `default` 即可；多会话并发共享引擎状态，需要按会话 id 隔离。
5. **许可**：插件 0BSD；卡库/脚本/禁限表按各上游许可分发，不要随插件再分发。

## 9. 结论

- 技术可行性：**通过**（已实测）。
- 工作量主体不在引擎，而在「goose 扩展壳 + 配置 + skill」。
- 移植后能力：卡查、卡组分析、禁限表、**真实 OCG 对局模拟/Combo 推演/录像复盘**，全部可用。
