# profiles-relay-paths — 11 profile 入口路线与编排规则

> 11 支 profile 入口小队（@aidlc-classic / @aidlc-express / @aidlc-feature / @aidlc-enterprise / @aidlc-mvp / @aidlc-poc / @aidlc-bugfix / @aidlc-refactor / @aidlc-infra / @aidlc-security-patch / @aidlc-workshop）的路由与编排总则。协议、锚格式与恢复协议以 [relay-protocol.md](relay-protocol.md) 为准；stage 契约细节见 [references/stages/](references/stages/) 对应 slug 文件；11 支入口小队的实体 instructions 与本文件入口章节一一对应（见 squad-instructions/entry-*.md）。

## 1. 总则

### 1.1 入口命名与家族标记

11 支入口小队以 ASCII profile 名命名，与上游 scopes 逐名对应: aidlc-classic、aidlc-express、aidlc-feature、aidlc-enterprise、aidlc-mvp、aidlc-poc、aidlc-bugfix、aidlc-refactor、aidlc-infra、aidlc-security-patch、aidlc-workshop。全部入口小队 leader 为 aidlc-dispatcher，description 带 `aidlc-relay:v1` 家族标记（seed 幂等解析依赖，保持不变）。同一 persona 领多队有平台先例（architect 已领三支 phase 队）。

### 1.2 dispatcher 职责

aidlc-dispatcher 为纯编排队长，不产出业务制品（init 三 stage 除外）: 读时间线对齐现场、亲做 init 三 stage（#1-3，orchestrator 适配，阶段一队长先例）、按所在入口小队的路由表派单或宣告路线、发锚与摘要、只 @ 本队成员、遵守恢复协议。

### 1.3 两执行模型分界

- **轻入口（闭环）**——express / poc / bugfix / refactor / security-patch: 入口小队成员 = 路线 lead + reviewer 并集，一队闭环执行路线全部 stage；phase 边界由人按规范话术（1.5）评论 @ 入口小队续跑，不与 phase 队接力；phase 人数 ≤ 6（含队长）。
- **重入口（接力链）**——classic / mvp / feature / enterprise / infra / workshop: 入口小队 0 成员（dispatcher 独任）。@ 后 dispatcher 亲做启动段（路线宣告 + init 三 stage）并宣告路线，随后沿用既有 5 支 phase 队接力链（路线裁剪同 bugfix 先例）；P1 之后 dispatcher 静默，phase 边界照协议 3.9 原文两步（改派 + @ 下一队），终局由路线末位 phase 队按 3.10 收尾。
- 子集裁剪执行与 0 成员队唤醒为未实证形态，由 seed `--verify` 入口探针与重入口首跑覆盖。

### 1.4 对协议 3.9/3.10 的替换与泛化声明（编排规则 9）

- 轻入口运行中，phase 边界的"改派+@下一队"替换为"评论 @ 入口小队续跑"（协议 3.9 的人审清单与返工语义不变），且 5.4 恢复主路径的 re-@ 语义按 1.5 三态/豁免词执行——此为对 5.4 主路径的**轻入口 scoped 替换**（轻入口无 worker，5.1"首要怀疑漏 @队长"不适用）。
- 重入口运行完全沿用 3.9 原文。
- 终局 3.10 的"末位 phase（full-33 与 bugfix 均为 P5）"泛化为"路线末位 phase"——classic 与 mvp 止于 P4，末位小队=阶段四队；收尾语义不变（改派末位小队 → 队长 in_review → 人 done）。
- 本文件与小队指令/入口指令并存时，入口指令以本声明为界引用协议原文，协议其余条款（含第 6 节红线）原文适用。

### 1.5 规范话术与消歧（编排规则 5 全文；轻入口全流程唯一人机门）

- 通过 = 评论"通过，继续" + @ 入口小队；打回 = 评论"打回：<具体要求>" + @ 入口小队。
- dispatcher 消歧规则按三态处理 @ 入口小队的评论:
  1. **无进行中路线**: @ 入口评论 = 启动新路线，首条正文即任务描述，不受规范话术约束。
  2. **进行中且最近 phase 摘要待人审**: 不含规范话术关键词的评论一律按打回处理并回复澄清请求，不续跑。
  3. **进行中但不在待审窗口（mid-phase 停滞）**: 按恢复协议处理——回现场快照（最后锚位置与状态），续跑仍须规范话术。
