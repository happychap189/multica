# nfr-requirements — NFR 需求

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/construction/nfr-requirements.md`。
> stage #21; phase=construction; execution=CONDITIONAL（需性能/安全/可扩展/可靠性/可观测性需求或技术选型时执行）; for_each=unit-of-work。

## 归属

- **phase 队**: aidlc-阶段四-构建（P4）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P4 队长本人执行, 无需派单 mention）; support: aidlc-devsecops（P4 成员）, aidlc-compliance（跨队支援, 经各自所属队队长派单）, aidlc-quality（P4 成员）
- **reviewer**: aidlc-architecture-reviewer（**adversarial**——源未声明 review_class, 按 stage-definition.md 缺省 adversarial; 队长须先解决 findings 再交付, 返工上限 1 次）

## 输入

- functional-spec / rules / requirements（必需）; contract-summary（可选）; brownfield 时 technology-stack（可选）

## 产出

- performance-requirements / security-requirements / scalability-requirements / reliability-requirements / observability-requirements（五类 NFR 需求, 按 produces_kinds 适用性: 性能 ui+service, 可扩展/可靠/可观测仅 service）
- tech-stack-decisions（技术选型决策）
- traceability

## 关键步骤

1. 读功能设计制品与需求, 评估五类 NFR 类别适用性;
2. 生成澄清问题并收集回答;
3. 产出五类 NFR 需求（带可测目标值——不从测试或构建配置放宽既定目标）与 tech-stack-decisions;
4. architecture-reviewer 对抗互审 security-requirements, leader 先解决 findings 再交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
