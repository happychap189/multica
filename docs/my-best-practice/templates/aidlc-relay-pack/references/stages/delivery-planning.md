# delivery-planning — 交付规划

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/delivery-planning.md`。
> stage #19; phase=inception; execution=ALWAYS。Inception 阶段的收尾: 产出构建期执行计划。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-delivery（非队长——P3 队长 @mention 派单执行）; support: aidlc-architect（P3 队长）
- **reviewer**: 无

## 输入

- requirements / components / unit-of-work / unit-of-work-dependency（必需）
- stories / mockups / unit-of-work-story-map / contract-summary / team-practices（可选）

## 产出

- bolt-plan（Bolt 排序: 每 Bolt 含单元、DoD、置信假设、预期演示）
- team-allocation（Bolt→mob/单元执行者分配; 单人队语境下全部由研发队执行）
- risk-and-sequencing-rationale（WSJF 式打分/风险优先/骨架优先的排序理由）
- external-dependency-map（外部依赖门控项→Bolt 映射）
- delivery-planning-questions

## 关键步骤

1. 读全部 Inception 制品与（有实践发现时）已确认实践;
2. 生成 Bolt 规划澄清问题（先建什么/是否 WSJF 打分/Bolt 大小/并行与否/外部阻碍/最担心什么）并收集回答;
3. 验证 Bolt 序尊重依赖 DAG（架构支援校验, 偏离须在理由制品中论证）;
4. 产出 bolt-plan / team-allocation / risk-and-sequencing-rationale / external-dependency-map;
5. Inception→Construction 阶段边界核查（追溯表无未解决 GAP/ORPHAN）, 登记 phase-check;
6. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
