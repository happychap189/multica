# 71 — aidlc 人工接力 playbook（官方后端可运行版）

> 验证后端: 官方镜像 `ghcr.io/multica-ai/multica-backend:latest`（2026-09-15 构建，rev c7f259c7）+ `multica-web:latest`，本地 docker compose 全链真跑通过。
> 方法论包: [templates/aidlc-relay-pack/](templates/aidlc-relay-pack/)（pack 标记 `aidlc-relay:v1`）。本文是其使用手册、验证 runbook 与实测记录；操作细节以包内文件为准。
> 实测口径: 全链真跑 AIDL-3（2026-10-04，约 7.5h）；重导入幂等 W5 同日完成。文中结论均来自实测，非推演。

## 71.1 这是什么

一套**在官方 multica 后端上可直接运行的 aidlc 人工接力方法论**：不改服务端、不加自建组件，只用平台原生原语（squad 评论触发、worker 交付评论唤醒队长、issue 指派、评论与附件）承载 AWS aidlc-workflows（MIT-0）的 33 stage 方法论。官方 ghcr 镜像即可运行，导入一个自包含 zip 即完成装配。

编排形态四件套：

| 机制 | 含义 |
|---|---|
| 5 支 phase 小队 | 一个 phase 一支小队（P1 启动 / P2 构思 / P3 孵化 / P4 构建 / P5 运营），14 个 aidlc persona 智能体跨队共享成员（v1.1 另增 dispatcher 与 11 支 profile 入口小队，共 15 agents / 16 squads，入口用法见 [73 号](73-aidlc-relay-profiles.md)）；33 个 stage 由队长派单给成员或队长亲做 |
| phase 级人审 ×5 | stage 不设单独人审；每个 phase 结束由环节负责人（人类成员）按清单审一次，通过后改派下一环节负责人并 @ 下一队 |
| 进度锚 | 每 stage 完成队长发一条 `[P{phase} {i}/{n}] {slug} done → next {next-slug}` 顶层评论（零 mention）。锚是接力的断点记录、恢复依据与计数凭据 |
| 显式 @ 回执 | 交付与 verdict 回复除在线程内回复外必须显式 @ 队长（mention markdown 字面量）。这是唤醒链的全版本兼容路径，也是漂移可观测性的基础 |

正因只依赖上游原生原语，本包没有任何服务端强制力——协议约束靠内容层自律、进度锚对冲与人工核对。能力边界与已知漂移对策见 [relay-protocol.md](templates/aidlc-relay-pack/relay-protocol.md) 第 1 节与本文 71.6。

导入物清单（单一 zip，零凭据）：

| 条目 | 说明 |
|---|---|
| aidlc-relay-pack/ | skill 源目录：SKILL.md 总览 + relay-protocol.md 接力协议 + profiles-relay-paths.md profile 路由表 + 16 份 squad-instructions/ 编排指令（5 phase + 11 entry）+ references/stages/ 33 份 stage 契约 + bugfix-relay-path.md 变体 |
| aidlc-relay-roster.json | 15 agents + 16 squads 的字段级事实源（重导入比对以此为准；v1.1 增 dispatcher 与 11 支 profile 入口小队） |
| seed-aidlc-relay.sh | 幂等导入脚本（含两层探针，见 71.3.1） |
| SHA256SUMS / README.md | 校验清单与导入指南（[templates/aidlc-relay-pack-export-README.md](templates/aidlc-relay-pack-export-README.md)） |

导入后的实体：1 个 skill（aidlc-relay-methodology，挂全员）+ 15 个智能体 + 16 支小队（v1.1：既有 5 支 phase 小队 + dispatcher 领衔的 11 支 profile 入口小队，入口用法见 [73 号](73-aidlc-relay-profiles.md)；编排契约写在小队 instructions，阶段交付时按 phase 作用域注入队长上下文）。

5 支 phase 小队的构成与 stage 覆盖（14 persona 跨队共享；11 真实出场 + 3 定义在场。v1.1 的 dispatcher 与 11 支 profile 入口小队不在此表，见 [73 号](73-aidlc-relay-profiles.md)）：

