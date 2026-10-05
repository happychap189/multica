# 73 — aidlc relay profile 入口（快捷启动指南）

> 读者：已随导出包完成导入的团队成员，读者假设与 72 号使用教程相同：会建 issue、写评论、用 @ 选择器、改派 issue 负责人。本文不展开协议机制——机制细节全部以纯文本路径指路包内文件。
> 本文随导出包分发（zip 内路径 docs/73-aidlc-relay-profiles.md），在仓库内位于 docs/my-best-practice/73-aidlc-relay-profiles.md。文中所有引用均为纯文本路径，仓库内与解包 zip 两种上下文都可按路径找到文件。

## 73.1 这是什么

**入口 = 快捷触发。** 上游 AI-DLC 有 11 个 workflow profile（classic / express / feature / enterprise / mvp / poc / bugfix / refactor / infra / security-patch / workshop），每个 profile 在 multica 里对应一支**入口小队**：评论 @ 入口小队 + 一句任务描述，即按该 profile 的静态路线推进。入口小队的队长都是 aidlc-dispatcher——它按该 profile 的路由表编排整条路线。这个触发形态对应上游"Start with <profile>"：一条指令选定路线并开工。

**两种执行模型（一句话分界）**：

- **轻 5 入口（express / poc / bugfix / refactor / security-patch）——闭环**：路线 stage 全部由入口小队内部跑完（dispatcher 领队派单，成员干活的口径同 72 号的队长/worker/reviewer）。每个 phase 交付摘要后你只发一条评论续跑：**"通过，继续" + @ 入口小队**；打回用**"打回：<具体要求>" + @ 入口小队**；终局把 issue 改派给入口小队，dispatcher 收尾。全程不需要跨队改派。
- **重 6 入口（classic / mvp / feature / enterprise / infra / workshop）——接力链**：dispatcher 只做启动段——@ 后亲做 init 三 stage 并发一条**路线宣告评论**（路线名、stage 数、人审次数、phase 序列，内含**逐 phase 照抄 kickoff 模板**），随后 dispatcher 与入口小队静默；你按宣告内模板"改派 + @ 对应 phase 队"，沿用 5 支 phase 队接力（动作同 72 号全链），终局由路线末位 phase 队收尾。

分界线一句话：轻入口路线不超过 10 个 stage，一支队闭环跑完；重入口 13 个 stage 以上，dispatcher 启动后交 5 支 phase 队接力。

**你打交道的对象**：11 支入口小队的队长都是同一个智能体 aidlc-dispatcher（纯编排，不产出业务制品——init 除外）；轻 5 入口小队另有队内成员（路线各 stage 的 lead 与 reviewer 并集），重 6 入口小队 0 成员（dispatcher 独任，接力段交给 5 支 phase 队）。你全程只 @ 小队、从不直接 @ 智能体，口径与 72.2 一致。

**与 72 号 5 队全链的关系与选择**：72 号是"5 支 phase 队全链"的照走教程（手动 @ 一队开场、每次人审后你自己 @ 下一队）；73 号（本文）是按 profile 选入口的快捷启动指南。重入口的接力段与 72 号全链动作完全同型（锚、人审、两步交接、终局两段式全部照旧）；轻入口是 72 号没有的新形态（无跨队改派、评论续跑）。怎么选：知道要跑哪个 profile，从 73.2 总表选入口直走；想手动掌控每次交接或首次学习完整接力，走 72 号。

**导入前置与两条红线**：与 72 号一致——issue 全程保持 todo（误入 backlog 会静默断链，见 72.5）；@ 一律用提及选择器插入真实提及标记（纯文本队名不触发）。协议机制见包内 aidlc-relay-pack/relay-protocol.md；11 条路线的逐 stage 明细与条件标注见包内 aidlc-relay-pack/profiles-relay-paths.md（以上游 core/scopes 为准的失效注记也在该文件）。

## 73.2 Start with 总表（11 入口）

启动评论模板 11 个入口同型，先读这一条再入表：建 issue（todo）→ 负责人指派给自己 → 评论框内用选择器插入入口小队提及标记，正文写任务描述。表中"启动模板"列为紧凑形式，完整骨架见 73.3.1。

