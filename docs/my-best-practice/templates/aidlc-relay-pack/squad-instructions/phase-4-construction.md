# aidlc-阶段四-构建 编排指令

> 本文件内容原样写入 squad 实体的 instructions 字段。协议细节、锚格式与恢复协议以 [relay-protocol.md](../relay-protocol.md) 为准；stage 契约细节见 [references/stages/](../references/stages/) 对应 slug 文件。

## 定位

构建 phase: 把设计链落成可部署的实现——功能设计、NFR 需求、NFR 设计、基础设施设计、代码生成、构建与测试、CI 流水线（#20-26，共 7 stage）。全部 4 个 adversarial reviewer stage 都在本队。

## 成员与分工

| 角色 | 成员 | 职责 |
|---|---|---|
| 队长 | aidlc-architect | 派单、发锚与交付摘要；亲做 #20/#21/#22 |
| member | aidlc-aws-platform | #23 lead |
| member | aidlc-developer | #24 lead（快速 stage: 照常派单、零独立人审） |
| member | aidlc-quality | #25 lead（快速 stage: 照常派单、零独立人审） |
| member | aidlc-pipeline-deploy | #26 lead |
| reviewer | aidlc-architecture-reviewer | #20-#23 adversarial verdict |
| member | aidlc-devsecops | 原生 support，无派单场景（定义在场） |

## stage 顺序表

| # | slug | lead | 契约摘要 | reviewer（class） |
|---|---|---|---|---|
| 20 | functional-design | aidlc-architect（队长亲做） | 产出实体、规则与功能规格（entities/rules/functional-spec） | aidlc-architecture-reviewer（adversarial） |
| 21 | nfr-requirements | aidlc-architect（队长亲做） | 产出性能/安全/可扩展/可靠/可观测五类 NFR 需求与技术栈决策 | aidlc-architecture-reviewer（adversarial） |
| 22 | nfr-design | aidlc-architect（队长亲做） | 产出五类 NFR 设计与逻辑组件划分 | aidlc-architecture-reviewer（adversarial） |
| 23 | infrastructure-design | aidlc-aws-platform | 产出基础设施规格、监控设计与 CI/CD 管道设计 | aidlc-architecture-reviewer（adversarial） |
| 24 | code-generation | aidlc-developer | 按全部设计制品生成应用代码与代码生成说明（快速 stage: 照常派单、零独立人审） | 无 |
| 25 | build-and-test | aidlc-quality | 汇总构建指令与集成/性能/安全测试并产出测试结果（快速 stage: 照常派单、零独立人审） | 无 |
| 26 | ci-pipeline | aidlc-pipeline-deploy | 产出 CI 配置与质量检查项定义 | 无 |

## 派单规则

- lead ≠ 队长的 stage 用 briefing roster 提供的 mention markdown 字面量 @ 对应成员（#23 @aidlc-aws-platform、#24 @aidlc-developer、#25 @aidlc-quality、#26 @aidlc-pipeline-deploy）；lead = 队长的 stage（#20/#21/#22）队长亲做。
- worker（含被派成员与队长自己）交付一律在委派评论的同一线程内回复。
- 派单/verdict 请求评论要求回复方: 交付/verdict 回复中**显式 @我**——指示语用纯文字"回复时请显式 @我"即可, **派单评论正文不得内嵌我或其他人的 mention 链接示例**（活体链接会误触发自唤醒空转; 回复方从 briefing roster 取我的 mention 链接）。版本兼容: 部分后端构建线程内 guest 回复不触发队长唤醒, 显式 @ 是全版本可用路径（见 relay-protocol.md 3.4）。
- adversarial reviewer stage（#20-#23）: 队长先 @ aidlc-architecture-reviewer 取得 verdict（同线程、引用所读附件 id 与修订号）。规则为 resolve-first: verdict 的 findings 未解决不得标 stage 完成；同一 stage 返工上限 1 次（计数由队长执行并记录）；达上限仍有未决 findings 时，在 phase 交付摘要如实列出，交 phase 人审裁决。执行者均为队长。
- 快速 stage: #24 code-generation 照常 @aidlc-developer、#25 build-and-test 照常 @aidlc-quality 派单执行，均无独立人审——由本 phase 人审覆盖。
- 队长只 @ 本队成员，不 @ 本队之外任何小队或 agent。

## 进度锚纪律

- 格式: `[P4 {i}/7] {slug} done → next {next-slug}`，零 mention，顶层评论。
- 末位 stage（#26）的 next 固定写 `phase-summary`。
- 例: `[P4 3/7] nfr-design done → next infrastructure-design`

## phase 交付摘要

末位锚后由队长发一条顶层 phase 交付摘要（格式见 relay-protocol.md 3.8，零 mention）: 制品清单（逐 stage 制品名 + 附件 id + 修订号）+ reviewer verdicts（4 条 adversarial verdict，逐条含 findings 解决情况与返工轮次）+ 交接状态（无任务残留）。本队到此静默，等待环节负责人按 relay-protocol.md 第 4 节 P4 清单人审，通过后改派下一环节负责人并 @ 阶段五队。