| 小队 | phase | stages | 队长 | 成员 |
|---|---|---|---|---|
| aidlc-阶段一-启动 | initialization | #1-3（3） | aidlc-architect | developer, composer（休眠，定义在场）, compliance |
| aidlc-阶段二-构思 | ideation | #4-10（7） | aidlc-product | design, architect, delivery + product-lead（reviewer） |
| aidlc-阶段三-孵化 | inception | #11-19（9） | aidlc-architect | product, design, developer, delivery, pipeline-deploy + product-lead/architecture-reviewer（reviewer）+ compliance（定义在场） |
| aidlc-阶段四-构建 | construction | #20-26（7） | aidlc-architect | aws-platform, developer, quality, pipeline-deploy + architecture-reviewer（reviewer）+ devsecops（定义在场） |
| aidlc-阶段五-运营 | operation | #27-33（7） | aidlc-operations | aws-platform, pipeline-deploy, quality |

完整 roster（含休眠/定义在场成员与每队完整成员集）见 [roster.json](templates/aidlc-relay-roster.json)；每队编排指令见 [squad-instructions/](templates/aidlc-relay-pack/squad-instructions/)。

## 71.2 使用手册

### 71.2.1 导入方前置清单

1. **multica CLI** 可用（用于 runtime 注册等操作）。
2. **自有 AI coding runtime**：一台已安装并在线的 daemon（运行时）——15 个智能体创建即绑这个 runtime。
3. **账号 + PAT**：网页 Settings 创建 PAT，或 `multica login --token`；PAT 需目标 workspace 的管理权限。
4. 目标 workspace 的 UUID（或 slug）。
5. 本机有 `curl`、`jq`、`zip`、`unzip`。

### 71.2.2 导入操作序

关键时序：**先注册 runtime，再 seed**。`POST /api/agents` 创建硬性要求 `runtime_id`，为空直接 400——这是后端硬约束，不是脚本约定。

```text
1. 安装 multica CLI，启动你的 daemon，在 multica 注册 runtime，记下 runtime UUID
2. 取得目标 workspace 管理权限的 PAT
3. 拿到 workspace UUID（或 slug）
4. 设置四参数（全部必填、fail-fast、无默认主机，见下方 env 块）：
5. bash seed-aidlc-relay.sh --verify    # 基础导入 + HTTP 层探针
6. （可选，daemon 在线时）bash seed-aidlc-relay.sh --verify-full   # 运行层探针
```

```bash
export MULTICA_SERVER_URL="https://your-multica.example.com"
export MULTICA_API_TOKEN="<your-human-PAT>"
export MULTICA_WORKSPACE_ID="<workspace-uuid-or-slug>"
export MULTICA_RUNTIME_ID="<your-runtime-uuid>"
```

其他可选参数：`--bind-runtime <uuid>`（把 15 个 agent 改绑到另一 runtime，仅作后续改绑）、`--force-skill-import`（同名 skill 强制覆盖重导）、`AIDLC_SKILL_ZIP=<path>`（用预构建 zip）。

### 71.2.3 导入完成判定

- seed 退出码 0，且断言输出：**15 agents / 16 squads / 1 skill** 全建（v1.1 含 dispatcher 与 11 支 profile 入口小队）；
- `--verify` PASS：skill 挂载读回 `GET /api/agents/{id}/skills` 命中；改派入队探针通过（建 scratch issue → 改派给小队 → 任务快照出现 queued 状态的队长任务 → 删除 issue）；
- `--verify-full` PASS（可选）：队长唤醒、guest 状态禁令、planned 回放三项运行层探针通过。

三项全绿即导入完成，可开跑。运行层探针未跑不影响使用，但建议在首次真跑前补齐（见 71.5 版本兼容矩阵——唤醒链行为与后端版本相关）。

### 71.2.4 日常使用流

一次接力的驱动动作全部由人类环节负责人发起，agents 自行完成队内派单与交付：