| 入口 | 适用一句 | 上游 stage 数 | 深度 | relay 路线 | 人审次数 | 启动模板 |
|---|---|---:|---|---|---|---|
| classic / @aidlc-classic | V1 式全仪式路线（Inception→Construction），上游隐含默认 | 18 | Standard | 接力链 P1（入口）→P3→P4（终局） | 3（P1/P3/P4） | {插入 aidlc-classic 提及}+任务描述 |
| express / @aidlc-express | 需求到部署的最轻通道：无设计 pass、无 reviewer | 10 | Minimal | 闭环 P1→P3→P4→P5（入口小队跑完） | 4（P1/P3/P4/P5） | {插入 aidlc-express 提及}+任务描述 |
| feature / @aidlc-feature | 新功能全生命周期，务实深度 | 33 | Standard | 接力链 P1（入口）→P2→P3→P4→P5（终局） | 5（P1-P5） | {插入 aidlc-feature 提及}+任务描述 |
| enterprise / @aidlc-enterprise | 强监管企业特性，全量审计轨迹 | 33 | Comprehensive | 接力链 P1→P2→P3→P4→P5（终局）+strict 语义 | 5（P1-P5） | {插入 aidlc-enterprise 提及}+任务描述 |
| mvp / @aidlc-mvp | 核心功能先跑起来，运营段后置 | 23 | Standard | 接力链 P1（入口）→P2→P3→P4（终局） | 4（P1/P2/P3/P4） | {插入 aidlc-mvp 提及}+任务描述 |
| poc / @aidlc-poc | 快速验证可行性（原型/spike） | 8 | Minimal | 闭环 P1→P2→P3→P4（入口小队跑完） | 4（P1/P2/P3/P4） | {插入 aidlc-poc 提及}+任务描述 |
| bugfix / @aidlc-bugfix | 修一个明确的缺陷（与 72.4.4 同路线的入口形态） | 9 | Minimal | 闭环 P1→P3→P4→P5（入口小队跑完） | 4（P1/P3/P4/P5） | {插入 aidlc-bugfix 提及}+任务描述 |
| refactor / @aidlc-refactor | 清理/简化既有代码 | 10 | Minimal | 闭环 P1→P3→P4→P5（入口小队跑完） | 4（P1/P3/P4/P5） | {插入 aidlc-refactor 提及}+任务描述 |
| infra / @aidlc-infra | 基础设施变更（网络/权限/部署底座） | 13 | Standard | 接力链 P1（入口）→P3→P4→P5（终局） | 4（P1/P3/P4/P5） | {插入 aidlc-infra 提及}+任务描述 |
| security-patch / @aidlc-security-patch | 安全漏洞与 CVE 响应 | 10 | Minimal | 闭环 P1→P3→P4→P5（入口小队跑完） | 4（P1/P3/P4/P5） | {插入 aidlc-security-patch 提及}+任务描述 |
| workshop / @aidlc-workshop | 带门禁的引导式小组活动（培训/实验室） | 26 | Standard（测试 Minimal） | 接力链 P1（入口）→P3→P4→P5（终局） | 4（P1/P3/P4/P5） | {插入 aidlc-workshop 提及}+任务描述 |

**人审语义保真说明**：表中"人审次数"为 relay 语义——**phase 级人审**（每个 phase 结束审一次）；上游为每 stage 独立 approval gate（classic 明文 one human approval per stage）。relay 把逐 stage 门禁语义吸收进 phase 人审与交付摘要承接，推进节拍与上游不同、语义等价承接；上游仪式开关中无独立对应物的"未映射项"见 73.4.5。逐 stage 路由、锚分母与条件标注以包内 aidlc-relay-pack/profiles-relay-paths.md 路由表为准。

## 73.3 全程走法

### 73.3.1 通用动作与启动模板（11 个入口同型）

两型入口的启动动作完全相同（三步 @ 动作同 72.3.1：评论框输入触发选择器 → 输入队名末词过滤 → 点击插入带高亮的提及标记）：

