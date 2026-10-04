# deployment-execution — 部署执行

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/operation/deployment-execution.md`。
> stage #29; phase=operation; execution=CONDITIONAL（部署流水线与环境就绪后执行）。

## 归属

- **phase 队**: aidlc-阶段五-运营（P5）; 队长: aidlc-operations
- **lead persona**: aidlc-pipeline-deploy（非队长——P5 队长 @mention 派单执行）; support: aidlc-developer（跨队支援, 经各自所属队队长派单）
- **reviewer**: 无

## 输入

- cd-config / deployment-strategy / environment-inventory / build-test-results（必需）

## 产出

- deployment-log（部署执行日志）
- smoke-test-results（冒烟测试结果）
- health-check-report（健康检查报告）
- deployment-execution-questions

## 关键步骤

1. 读 CD 配置/部署策略/环境清单/构建测试结果（增量 scope 跳过上游时用工作区实际配置, 不虚构环境清单或部署路径; 无真实目标时报告跳过）;
2. 部署前检查问题（预检通过? 迁移已测? 依赖服务健康? 部署窗口?）并收集回答;
3. 推送制品过流水线, 跑冒烟测试, 验证健康检查, 需要时执行迁移（developer 支援）;
4. 产出部署日志/冒烟结果/健康检查报告;
5. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。**终局收尾（两段式）**: 全链最后一次人审通过后, P5 队长把 issue 置为 `in_review`, 最终 `done` 由 P5 环节负责人终审执行（`done` 只由人执行）。