```text
建 issue（todo，禁 backlog）→ 分配环节负责人 → 环节负责人 @ 队启动
→ 队长派单 ⇄ worker 线程内交付（显式 @ 队长）→ 进度锚推进 → …
→ phase 交付摘要 → 环节负责人人审 → 改派 + @ 下一队 → …（P1→P5）
→ 末位人审通过 → 改派 P5 队 → 队长收尾 in_review → 环节负责人终审 done
```

- issue 建为 `todo` 并全程保持：进入 `backlog` 分类的 issue，其内置挂起赋值触发会冻结派单，@ 队不再生成任务，接力链静默断链。
- 环节负责人按 phase 换人（assignee 换人即留痕）；单人操作时也建议走真实改派动作，人审留痕靠"清单核对评论 + 改派时间线"。
- agents 不写 issue 状态；唯一例外是终局两段式中末位队长收尾至 `in_review`（授权边界内），`done` 只由人写出。
- 启动评论例句（mention 用 UI 选择器或 `mention://squad/<uuid>` 字面量）："{阶段一队 mention} 按 relay-protocol.md 跑 initialization。issue 保持 todo。"

### 71.2.5 人审交接操作与 mention 自查

每次 phase 人审交接（含启动 @ 队）的标准动作序：

1. **清单核对**：按 relay-protocol.md 第 4 节对应 phase 清单逐项核对——核心制品、reviewer verdict 摘要、附件修订号、交接卫生项（本队无 queued/running/pending 任务残留、锚计数 = 本 phase stage 数）。
2. **留痕评论**：核对结论以评论落 issue 时间线。
3. **改派**：assignee 换为下一 phase 环节负责人。
4. **@ 下一队**：评论 @ 对应小队，说明下一 phase 范围。

**mention UUID 必须程序化获取**，这是实测教训（71.6/71.9）：

- 队级 mention 格式必须为 `[@队名](mention://squad/<uuid>)`；短格式 `n/<id>` 不触发派单（实测：评论 201 但零 `trigger_outcomes`、零任务行，静默失效）。UI 的 mention 选择器没有这个问题。
- 人或 agent 手抄 UUID 会产生"模式合法的不存在 UUID"，服务端静默返回 `target_unavailable`，同样 201 无任何报错（33 次派单实测出现 2 例，约 6%）。
- 正确做法：从 squads/agents API 或 briefing roster **逐字复制** mention markdown 字面量；永远不手打。
- **自查法**：发完 @ 评论立即看响应的 `trigger_outcomes`——必须含 `queued`；201 加空 `trigger_outcomes` 即静默失效，换正确格式或正确 UUID 重发。监控侧可加"派单后 N 分钟无任务行 → 比对评论内 UUID vs agents API"探针。

### 71.2.6 恢复操作速查

接力停滞按三臂判据判定 STALL（臂 1：无新评论 >30min；臂 2：无 running/pending 任务；臂 3：任一任务 queued >15min 未被认领；STALL =（臂 1 且 臂 2）或 臂 3）。处置序：

1. STALL 首要怀疑是 **worker 交付漏 @ 队长**：看最后一条交付评论是否在线程内但缺显式 @——是则补发一条显式 @ 队长的评论即可，不重派任务。
2. 干预前必读最后一条进度锚（重入护栏）：最后一条锚之后若已有运行中任务，唯一合法动作是等待。
3. 队长被重新唤醒后行为是**恢复**（从最后一条锚续跑）而非重派；运行中 stage 不得重派——双派会产出重复制品与重复锚，破坏锚计数校验。
4. 每次恢复事件（含误报排除）按登记表格式留档：`时间 | 触发臂 | 最后一条进度锚 | 现象描述 | 干预动作 | 恢复结果`。

daemon 离线时先恢复 daemon 再按上述处理（臂 3 形态不会自愈）。完整协议见 [relay-protocol.md](templates/aidlc-relay-pack/relay-protocol.md) 第 5 节。

### 71.2.7 bugfix 路径

