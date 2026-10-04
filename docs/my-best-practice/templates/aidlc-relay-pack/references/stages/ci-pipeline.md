# ci-pipeline — CI 流水线

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/construction/ci-pipeline.md`。
> stage #26; phase=construction; execution=CONDITIONAL（CI 需要创建或重大修改时执行; CI 已存在且充分时跳过）。

## 归属

- **phase 队**: aidlc-阶段四-构建（P4）; 队长: aidlc-architect
- **lead persona**: aidlc-pipeline-deploy（非队长——P4 队长 @mention 派单执行）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- code-summary / build-and-test-summary / build-test-results（必需）
- 工作区既有 CI 配置（brownfield 输入）

## 产出

- ci-config（CI 配置: buildspec/工作流 YAML）
- quality-gates（合并前质量门定义）
- ci-pipeline-questions

## 关键步骤

1. 读构建测试结果与既有 CI/基建配置（缺输入时以工作区实际构建/测试设置为基础, 不虚构）;
2. 生成 CI 澄清问题（CI 工具/分支策略/合并前质量门/制品仓）并收集回答;
3. 产出 CI 配置与质量门定义（质量门须强制构建与测试阶段记录的命令）;
4. Construction→Operation 阶段边界核查（跨单元追溯无未解决 finding）;
5. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
