# user-stories — 用户故事

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/user-stories.md`。
> stage #12; phase=inception; execution=CONDITIONAL（有用户可见功能/多角色/复杂业务逻辑/跨队协作时执行; 纯重构/孤立缺陷修复/纯基础设施/开发工具跳过）; mode=mob。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-product（非队长——P3 队长 @mention 派单执行）; mob 参与: aidlc-design（UX/角色保真）、aidlc-developer（可实现性/故事粒度）、aidlc-quality（验收标准可测性）
- **reviewer**: aidlc-product-lead（**advisory**——verdict 不阻塞交付, 队长在交付评论中记录采纳/回应）

## 输入

- requirements（必需）
- brownfield 时: business-overview / component-inventory（可选）

## 产出

- stories（INVEST 格式故事, 稳定 ID `US{group}.{seq}`; 验收标准 ID `AC{g}.{s}.{c}`; MoSCoW 优先级）
- personas（用户角色定义）
- user-stories-assessment（执行/跳过评估）
- traceability（FR/NFR→故事元素级追溯）

## 关键步骤

1. 评估用户故事是否增值（不增值则产出评估制品并在交付评论说明, 由 phase 级人审覆盖）;
2. 制定故事计划（角色方法/INVEST/MoSCoW/拆解方式）并收集回答;
3. lead 起草 personas 与 stories, 三个 support persona 并行独立出贡献文件后由 lead 整合, 分歧升级为人;
4. 写元素级追溯（每个 FR/NFR 有 OK/Deferred/N/A/GAP 状态与目标故事 ID）;
5. product-lead 复审 stories 后交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