缺陷修复类任务走 9 stage 轻量路径（{1,2,3,11,15,24,25,28,29}，4 次人审），入口判据与路径表见 [bugfix-relay-path.md](templates/aidlc-relay-pack/bugfix-relay-path.md)。协议、锚格式、清单结构、终局两段式与 full-33 完全一致；进度锚 `{i}/{n}` 取该 phase 本次运行的 stage 数。

## 71.3 验证 runbook

### 71.3.1 seed 探针（两层）

探针分层的动机：编排链路里最脆的一环是"评论 mention → 任务入队 → 唤醒执行"，HTTP 层探不到唤醒行为，运行层探针又消耗真实 token。两层各司其职：

| 层 | 触发方式 | 覆盖 | 通过判据 |
|---|---|---|---|
| HTTP 层 `--verify` | 导入时即跑 | skill 挂载读回；改派入队触发（走 UPDATE 改派路径，即终局关单所用路径） | 挂载命中；scratch issue 改派后任务快照出现队长任务，状态命中 `queued/pending/dispatched/running` |
| 运行层 `--verify-full` | 绑定 runtime 后跑（daemon 在线） | 队长唤醒（guest 场景）、guest 状态禁令、planned 回放 | 三项各 PASS；`VERIFY_TIMEOUT_SECS` 可调（默认 600s） |

导入时（HTTP 层）+ 绑定时（运行层）显式失败，是把"上游版本漂移导致静默断裂"制度化为可观测信号的手段；真跑期间另行做恢复探针（71.9）。

### 71.3.2 冒烟判据（新环境先跑这条）

冒烟目的：验证接力主链的每个原生原语环节，跑 P1 全程 + P2 前 4 个 stage 即止，不跑满。

| 环节 | 判据 |
|---|---|
| P1 启动 | demo issue（todo）分配环节负责人并 @ P1 队后，**三连锚**出现：init×3 由队长在同一次被 @ 任务内连续消化并发锚；若单任务未消化完，队长跨唤醒周期续锚（兜底路径），必要时操作者 re-@ 队长 |
| P1 收尾 | phase 交付摘要（零 mention）→ 环节负责人按 P1 清单人审 → 改派 + @ P2 队 |
| P2 抽查（至 #7） | 队长亲做 stage 至少 1 个（#4/#5/#8 lead=队长）；#7 rough-mockups @ aidlc-design + aidlc-product-lead advisory verdict 全环采纳（一石二鸟：既是 lead-proxy 派单又是 verdict 环节）；附件修订号 r1/r2 链可见 |
| mention 语义 | mention markdown 触发派单；纯文本 @Name 不触发（若触发则记录防误触对策） |
| 唤醒链 | worker 交付评论唤醒队长至少肉眼验证一次 |
| 终局两段式 | 将 issue 改派给 P1 队 → 队长收尾至 `in_review` → 环节负责人终审置 `done`。两段各验证一次，冒烟 issue 终态 `done` |

全绿才进全链真跑。本仓冒烟实测（AIDL-4，worktree 源码构建后端）已按此判据全绿：P1 三连锚（单任务消化）→ P2 至 #7（advisory verdict 全环采纳 + 附件 r1/r2 链）→ 终局两段式两段各验证一次，冒烟 issue 终态 `done`。

### 71.3.3 全链真跑判据

冒烟通过后，新 demo issue 走满 5 phase/33 stage，判据五件：

1. **33 唯一槽位锚**（计数法见 71.3.4）；交接时逐 phase 校验锚计数 = 该 phase stage 数（3/7/9/7/7）。
2. **5 次 phase 人审留痕**：每 phase 一条核对评论 + assignee 变更时间线。
3. **出场矩阵 11+3**：11 个 persona 真实出场（product/design/delivery/architect/aws-platform/developer/quality/pipeline-deploy/operations + product-lead/architecture-reviewer），3 个定义在场（composer 休眠、compliance/devsecops 无派单场景）。
4. **署名核对**：交付评论作者 = 被派 persona（监控指标，漂移即按恢复协议处理）。
5. **终态两段式**：issue 时间线呈现 `in_review`（队长收尾）→ `done`（人终审）两段；`done` 作者为人。

可选加验（本仓已做）：恢复探针注入（71.9），验证断链后按协议恢复续跑。

