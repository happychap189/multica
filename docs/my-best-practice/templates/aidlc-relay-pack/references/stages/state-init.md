# state-init — 状态初始化（上下文盘点）

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/initialization/state-init.md`（适配语义: 源阶段在 aidlc 引擎内确定性运行; 本移植由 P1 队长  执行"上下文盘点"）。
> stage #1; phase=initialization; execution=ALWAYS; mode=inline; 源 lead_agent=orchestrator → 适配为 P1 队长。

> Relay note: 快速阶段（零人审）——P1 队长同任务内部消化: 队长在同一次被 @ 任务内连续消化本阶段, 以进度锚评论承载交付, 不派 worker。

## 归属

- **phase 队**: aidlc-阶段一-启动（P1）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P1 队长本人执行, 无需派单 mention）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- 本次执行的 issue: 描述、诉求评论、已有评论上下文
- 本次执行路径的阶段集（全量 33 阶段或 bugfix 9 阶段——入口判据见 relay 变体文档, 决定本次 scope 路由）


## 产出

- **上下文盘点评论**: 汇总 issue 上下文、诉求要点、本次执行路径的阶段集、本阶段路由结论（类 brownfield/greenfield 判定沿用下一阶段探测）
- 源 `produces` 为空（源阶段只写状态文件）; 本适配以盘点评论承载等价信息

## 关键步骤

1. 读 issue 描述与全部评论, 提取诉求要点、约束与既有上下文;
2. 确定本次执行路径的阶段集（全量 33 阶段或 bugfix 9 阶段, 对应源 scope 路由: 全量/bugfix）; 
3. 判断项目类型线索（工作区是否已有代码——初步判定, 精确探测在 workspace-detection）;
4. 把盘点结论以评论形式发布到 issue, 标注当前阶段 slug `state-init`。


## 完成动作（接力交接）

盘点评论发出后, 本阶段即告完成——P1 队长继续在同任务内消化下一阶段, 并发进度锚评论。**全部 33 个阶段统一此动作**: 交付以评论承载, 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
