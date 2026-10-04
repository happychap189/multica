# approval-handoff — 批准与移交

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/ideation/approval-handoff.md`。
> stage #10; phase=ideation; execution=ALWAYS; mode=inline; 源 summary_confirmation=required。

## 归属

- **phase 队**: aidlc-阶段二-构思（P2）; 队长: aidlc-product
- **lead persona**: aidlc-delivery（非队长——P2 队长 @mention 派单执行）; support: aidlc-product（P2 队长）
- **reviewer**: 无

## 输入

- intent-statement / stakeholder-map（必需）
- scope-document / intent-backlog（必需）
- competitive-analysis / feasibility-assessment / constraint-register / team-assessment / wireframes（可选）

## 产出

- initiative-brief（倡议简报: 意图/市场验证/可行性风险/范围/概念图/团队计划/go-no-go 建议）
- decision-log（ideation 期间决策记录）
- approval-handoff-questions

## 关键步骤

1. 汇编全部 ideation 制品;
2. 生成批准问题（干系人一致? 关键风险有缓解? 预算承诺?）并收集回答;
3. 编制 initiative-brief 一页纸与 decision-log;
4. Ideation→Inception 阶段边界核查（intent→scope→backlog 一致性）, 结果登记 phase-check;
5. 交付并发进度锚评论（批准进入 Inception / 要求修改 / 否决倡议由 phase 级人审决定）。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