- **恢复豁免词**: 评论含"恢复/续跑/核对"字样的 re-@ 在态②/③中均按恢复动作处理（先回快照而非打回）。

## 2. 11 条路由表

每张表逐 stage 行，**列序固定: 编号 / slug / lead / reviewer / 条件标注**（构建断言按此列序解析，列序不可变）。reviewer 单元格 = verdict persona 完整名（括号注记 class: advisory / adversarial; 无 reviewer 写"无"）; lead 于 #1-3 写"队长（aidlc-dispatcher 适配）"。条件标注: —（无条件）/ 条件（上游 CONDITIONAL 语义: 不适用时队长自跳——不发锚、分母按实际执行数、phase 摘要登记，见编排规则 6）。reviewer persona 归属与 5 队契约一致: advisory/adversarial 于 #4/#7/#11/#12/#16 由 aidlc-product-lead 出 verdict，于 #13/#17/#18/#20/#21/#22/#23 由 aidlc-architecture-reviewer 出 verdict。锚分母 n = 本 phase 本次运行 stage 数。

### aidlc-classic（18 stage，Standard，接力链 P1→P3→P4，人审 3 次，锚分母 3/9/6，止于 P4）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #12 | user-stories | aidlc-product | aidlc-product-lead（advisory） | 条件 |
| #13 | domain-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | 条件 |
| #14 | practices-discovery | aidlc-pipeline-deploy | 无 | 条件 |
| #15 | reverse-engineering | aidlc-developer | 无 | 条件 |
| #16 | refined-mockups | aidlc-design | aidlc-product-lead（advisory） | 条件 |
| #17 | units-generation | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #18 | contract-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | 条件 |
| #19 | delivery-planning | aidlc-delivery | 无 | — |
| #20 | functional-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | 条件 |
| #21 | nfr-requirements | aidlc-architect | aidlc-architecture-reviewer（advisory） | 条件 |
| #22 | nfr-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | 条件 |
| #23 | infrastructure-design | aidlc-aws-platform | aidlc-architecture-reviewer（advisory） | 条件 |
| #24 | code-generation | aidlc-developer | 无 | — |
| #25 | build-and-test | aidlc-quality | 无 | — |

P3 子集 = {11-19}（9）: #11-#19 全表执行，reviewer 语义与默认一致。P4 子集 = {20-25}（6）: **#20-#23 reviewer 降级为 advisory**（classic 按上游 review_cap=advisory，覆盖默认 adversarial），#24/#25 为快速 stage。

逐 phase kickoff 模板要素（防呆注记适用全部重入口; kickoff 声明的子集优先于该队默认顺序表）:
- 防呆①: 止于 P4 的路线，P4 人审通过评论即终局指令，覆盖该队指令"改派+@下一队"默认段（classic / mvp 适用）。
- 防呆②: kickoff 模板中的队名为纯文本照抄素材，粘贴后须经评论提及选择器转为真实 mention 方为有效触发（协议 3.2）。
- P3 → 阶段三队（aidlc-阶段三-孵化）: 子集 11 requirements-analysis, 12 user-stories, 13 domain-design, 14 practices-discovery, 15 reverse-engineering, 16 refined-mockups, 17 units-generation, 18 contract-design, 19 delivery-planning；锚分母 n=9；末位 delivery-planning；reviewer 语义: 与默认一致（#11/#12/#13/#16/#17/#18 advisory）。
- P4 → 阶段四队（aidlc-阶段四-构建）: 子集 20 functional-design, 21 nfr-requirements, 22 nfr-design, 23 infrastructure-design, 24 code-generation, 25 build-and-test；锚分母 n=6；末位 build-and-test；reviewer 语义: #20-#23 降级为 advisory（classic 按上游 review_cap=advisory，覆盖默认 adversarial），kickoff 评论须注明。
- 末位 phase（P4）人审通过评论模板（classic）: "通过，继续。路线终局，按 relay-protocol.md 3.10 收尾至 in_review——将本 issue 改派给 阶段四队（aidlc-阶段四-构建），其队长执行 in_review，人终审 done。"

