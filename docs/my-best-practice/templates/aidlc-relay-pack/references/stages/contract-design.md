# contract-design — 契约设计

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/contract-design.md`。
> stage #17; phase=inception; execution=CONDITIONAL（存在正式契约要定准——单元间边界（≥2 个须集成的单元）或对外暴露公共/外部 API 的单元时执行; 仅单个自包含单元时跳过）。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P3 队长本人执行, 无需派单 mention）; support: aidlc-aws-platform（跨队支援, 经各自所属队队长派单）
- **reviewer**: aidlc-architecture-reviewer（**advisory**——verdict approved/rejected 不阻塞交付, 队长在交付评论中记录采纳/回应）

## 输入

- unit-of-work / unit-of-work-dependency（必需）; components / requirements（可选）

## 产出

- contract-summary（契约摘要: contracts 表 + 每边界 fenced spec 块（OpenAPI/AsyncAPI/共享 schema）+ 所有权/破坏性变更规则 + 未决问题表）

## 关键步骤

1. 读单元定义与依赖 DAG（每条边都是候选契约）;
2. 生成契约问题（公共 API 面/集成机制/契约所有权/版本与破坏性变更策略/边界错误-超时-重试行为）并收集回答;
3. 产出 contract-summary（机制匹配 spec 格式）;
4. architecture-reviewer 互审 contract-summary 后交付（verdict 不阻塞, leader 记录采纳/回应）。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
