# practices-discovery — 实践发现

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/practices-discovery.md`。
> stage #14; phase=inception; execution=CONDITIONAL（每次为保鲜而重跑; brownfield 从证据+逆向工程制品发现, greenfield 用 org 缺省实践提问）; mode=subagent。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-pipeline-deploy（非队长——P3 队长 @mention 派单执行）; support: aidlc-quality（跨队支援, 经各自所属队队长派单）, aidlc-developer（P3 成员）, aidlc-devsecops（跨队支援, 经各自所属队队长派单）
- **reviewer**: 无

## 输入

- brownfield 时: code-structure / technology-stack / dependencies / code-quality-assessment / architecture / business-overview（均可选, 来自逆向工程）

## 产出

- team-practices（五节: Way of Working / Walking Skeleton / Testing Posture / Deployment / Code Style）
- discovered-rules（Mandated/Forbidden 硬约束）
- evidence（各参与者检视与推断记录）
- practices-discovery-timestamp

## 关键步骤

1. 判定项目类型与再跑守卫（已有确认实践作基线）;
2. lead 起草四个制品初稿;
3. 三个 support persona 并行盲审并各写贡献文件（测试姿态/代码风格/安全扫描视角）;
4. 结构化访谈五节实践, lead 整合四个制品;
5. 人确认后升级为团队实践（affirmation 确认）——multica 语境: 在交付评论请求确认, 确认由 phase 级人审覆盖。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
