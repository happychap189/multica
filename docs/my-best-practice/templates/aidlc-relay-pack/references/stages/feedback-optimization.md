# feedback-optimization — 反馈与优化

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/operation/feedback-optimization.md`。
> stage #32; phase=operation; execution=CONDITIONAL（需持续运营监控与优化时执行）; 源阶段是全量链的末阶段。

## 归属

- **phase 队**: aidlc-阶段五-运营（P5）; 队长: aidlc-operations
- **lead persona**: aidlc-operations（P5 队长本人执行, 无需派单 mention）; support: aidlc-aws-platform（P5 成员）
- **reviewer**: 无

## 输入

- dashboards / alarms / slo-config / deployment-log（必需）; load-test-results / incident-plan（可选）

## 产出

- slo-report（SLO 合规报告: 合规状况与错误预算消耗率）
- cost-analysis（成本优化建议）
- drift-report（配置漂移报告）
- feedback-loop（反馈环文档: 作为下一轮 Ideation 输入）
- feedback-optimization-questions

## 关键步骤

1. 读可观测性/性能验证/部署执行制品与监控数据;
2. 生成优化澄清问题（SLO 达成与错误预算/成本优化/漂移/用户行为洞察/可自动化运维杂务）并收集回答;
3. 产出 SLO 报告/成本分析/漂移报告/反馈环文档;
4. 交付并发进度锚评论（本阶段为全量链末阶段, 收尾走终局两段式, 见完成动作）。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。**终局收尾（两段式）**: 全链最后一次人审通过后, P5 队长把 issue 置为 `in_review`, 最终 `done` 由 P5 环节负责人终审执行（`done` 只由人执行）。
