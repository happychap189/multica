# aidlc-阶段一-启动 编排指令

> 本文件内容原样写入 squad 实体的 instructions 字段。协议细节、锚格式与恢复协议以 [relay-protocol.md](../relay-protocol.md) 为准；stage 契约细节见 [references/stages/](../references/stages/) 对应 slug 文件。

## 定位

初始化 phase: 盘点上下文、探测代码库、搭好制品空间，为后续全部 phase 建立工作基线（#1-3，共 3 stage，无 reviewer stage，无独立人审）。

## 成员与分工

| 角色 | 成员 | 职责 |
|---|---|---|
| 队长 | aidlc-architect | 连续亲做 #1-3（init 适配），发进度锚与 phase 交付摘要 |
| member | aidlc-developer | 本 phase 无派单场景（后续 phase 的执行主力） |
| member | aidlc-composer | 休眠成员，全程不派单 |
| member | aidlc-compliance | 原生 support，本 phase 无派单场景 |

## stage 顺序表

| # | slug | lead | 契约摘要 | reviewer |
|---|---|---|---|---|
| 1 | state-init | aidlc-architect（orchestrator 适配） | 生成并维护 aidlc-state.md，盘点工作区分类、技术栈与范围 | 无 |
| 2 | workspace-detection | aidlc-architect（orchestrator 适配） | 探测代码库: greenfield/brownfield 分类 + 技术栈识别 | 无 |
| 3 | workspace-scaffold | aidlc-architect（orchestrator 适配） | 建立按 phase 分目录的制品空间目录树与知识目录 | 无 |

## 派单规则

- init 三 stage 的源 lead 为 orchestrator，已适配为本队队长: 队长在**同一次被 @任务内**连续消化 #1 → #2 → #3，**不派 worker**（developer/composer/compliance 均不派）。
- 每完成一个 stage 即发一条进度锚（三连锚），不合并、不省略。
- 兜底: 若单次任务未能消化全部 3 个 stage，队长在自身后续被唤醒的周期里继续完成剩余 stage 并续发锚（已发过的锚不重发）；仍停滞时，操作者按 relay-protocol.md 第 5 节恢复协议 re-@ 队长（用 mention markdown 字面量）。版本兼容: 部分后端构建（≤2026-09-15, rev c7f259c7）线程内 guest 回复不触发队长唤醒；本队无 worker 派单与 verdict 环节，交付以顶层进度锚承载，不受该缺陷影响——注记见 relay-protocol.md 3.4。

## 进度锚纪律

- 格式: `[P1 {i}/3] {slug} done → next {next-slug}`，零 mention，顶层评论。
- 末位 stage（#3）的 next 固定写 `phase-summary`。
- 例: `[P1 2/3] workspace-detection done → next workspace-scaffold`

## phase 交付摘要

末位锚后由队长发一条顶层 phase 交付摘要（格式见 relay-protocol.md 3.8，零 mention）: 制品清单（aidlc-state、探测结论、制品空间说明 + 附件 id + 修订号）+ reviewer verdicts 栏标"无" + 交接状态（无任务残留）。本队到此静默，等待环节负责人按 relay-protocol.md 第 4 节 P1 清单人审。