1. 建 issue（todo，禁 backlog），标题写清"是什么"，负责人指派给自己。
2. 描述写任务：简单任务一句话说清要什么、形态（全新/改造）、输入与验收形态；复杂任务按 72.3.1 的五段骨架（背景/目标/范围/非目标/输入与输出）。
3. 评论 @ 入口小队 + 任务描述，正文可照抄：

```text
{此处为已插入的入口小队提及标记} <任务描述：一句话说清要什么、形态（全新/改造）、输入与验收形态>
```

发出后时间线很快出现 dispatcher 的路线宣告与 init 锚（下一节）。

### 73.3.2 express 闭环全程（轻入口代表；其余轻入口同型）

时点对齐（你是 issue 负责人，即环节负责人）：

| 时点 | 你做什么 | 入口小队做什么 |
|---|---|---|
| 启动 | 评论 @ aidlc-express + 任务描述 | dispatcher 发路线宣告（零提及），随后亲做 init 三连锚 |
| phase 进行中 | 等待、随时抽查时间线 | dispatcher 派单给队内成员、收交付、发锚 |
| phase 末 | 发"通过，继续"+@ aidlc-express | 发 phase 交付摘要后静默 |
| 终局 | 改派 issue 给 aidlc-express → 终审置 done | dispatcher 收尾 in_review |

**第 1 步 启动**：按 73.3.1 模板评论 @ aidlc-express + 任务描述。

**第 2 步 路线宣告与 init 三连锚**：dispatcher 醒后发一条**路线宣告**（零提及）——路线名（aidlc-express）、stage 数（10）、人审次数（4）、phase 序列（P1→P3→P4→P5）。随后在启动评论的触发任务内连续消化 init 三 stage，发三连锚（锚格式以包内 aidlc-relay-pack/relay-protocol.md 为准）：

```text
[P1 1/3] state-init done → next workspace-detection
[P1 2/3] workspace-detection done → next workspace-scaffold
[P1 3/3] workspace-scaffold done → next phase-summary
```

**第 3 步 P1 摘要与首次人审**：看到 P1 交付摘要（零提及；express 无 reviewer，verdicts 栏标"无"）后，你发通过评论（可照抄——通过话术与提及必须在同一条评论里）：

```text
通过，继续
{此处为已插入的 aidlc-express 提及标记}
```

**第 4 步 P3/P4/P5 续跑**：每次"通过，继续"+@ 之后 dispatcher 按路线续跑下一 phase——P3 两锚（#11 requirements-analysis → #15 reverse-engineering）→ P3 摘要 → 人审 → P4 两锚（#24 code-generation → #25 build-and-test）→ 摘要 → 人审 → P5 三锚（#28 deployment-pipeline → #29 deployment-execution → #30 observability-setup）→ 摘要 → 人审。锚形如：

```text
[P3 1/2] requirements-analysis done → next reverse-engineering
[P3 2/2] reverse-engineering done → next phase-summary
```

**第 5 步 终局两段式**：P5 摘要后发最后一次人审评论——终局门话术与续跑不同: 评论"通过"并声明"路线终局，按 relay-protocol.md 3.10 收尾"+@ aidlc-express（非末位 phase 才用"通过，继续"），然后两段收尾：

1. **你把 issue 改派给 aidlc-express**（负责人字段直接选小队——全程唯一一次 assignee 是小队）。这个改派就是授权：它允许入口小队的 dispatcher 收尾这个 issue。
2. **dispatcher 把 issue 收尾到 in_review** 并发收尾评论。
3. **你终审置 done**。置 done 前重点确认部署与验证证据真实存在（部署日志/冒烟测试/健康检查）。

语义与 72.3.5 完全同型，只是收尾者从 P5 队长换成入口小队的 dispatcher；收尾授权边界以包内 aidlc-relay-pack/relay-protocol.md 为准。

**express 全程时间线示意（锚格式以包内 aidlc-relay-pack/relay-protocol.md 为准）**：

