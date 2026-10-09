---
name: duel-compass
description: Duel Compass 游戏王专用技能：通过 17 个工具完成卡查、卡组学习、规则证据检索、持久引擎对局、检查点、YGOPro2 对战与录像分析。对局中逐条判断响应窗口，裁定分析核对原文与情境。
---

# Duel Compass 对战引擎工作方式

本预设挂载 `duel-compass`，向模型注册 17 个聚合式 YGO
工具。引擎首次调用时自动启动并跨 DSH 重启保留。模型不得经 shell、
eval、Node import、HTTP、CLI 或包装脚本调用后端。

## 工作流

1. 每个 YGO 任务先调用 `manageEngineSession({action:"status"})`。
2. 直接使用注册工具；不要枚举内部后端命令，也不要创建或传递
   `sessionId`。
3. 卡查用 `queryCards`；卡组用 `manageSessionDeck`；场面与合法动作使用
   `observeDuel`；分支回滚使用 `manageCheckpoint`。
4. `executeAction` 成功后直接消费返回的 `state` 和
   `nextDecision.actions`，仅在缺失、截断、失败、中断或无进展时重新
   `observeDuel`。
5. 录像使用 `analyzeReplay`，旧 Combo 使用 `analyzeCombo`，用户明确要求
   写文件时才调用 `saveArtifact`。
6. 只有 DSH 直接报 `manageEngineSession` 未知才证明插件注册失败；此时
   停止并报告，绝不自建后端访问路径。

## 14 个公开工具

- `queryCards`: `get` / `search`
- `manageCardDataSources`: `inspect` / `refresh`
- `manageYgoPro2`: `discover` / `status`
- `getBanlistContext`
- `manageSessionDeck`: `set` / `get` / `check` / `edit` / `export`
- `resetGame`
- `observeDuel`: `state` / `actions`
- `executeAction`
- `simulateActions`
- `manageCheckpoint`: `save` / `restore` / `list` / `delete`
- `analyzeReplay`: `parse` / `context` / `analyze`
- `analyzeCombo`: `parse` / `adapt`
- `saveArtifact`: `replay` / `route`
- `manageEngineSession`: `status` / `clear` / `shutdown`

## 硬性规则

- 以工具输出为准，不凭记忆断言卡文、卡组归属、合法动作、场面或录像。
- YDK 文本原样传给 `manageSessionDeck({action:"set",ydk})`，绝不手工解析。
- 固定起手通过 `resetGame({fixedOpening:[...]})` 设置，不补随机牌。
- 真实对局必须显式使用 `duelBackend:"ygopro2"`、对手配置和先后手，并以
  `manageYgoPro2({action:"status"})` 的 `liveDuelBridge:true` 为准。
- AI.Server 对局不可回滚；固定起手、模拟和检查点只适用于内嵌 runner。
- 导出真实对局时优先让对局**自然终局**；`surrenderIfRunning:true` 会把录像
  截断在投降点，只在用户明确要求中断未结束的对局时才传。
- 默认纯内存，不写路线、录像、报告、日志、调试转储或工作流文件。
- `manageEngineSession` 的 `clear` / `shutdown` 必须有明确需求并传
  `confirm:true`。
- 不创建数值化对局评分；直接比较已验证的资源、封锁、区域和合法后续。

## 对局执行纪律

详见 `references/prompt-duel-discipline.md`。核心条目：

- 先定目标场再选手段；目标场是"能锁住对手的场"，不是"最大场"。
- 禁止默认响应：`SelectEffectYn` / `SelectYesNo` / 连锁窗口逐条读
  `description` 按价值判断，取末项和一律不发动都会丢真实价值。
- 标签编号不可信（`引擎效果#N` / `卡面效果②` 可能错位或缺失），只认
  `description` 与卡文。
- 匹配动作用完整前缀 `发动效果[`，不要用卡名字串。
- `actionIndex` 必须来自最近一次 `observeDuel` 或上一次成功
  `executeAction.nextDecision.actions`。
- 说"安全"前先算对手的响应；依赖对手不响应的手段要明说是赌注。
- 对手是真人时，轮到对手的响应窗口无条件停下等用户，绝不代打。
- 胜负条件可切换（打血 / 锁场 / 拖牌库 / 资源循环），切换时说明依据与代价。

## 常见决策类型速查

- `SelectChain`："不连锁"会在每个可响应点各出现一次。
- `SelectPlace`：index→区域映射随可用区变化，以标签为准。
- `SelectPosition`：`(1)`=攻击表示，`(4)`=守备表示。
- `SelectUnselectCard`：选中后还需点"确认选择"。
- `YGOProMsgSortCard`：选"排序卡片(N)"或"默认响应"任一即可继续。
- `A YGOPro2 decision wait is already pending.`：不要立刻重试，等旧 wait 超时
  （先约 20s 再约 60s），重新 `observeDuel` 取新索引后再执行，不要 reset。
