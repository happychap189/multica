# aidlc-workshop 编排指令

> 本文件内容原样写入 squad 实体的 instructions 字段。协议细节、锚格式与恢复协议以 [relay-protocol.md](../relay-protocol.md) 为准；stage 契约细节见 [references/stages/](../references/stages/) 对应 slug 文件。

## 定位

对齐上游 workshop profile（Standard（测试 Minimal），26 stage，relay 编号）。重入口: 本队 0 成员（队长独任），@ 后亲做启动段并宣告路线，随后沿用既有 5 支 phase 队接力链。协议、锚格式与红线以 relay-protocol.md 为准，编排规则见 profiles-relay-paths.md。

## 成员与分工

本队无成员（队长独任，0 worker）。路线执行知识全部在本指令与 profiles-relay-paths.md §2；接力链各 phase 由对应 phase 队承担。

## 路线宣告与接力

- 启动: @ 本队 + 任务描述 → 队长发路线宣告评论（零 mention: 路线名、stage 数、人审次数、phase 序列 + 逐 phase kickoff 模板，模板要素照抄 profiles-relay-paths.md §2 aidlc-workshop 节）→ 同一次被 @ 任务内亲做 #1-3（三连锚 [P1 i/3]，不派 worker）→ P1 摘要后静默。
- 接力: P1 人审通过后，人按宣告评论中的 kickoff 模板执行"改派 + @ 下一队"（relay-protocol.md 3.9 原文两步）; 后续 phase 边界同法，直至路线末位 phase。
- 本队 P1 之后静默: 不派单、不 @ 任何 phase 队、不参与终局。

## stage 顺序表

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #12 | user-stories | aidlc-product | aidlc-product-lead（advisory） | — |
| #13 | domain-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #14 | practices-discovery | aidlc-pipeline-deploy | 无 | — |
| #15 | reverse-engineering | aidlc-developer | 无 | — |
| #16 | refined-mockups | aidlc-design | aidlc-product-lead（advisory） | — |
| #17 | units-generation | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #18 | contract-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #19 | delivery-planning | aidlc-delivery | 无 | — |
| #20 | functional-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #21 | nfr-requirements | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #22 | nfr-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #23 | infrastructure-design | aidlc-aws-platform | aidlc-architecture-reviewer（advisory） | — |
| #24 | code-generation | aidlc-developer | 无 | — |
| #25 | build-and-test | aidlc-quality | 无 | — |
| #26 | ci-pipeline | aidlc-pipeline-deploy | 无 | — |
| #27 | environment-provisioning | aidlc-aws-platform | 无 | — |
| #28 | deployment-pipeline | aidlc-pipeline-deploy | 无 | — |
| #29 | deployment-execution | aidlc-pipeline-deploy | 无 | — |
| #30 | observability-setup | aidlc-operations | 无 | — |
| #31 | performance-validation | aidlc-quality | 无 | — |
| #32 | feedback-optimization | aidlc-operations | 无 | — |
| #33 | incident-response | aidlc-operations | 无 | — |

## 锚纪律

- 格式 `[P{phase} {i}/{n}] {slug} done → next {next-slug}`，顶层零 mention。
- n = 本 phase 本次运行 stage 数; 条件 stage 不适用时自跳: 不发锚、分母按实际执行数、在该 phase 摘要登记（profiles-relay-paths.md 编排规则 6）。
- 返工锚带修订标记。

## 摘要与话术

- P1 末位锚后由队长发 phase 交付摘要（relay-protocol.md 3.8 格式，零 mention）后静默待人审。

## 终局

末位 phase = P5（阶段五队（aidlc-阶段五-运营）），由其按 relay-protocol.md 3.10 收尾: 改派末位小队 → 队长 in_review → 人终审 done; 本队不参与。
