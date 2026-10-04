# code-generation — 代码生成

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/construction/code-generation.md`。
> stage #24; phase=construction; execution=ALWAYS（每个单元各跑一次）; for_each=unit-of-work; mode=subagent; workspace_requires=true（应用代码写到工作区根, 不只写 record 目录的 markdown）。

> Relay note: 快速阶段（零人审）——照常派单: 队长 @mention 派 lead persona 真实执行, 产出由 phase 级人审覆盖, 不增设互审。

## 归属

- **phase 队**: aidlc-阶段四-构建（P4）; 队长: aidlc-architect
- **lead persona**: aidlc-developer（非队长——P4 队长 @mention 派单执行）; support 无（源 support_agents 为空）
- **reviewer**: 无（源 frontmatter 声明 reviewer=aidlc-architecture-reviewer, review_class 未声明按源缺省 adversarial; 但本阶段不在 12 个互审阶段集合内, reviewer 协议在本阶段不激活）

## 输入

- unit-of-work / requirements（必需）
- functional-spec / rules / entities / contract-summary / performance-design / security-design / infrastructure-specification（可选, 按单元适用性）

## 产出

- 应用代码（写到工作区/代码仓）+ code-generation-plan（含 Testing Contract 块与测试步骤, 测试文件强制入计划）+ unit-test-instructions（运行命令必须单元级限定）+ code-summary + traceability

## 关键步骤

1. 读本单元全部设计制品（缺制品时不虚构, 按 scope 降级）;
2. PART 1 规划: 产出代码生成计划（checkbox 步骤, 故事→代码步骤追溯, 测试文件强制, Testing Contract 定序）;
3. 请人批准计划（源 Plan Approval; multica 语境: 在交付评论请求计划确认）;
4. PART 2 生成: 按计划实现业务逻辑/API/数据访问/测试, brownfield 就地修改不复制文件; 不得为通过而放宽既定质量目标;
5. 产出 code-summary 与 traceability。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
