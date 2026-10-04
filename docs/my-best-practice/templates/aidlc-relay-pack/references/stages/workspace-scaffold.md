# workspace-scaffold — 工作区脚手架（制品空间准备）

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/initialization/workspace-scaffold.md`（适配语义: 源阶段幂等创建 record 目录树; 本移植**只发布制品空间结构推荐评论, 不在运行中绑定 git 仓**——制品仓绑定推迟到全量真跑之后再加）。
> stage #3; phase=initialization; execution=ALWAYS; mode=inline; 源 lead_agent=orchestrator → 适配为 P1 队长。

> Relay note: 快速阶段（零人审）——P1 队长同任务内部消化: 队长在同一次被 @ 任务内连续消化本阶段, 以进度锚评论承载交付, 不派 worker。

## 归属

- **phase 队**: aidlc-阶段一-启动（P1）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P1 队长本人执行, 无需派单 mention）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- workspace-detection 的探测报告（greenfield/brownfield、技术栈）

## 产出

- **制品空间推荐评论**: 推荐的 intent 目录结构与命名约定（见下）, 供后续阶段沿用; **不执行 git 仓创建/绑定**
- 源 `produces` 为空; 本适配以推荐评论承载等价信息

## 关键步骤

1. 按本次执行路径的阶段集生成推荐的制品空间目录约定: `intents/<YYMMDD>-<issue-key>-<slug>/` 下按 phase 分目录（ideation/inception/construction/operation + verification）, 每阶段一个子目录放本阶段制品;
2. 说明后续阶段的制品落位方式: 制品全文按路径约定写文件（绑定制品仓后）, 当前以**交付摘要评论引用制品名 + 关键内容摘录**承载;
3. 声明 intent 目录命名规则（UTC 日期 + issue key + 2-5 词短横线摘要）与 intent-state 进度登记建议;
4. 把推荐结构以评论形式发布, 标注当前阶段 slug `workspace-scaffold`。

## 完成动作（接力交接）

推荐评论发出后, 本阶段即告完成——P1 队长继续在同任务内消化下一阶段, 并发进度锚评论。**全部 33 个阶段统一此动作**: 交付以评论承载, 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