### aidlc-express（10 stage，Minimal，闭环 P1/P3/P4/P5，人审 4 次，锚分母 3/2/2/3）

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

轻 5 入口成员（lead+reviewer 并集）: product、developer、quality、pipeline-deploy、operations（5 成员，含队长 6）。上游 review_cap=none，全路线无 reviewer（#11 reviewer class 标"无"）。#15 与部署尾（#28/#29/#30）为条件 stage: brownfield 且存在可部署目标时执行；不适用时自跳并登记（编排规则 6）。终局: 末位 phase（P5）人审通过后按 1.5 规范话术 @ 入口小队，dispatcher 改派本队收尾 in_review。

### aidlc-feature（33 stage，Standard，接力链 P2→P3→P4→P5，人审 5 次，锚分母 3/7/9/7/7）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #4 | intent-capture | aidlc-product | aidlc-product-lead（advisory） | — |
| #5 | market-research | aidlc-product | 无 | — |
| #6 | feasibility | aidlc-architect | 无 | — |
| #7 | rough-mockups | aidlc-design | aidlc-product-lead（advisory） | — |
| #8 | scope-definition | aidlc-product | 无 | — |
| #9 | team-formation | aidlc-delivery | 无 | — |
| #10 | approval-handoff | aidlc-delivery | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #12 | user-stories | aidlc-product | aidlc-product-lead（advisory） | — |
| #13 | domain-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #14 | practices-discovery | aidlc-pipeline-deploy | 无 | — |
| #15 | reverse-engineering | aidlc-developer | 无 | — |
| #16 | refined-mockups | aidlc-design | aidlc-product-lead（advisory） | — |
| #17 | units-generation | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #18 | contract-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #19 | delivery-planning | aidlc-delivery | 无 | — |
| #20 | functional-design | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #21 | nfr-requirements | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #22 | nfr-design | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #23 | infrastructure-design | aidlc-aws-platform | aidlc-architecture-reviewer（adversarial） | — |
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

逐 phase kickoff 模板要素:
- P2 → 阶段二队（aidlc-阶段二-构思）: 子集 4 intent-capture, 5 market-research, 6 feasibility, 7 rough-mockups, 8 scope-definition, 9 team-formation, 10 approval-handoff；锚分母 n=7；末位 approval-handoff；reviewer 语义: 与默认一致（#4/#7 advisory）。
- P3 → 阶段三队（aidlc-阶段三-孵化）: 子集 11 requirements-analysis, 12 user-stories, 13 domain-design, 14 practices-discovery, 15 reverse-engineering, 16 refined-mockups, 17 units-generation, 18 contract-design, 19 delivery-planning；锚分母 n=9；末位 delivery-planning；reviewer 语义: 与默认一致（#11/#12/#13/#16/#17/#18 advisory）。
- P4 → 阶段四队（aidlc-阶段四-构建）: 子集 20 functional-design, 21 nfr-requirements, 22 nfr-design, 23 infrastructure-design, 24 code-generation, 25 build-and-test, 26 ci-pipeline；锚分母 n=7；末位 ci-pipeline；reviewer 语义: #20-#23 保持 adversarial；#24-#26 为快速 stage。
- P5 → 阶段五队（aidlc-阶段五-运营）: 子集 27 environment-provisioning, 28 deployment-pipeline, 29 deployment-execution, 30 observability-setup, 31 performance-validation, 32 feedback-optimization, 33 incident-response；锚分母 n=7；末位 incident-response；reviewer 语义: 无 reviewer stage；终局由本队按 3.10 收尾（末位 phase）。

