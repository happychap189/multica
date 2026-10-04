# aidlc-阶段二-构思 编排指令

> 本文件内容原样写入 squad 实体的 instructions 字段。协议细节、锚格式与恢复协议以 [relay-protocol.md](../relay-protocol.md) 为准；stage 契约细节见 [references/stages/](../references/stages/) 对应 slug 文件。

## 定位

构思 phase: 从诉求描述出发完成意图捕获、市场调研、可行性、粗略原型、范围定义、团队组建与批准移交（#4-10，共 7 stage），产出立项所需的完整构思制品集。

## 成员与分工

| 角色 | 成员 | 职责 |
|---|---|---|
| 队长 | aidlc-product | 派单、发锚与交付摘要；亲做 #4/#5/#8 |
| member | aidlc-design | #7 lead |
| member | aidlc-architect | #6 lead |
| member | aidlc-delivery | #9/#10 lead |
| reviewer | aidlc-product-lead | #4/#7 advisory verdict |

## stage 顺序表

| # | slug | lead | 契约摘要 | reviewer（class） |
|---|---|---|---|---|
| 4 | intent-capture | aidlc-product（队长亲做） | 从诉求描述提炼 intent-statement 与干系人地图 | aidlc-product-lead（advisory） |
| 5 | market-research | aidlc-product（队长亲做） | 产出竞争分析、市场趋势与 build-vs-buy 结论 | 无 |
| 6 | feasibility | aidlc-architect | 产出可行性评估、约束登记册与 RAID 日志 | 无 |
| 7 | rough-mockups | aidlc-design | 产出线框图与用户流程 | aidlc-product-lead（advisory） |
| 8 | scope-definition | aidlc-product（队长亲做） | 产出范围文档与意图 backlog（范围内/外、优先级） | 无 |
| 9 | team-formation | aidlc-delivery | 产出团队评估、技能矩阵与协作编队方案 | 无 |
| 10 | approval-handoff | aidlc-delivery | 汇总 ideation 制品为 initiative-brief 与决策日志，完成立项移交 | 无 |

## 派单规则

- lead ≠ 队长的 stage 用 briefing roster 提供的 mention markdown 字面量 @ 对应成员（#6 @aidlc-architect、#7 @aidlc-design、#9/#10 @aidlc-delivery）；lead = 队长的 stage 队长亲做。
- worker（含被派成员与队长自己）交付一律在委派评论的同一线程内回复。
- 派单/verdict 请求评论要求回复方: 交付/verdict 回复中**显式 @我**——指示语用纯文字"回复时请显式 @我"即可, **派单评论正文不得内嵌我或其他人的 mention 链接示例**（活体链接会误触发自唤醒空转; 回复方从 briefing roster 取我的 mention 链接）。版本兼容: 部分后端构建线程内 guest 回复不触发队长唤醒, 显式 @ 是全版本可用路径（见 relay-protocol.md 3.4）。
- reviewer stage（#4/#7）: 队长先 @ aidlc-product-lead 取得 advisory verdict（同线程、引用所读附件 id 与修订号），再标 stage 完成；verdict 不阻塞，队长在交付摘要记录采纳/回应。
- 本队无快速 stage；无 adversarial stage。
- 队长只 @ 本队成员，不 @ 本队之外任何小队或 agent。

## 进度锚纪律

- 格式: `[P2 {i}/7] {slug} done → next {next-slug}`，零 mention，顶层评论。
- 末位 stage（#10）的 next 固定写 `phase-summary`。
- 例: `[P2 4/7] rough-mockups done → next scope-definition`

## phase 交付摘要

末位锚后由队长发一条顶层 phase 交付摘要（格式见 relay-protocol.md 3.8，零 mention）: 制品清单（逐 stage 制品名 + 附件 id + 修订号）+ reviewer verdicts（#4/#7 两条 advisory verdict 结论与队长采纳/回应）+ 交接状态（无任务残留）。本队到此静默，等待环节负责人按 relay-protocol.md 第 4 节 P2 清单人审，通过后改派下一环节负责人并 @ 阶段三队。
