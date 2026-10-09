# WindBot 补丁

## 问题

`skill/resources/ygopro2-bridge/windbot/source/Game/GameBehavior.cs` 的
`OnNewTurn` 中存在一段硬编码逻辑：

```csharp
if (_externalPolicy != null && _duel.Turn > 1)
{
    _externalPolicy.NotifyCutoff();
    Game.Surrender();
}
```

只要使用外部策略（external policy）模式，对局一进入第 2 回合就会被主动投降，
在引擎侧表现为 `terminalResult: "cutoff"`。这让多回合对局无法进行。

## 修复

删除上述分支，保留同文件中的 `OnTeammateSurrender` 等其它投降路径。

- 补丁文件：`windbot-no-auto-surrender.patch`（相对 `source/Game/` 的
  `GameBehavior.cs.bak` → `GameBehavior.cs`）
- 原始备份：`GameBehavior.cs.bak`（随源码保留，便于比对）
- 已重建二进制：`../skill/resources/ygopro2-bridge/windbot/WindBot.exe`

## 应用与重建

```powershell
cd skill/resources/ygopro2-bridge/windbot/source
git apply ..\..\..\..\..\..\patches\windbot-no-auto-surrender.patch   # 或手工按补丁修改
MSBuild.exe WindBot.csproj /p:Configuration=Release /p:Platform=x86 /v:minimal /nologo
Copy-Item bin\Release\WindBot.exe ..\WindBot.exe -Force
```

需要 .NET Framework 4.8 与 MSBuild（Visual Studio Build Tools 或 Mono 均可）。

## 验收

在一局真实对局中打满多回合：第 2 回合不再出现 `cutoff`，对局可持续到自然终局
（`terminalResult: "win" / "lose"`），且导出的录像为完整响应历史而非截断。
