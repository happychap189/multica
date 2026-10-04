# infrastructure-design — 基础设施设计

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/construction/infrastructure-design.md`。
> stage #23; phase=construction; execution=CONDITIONAL（基建服务映射/部署架构/云资源需要时执行; 无基建变更且基建已定义时跳过）; for_each=unit-of-work。

## 归属

- **phase 队**: aidlc-阶段四-构建（P4）; 队长: aidlc-architect
- **lead persona**: aidlc-aws-platform（非队长——P4 队长 @mention 派单执行）; support: aidlc-devsecops（P4 成员）, aidlc-compliance（跨队支援, 经各自所属队队长派单）
- **reviewer**: aidlc-architecture-reviewer（**adversarial**——源未声明 review_class, 按 stage-definition.md 缺省 adversarial; 队长须先解决 findings 再交付, 返工上限 1 次）

## 输入

- 五类 NFR 设计（performance/security/scalability/reliability/observability-design）+ logical-components + components + functional-spec（必需）
- contract-summary（可选）

## 产出

- infrastructure-specification（部署+服务+共享, 表格式）
- monitoring-design（表格式）
- cicd-pipeline
- traceability

## 关键步骤

1. 读五类 NFR 设计、logical-components、components、functional-spec;
2. 生成基建澄清问题并收集回答;
3. 产出 infrastructure-specification / monitoring-design / cicd-pipeline;
4. architecture-reviewer 对抗互审 cicd-pipeline, leader 先解决 findings 再交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