### aidlc-enterprise（33 stage，Comprehensive，接力链 P2→P3→P4→P5 + strict 语义，人审 5 次，锚分母 3/7/9/7/7）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #4 | intent-capture | aidlc-product | aidlc-product-lead（advisory） | — |
| #5 | market-research | aidlc-product | 无 | — |
| #6 | feasibility | aidlc-architect | 无 | — |
| #7 | rough-mockups | aidlc-design | aidlc-product-lead（advisory） | — |
| #8 | scope-definition | aidlc-product | 无 | — |
| #9 | team-formation | aidlc-delivery | 无 | — |
| #10 | approval-handoff | aidlc-delivery | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #12 | user-stories | aidlc-product | aidlc-product-lead（advisory） | — |
| #13 | domain-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #14 | practices-discovery | aidlc-pipeline-deploy | 无 | — |
| #15 | reverse-engineering | aidlc-developer | 无 | — |
| #16 | refined-mockups | aidlc-design | aidlc-product-lead（advisory） | — |
| #17 | units-generation | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #18 | contract-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #19 | delivery-planning | aidlc-delivery | 无 | — |
| #20 | functional-design | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #21 | nfr-requirements | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #22 | nfr-design | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #23 | infrastructure-design | aidlc-aws-platform | aidlc-architecture-reviewer（adversarial） | — |
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

逐 phase kickoff 模板要素:
- P2 → 阶段二队（aidlc-阶段二-构思）: 子集 4 intent-capture, 5 market-research, 6 feasibility, 7 rough-mockups, 8 scope-definition, 9 team-formation, 10 approval-handoff；锚分母 n=7；末位 approval-handoff；reviewer 语义: 与默认一致（#4/#7 advisory）。
- P3 → 阶段三队（aidlc-阶段三-孵化）: 子集 11 requirements-analysis, 12 user-stories, 13 domain-design, 14 practices-discovery, 15 reverse-engineering, 16 refined-mockups, 17 units-generation, 18 contract-design, 19 delivery-planning；锚分母 n=9；末位 delivery-planning；reviewer 语义: 与默认一致（#11/#12/#13/#16/#17/#18 advisory）。
- P4 → 阶段四队（aidlc-阶段四-构建）: 子集 20 functional-design, 21 nfr-requirements, 22 nfr-design, 23 infrastructure-design, 24 code-generation, 25 build-and-test, 26 ci-pipeline；锚分母 n=7；末位 ci-pipeline；reviewer 语义: #20-#23 保持 adversarial；strict: 每阶段摘要附"变更与依据"一行（编排规则 8，kickoff 评论须注明）。
- P5 → 阶段五队（aidlc-阶段五-运营）: 子集 27 environment-provisioning, 28 deployment-pipeline, 29 deployment-execution, 30 observability-setup, 31 performance-validation, 32 feedback-optimization, 33 incident-response；锚分母 n=7；末位 incident-response；reviewer 语义: 无 reviewer stage；strict 同 P4 注记；终局由本队按 3.10 收尾（末位 phase）。

### aidlc-mvp（23 stage，Standard，接力链 P2→P3→P4，人审 4 次，锚分母 3/4/9/7，止于 P4）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #4 | intent-capture | aidlc-product | aidlc-product-lead（advisory） | — |
| #6 | feasibility | aidlc-architect | 无 | — |
| #7 | rough-mockups | aidlc-design | aidlc-product-lead（advisory） | — |
| #8 | scope-definition | aidlc-product | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #12 | user-stories | aidlc-product | aidlc-product-lead（advisory） | — |
| #13 | domain-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #14 | practices-discovery | aidlc-pipeline-deploy | 无 | — |
| #15 | reverse-engineering | aidlc-developer | 无 | — |
| #16 | refined-mockups | aidlc-design | aidlc-product-lead（advisory） | — |
| #17 | units-generation | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #18 | contract-design | aidlc-architect | aidlc-architecture-reviewer（advisory） | — |
| #19 | delivery-planning | aidlc-delivery | 无 | — |
| #20 | functional-design | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #21 | nfr-requirements | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #22 | nfr-design | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #23 | infrastructure-design | aidlc-aws-platform | aidlc-architecture-reviewer（adversarial） | — |
| #24 | code-generation | aidlc-developer | 无 | — |
| #25 | build-and-test | aidlc-quality | 无 | — |
| #26 | ci-pipeline | aidlc-pipeline-deploy | 无 | — |