```text
（你的启动评论）
[路线宣告] aidlc-express · 10 stage · 4 人审 · P1→P3→P4→P5（零提及）
[P1 1/3] state-init done → next workspace-detection
[P1 2/3] workspace-detection done → next workspace-scaffold
[P1 3/3] workspace-scaffold done → next phase-summary
[P1 交付摘要]（无 reviewer，verdicts 栏标"无"）
（你：通过，继续 + @ aidlc-express）
[P3 1/2] requirements-analysis done → next reverse-engineering
[P3 2/2] reverse-engineering done → next phase-summary
[P3 交付摘要]
（你：通过，继续 + @ aidlc-express）
[P4 1/2] code-generation done → next build-and-test
[P4 2/2] build-and-test done → next phase-summary
[P4 交付摘要]
（你：通过，继续 + @ aidlc-express）
[P5 1/3] deployment-pipeline done → next deployment-execution
[P5 2/3] deployment-execution done → next observability-setup
[P5 3/3] observability-setup done → next phase-summary
[P5 交付摘要]
（你：通过 + 路线终局，按 relay-protocol.md 3.10 收尾 + @ aidlc-express）
（你：改派 issue 给 aidlc-express）
[接力完成，提交人审] in_review
（你：置 done）
```

示意说明两点：①若 #15 逆向工程或部署尾三 stage 依法自跳，相应锚行不出现、相应摘要带自跳登记行（锚数通式 = 名义分母 − 已登记自跳数）；②"路线宣告"评论的栏目是 dispatcher 实际输出格式，示意仅列信息要素，以包内 aidlc-relay-pack/profiles-relay-paths.md 为准。

**打回分支**：任何 phase 摘要后改主意——评论"打回：<具体要求>"+@ aidlc-express，受影响 stage 按契约返工（制品修订号递增、重锚带修订标记），完成后重发交付摘要，你再审一轮。打回粒度由你掌握（同 72.3.3）；返工轮次上限等数值以包内协议为准。

**待审窗口纪律（轻入口唯一人机门）**：交付摘要之后时间线安静是正常的。这段窗口内：含"通过，继续"的评论 = 通过并续跑；含"打回："的评论 = 打回返工；**两者都不含的评论一律按打回处理**，dispatcher 会回复澄清请求、不续跑。只想查进度不动路线：发一条含"核对"字样（恢复豁免词：恢复/续跑/核对任一）+@ aidlc-express 的评论，得到现场快照回复（最后锚位置与状态），再按快照决定续跑或打回。

**条件 stage 自跳说明（express 特有）**：express 的逆向工程（#15）与部署尾（#28/#29/#30）是条件 stage——题材没有可逆向的既有代码、或没有可部署形态时，dispatcher 依法自跳：不发锚、锚分母按实际执行 stage 数、并在该 phase 摘要的制品清单后登记自跳行（stage 名 + 一句理由）。锚数通式 = 名义分母 − 已登记自跳数；看到锚数少于宣告 stage 数，先查摘要的自跳登记行再判断异常。

### 73.3.3 classic 接力短例（重入口代表；其余重入口同型）

1. **启动**：按 73.3.1 模板评论 @ aidlc-classic + 任务描述。
2. **路线宣告**：dispatcher 发路线宣告评论——路线名、18 stage、3 人审、phase 序列 P1→P3→P4，并内含**逐 phase 照抄 kickoff 模板**（每 phase 一段：改派目标环节负责人提示 + @ 对应 phase 队的评论文本，含该队本次 stage 子集与锚分母、reviewer 语义注记）。宣告发出后 dispatcher 与入口小队静默——它的路线知识已全部固化在宣告评论里，后续照模板走即可。
3. **P1（入口发）**：dispatcher 亲做 init 三连锚 + P1 摘要（锚形态同 73.3.2 第 2 步）。
4. **P1 人审 → 交棒 P3**：按宣告内 P3 段模板照抄执行——核对评论通过后，按模板提示改派环节负责人，@ 阶段三队。**模板内的队名是纯文本照抄素材，粘贴后必须用提及选择器转成真实提及标记才有效触发**（同 72.3.1 三步 @）。阶段三队跑 9 个 stage（锚 [P3 i/9]）→ 交付摘要 → 人审。重入口的人审动作与 72.3.3/72.3.4 完全相同：核对评论 + 改派 + @ 下一队，两步缺一不可。
5. **P3 → P4**：按宣告内 P4 段模板照抄：改派 + @ 阶段四队——模板注明本次 stage 子集为 20-25、锚分母 6，其中 20-23 号 stage 的评审为 advisory 语义（模板内有注记）。阶段四队跑 6 个 stage → 摘要 → 人审。
6. **终局（止于 P4）**：classic 路线止于 P4——**P4 人审通过评论即路线终局指令**：把 issue 改派给阶段四队（路线末位 phase 队）→ 队长收尾 in_review → 你终审置 done。阶段四队默认指令里"通过后改派+@阶段五队"的一段被路线终局覆盖，宣告模板与包内 profiles 文件均有防呆注记。

