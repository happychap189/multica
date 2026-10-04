# workspace-detection — 工作区探测（代码库探测）

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/initialization/workspace-detection.md`（适配语义: 源阶段确定性扫描分类; 本移植由 P1 队长  对 issue 指向的代码库做探测并评论报告）。
> stage #2; phase=initialization; execution=ALWAYS; mode=inline; 源 lead_agent=orchestrator → 适配为 P1 队长。

> Relay note: 快速阶段（零人审）——P1 队长同任务内部消化: 队长在同一次被 @ 任务内连续消化本阶段, 以进度锚评论承载交付, 不派 worker。

## 归属

- **phase 队**: aidlc-阶段一-启动（P1）; 队长: aidlc-architect
- **lead persona**: aidlc-architect（P1 队长本人执行, 无需派单 mention）; support 无（源 support_agents 为空）
- **reviewer**: 无

## 输入

- state-init 的上下文盘点结论（issue 上下文与 scope 路由）
- issue 指向的代码仓/工作区（可访问时; 不可访问时在评论中声明并给出推荐获取方式）

## 产出

- **代码库探测报告评论**: greenfield/brownfield 分类、语言/框架/构建系统/测试基础设施清单、嵌套项目发现
- 源 `produces` 为空; 本适配以探测报告评论承载等价信息

## 关键步骤

1. 扫描代码库顶层与关键子目录（配置文件、构建系统、依赖清单、源码目录、测试设施、文档）;
2. 按 brownfield 判定规则分类: 任一源码文件/应用框架配置/含应用依赖的清单/应用源码目录即 brownfield; 全部缺失才判 greenfield（README、.gitignore、空目录、无应用代码的 CI 样板不算 brownfield 信号）;
3. 顶层无信号时做嵌套项目回退探测（限三层, 命中即停）;
4. 识别技术栈: 语言、框架、构建工具、测试框架与覆盖率工具;
5. 把探测报告以评论形式发布, 标注当前阶段 slug `workspace-detection`。

## 完成动作（接力交接）

探测报告发出后, 本阶段即告完成——P1 队长继续在同任务内消化下一阶段, 并发进度锚评论。**全部 33 个阶段统一此动作**: 交付以评论承载, 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
