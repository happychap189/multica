---
name: aidlc-relay-methodology
description: 33 stage aidlc 人工接力方法论包（5 支 phase 小队、每 phase 一次人审接力）。当处理的 issue 涉及 aidlc-阶段一-启动 至 aidlc-阶段五-运营 五支小队之一，或被要求按 aidlc 接力方法论产出制品时使用。定义 phase 与小队映射、人工接力协议、进度锚与恢复协议，以及 33 个 stage 的输入产出契约。
---

# aidlc-relay-methodology — aidlc 人工接力方法论

## 1. 这是什么

本包是**在官方 multica 后端上可直接运行的 aidlc 方法论**：不依赖任何自建引擎或服务端扩展，只用平台原生能力（小队评论触发、worker 交付评论唤醒队长、issue 指派、评论与附件）承载 AWS aidlc-workflows（MIT-0）的 33 stage 方法论。

编排形态：**一个 phase 一支小队，人类在 phase 边界接力**。33 个 stage 由小队队长派单给成员（或队长亲做）完成；每个 phase 结束由该 phase 的环节负责人（人类成员）按清单做一次人审，通过后改派下一 phase 的环节负责人并 @ 下一支小队。全程共 5 次人审。

正因为只依赖上游原生原语，本包可随官方后端升级继续工作；也因此它没有任何服务端强制力——协议约束全部靠内容层自律与人工核对，边界与已知漂移对策见 [relay-protocol.md](relay-protocol.md) 第 1 节。

## 2. 何时使用

满足任一条件即适用：

- 你是五支 phase 小队之一的队长或成员，处理的 issue 正在走 aidlc 接力流程（被 @ 启动、被派单，或负责发锚与交付摘要）；
- 你是该 issue 的环节负责人（人类成员），要按协议驱动接力或做 phase 人审；
- 有人要求你"按 aidlc 接力方法论"产出制品。

不满足以上条件时，本 skill 仅作参考，不改变你的默认工作方式。

## 3. phase 与小队映射

| 小队 | phase | stages | 队长 | 成员 |
|---|---|---|---|---|
| aidlc-阶段一-启动 | initialization | #1-3（3） | aidlc-architect | aidlc-developer, aidlc-composer（休眠）, aidlc-compliance |
| aidlc-阶段二-构思 | ideation | #4-10（7） | aidlc-product | aidlc-design, aidlc-architect, aidlc-delivery, aidlc-product-lead（reviewer） |
| aidlc-阶段三-孵化 | inception | #11-19（9） | aidlc-architect | aidlc-product, aidlc-design, aidlc-developer, aidlc-delivery, aidlc-pipeline-deploy, aidlc-product-lead（reviewer）, aidlc-architecture-reviewer（reviewer）, aidlc-compliance |
| aidlc-阶段四-构建 | construction | #20-26（7） | aidlc-architect | aidlc-aws-platform, aidlc-developer, aidlc-quality, aidlc-pipeline-deploy, aidlc-architecture-reviewer（reviewer）, aidlc-devsecops |
| aidlc-阶段五-运营 | operation | #27-33（7） | aidlc-operations | aidlc-aws-platform, aidlc-pipeline-deploy, aidlc-quality |

- 14 个智能体跨队共享（同一 persona 可在多队出现）。其中 11 个在真实接力中出场；aidlc-composer（休眠）、aidlc-compliance、aidlc-devsecops 为定义在场，无主动派单场景。
- 每队的 stage 顺序表、派单规则、进度锚纪律与 phase 交付摘要格式见 [squad-instructions/](squad-instructions/)。

## 4. 接力语义速览

- **人审 5 次**：P1-P5 各一次，由该 phase 的环节负责人按 [relay-protocol.md](relay-protocol.md) 第 5 节清单核对。stage 不设单独人审；reviewer verdict、附件修订号、交接卫生等核对项全部吸收进 phase 清单。
- **进度锚**：每个 stage 完成后由队长发一条 `[P{phase} {i}/{n}] {slug} done → next {next-slug}` 进度锚评论（零 mention）。它是接力的断点记录与恢复依据。
- **终局两段式**：末位 phase 人审通过后，环节负责人把 issue 改派给末位小队，队长收尾至 `in_review`，再由环节负责人终审置 `done`。`done` 只由人写出。
- **恢复协议**：接力停滞按三臂判据判定 STALL；任何干预前先读最后一条进度锚（重入护栏）。详见 [relay-protocol.md](relay-protocol.md) 第 6 节。
- **stage 契约**：33 个 stage 的输入/步骤/产出在 [references/stages/](references/stages/)；各队指令中有每个 stage 的一行契约摘要。

## 5. 文件地图

| 文件 | 内容 |
|---|---|
| [relay-protocol.md](relay-protocol.md) | 人工接力协议核心：能力边界声明、全流程、派单与评论纪律、5 份 phase 审查清单、恢复协议、红线 |
| [squad-instructions/phase-1-initialization.md](squad-instructions/phase-1-initialization.md) … [phase-5-operation.md](squad-instructions/phase-5-operation.md) | 5 支小队的编排指令（原样写入 squad 实体的 instructions 字段） |
| [references/stages/](references/stages/) | 33 个 stage 契约（输入/产出/关键步骤，转写自 refs/aidlc-workflows） |
| [bugfix-relay-path.md](bugfix-relay-path.md) | 9 stage 缺陷修复接力路径变体（4 次人审）与入口判据 |
