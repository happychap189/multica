# refined-mockups — 精细原型

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/refined-mockups.md`。
> stage #16; phase=inception; execution=CONDITIONAL（有用户可见 UI 且 ideation 产出了粗略原型时执行; API 类倡议则细化系统交互图）。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-design（非队长——P3 队长 @mention 派单执行）; support: aidlc-product（P3 成员）
- **reviewer**: aidlc-product-lead（**advisory**——verdict 不阻塞交付, 队长在交付评论中记录采纳/回应）

## 输入

- wireframes / user-flow（必需）; requirements（必需）; stories / team-practices（可选）

## 产出

- mockups（精细原型/交互细化）
- interaction-spec（交互规格）
- design-system-mapping（设计系统映射）
- accessibility-checklist（无障碍检查单）
- refined-mockups-questions

## 关键步骤

1. 读粗略原型/需求/故事, 生成澄清问题并收集回答;
2. 歧义分析消歧;
3. 产出 mockups / interaction-spec / design-system-mapping / accessibility-checklist;
4. product-lead 复审 mockups 后交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
