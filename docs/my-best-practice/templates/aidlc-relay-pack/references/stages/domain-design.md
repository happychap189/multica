# domain-design — 领域设计

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/domain-design.md`。
> stage #13; phase=inception; execution=CONDITIONAL（需要新组件/逻辑构件时执行; 纯现有组件修改跳过）。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P3 队长本人执行, 无需派单 mention）; support: aidlc-aws-platform（跨队支援, 经各自所属队队长派单）, aidlc-design（P3 成员）
- **reviewer**: aidlc-architecture-reviewer（**advisory**——verdict 不阻塞交付, 队长在交付评论中记录采纳/回应）

## 输入

- requirements（必需）; stories（可选）
- brownfield 时: architecture / component-inventory（可选）

## 产出

- components（组件目录: fenced yaml 清单 + mermaid 图 + 摘要表）
- decisions（ADR 记录）
- traceability

## 关键步骤

1. 读需求/故事/（brownfield）现有架构与组件清单, 制定设计计划并收集回答;
2. 产出组件目录（多可行分解时给出边界选项）;
3. 记录 ADR（Context/Decision/Consequences + 被否方案）;
4. 写元素级追溯;
5. architecture-reviewer 复审 components 后交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