出场矩阵逐位口径（判据 3）：

| persona | 出场 | 位置 |
|---|---|---|
| aidlc-product / aidlc-design / aidlc-delivery | 真实出场 | P2-P3（product/design/delivery 各自 lead 或 worker stage） |
| aidlc-architect | 真实出场 | P1/P3/P4 队长 + P2 worker（#6 feasibility） |
| aidlc-aws-platform | 真实出场 | P4 #23 / P5 #27 lead |
| aidlc-developer | 真实出场 | P4 #24（快速 stage 照常派单） |
| aidlc-quality | 真实出场 | P4 #25 / P5 #31 lead |
| aidlc-pipeline-deploy | 真实出场 | P3 #14 / P4 #26 / P5 #28/#29 lead |
| aidlc-operations | 真实出场 | P5 队长（#30/#32/#33 亲做 + 派单） |
| aidlc-product-lead | 真实出场 | P2/P3 reviewer（advisory verdict） |
| aidlc-architecture-reviewer | 真实出场 | P3/P4 reviewer（P4 为 adversarial） |
| aidlc-composer | 定义在场（休眠） | P1 成员，无派单场景 |
| aidlc-compliance | 定义在场 | P1/P3 成员，原生 support 无派单场景 |
| aidlc-devsecops | 定义在场 | P4 成员，无 lead 阶段的原生 support |

### 71.3.4 33 唯一槽位锚计数法

锚是计数凭据，但**直接 grep 锚格式会数错**——复发锚与线程内锚都会干扰。正确数法：

```text
1. 拉全量评论：GET /api/issues/{id}/comments（翻页取全）
2. 行首严格匹配锚格式（正文中间出现的相似文本不算锚）：
   ^\[P([1-5]) (\d+)/(\d+)\] ([a-z0-9-]+) done( \(r\d+\))? → next (\S+)$
3. 唯一化：按 (P, i, slug) 三元组去重——返工重发的锚（如 (r2)/(r3) 后缀）落在同一槽位，
   取最新修订版计数；唯一槽位总数应为 33，逐 phase 3/7/9/7/7
4. 复发锚核对：每处"唯一槽位数 < 匹配行数"的差额，应能对应一条带 (rN) 修订标记的锚
5. 线程内锚变体：锚纪律规定顶层评论，但实测 P5 队长因评论触发任务限线程内回复，
   把锚发成了线程内评论（71.6 末行）——采集时需同时扫描线程回复，格式判据不变
```

计数脚本的判据以"唯一槽位"为准而非"锚评论条数"，否则返工轮次多的 phase 会虚增计数。

### 71.3.5 监控实施要点

监控是 API-only 轮询：`GET /api/issues/{id}/comments`（锚推进与人审留痕）+ `GET /api/agent-task-snapshot`（running/pending/queued 任务形态），判据即 71.2.6 的三臂 STALL 判据与 71.3.3 判据 1/4。三点实施注意：

1. 快照 jq 双条件 select 注意引号正确性，避免误读计数（实测教训：双条件 select 用错引号导致误读任务形态）。
2. 锚计数脚本以唯一槽位为准（71.3.4）；交接时逐 phase 校验，差额必须能对应带 (rN) 修订标记的锚。
3. 署名核对（判据 4）按"交付评论作者 vs 派单评论 mention 目标"逐次比对，漂移即按 71.2.6 恢复协议处理。

## 71.4 实测结果摘要（AIDL-3）

全链真跑 AIDL-3：官方 ghcr 后端镜像栈，2026-10-04，07:35-14:59 UTC，约 7.5h。

