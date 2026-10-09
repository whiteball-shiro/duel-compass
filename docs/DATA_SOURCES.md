# 资料来源与分发范围

仓库分发工具代码，不分发完整卡库、卡图、规则原文、问答快照或第三方决斗程序。运行 data:init 是用户显式请求下载外部资料；下载不改变版权或授予再分发权利。

| 来源 | 使用方式 | 注意事项 |
| --- | --- | --- |
| [inoribea/ygo-ai](https://github.com/inoribea/ygo-ai) | 代码基础与首次安装资料（固定 GitHub 版本），0BSD；基准提交 60dde4b53ef5e7bfa1a1e7e86269551c8e6659ea | 保留原始许可 |
| [coldiceh/ocg-ruling-assistant](https://github.com/coldiceh/ocg-ruling-assistant) | 3 个 MIT 检索模块；用户初始化下载资料 | 代码 MIT 不代表所有官方文本为 MIT；下载锁定单一提交并保存来源与完整性信息 |
| [lucays/OCG-Rule-documentation](https://github.com/lucays/OCG-Rule-documentation) | 检索资料中的社区规则整理 | 未打包完整文档，来源授权需单独核实 |
| Koishi / YGOPro CDN、[Smile-DK/ygopro-scripts](https://github.com/Smile-DK/ygopro-scripts) | 后续显式刷新卡库、禁限表、字符串与脚本 | 社区配套数据，需核对新卡及禁限表适用地区、日期 |
| [YGOResources](https://db.ygoresources.com/) | 问答和 FAQ 镜像，实时检索 | 镜像不等于官方网站实时核验，保留官方链接 |
| [Konami 游戏王数据库](https://www.db.yugioh-card.com/yugiohdb/) | 官方来源链接 | 卡片密码与官方 CID 不同 |

裁定初始化校验结构、记录数与完整性，采用版本目录和原子切换。资料不可用、存在冲突或只命中摘要时，应明确局限，不能猜测裁定。

卡图由组件引用远程资源；图片缺失或离线时保留文字。商标、卡图与官方卡文属于相应权利人，本项目未获得 Konami 官方背书。
