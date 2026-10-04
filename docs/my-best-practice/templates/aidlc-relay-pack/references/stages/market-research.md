# market-research — 市场调研与竞争分析

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/ideation/market-research.md`。
> stage #5; phase=ideation; execution=CONDITIONAL（有外部市场定位或自建/外购考量时执行; 内部工具/缺陷修复/重构跳过——跳过时在交付评论留跳过理由）。

## 形成条件与处理

execution=CONDITIONAL 且本阶段不在 bugfix 路径中; 全量跑时若不适用, 在交付评论说明「跳过理由」, 由 phase 级人审覆盖。

## 归属

- **phase 队**: aidlc-阶段二-构思（P2）; 队长: aidlc-product
- **lead persona**: aidlc-product（P2 队长本人执行, 无需派单 mention）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- intent-statement（必需）

## 产出

- competitive-analysis（竞争分析）
- market-trends（市场趋势）
- build-vs-buy（自建/外购建议）
- market-research-questions（澄清问题记录）

## 关键步骤

1. 读 intent-statement, 生成市场/竞争/自建外购澄清问题并收集回答;
2. 歧义与矛盾分析, 追问消歧;
3. 产出竞争分析、市场趋势、build-vs-buy 三份制品;
4. 交付并发进度锚评论（本阶段 CONDITIONAL 不适用时, 在交付评论留跳过理由）。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
