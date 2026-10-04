# bugfix-relay-path — 9 stage 缺陷修复接力路径

> full-33 之外的轻量变体: 仅定义、不真跑（验证范围见 SKILL.md 与 71 号 playbook）。协议、锚格式、清单结构、终局两段式均复用 [relay-protocol.md](relay-protocol.md)。

## 1. 入口判据

一条任务同时满足以下全部条件时走 bugfix 路径，否则走 full-33:

1. **缺陷修复类**: 已知系统存在明确缺陷或回归，目标是定位与修复，不是新需求。
2. **无需完整需求/设计链**: 需求上下文已由原 full-33 运行制品（requirements.md 等）或既有文档承载，无需重跑 P2 构思与 P3 全量分析。
3. **修复范围落在修复-验证通道内**: 需要重走"代码修复 → 构建测试 → 部署验证"通道。

反例: 缺陷根因涉及需求理解错误，需要需求层返工——属 full-33 的 P3 人审返工，不走 bugfix 路径。

## 2. 路径构成（9 stage，4 次人审）

| 序 | phase | # | slug | 小队 | lead | reviewer |
|---|---|---|---|---|---|---|
| 1-3 | P1 | #1-3 | state-init / workspace-detection / workspace-scaffold | aidlc-阶段一-启动 | 队长内部消化（同 full-33） | 无 |
| 4 | P3 | #11 | requirements-analysis | aidlc-阶段三-孵化 | aidlc-product | aidlc-product-lead（advisory） |
| 5 | P3 | #15 | reverse-engineering | 同队 | aidlc-developer | 无（快速 stage，零独立人审） |
| 6 | P4 | #24 | code-generation | aidlc-阶段四-构建 | aidlc-developer | 无（快速 stage，零独立人审） |
| 7 | P4 | #25 | build-and-test | 同队 | aidlc-quality | 无（快速 stage，零独立人审） |
| 8 | P5 | #28 | deployment-pipeline | aidlc-阶段五-运营 | aidlc-pipeline-deploy | 无 |
| 9 | P5 | #29 | deployment-execution | 同队 | aidlc-pipeline-deploy | 无 |

- 4 次人审: P1 → P3 → P4 → P5 各一次，按 relay-protocol.md 第 4 节对应清单核对（制品集按本次运行 stage 裁剪）。
- #11 仍按契约取 aidlc-product-lead advisory verdict（契约复用原则）；其余 8 个 stage 无 reviewer。
- 快速 stage 语义与 full-33 一致: #15/#24/#25 照常派单执行、零独立人审。

## 3. 同队同契约复用

- 小队、队长、派单规则、进度锚格式、恢复协议与 full-33 完全一致；stage 契约直接复用 [references/stages/](references/stages/) 同名文件（内容按修复范围裁剪，不改契约结构）。
- 环节负责人机制不变: 每个涉足 phase 一位环节负责人，phase 通过后改派 + @ 下一队。
- 进度锚 `{i}/{n}` 取该 phase 本次运行的 stage 数: P1 为 3，P3 为 2，P4 为 2，P5 为 2。例: `[P3 1/2] requirements-analysis done → next reverse-engineering`。
- 各队 squad-instructions 顺序表中未进路径的 stage 在 bugfix 运行中跳过，顺序相对位置保持不变。

## 4. 与 full-33 的差异

| 维度 | full-33 | bugfix-9 |
|---|---|---|
| stage 集 | 33 个全部执行 | {1,2,3,11,15,24,25,28,29} 共 9 个 |
| 人审次数 | 5（P1-P5） | 4（P1/P3/P4/P5） |
| 跳过范围 | 无 | P2 全部、#13/#14/#16/#17/#18/#19、#20-#23、#26、#27、#30-#33 |
| 队伍 | 5 队全动 | P1/P3/P4/P5 四队 |
| 交付摘要 verdict 栏 | 按 phase 实际 | P3 含 #11 advisory verdict 1 条，其余 phase 标"无" |
| 终局 | 两段式（P5 队长收尾 + 人终审） | 相同 |