mvp 同型（P1→P2→P3→P4，止于 P4 终局）；feature / enterprise 全链至 P5；infra / workshop 走 P3→P4→P5。各路线逐 phase 子集与 kickoff 模板以路线宣告评论与包内 aidlc-relay-pack/profiles-relay-paths.md 为准，照抄即可、无需记忆。

## 73.4 选型指引

### 73.4.1 场景 → 入口对照

| 场景 | 选入口 |
|---|---|
| 修一个明确的缺陷/回归（非新需求，根因不在需求层） | bugfix |
| 安全漏洞 / CVE 响应 | security-patch |
| 清理 / 简化既有代码 | refactor |
| 基础设施变更（网络 / 权限 / 部署底座） | infra |
| 需求到部署的最轻通道（无设计、无 reviewer） | express |
| 快速验证可行性（原型 / spike） | poc |
| 核心功能先跑起来，运营段后置 | mvp |
| 全仪式默认路线（Inception→Construction） | classic |
| 新功能全生命周期 | feature |
| 强监管特性、全量审计、strict 守卫 | enterprise |
| 带门禁的引导式小组活动（培训 / 实验室） | workshop |

判别顺序建议：先看是否落入四个专道（缺陷 bugfix / 安全 security-patch / 清理 refactor / 基建 infra）；不落则按投入深度选——最轻通道 express，验证可行性 poc，"先跑起来" mvp，全仪式 classic，全生命周期 feature，最重仪式 enterprise，群活动 workshop。

### 73.4.2 条件 stage 裁量（classic 为例）

classic 的 18 个 stage 中仅 8 个无条件，其余 10 个带上游条件标注——条件不满足的 stage 队长依法自跳：不发锚、锚分母按实际执行 stage 数、phase 摘要登记自跳行。逐 stage 条件明细见包内 aidlc-relay-pack/profiles-relay-paths.md 路由表（条件列）。其他入口的条件 stage（如 express 的逆向工程与部署尾）同理。

### 73.4.3 feature 入口 vs 72 号 5 队全链

同一条路线（full-33、5 人审、终局两段式、锚分母 3/7/9/7/7），两个启动形态：

- **feature 入口**：一条评论 @ 入口启动；dispatcher 亲做 init 并发路线宣告（内含各 phase 照抄模板），你照模板交接，无需记忆路线。
- **72 号全链**：你按 72.3.1 手动 @ 一队开场，每个 phase 人审后自己 @ 下一队——不需要 dispatcher 与宣告，但需要先读 72 号教程。

协议、锚、人审、终局完全一致；选择只看你要不要"一条评论启动 + 现成模板"。

### 73.4.4 enterprise strict 语义

enterprise 在 feature 同款 full-33 路线上叠加 strict 守卫语义：每个 stage 的交付摘要附"变更与依据"一行；已批准 stage 的输入发生变化时，必须打回受影响 stage 重审。适合强监管、全量审计场景——变更影响面被逐 stage 留痕，输入漂移不会带病前进。

### 73.4.5 上游仪式开关的"未映射项"

上游 profile 有若干仪式开关（sensors / learnings / summary-confirmation / plan-approval / walking-skeleton 等）在 relay 无独立对应物——由 phase 人审与交付摘要吸收，不单设 stage 或人工操作项。这是保真说明而非缺失：relay 承诺的是触发与推进的等价体验（@ 入口对齐上游 Start with；phase 级人审承接逐 stage 门禁语义），不逐项复刻上游仪式开关。

