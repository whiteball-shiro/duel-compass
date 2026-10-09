# 复用的规则检索模块

来源：[coldiceh/ocg-ruling-assistant](https://github.com/coldiceh/ocg-ruling-assistant)。

固定提交：`83372752dc517b93f22ad4d85e46082f235cc16d`。

以下文件从上游的 `backend/` 目录原样复制：

- `rulebookPassageRetriever.mjs`
- `evidenceQuestionTypeClassifier.mjs`
- `liveOfficialQaProvider.mjs`

上游 MIT 许可原文保留在 `LICENSE` 中。Duel Compass 的接入代码位于 `../ruling-evidence.mjs` 与 `../ruling-sources.mjs`；未嵌入或调用上游的模型回答生成流程。

检索资料来自锁定提交的上游 `data/` 快照，本地清单保留原始记录链接、快照日期和来源提交。上游的软件许可不代表第三方卡图、卡文或裁定资料也采用相同许可。卡名身份映射的引用范围见 `FACTUAL-REFERENCES.txt`；仅导入必要的卡名、CID 与日文身份信息，此扩展未导入图片或完整的第三方别名数据库。