| 验证项 | 结果 |
|---|---|
| 进度锚 | 33/33 唯一槽位（3/7/9/7/7），逐 phase 交接锚计数校验通过 |
| phase 人审 | 5/5 留痕（核对评论 + assignee 时间线） |
| 互审 | 10 组全环：6 组 advisory + 4 组 adversarial（返工上限 1 全跟踪，全环 = findings 全部解决） |
| 级联修订 | 3 轮跨制品级联修订闭环（其中 P3 两轮：契约设计三腿返工至 R4、units-generation 产物回流 practices-discovery） |
| 快速 stage | #15 reverse-engineering 守卫 SKIP（greenfield 条件分支，契约内行为，零独立人审）；#24/#25 照常派单 |
| 真实测试 | #25 build-and-test 产出 test-results：57/57 真实测试通过 |
| 出场矩阵 | 11 实跑 + 3 定义在场，逐位吻合（developer 于 #24 回归出场） |
| 恢复探针 | AC7 全链闭环：预解绑 → 入队阻断（0 新任务行）→ 重绑 → 护栏重入 → 恢复续跑（12:37-13:00 UTC，详见 71.9） |
| 终局 | 两段式 done：P5 环节 owning 队长收尾 `in_review` → 环节负责人终审 `done` |

W5 重导入幂等（同日）：同服务器第二 workspace 全新导入，以 roster.json 为事实源逐字段比对——14 agents + 5 squads 共 19/19 字段哈希零 diff；seed 双跑实体计数不变（14/5/1）、squad 无重复（精确名 + `aidlc-relay:v1` 标记解析）。

证据链口径：冒烟（AIDL-4）在 worktree 源码构建后端完成；切换官方镜像栈后 seed 双层探针全数重验 PASS，全链真跑（AIDL-3）在官方镜像栈完成；中断的 AIDL-5 作废，无结论入册。

## 71.5 版本兼容矩阵

| 能力 | 官方镜像（2026-09-15 构建，rev c7f259c7） | 新版源码（含修复后） | 对策（全版本路径） |
|---|---|---|---|
| worker 交付唤醒队长 | 缺 guest 线程唤醒修复：线程内交付评论不唤醒 guest 队长（实测交付后 13min 零唤醒、任务快照零新行） | 线程内回复可唤醒（修复在更新源码中） | **协议 v3：交付/verdict 回复必须显式 @ 队长**——全版本可用的唤醒路径，已定为强制项而非礼貌项 |
| runtime 不可用反馈 | 无 runtime-unusable 系统通知（新特性未进该镜像）：解绑 runtime 后派单静默不入队 | 出现 author_type=system 的通知评论 | 检测信号 = **任务缺席 + 无锚推进**（三臂判据的臂 1/臂 3 形态）；不依赖系统通知存在 |
| agent 创建 | `POST /api/agents` 硬性要求 `runtime_id`（空 → 400） | 同（创建路径行为一致） | seed `RUNTIME_ID` 为必填参数；README 固化"先注册 runtime 后 seed"时序 |
| dev 验证码 | 官方镜像以 APP_ENV=production 运行，dev 固定验证码被忽略 | dev 环境可用固定验证码 | 从容器 stdout 取验证码（`docker logs`），不依赖 dev 码 |

协议版本演进（供对照，现行 v3）：v1 线程内交付等唤醒 → 官方镜像缺修复实测断裂 → v2 回复显式 @ 队长 → v2 模板内嵌活体 mention 链接示例引发队长自唤醒空转 → v3 指示语纯文字化并禁止派单评论正文内嵌 mention 链接示例（71.6）。v3 已在官方后端 5 队核验生效。

## 71.6 已知漂移模式与对策表

全部来自实测（W3 冒烟 + W4 全链真跑）。零服务端强制力意味着这些漂移不被拦截、只能被发现与纠正——对策全部围绕"可观测 + 可核对"：