## 73.5 常见卡住与自救

**停滞判断与通用自救（三臂复用）**：判据与 72.5 完全相同——无新评论约 30 分钟且无进行中任务即按停滞处理；步骤也相同：先读最后一条锚（重入护栏：锚后仍有活动唯一正确动作是等待）→ 查最后一条交付评论是否漏 @ 队长（是则在同线程补 @ 队长）→ 补 @ 无效走主路径 re-@ 队。轻入口运行中，"队"即入口小队，re-@ 评论含恢复豁免词（"恢复 / 续跑 / 核对"任一）时 dispatcher 先回现场快照（最后锚位置与状态）而非按打回处理；快照确认卡点后，续跑仍须规范话术。重入口 P1 之后各 phase 队的自救同 72.5 四步；P1 之前（入口小队未动）re-@ 入口小队 + 豁免词。分钟数等数值以包内 aidlc-relay-pack/relay-protocol.md 第 5 节为准。

**恢复登记**：每次恢复事件（含确认是虚惊的）记一行到你的制品目录，建议文件名 aidlc-relay-recovery-log.md（格式以包内协议为准）：

```text
时间 | 触发臂 | 最后一条进度锚 | 现象描述 | 干预动作 | 恢复结果
```

**入口特有形态速查**：

| 症状 | 原因 | 处理 |
|---|---|---|
| 人审通过后没动静 | 通过评论只有话术、没 @ 入口小队（话术是门、@ 是触发） | 补一条"通过，继续"+@ 入口小队 |
| 重入口交棒时 @ 错队或 @ 不动 | 漏抄宣告内的 kickoff 模板，凭记忆写了队名或 stage 子集 | 回读路线宣告评论，逐字照抄该 phase 段；队名用选择器转真实提及 |
| 待审期随手回了一条评论，dispatcher 只回澄清请求 | 非规范话术在待审窗口一律按打回处理（三态消歧） | 想通过补发"通过，继续"；想打回补发"打回：<要求>"；只想查进度用含"核对"字样的评论 |
| re-@ 之后只收到现场快照，没有续跑 | 恢复豁免词评论只触发快照回复（恢复动作），续跑仍须规范话术 | 按快照确认卡点后，续跑发"通过，继续"或"打回：<要求>" |
| 锚数比宣告的 stage 数少 | 条件 stage 依法自跳（不发锚、分母按实际数、摘要登记） | 先看摘要的自跳登记行；有登记即正常，无登记才异常（按 72.5 找运维） |
| 宣告迟迟不来、init 锚不出现 | 入口小队停滞或运行时离线 | re-@ 入口小队 + 豁免词"核对现场"；仍无反应按 72.5 排查运行时 |

**报错与维护入口**：自救两轮仍无反应、锚计数明显异常、任务长时间排队（运行时离线形态）——按 72.5 末节找运维同学，他们的检查清单见仓库内 docs/my-best-practice/71-aidlc-relay-playbook.md。

## 73.6 延伸阅读

- 方法论总览（这套接力是什么、何时适用）：包内 aidlc-relay-pack/SKILL.md
- 接力协议全文（锚格式、人审清单、恢复协议、红线）：包内 aidlc-relay-pack/relay-protocol.md
- 入口路由表与编排规则（逐 stage 条件标注、kickoff 模板、防呆注记）：包内 aidlc-relay-pack/profiles-relay-paths.md
- bugfix 快路径逐 stage 说明（与 aidlc-bugfix 入口等价）：包内 aidlc-relay-pack/bugfix-relay-path.md
- 完整接力照走教程（5 队全链手动版，含五段诉求骨架与三步 @ 教学）：仓库内 docs/my-best-practice/72-aidlc-relay-usage-guide.md（随导出包分发）
- 导入、监控、恢复实战与验证记录（运维视角）：仓库内 docs/my-best-practice/71-aidlc-relay-playbook.md（不随包分发）

**声明**：本文是使用教程，协议语义与逐 stage 路由一律以包内 aidlc-relay-pack/ 文件为准；文中复制的格式与数值是写作时点的快照，若有出入，以包内文件为权威。
