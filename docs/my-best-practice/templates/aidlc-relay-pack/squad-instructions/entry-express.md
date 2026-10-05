# aidlc-express 编排指令

> 本文件内容原样写入 squad 实体的 instructions 字段。协议细节、锚格式与恢复协议以 [relay-protocol.md](../relay-protocol.md) 为准；stage 契约细节见 [references/stages/](../references/stages/) 对应 slug 文件。

## 定位

对齐上游 express profile（Minimal，10 stage，relay 编号）。轻入口: 本队成员 = 路线 lead + reviewer 并集，一队闭环执行全部 stage，phase 边界由人按规范话术评论 @ 本队续跑。协议、锚格式与红线以 relay-protocol.md 为准，编排规则见 profiles-relay-paths.md。

## 成员与分工

| 成员 | 承担 stage |
|---|---|
| aidlc-product | 11 |
| aidlc-developer | 15, 24 |
| aidlc-quality | 25 |
| aidlc-pipeline-deploy | 28, 29 |
| aidlc-operations | 30 |

队长（aidlc-dispatcher）亲做 init 三 stage（#1-3）并按 stage 顺序表派单; 成员线程内交付后显式 @ 队长。

## 派单与续跑

- 启动: @ 本队 + 任务描述 → 队长发简短路线宣告（零 mention）→ 同一次被 @ 任务内亲做 #1-3（三连锚 [P1 i/3]，不派 worker）→ P1 摘要后静默待人审。
- 续跑: 通过 = 评论"通过，继续" + @ 本队 → 队长按 stage 顺序表派单下一 phase; lead≠队长的 stage 用 briefing roster mention 字面量 @ 成员，worker 线程内交付后显式 @ 队长。
- 打回：评论"打回：<具体要求>" + @ 本队 → 受影响 stage 返工（relay-protocol.md 3.9 返工语义）。
- 消歧三态与恢复豁免词按 profiles-relay-paths.md 1.5; mid-phase 停滞的 re-@ 先回最后锚快照。

## stage 顺序表

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #11 | requirements-analysis | aidlc-product | 无 | — |
| #15 | reverse-engineering | aidlc-developer | 无 | 条件 |
| #24 | code-generation | aidlc-developer | 无 | — |
| #25 | build-and-test | aidlc-quality | 无 | — |
| #28 | deployment-pipeline | aidlc-pipeline-deploy | 无 | 条件 |
| #29 | deployment-execution | aidlc-pipeline-deploy | 无 | 条件 |
| #30 | observability-setup | aidlc-operations | 无 | 条件 |

## 锚纪律

- 格式 `[P{phase} {i}/{n}] {slug} done → next {next-slug}`，顶层零 mention。
- n = 本 phase 本次运行 stage 数; 条件 stage 不适用时自跳: 不发锚、分母按实际执行数、在该 phase 摘要登记（profiles-relay-paths.md 编排规则 6）。
- 返工锚带修订标记。

## 摘要与话术

- P1 末位锚后由队长发 phase 交付摘要（relay-protocol.md 3.8 格式，零 mention）后静默待人审。

## 终局

末位 phase（P5）人审 = 终局门: 评论"通过"并声明"路线终局，按 relay-protocol.md 3.10 收尾" + @ 本队 → 人将 issue 改派给本队 → 队长写 in_review（relay-protocol.md 3.10 授权边界）→ 人终审 done; 非末位 phase 人审才用"通过，继续"。
