# observability-setup — 可观测性配置

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/operation/observability-setup.md`。
> stage #30; phase=operation; execution=CONDITIONAL（需配置监控/看板/告警/追踪时执行）。

## 归属

- **phase 队**: aidlc-阶段五-运营（P5）; 队长: aidlc-operations
- **lead persona**: aidlc-operations（P5 队长本人执行, 无需派单 mention）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- performance-design / security-design / reliability-design / monitoring-design / infrastructure-specification（必需）

## 产出

- dashboards（看板配置）
- alarms（告警定义: 严重级/SNS 路由/升级路径）
- slo-config（SLO/SLI 配置）
- log-queries（日志查询, 如 Logs Insights 保存查询）
- tracing-config（追踪配置）
- anomaly-config（异常检测配置）
- observability-setup-questions

## 关键步骤

1. 读 NFR 设计与基础设施设计及部署执行证据（上游被跳过时从已批准需求/工作区配置推导最小可观测面, 不虚构设计制品）;
2. 生成可观测性澄清问题（黄金信号/SLO-SLI/看板布局/日志保留聚合/追踪插桩）并收集回答;
3. 产出六件可观测性配置制品;
4. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。**终局收尾（两段式）**: 全链最后一次人审通过后, P5 队长把 issue 置为 `in_review`, 最终 `done` 由 P5 环节负责人终审执行（`done` 只由人执行）。
