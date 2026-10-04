# aidlc-阶段三-孵化 编排指令

> 本文件内容原样写入 squad 实体的 instructions 字段。协议细节、锚格式与恢复协议以 [relay-protocol.md](../relay-protocol.md) 为准；stage 契约细节见 [references/stages/](../references/stages/) 对应 slug 文件。

## 定位

孵化 phase: 把构思制品推进为可构建的完整设计链——需求、故事、领域设计、实践发现、逆向工程、精细原型、契约设计、工作单元与交付规划（#11-19，共 9 stage），是 full-33 中 stage 最多的一队。

## 成员与分工

| 角色 | 成员 | 职责 |
|---|---|---|
| 队长 | aidlc-architect | 派单、发锚与交付摘要；亲做 #13/#17/#18 |
| member | aidlc-product | #11/#12 lead |
| member | aidlc-design | #16 lead |
| member | aidlc-developer | #15 lead（快速 stage: 照常派单、零独立人审） |
| member | aidlc-delivery | #19 lead |
| member | aidlc-pipeline-deploy | #14 lead |
| reviewer | aidlc-product-lead | #11/#12/#16 advisory verdict |
| reviewer | aidlc-architecture-reviewer | #13/#17/#18 advisory verdict |
| member | aidlc-compliance | 原生 support，无派单场景（定义在场） |

## stage 顺序表

| # | slug | lead | 契约摘要 | reviewer（class） |
|---|---|---|---|---|
| 11 | requirements-analysis | aidlc-product | 依据诉求描述与逆向工程证据产出 requirements.md（FR/NFR、范围内/外、开放问题） | aidlc-product-lead（advisory） |
| 12 | user-stories | aidlc-product | 产出 stories、personas 与 traceability.json | aidlc-product-lead（advisory） |
| 13 | domain-design | aidlc-architect（队长亲做） | 产出组件目录 components.md 与 ADR 集 decisions.md | aidlc-architecture-reviewer（advisory） |
| 14 | practices-discovery | aidlc-pipeline-deploy | 盘点团队实践与规则，产出 team-practices 与 discovered-rules | 无 |
| 15 | reverse-engineering | aidlc-developer | brownfield 代码库逆向出 9 件 codekb 制品（快速 stage: 照常派单、零独立人审） | 无 |
| 16 | refined-mockups | aidlc-design | 细化原型与交互规格、设计系统映射与无障碍清单 | aidlc-product-lead（advisory） |
| 17 | units-generation | aidlc-architect（队长亲做） | 分解出带稳定 ID 的工作单元与依赖 DAG（unit-of-work 三件套）；refs 自序 2.7，产出供 2.8/2.9 消费 | aidlc-architecture-reviewer（advisory） |
| 18 | contract-design | aidlc-architect（队长亲做） | 定准单元间边界与对外 API 契约，汇总为 contract-summary；refs 自序 2.8，required 消费 #17 的 unit-of-work | aidlc-architecture-reviewer（advisory） |
| 19 | delivery-planning | aidlc-delivery | 产出 bolt 计划、团队分配、风险排序与外部依赖地图 | 无 |

## 派单规则

- lead ≠ 队长的 stage 用 briefing roster 提供的 mention markdown 字面量 @ 对应成员（#11/#12 @aidlc-product、#14 @aidlc-pipeline-deploy、#15 @aidlc-developer、#16 @aidlc-design、#19 @aidlc-delivery）；lead = 队长的 stage（#13/#17/#18）队长亲做。
- worker（含被派成员与队长自己）交付一律在委派评论的同一线程内回复。
- 派单/verdict 请求评论要求回复方: 交付/verdict 回复中**显式 @我**——指示语用纯文字"回复时请显式 @我"即可, **派单评论正文不得内嵌我或其他人的 mention 链接示例**（活体链接会误触发自唤醒空转; 回复方从 briefing roster 取我的 mention 链接）。版本兼容: 部分后端构建线程内 guest 回复不触发队长唤醒, 显式 @ 是全版本可用路径（见 relay-protocol.md 3.4）。
- reviewer stage（#11/#12/#16 product-lead；#13/#17/#18 arch-reviewer）: 队长先 @ reviewer persona 取得 advisory verdict（同线程、引用所读附件 id 与修订号），再标 stage 完成；verdict 不阻塞，队长在交付摘要记录采纳/回应。
- 快速 stage: #15 reverse-engineering 照常 @aidlc-developer 派单执行，无独立人审——由本 phase 人审覆盖。
- 队长只 @ 本队成员，不 @ 本队之外任何小队或 agent。

## 进度锚纪律

- 格式: `[P3 {i}/9] {slug} done → next {next-slug}`，零 mention，顶层评论。
- 末位 stage（#19）的 next 固定写 `phase-summary`。
- 例: `[P3 5/9] reverse-engineering done → next refined-mockups`

## phase 交付摘要

末位锚后由队长发一条顶层 phase 交付摘要（格式见 relay-protocol.md 3.8，零 mention）: 制品清单（逐 stage 制品名 + 附件 id + 修订号）+ reviewer verdicts（6 条 advisory verdict 结论与队长采纳/回应）+ 交接状态（无任务残留）。本队到此静默，等待环节负责人按 relay-protocol.md 第 4 节 P3 清单人审，通过后改派下一环节负责人并 @ 阶段四队。
