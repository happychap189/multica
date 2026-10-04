# deployment-pipeline — 部署流水线（CD）

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/operation/deployment-pipeline.md`。
> stage #28; phase=operation; execution=CONDITIONAL（CD 流水线需要创建或重大修改时执行; 既有流水线已充分时跳过）。

## 归属

- **phase 队**: aidlc-阶段五-运营（P5）; 队长: aidlc-operations
- **lead persona**: aidlc-pipeline-deploy（非队长——P5 队长 @mention 派单执行）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- ci-config / quality-gates / infrastructure-specification / cicd-pipeline（必需）

## 产出

- cd-config（CD 配置）
- deployment-strategy（部署策略: blue/green、canary、rolling; 环境晋升门 dev→staging→prod）
- rollback-runbook（回滚 runbook）
- deployment-pipeline-questions

## 关键步骤

1. 读 CI 配置与基础设施设计;
2. 生成 CD 澄清问题（部署策略/环境晋升门/生产审批/回滚程序/特性开关策略）并收集回答;
3. 产出 CD 配置、部署策略、回滚 runbook、特性开关配置;
4. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。**终局收尾（两段式）**: 全链最后一次人审通过后, P5 队长把 issue 置为 `in_review`, 最终 `done` 由 P5 环节负责人终审执行（`done` 只由人执行）。
