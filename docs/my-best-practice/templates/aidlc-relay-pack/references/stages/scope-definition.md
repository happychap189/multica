# scope-definition — 范围定义与优先级

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/ideation/scope-definition.md`。
> stage #8; phase=ideation; execution=ALWAYS; mode=inline; 源 summary_confirmation=required。

## 归属

- **phase 队**: aidlc-阶段二-构思（P2）; 队长: aidlc-product
- **lead persona**: aidlc-product（P2 队长本人执行, 无需派单 mention）; support: aidlc-delivery（P2 成员）
- **reviewer**: 无

## 输入

- intent-statement（必需）; feasibility-assessment / constraint-register（可选）

## 产出

- scope-document（范围文档: 范围内/外边界）
- intent-backlog（意图积压: 按价值/紧迫度/风险的加权排序）
- scope-definition-questions（澄清问题记录）

## 关键步骤

1. 读意图与可行性制品, 生成范围澄清问题并收集回答;
2. 歧义与矛盾分析, 追问消歧;
3. 产出范围文档（范围内/外边界）与意图积压（加权排序的排期候选）;
4. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