逐 phase kickoff 模板要素:
- P2 → 阶段二队（aidlc-阶段二-构思）: 子集 4 intent-capture, 6 feasibility, 7 rough-mockups, 8 scope-definition；锚分母 n=4；末位 scope-definition；reviewer 语义: 与默认一致（#4/#7 advisory）；#5/#9/#10 不在本路线（kickoff 子集优先于该队默认顺序表）。
- P3 → 阶段三队（aidlc-阶段三-孵化）: 子集 11 requirements-analysis, 12 user-stories, 13 domain-design, 14 practices-discovery, 15 reverse-engineering, 16 refined-mockups, 17 units-generation, 18 contract-design, 19 delivery-planning；锚分母 n=9；末位 delivery-planning；reviewer 语义: 与默认一致（#11/#12/#13/#16/#17/#18 advisory）。
- P4 → 阶段四队（aidlc-阶段四-构建）: 子集 20 functional-design, 21 nfr-requirements, 22 nfr-design, 23 infrastructure-design, 24 code-generation, 25 build-and-test, 26 ci-pipeline；锚分母 n=7；末位 ci-pipeline；reviewer 语义: #20-#23 保持 adversarial；#24-#26 为快速 stage。
- 末位 phase（P4）人审通过评论模板（mvp）: "通过，继续。路线终局，按 relay-protocol.md 3.10 收尾至 in_review——将本 issue 改派给 阶段四队（aidlc-阶段四-构建），其队长执行 in_review，人终审 done。"

### aidlc-poc（8 stage，Minimal，闭环 P1/P2/P3/P4，人审 4 次，锚分母 3/1/2/2）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #4 | intent-capture | aidlc-product | aidlc-product-lead（advisory） | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #15 | reverse-engineering | aidlc-developer | 无 | — |
| #24 | code-generation | aidlc-developer | 无 | — |
| #25 | build-and-test | aidlc-quality | 无 | — |

