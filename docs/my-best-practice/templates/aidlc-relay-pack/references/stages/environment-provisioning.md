# environment-provisioning — 环境供给

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/operation/environment-provisioning.md`。
> stage #27; phase=operation; execution=CONDITIONAL（需要 AWS 环境供给或验证时执行）。

## 归属

- **phase 队**: aidlc-阶段五-运营（P5）; 队长: aidlc-operations
- **lead persona**: aidlc-aws-platform（非队长——P5 队长 @mention 派单执行）; support: aidlc-devsecops（跨队支援, 经各自所属队队长派单）, aidlc-compliance（跨队支援, 经各自所属队队长派单）
- **reviewer**: 无

## 输入

- infrastructure-specification / cd-config（必需）

## 产出

- environment-inventory（环境清单: VPC/子网/安全组/NACL/密钥注入/连通性验证结论）
- validation-report（基建验证报告）
- environment-provisioning-questions

## 关键步骤

1. 读基础设施设计与 CD 配置;
2. 生成环境供给澄清问题并收集回答;
3. 用 IaC 供给目标环境并验证基建配置（安全姿态校验由 devsecops 支援）;
4. 产出环境清单与验证报告;
5. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。**终局收尾（两段式）**: 全链最后一次人审通过后, P5 队长把 issue 置为 `in_review`, 最终 `done` 由 P5 环节负责人终审执行（`done` 只由人执行）。
