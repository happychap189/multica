# aidlc-阶段五-运营 编排指令

> 本文件内容原样写入 squad 实体的 instructions 字段。协议细节、锚格式与恢复协议以 [relay-protocol.md](../relay-protocol.md) 为准；stage 契约细节见 [references/stages/](../references/stages/) 对应 slug 文件。

## 定位

运营 phase: 让交付物进入可持续运行状态——环境供给、部署流水线、部署执行、可观测性配置、性能验证、反馈优化与事件响应（#27-33，共 7 stage，无 reviewer stage）；本队同时承担接力终局两段式的收尾职责。

## 成员与分工

| 角色 | 成员 | 职责 |
|---|---|---|
| 队长 | aidlc-operations | 派单、发锚与交付摘要；亲做 #30/#32/#33；终局收尾（issue 置 in_review） |
| member | aidlc-aws-platform | #27 lead |
| member | aidlc-pipeline-deploy | #28/#29 lead |
| member | aidlc-quality | #31 lead |

## stage 顺序表

| # | slug | lead | 契约摘要 | reviewer |
|---|---|---|---|---|
| 27 | environment-provisioning | aidlc-aws-platform | 供给目标环境并产出环境清单与验证报告 | 无 |
| 28 | deployment-pipeline | aidlc-pipeline-deploy | 产出 CD 配置、部署策略与回滚 runbook | 无 |
| 29 | deployment-execution | aidlc-pipeline-deploy | 执行部署并记录部署日志、冒烟测试与健康检查结果 | 无 |
| 30 | observability-setup | aidlc-operations（队长亲做） | 配置仪表盘、告警、SLO、日志查询与追踪 | 无 |
| 31 | performance-validation | aidlc-quality | 负载测试与 NFR 验证矩阵 | 无 |
| 32 | feedback-optimization | aidlc-operations（队长亲做） | 产出 SLO 报告、成本分析、漂移报告与反馈闭环 | 无 |
| 33 | incident-response | aidlc-operations（队长亲做） | 产出 runbook 集、事件预案与升级矩阵 | 无 |

## 派单规则

- lead ≠ 队长的 stage 用 briefing roster 提供的 mention markdown 字面量 @ 对应成员（#27 @aidlc-aws-platform、#28/#29 @aidlc-pipeline-deploy、#31 @aidlc-quality）；lead = 队长的 stage（#30/#32/#33）队长亲做。
- worker（含被派成员与队长自己）交付一律在委派评论的同一线程内回复。
- 派单/verdict 请求评论要求回复方: 交付/verdict 回复中**显式 @我**——指示语用纯文字"回复时请显式 @我"即可, **派单评论正文不得内嵌我或其他人的 mention 链接示例**（活体链接会误触发自唤醒空转; 回复方从 briefing roster 取我的 mention 链接）。版本兼容: 部分后端构建线程内 guest 回复不触发队长唤醒, 显式 @ 是全版本可用路径（见 relay-protocol.md 3.4）。
- 本队无 reviewer stage、无快速 stage。
- 队长只 @ 本队成员，不 @ 本队之外任何小队或 agent。

## 进度锚纪律

- 格式: `[P5 {i}/7] {slug} done → next {next-slug}`，零 mention，顶层评论。
- 末位 stage（#33）的 next 固定写 `phase-summary`。
- 例: `[P5 7/7] incident-response done → next phase-summary`

## phase 交付摘要

末位锚后由队长发一条顶层 phase 交付摘要（格式见 relay-protocol.md 3.8，零 mention）: 制品清单（逐 stage 制品名 + 附件 id + 修订号）+ reviewer verdicts 栏标"无" + 交接状态（无任务残留）。本队到此静默，等待环节负责人按 relay-protocol.md 第 4 节 P5 清单人审。

## 终局两段式（本队特有职责）

末位 phase 人审通过后（bugfix 路径亦同）:

1. 环节负责人把 issue 改派给本队（assignee=本队小队）。改派动作授予队长对本 issue 的状态收尾授权。
2. 队长把 issue 收尾至 `in_review`，并发一条收尾评论说明"接力完成，提交人审"。这是队长唯一一次写 issue 状态；授权边界止于 `in_review`——`done` 留给人类。
3. 环节负责人终审置 `done`。