| # | 漂移模式 | 实测表现 | 对策 |
|---|---|---|---|
| 1 | worker 越权改 issue 状态 | 实测 2 例：worker（design 等）把 member 分配的 issue 置 `in_progress`（activity_log 可查 actor）；guest 状态禁令只注入队长 briefing，worker 无门禁 | 监控加"非 owner 发起的状态变更"告警：`backlog` 立即纠正（会冻结派单），其余人审时纠正；后续 pack 修订可在 persona 指令补"非终局禁改状态"行 |
| 2 | agent 手写 mention UUID 幻觉 | 33 次派单 2 例（约 6%）：评论中 UUID 被写成"模式合法的错误 id"（共享真实 id 尾段的幻觉变体）→ 静默 `target_unavailable`，评论 201 零报错、零任务行 | 派单/交接 mention UUID 从 briefing roster **逐字复制**，禁止 agent 手写；监控加"派单后 N 分钟无任务行 → 比对评论内 UUID vs agents API"探针（见 71.2.5 自查法） |
| 3 | 活体链接示例自唤醒 | 队长把派单模板中的 mention 链接示例原样写进 verdict 请求评论 → 触发被示例者自唤醒，空转一轮 | 协议 v3 禁令：指示语用纯文字（如"回复时请显式 @我"），**派单评论正文不得内嵌任何 mention 链接示例** |
| 4 | 锚复发（返工重锚） | 返工 stage 重发同槽位锚（(r2)/(r3) 修订标记），原始匹配行数超过 33 | 锚计数按 (P, i, slug) 唯一化（71.3.4）；每处差额对应一条带修订标记的锚，逐处可追溯 |
| 5 | 队级 mention 短格式失效 | 短格式 `n/<id>` 评论 201 但零 `trigger_outcomes`、零任务行，静默不触发派单 | 队级 mention 一律 `mention://squad/<uuid>`；发后自查 `trigger_outcomes` 必含 `queued` |
| 6 | 锚位置漂移（线程内锚） | P5 队长因评论触发任务限线程内回复，把进度锚以线程内评论承载（实测裁量，记为合理——锚格式与零 mention 纪律均保持） | 锚采集同时扫描顶层评论与线程回复（71.3.4 第 5 步）；格式判据不放宽 |

另有两条结构性风险（非单次漂移，协议已内化对策）：对话即状态——队长上下文跨 stage 漂移，靠进度锚 + squad instructions 顺序表 + 交接锚计数校验对冲；监控只能发现不能阻止——发现之前的带病前进无法技术阻断，靠 phase 清单人工核对兜底。

## 71.7 已知修正

- **#17/#18 顺序修正**：refs 仓库 stages 文件自序为 units-generation（2.7）→ contract-design（2.8，required 消费 #17 的 unit-of-work）。引擎版总表的 #17/#18 为转置，relay 版按 refs 自序修正，phase-3 顺序表与契约文件一致。
- 该修正属内容层勘误，不影响协议与验证判据；对照旧材料阅读时注意此处差异。

## 71.8 与引擎版差异表（历史对照）

引擎版 = 本仓本地分支 `feat/stage-gate-workflow` 的实现（服务端 stage 工作流引擎 + 方法论包 `aidlc-methodology-pack`），仅作历史对照，不构成本包依赖；本分支不包含其任何代码。两版承载同一 33 stage 方法论，强制模型完全不同：

| 维度 | 引擎版（feat/stage-gate-workflow） | relay 版（本包） |
|---|---|---|
| 门禁语义 | 27 个实质门禁（6 个快速 stage 定义层免门）+ 33 个运行时门禁：每 stage 停靠服务端校验 | 5 次 phase 级人审承载全部门禁语义；stage 不停靠，reviewer verdict/返工上限/附件修订核对全部吸收进 phase 清单 |
| 推进机制 | 结构化评审通过后服务端推进（评审记录行更新、stage 推进、下一队队长自动入队同一事务内完成） | 人审改派：环节负责人核对清单 → assignee 换人 → @ 下一队；推进由人的动作承载 |
| issue 终态 | 决策 D-2：末位门禁 approve 后引擎完成实例并自动把 issue 置 `done`，agent 不手动改状态 | 终局两段式：末位人审通过后改派 P5 队 → 队长收尾 `in_review` → 环节负责人终审 `done`；`done` 只由人写出 |
| 强制力 | 服务端强制：违规停靠/越权推进被拒 | 零服务端强制力：协议靠自律；进度锚 + 三臂监控 + phase 清单 + 分层探针对冲（可发现不可阻止） |
| 快速 stage | 6 个定义层免门（init×3、#15、#24、#25） | 语义一致：init×3 队长同任务消化；#15/#24/#25 照常 @mention 派单执行、零独立人审，由所在 phase 人审覆盖 |
| 恢复 | 引擎状态权威，断链后按实例状态重放 | 三臂 STALL 判据 + 重入护栏 + 队长恢复而非重派（71.2.6） |
| 互审 | reviewer 互审 12 门控 stage（8 advisory + 4 adversarial），服务端记录 | 同一 12 集语义平移：队长先取 verdict 再标完成；adversarial resolve-first + 返工上限 1，计数由队长执行 |

