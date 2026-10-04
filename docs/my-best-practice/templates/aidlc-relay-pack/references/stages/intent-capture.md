# intent-capture — 意图捕获与框定

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/ideation/intent-capture.md`。
> stage #4; phase=ideation; execution=ALWAYS; mode=inline; 源 summary_confirmation=required。

## 归属

- **phase 队**: aidlc-阶段二-构思（P2）; 队长: aidlc-product
- **lead persona**: aidlc-product（P2 队长本人执行, 无需派单 mention）; support: aidlc-architect（源 frontmatter 声明, P2 成员）
- **reviewer**: aidlc-product-lead（**advisory**——verdict 不阻塞交付, 队长在交付评论中记录采纳/回应）

## 输入

- issue 描述（权威项目描述）; scope 选择（全量/bugfix 由操作者在接力启动时选定）

## 产出

- intent-statement（意图陈述: 问题、目标、成功标准）
- stakeholder-map（干系人地图）
- intent-capture-questions（澄清问题记录）

## 关键步骤

1. 加载 issue 上下文与先行阶段制品;
2. 生成澄清问题（意图范围、成功标准、干系人、边界）并收集回答;
3. 歧义检测与矛盾分析, 追问直至消歧;
4. 产出 intent-statement 与 stakeholder-map, 解决残余假设;
5. 产品负责人 persona 复审 intent-statement 后交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
