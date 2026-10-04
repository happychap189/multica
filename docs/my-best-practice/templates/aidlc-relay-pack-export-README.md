# aidlc relay 方法论包 — 导入指南

> 本包在官方 multica 后端上可直接运行：不修改服务端、不含任何凭据。导入内容 = 1 个 skill（aidlc-relay-methodology）+ 14 个智能体 + 5 支 phase 小队。
> 方法论文档见包内 aidlc-relay-pack/（SKILL.md 总览、relay-protocol.md 人工接力协议、5 支小队的编排指令、33 份 stage 契约）。
> 导入完成后，团队成员从 `docs/72-aidlc-relay-usage-guide.md` 读起。

## 0. 包内容

| 条目 | 说明 |
|---|---|
| aidlc-relay-pack/ | skill 源目录（SKILL.md + relay-protocol.md + squad-instructions/ + references/stages/） |
| aidlc-relay-roster.json | 14 agents + 5 squads 的字段级事实源（W5 重导入比对以此为准）；5 支小队的 instructions 为 phase 编排契约**全文嵌入**（打包时由 squad-instructions/phase-{1..5}-*.md 生成，seed 不从文件读入） |
| seed-aidlc-relay.sh | 幂等导入脚本（同名 agent 更新；squad 按"精确名 + aidlc-relay:v1 标记"解析，不重复创建） |
| SHA256SUMS | 包内容清单校验和；打包前断言 stage 契约 33/33 且 slug 集合与 refs 派生集一致、协议文件与小队指令齐备 |
| README.md | 本文件 |
| docs/72-aidlc-relay-usage-guide.md | 团队成员使用教程，导入后从这份读起 |

## 1. 前置条件

1. **multica CLI**（`multica` 命令可用；用于 runtime 注册等操作）。
2. **自有 AI coding runtime**：一台已安装并在线的 daemon（运行时）。
3. **账号 + PAT**：网页 Settings 创建 PAT，或 `multica login --token`。
4. **目标 workspace 的管理权限**。
5. 本机有 `curl`、`jq`、`zip`、`unzip`。

## 2. 导入时序（关键：先注册 runtime，再 seed）

`POST /api/agents` 创建硬性要求 `runtime_id`，为空直接 400——所以必须先有 runtime 再跑 seed：

1. 启动你的 daemon 并在 multica 中注册 runtime，记下 runtime UUID；
2. 取得目标 workspace 的管理权限 PAT；
3. 拿到 workspace UUID（或 slug）；
4. 运行 seed（全部参数必填、fail-fast、无默认主机）：

```bash
export MULTICA_SERVER_URL="https://your-multica.example.com"
export MULTICA_API_TOKEN="<your-human-PAT>"
export MULTICA_WORKSPACE_ID="<workspace-uuid-or-slug>"
export MULTICA_RUNTIME_ID="<your-runtime-uuid>"

bash seed-aidlc-relay.sh              # 基础导入（skill + agents + squads + 挂载 + 断言）
bash seed-aidlc-relay.sh --verify     # 追加 HTTP 层探针（挂载读回 + 改派入队触发，自动建/删 scratch issue）
```

5. 可选：
   - `--verify-full`：运行层探针（队长唤醒、guest 状态禁令、planned 回放）——**需要 daemon 在线且 agents 已绑 runtime**，会真实运行智能体（消耗 token）；`VERIFY_TIMEOUT_SECS` 可调超时（默认 600s）。
   - `--bind-runtime <uuid>`：把 14 个 agent 全部改绑到另一 runtime（导入时创建即绑 MULTICA_RUNTIME_ID，此项只作后续改绑）。
   - `--force-skill-import`：同名 skill 已存在时用 `on_conflict=overwrite` 重导。
   - `AIDLC_SKILL_ZIP=<path>`：使用预构建的 skill zip 而非现场打包。

## 3. 幂等性

- agent 同名 → PUT 更新（description/instructions/visibility），不重复创建；runtime 绑定只在创建时写入，改绑走 `--bind-runtime`，update 不动 runtime。
- squad 按"精确名 + description 含 `aidlc-relay:v1`"解析：命中即更新（instructions/description 刷新、成员补齐），未命中才创建——087 迁移后 squad 名不再唯一，纯名解析会误并其他小队。
- skill 按名解析：存在即跳过（`--force-skill-import` 强制覆盖重导）。
- seed 双跑：实体计数不变（14/5/1）、squad 无重复（AC5）。

## 4. 零凭据声明

包内不含任何 token/PAT/内部地址。脚本所有敏感参数走环境变量，缺一即 fail-fast 退出；凭据扫描在打 zip 时对**最终 zip 内容**执行（智能体令牌字面量、硬编码 Bearer、回环地址与默认主机名的空断言）。
