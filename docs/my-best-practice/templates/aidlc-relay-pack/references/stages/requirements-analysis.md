# requirements-analysis — 需求分析

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/requirements-analysis.md`。
> stage #11; phase=inception; execution=ALWAYS; mode=inline; 源 summary_confirmation=required。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-product（非队长——P3 队长 @mention 派单执行）; support 无（源 support_agents 为空）
- **reviewer**: aidlc-product-lead（**advisory**——verdict 不阻塞交付, 队长在交付评论中记录采纳/回应）

## 输入

- intent-statement / scope-document（可选）
- brownfield 时: business-overview / architecture / code-structure（可选, 来自逆向工程）

## 产出

- requirements（稳定 ID 的 FR/NFR 需求清单: 范围内/外、开放问题留痕）
- requirements-analysis-questions

## 关键步骤

1. 读 ideation 制品与（brownfield 时）逆向工程制品, 分析用户请求;
2. 判定分析深度, 评估现状需求做完整性分析;
3. 生成澄清问题、收集回答、追问消歧;
4. 确认合并后的需求摘要;
5. 产出带稳定 ID 的 FR/NFR 需求清单（范围内/外明确、开放问题留痕）;
6. product-lead 复审 requirements 后交付。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
