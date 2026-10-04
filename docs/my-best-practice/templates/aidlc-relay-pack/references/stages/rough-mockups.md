# rough-mockups — 粗略原型

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/ideation/rough-mockups.md`。
> stage #7; phase=ideation; execution=CONDITIONAL（有用户可见 UI 时产出线框/概念图; 纯 API/后端时产出系统交互图; 非 UI/纯 API/纯基础设施跳过）。

## 归属

- **phase 队**: aidlc-阶段二-构思（P2）; 队长: aidlc-product
- **lead persona**: aidlc-design（非队长——P2 队长 @mention 派单执行）; support: aidlc-product（P2 队长）
- **reviewer**: aidlc-product-lead（**advisory**——verdict 不阻塞交付, 队长在交付评论中记录采纳/回应）

## 输入

- intent-statement（必需）; scope-document（必需）; intent-backlog（必需）

## 产出

- wireframes（线框图/概念可视化; 纯 API 时为系统交互图）
- user-flow（用户流）
- rough-mockups-questions（澄清问题记录）

## 关键步骤

1. 读意图/范围/积压, 生成澄清问题并收集回答;
2. 歧义分析消歧;
3. 产出线框与用户流（纯 API 倡议改为系统交互图）;
4. product-lead 复审 wireframes 后交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
