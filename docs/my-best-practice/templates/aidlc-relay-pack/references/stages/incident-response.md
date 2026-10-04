# incident-response — 事件响应

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/operation/incident-response.md`。
> stage #33; phase=operation; execution=CONDITIONAL（需要运营 runbook 与事件响应程序时执行）。

## 归属

- **phase 队**: aidlc-阶段五-运营（P5）; 队长: aidlc-operations
- **lead persona**: aidlc-operations（P5 队长本人执行, 无需派单 mention）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- dashboards / alarms / reliability-design / security-design / infrastructure-specification（必需）

## 产出

- runbooks（runbook 库: 失败模式处置程序）
- incident-plan（事件响应计划）
- escalation-matrix（升级矩阵与 RTO/RPO 目标）
- incident-response-questions

## 关键步骤

1. 读可观测性/NFR 设计/基础设施设计制品;
2. 生成事件响应澄清问题（失败模式/升级路径与 on-call/自动修复/沟通程序/RTO-RPO 目标）并收集回答;
3. 产出 runbook 库/事件计划/升级矩阵;
4. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。**终局收尾（两段式）**: 全链最后一次人审通过后, P5 队长把 issue 置为 `in_review`, 最终 `done` 由 P5 环节负责人终审执行（`done` 只由人执行）。
