# functional-design — 功能设计

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/construction/functional-design.md`。
> stage #20; phase=construction; execution=CONDITIONAL（新数据模型/复杂业务逻辑需设计时执行; 简单逻辑变更跳过）; for_each=unit-of-work（按单元运行）; mode=inline。

## 归属

- **phase 队**: aidlc-阶段四-构建（P4）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P4 队长本人执行, 无需派单 mention）; support: aidlc-developer（P4 成员）
- **reviewer**: aidlc-architecture-reviewer（**adversarial**——源 frontmatter 未声明 review_class, 按 stage-definition.md 缺省为 adversarial; 队长须先解决 findings 再交付, 返工上限 1 次（源 reviewer_max_iterations=2 的内容层近似））

## 输入

- unit-of-work / requirements / components（必需）; unit-of-work-story-map / contract-summary（可选）

## 产出

- entities（fenced yaml 真值块）
- rules（业务规则, fenced yaml 真值块）
- functional-spec（工作流与状态机的真值源, 含派生 ER 图与规则摘要视图）
- frontend-components（仅 ui 单元）

## 关键步骤

1. 读单元上下文（单元定义/故事映射/需求/组件目录/契约摘要）;
2. 制定功能设计计划并收集回答;
3. 产出 entities / rules / functional-spec（UI 单元加 frontend-components）;
4. architecture-reviewer 对抗互审 functional-spec, leader 先解决 findings 再交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
