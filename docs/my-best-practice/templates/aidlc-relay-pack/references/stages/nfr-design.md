# nfr-design — NFR 设计

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/construction/nfr-design.md`。
> stage #22; phase=construction; execution=CONDITIONAL（NFR 需求已执行且 NFR 模式需设计时执行; NFR 需求被跳过则跳过）; for_each=unit-of-work。

## 归属

- **phase 队**: aidlc-阶段四-构建（P4）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P4 队长本人执行, 无需派单 mention）; support: aidlc-aws-platform（P4 成员）
- **reviewer**: aidlc-architecture-reviewer（**adversarial**——源未声明 review_class, 按 stage-definition.md 缺省 adversarial; 队长须先解决 findings 再交付, 返工上限 1 次）

## 输入

- performance-requirements / security-requirements / scalability-requirements / reliability-requirements / observability-requirements / tech-stack-decisions / functional-spec（必需）; contract-summary（可选）

## 产出

- performance-design / security-design / scalability-design / reliability-design / observability-design（五类 NFR 设计）
- logical-components（逻辑组件设计）
- traceability

## 关键步骤

1. 读 NFR 需求与功能设计制品;
2. 生成设计问题并收集回答;
3. 产出五类 NFR 设计与 logical-components（per-kind 适用性按单元 kind）;
4. architecture-reviewer 对抗互审 security-design, leader 先解决 findings 再交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
