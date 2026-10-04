# performance-validation — 性能验证

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/operation/performance-validation.md`。
> stage #31; phase=operation; execution=CONDITIONAL（NFR 性能目标需加压验证时执行）; bugfix 路径不含本阶段。

## 归属

- **phase 队**: aidlc-阶段五-运营（P5）; 队长: aidlc-operations
- **lead persona**: aidlc-quality（非队长——P5 队长 @mention 派单执行）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- performance-requirements / scalability-requirements / performance-design / scalability-design / dashboards（必需）

## 产出

- load-test-plan（负载测试计划: 流量模式/p50-p95-p99 延迟目标/吞吐/瓶颈假设）
- load-test-results（负载测试结果: 延迟/吞吐/错误率）
- nfr-validation-matrix（NFR 验证矩阵: 目标 vs 实际值比对）
- performance-validation-questions

## 关键步骤

1. 读 NFR 需求与 NFR 设计及可观测性配置;
2. 生成性能澄清问题（流量模式/延迟分位目标/吞吐/瓶颈假设）并收集回答;
3. 设计并执行负载测试, 用监控数据证据分析结果;
4. 产出负载测试计划/结果与 NFR 验证矩阵;
5. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。**终局收尾（两段式）**: 全链最后一次人审通过后, P5 队长把 issue 置为 `in_review`, 最终 `done` 由 P5 环节负责人终审执行（`done` 只由人执行）。
