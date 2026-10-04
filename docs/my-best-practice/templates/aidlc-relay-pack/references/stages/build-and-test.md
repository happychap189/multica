# build-and-test — 构建与测试

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/construction/build-and-test.md`。
> stage #25; phase=construction; execution=ALWAYS（全部单元完成后运行一次）。

> Relay note: 快速阶段（零人审）——照常派单: 队长 @mention 派 lead persona 真实执行, 产出由 phase 级人审覆盖, 不增设互审。

## 归属

- **phase 队**: aidlc-阶段四-构建（P4）; 队长: aidlc-architect
- **lead persona**: aidlc-quality（非队长——P4 队长 @mention 派单执行）; support: aidlc-devsecops（P4 成员）
- **reviewer**: 无

## 输入

- code-generation-plan / unit-test-instructions / code-summary（必需, 汇总全部单元）

## 产出

- build-instructions
- integration/performance/security-test-instructions（按测试策略层级生成）
- build-and-test-summary + build-test-results（Target Verification Matrix: 每 target 有 Met/Not Met/Unverified 终态判定）
- cross-unit-traceability（FR/NFR/AC 跨单元覆盖门）

## 关键步骤

1. 汇总各单元代码生成产物, 建质量目标清单;
2. 生成构建说明与按策略层级的测试说明文件;
3. 执行构建与各层测试（去重后的单元级命令各跑一次）, 无法本地执行的 check 可延后到后继验证阶段并记录归属;
4. 写 test-results 与 Target Verification Matrix（Pending 不得残留）;
5. 跨单元 FR/NFR/AC 覆盖门, 登记 cross-unit-traceability, 未覆盖项即本阶段 finding;
6. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
