# units-generation — 工作单元生成

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/units-generation.md`。
> stage #18; phase=inception; execution=ALWAYS（在 scope 内时）。源阶段产出的依赖 DAG 是 delivery-planning 排序的拓扑输入。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P3 队长本人执行, 无需派单 mention）; support: aidlc-delivery（P3 成员）
- **reviewer**: aidlc-architecture-reviewer（**advisory**——verdict 不阻塞交付, 队长在交付评论中记录采纳/回应）

## 输入

- components / requirements（必需）; decisions / stories（可选）

## 产出

- unit-of-work（单元定义: 稳定 ID `U{n}`、职责、部署模型、复杂度、kind: service/spec/ui/packaging/library）
- unit-of-work-dependency（单元依赖 DAG: 无环; 集成点; 并行机会）
- unit-of-work-story-map（单元-故事映射）
- traceability

## 关键步骤

1. 读组件目录与 ADR（边界类 ADR 约束单元分组）;
2. 制定分解计划（边界策略/粒度/依赖排序/集成点/部署模型）并收集回答;
3. 歧义分析后在交付评论请求分解计划确认（源 Plan Approval）, 由 phase 级人审覆盖;
4. 生成单元三件套与追溯（骨架优先时首个单元=最小端到端切片）;
5. architecture-reviewer 互审 unit-of-work 后交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
