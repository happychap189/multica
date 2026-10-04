# team-formation — 团队组建与 Mob 规划

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/ideation/team-formation.md`。
> stage #9; phase=ideation; execution=CONDITIONAL（涉及团队构成/容量/mob 规划时执行; 独立开发者/小项目跳过）。

## 归属

- **phase 队**: aidlc-阶段二-构思（P2）; 队长: aidlc-product
- **lead persona**: aidlc-delivery（非队长——P2 队长 @mention 派单执行）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- scope-document（必需）; intent-backlog（必需）; feasibility-assessment（可选）

## 产出

- team-assessment（团队评估）
- skill-matrix（技能矩阵）
- mob-composition（mob 构成建议——multica 语境映射为: 建议哪些阶段由哪个 phase 队/lead persona 执行）
- team-formation-questions（澄清问题记录）

## 关键步骤

1. 读范围与积压, 生成团队/容量/mob 构成澄清问题并收集回答;
2. 歧义分析消歧;
3. 产出团队评估、技能矩阵、mob 构成建议;
4. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
