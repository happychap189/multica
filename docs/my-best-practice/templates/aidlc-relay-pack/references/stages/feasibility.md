# feasibility — 可行性与约束

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/ideation/feasibility.md`。
> stage #6; phase=ideation; execution=CONDITIONAL（存在集成约束/合规要求/显著技术不确定性时执行）; mode=inline; 源 summary_confirmation=required。

## 归属

- **phase 队**: aidlc-阶段二-构思（P2）; 队长: aidlc-product
- **lead persona**: aidlc-architect（非队长——P2 队长 @mention 派单执行）; support: aidlc-aws-platform（跨队支援, 经各自所属队队长派单）, aidlc-compliance（跨队支援, 经各自所属队队长派单）
- **reviewer**: 无

## 输入

- intent-statement（必需）; competitive-analysis / market-trends / build-vs-buy（可选）

## 产出

- feasibility-assessment（技术可行性与风险分析）
- constraint-register（技术/组织/合规约束登记册）
- raid-log（风险/假设/问题/依赖）
- feasibility-questions（澄清问题记录）

## 关键步骤

1. 读 intent-statement 与市场制品, 生成集成/合规/预算/组织阻碍澄清问题并收集回答;
2. 歧义与矛盾分析, 追问消歧;
3. 产出可行性评估、约束登记册、RAID log（support persona 提供输入后由 lead 合成）;
4. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