轻 4 入口成员（lead+reviewer 并集）: product(#4/#11)、developer(#15/#24)、quality(#25)、product-lead(#4/#11 advisory)（4 成员，含队长 5）。全路线无条件 stage; reviewer 语义与默认一致: #4/#11 advisory（verdict 由 product-lead 出）。终局: 末位 phase（P4）人审通过后按 1.5 规范话术 @ 入口小队，dispatcher 改派本队收尾 in_review（1.4 泛化）。

### aidlc-bugfix（9 stage，Minimal，闭环 P1/P3/P4/P5，人审 4 次，锚分母 3/2/2/2）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #15 | reverse-engineering | aidlc-developer | 无 | — |
| #24 | code-generation | aidlc-developer | 无 | — |
| #25 | build-and-test | aidlc-quality | 无 | — |
| #28 | deployment-pipeline | aidlc-pipeline-deploy | 无 | — |
| #29 | deployment-execution | aidlc-pipeline-deploy | 无 | — |

轻 5 入口成员（lead+reviewer 并集）: product(#11)、developer(#15/#24)、quality(#25)、pipeline-deploy(#28/#29)、product-lead(#11 advisory)（5 成员，含队长 6）。全路线无条件 stage。与既有 bugfix-relay-path.md 等价（见 §4）。终局: 末位 phase（P5）人审通过后按 1.5 规范话术 @ 入口小队，dispatcher 改派本队收尾 in_review。

### aidlc-refactor（10 stage，Minimal，闭环 P1/P3/P4/P5，人审 4 次，锚分母 3/2/3/2）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #15 | reverse-engineering | aidlc-developer | 无 | — |
| #20 | functional-design | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #24 | code-generation | aidlc-developer | 无 | — |
| #25 | build-and-test | aidlc-quality | 无 | — |
| #28 | deployment-pipeline | aidlc-pipeline-deploy | 无 | — |
| #29 | deployment-execution | aidlc-pipeline-deploy | 无 | — |

轻 7 入口成员（lead+reviewer 并集）: product(#11)、architect(#20)、developer(#15/#24)、quality(#25)、pipeline-deploy(#28/#29)、product-lead(#11 advisory)、architecture-reviewer(#20 adversarial)（7 成员，含队长 8）。全路线无条件 stage。终局: 末位 phase（P5）人审通过后按 1.5 规范话术 @ 入口小队，dispatcher 改派本队收尾 in_review。

### aidlc-infra（13 stage，Standard，接力链 P3→P4→P5，人审 4 次，锚分母 3/2/4/4）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #14 | practices-discovery | aidlc-pipeline-deploy | 无 | — |
| #21 | nfr-requirements | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #22 | nfr-design | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #23 | infrastructure-design | aidlc-aws-platform | aidlc-architecture-reviewer（adversarial） | — |
| #26 | ci-pipeline | aidlc-pipeline-deploy | 无 | — |
| #27 | environment-provisioning | aidlc-aws-platform | 无 | — |
| #28 | deployment-pipeline | aidlc-pipeline-deploy | 无 | — |
| #29 | deployment-execution | aidlc-pipeline-deploy | 无 | — |
| #30 | observability-setup | aidlc-operations | 无 | — |

逐 phase kickoff 模板要素:
- P3 → 阶段三队（aidlc-阶段三-孵化）: 子集 11 requirements-analysis, 14 practices-discovery；锚分母 n=2；末位 practices-discovery；reviewer 语义: 与默认一致（#11 advisory）。
- P4 → 阶段四队（aidlc-阶段四-构建）: 子集 21 nfr-requirements, 22 nfr-design, 23 infrastructure-design, 26 ci-pipeline；锚分母 n=4；末位 ci-pipeline；reviewer 语义: #21-#23 保持 adversarial（对齐 full-33）。
- P5 → 阶段五队（aidlc-阶段五-运营）: 子集 27 environment-provisioning, 28 deployment-pipeline, 29 deployment-execution, 30 observability-setup；锚分母 n=4；末位 observability-setup；reviewer 语义: 无 reviewer stage；终局由本队按 3.10 收尾（末位 phase）。

### aidlc-security-patch（10 stage，Minimal，闭环 P1/P3/P4/P5，人审 4 次，锚分母 3/2/3/2）

| # | slug | lead | reviewer | 条件标注 |
|---|---|---|---|---|
| #1 | state-init | 队长（aidlc-dispatcher 适配） | 无 | — |
| #2 | workspace-detection | 队长（aidlc-dispatcher 适配） | 无 | — |
| #3 | workspace-scaffold | 队长（aidlc-dispatcher 适配） | 无 | — |
| #11 | requirements-analysis | aidlc-product | aidlc-product-lead（advisory） | — |
| #15 | reverse-engineering | aidlc-developer | 无 | — |
| #21 | nfr-requirements | aidlc-architect | aidlc-architecture-reviewer（adversarial） | — |
| #24 | code-generation | aidlc-developer | 无 | — |
| #25 | build-and-test | aidlc-quality | 无 | — |
| #28 | deployment-pipeline | aidlc-pipeline-deploy | 无 | — |
| #29 | deployment-execution | aidlc-pipeline-deploy | 无 | — |

轻 7 入口成员（lead+reviewer 并集）: product(#11)、architect(#21)、developer(#15/#24)、quality(#25)、pipeline-deploy(#28/#29)、product-lead(#11 advisory)、architecture-reviewer(#21 adversarial)（7 成员，含队长 8）。全路线无条件 stage。终局: 末位 phase（P5）人审通过后按 1.5 规范话术 @ 入口小队，dispatcher 改派本队收尾 in_review。

### aidlc-workshop（26 stage，Standard（测试 Minimal），接力链 P3→P4→P5，人审 4 次，锚分母 3/9/7/7）

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

逐 phase kickoff 模板要素:
- P3 → 阶段三队（aidlc-阶段三-孵化）: 子集 11 requirements-analysis, 12 user-stories, 13 domain-design, 14 practices-discovery, 15 reverse-engineering, 16 refined-mockups, 17 units-generation, 18 contract-design, 19 delivery-planning；锚分母 n=9；末位 delivery-planning；reviewer 语义: 与默认一致（#11/#12/#13/#16/#17/#18 advisory）。
- P4 → 阶段四队（aidlc-阶段四-构建）: 子集 20 functional-design, 21 nfr-requirements, 22 nfr-design, 23 infrastructure-design, 24 code-generation, 25 build-and-test, 26 ci-pipeline；锚分母 n=7；末位 ci-pipeline；reviewer 语义: #20-#23 降级为 advisory（workshop 按上游 review_cap=advisory，覆盖默认 adversarial），kickoff 评论须注明。
- P5 → 阶段五队（aidlc-阶段五-运营）: 子集 27 environment-provisioning, 28 deployment-pipeline, 29 deployment-execution, 30 observability-setup, 31 performance-validation, 32 feedback-optimization, 33 incident-response；锚分母 n=7；末位 incident-response；reviewer 语义: 无 reviewer stage；终局由本队按 3.10 收尾（末位 phase）。

## 3. 编排规则

1. **触发与启动**: issue 建 todo 且 assignee=人 → 人评论 @ 入口小队 + 任务描述 → dispatcher 醒后读时间线对齐现场，发**路线宣告评论**（零 mention: 路线名、stage 数、人审次数、phase 序列），随后同任务内连续消化 init 三 stage（三连锚 `[P1 i/3]`，P1 队长先例）→ 发 P1 phase 摘要后静默，等待 P1 人审。
2. **P1 人审与续跑（两模型分叉点）**:
   - 轻入口: 通过 = 评论"通过，继续" + @ 入口小队 → dispatcher 按路由表续跑下一 phase（队内派单: lead≠队长用 briefing roster 字面量 @ 成员；worker 线程内交付 + 显式 @ 队长）；打回 = 评论"打回：<具体要求>" + @ 入口小队（受影响 stage 返工，3.9 返工语义）。
   - 重入口: dispatcher 的路线宣告评论内含**逐 phase 照抄 kickoff 模板**（每 phase 一段: 改派目标环节负责人提示 + @ 对应 phase 队的评论文本，含该队本次 stage 子集与 reviewer 语义注记，模板要素见 §2 各重入口表后）。P1 人审通过后人按模板执行"改派 + @ 下一队"（3.9 原文两步）；后续各 phase 边界同法，直至末位 phase 人审通过后按 3.10 收尾。dispatcher 与入口小队 P1 之后静默。
3. **锚纪律**: `[P{phase} {i}/{n}] {slug} done → next {next-slug}` 顶层零 mention；n = 本 phase 本次运行 stage 数（重路线各 phase 队按宣告的子集计数，同 bugfix 先例）；返工锚带修订标记。
4. **phase 摘要与等待**: 每 phase 末位锚后队长（轻 = dispatcher，重 = 各 phase 队长）发 phase 交付摘要（3.8 格式，零 mention）后静默待人审。
5. **规范话术与消歧**: 全文见 1.5（轻入口全流程唯一人机门）。
6. **条件 stage 裁量**: 路由表标注"条件"的 stage 不适用时队长自跳: 不发锚、分母按实际执行数，且在该 phase 摘要"制品清单"后加自跳登记行（slug + 一句理由）。
7. **红线继承**: relay-protocol.md 第 6 节全部条款原样适用。
8. **enterprise strict 补充语义**: 每 stage 摘要附"变更与依据"一行; 已批准 stage 的输入发生变化时必须打回受影响 stage 重审（对应上游 guard=strict），kickoff 模板向各队注明。
9. **对协议 3.9/3.10 的替换与泛化声明**: 全文见 1.4（编排规则 9）。

## 4. 与 bugfix-relay-path.md 的关系

bugfix-relay-path.md 保留为 bugfix 入口的判据详解（逐 stage 判据与验收口径），不并入本文件; 入口体系中的 aidlc-bugfix 路由表与其等价（stage 集、phase 分组、锚分母一致）。两者并存: 深读判据用 bugfix-relay-path.md，路由与编排以本文件与 aidlc-bugfix 入口指令为准。

## 5. 上游路由失效注记

"上游路由以上游 core/scopes 为准"自本文件起失效: 11 条路由表为本仓固化快照（对齐 refs/aidlc-workflows-main/core/scopes @ 82ece16）。上游 scope 体系演进时，以本注记为同步线索重核 11 表; 在官方镜像场景中一律以本文件路由为准。