**两项未验证项**（如实声明，非通过项）：

1. **官方云 runtime 绑定形态**：全链验证在本地 docker 官方镜像栈完成；官方云环境（SaaS）的 runtime 绑定与 daemon 接入形态未验证。
2. **真实多人类接力**：实测由单一操作者扮演 5 个环节负责人（改派动作真实留痕）；多个人类成员跨时区接力的协作摩擦（通知、审批时效）未验证。

## 71.9 恢复协议实战摘要

全链真跑期间登记的恢复事件与探针（完整登记表由操作者保存于其制品目录，本仓验证存于内部记录；此处摘要入册以自足）：

**REC-2 唤醒链缺失（2 次重入）**：#6 线程内交付后 13min 零唤醒（任务快照零新行）→ 判定官方镜像缺 guest 唤醒修复 → 显式 @ 队长重入恢复。此后 design 交付仍遵旧协议（v1 指示）未 @，再次零唤醒 → 人工显式 @ 重入。协议 v2（回复显式 @ 队长）随后上线 5 队，之后一个旧 turn 残留模板引发的自唤醒空转（预期内噪音）后归零。教训：唤醒链断裂的首要怀疑是"交付漏 @"，修复动作是补 @ 而非重派。

**REC-3 / REC-5 mention UUID 幻觉（根因链）**：#13 verdict 请求（agent 作者）未生成 reviewer 任务行（DB 权威核验），当时以"agent→agent mention 触发异常"登记；14:45 #31 派单再发——评论中 quality 的 UUID 被写成共享真实 id 尾段的幻觉变体（`cc5a01a2-…` vs 真实 `cc56604c-…`）→ 静默 `target_unavailable`。回溯比对 #13 评论内 UUID，确认同型损坏，REC-3 根因修正。两次恢复均为"成员以正确 id 重新 @"（queued 后续跑）。教训固化：mention UUID 不可手写（71.6 #2 对策）。

**恢复探针（AC7，12:37-13:00 UTC）**：计划性断链注入——

```text
预解绑: 直连 DB 将 aidlc-developer 的 runtime_id 置 NULL（单 agent 手术；
        运行时级解绑 API 会波及全员，且属验证手段，不进导出包）
派单:   队长照常 @ developer 派 #24 → 派单评论已发，但零新任务行（入队即阻断）；
        该镜像无 runtime-unusable 系统通知 → 检测信号 = 任务缺席 + 无锚推进
重绑:   PUT /api/agents/{id} 重绑 runtime（bound=true）
重入:   按重入护栏 @ 队长 → 队长重新派 #24（queued）→ 恢复续跑至终点
```

事件链七环节完整（预解绑 → 派单阻断 → 无锚 → STALL → 重绑 → 护栏重入 → 续跑终点），验证了断链后按协议恢复的可行性；探针操作属验证手段，日常使用不涉及。

## 71.10 阅读顺序建议

- 团队成员日常使用：先读 [72 号使用教程](72-aidlc-relay-usage-guide.md)（随导出包分发，导入后从这份读起）。
- 只想跑起来：71.2.1 → 71.2.2 → 71.2.3 → [README](templates/aidlc-relay-pack-export-README.md) → 跑冒烟（71.3.2）。
- 想理解协议：[SKILL.md](templates/aidlc-relay-pack/SKILL.md) → [relay-protocol.md](templates/aidlc-relay-pack/relay-protocol.md) → 本文 71.5/71.6/71.9。
- 想复现验证：71.3 全节 → 71.4 口径 → 71.8 未验证项声明。
