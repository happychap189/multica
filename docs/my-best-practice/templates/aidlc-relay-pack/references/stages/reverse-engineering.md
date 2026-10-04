# reverse-engineering — 逆向工程

> 转写自 `refs/aidlc-workflows/core/aidlc-common/stages/inception/reverse-engineering.md`。
> stage #15; phase=inception; execution=CONDITIONAL（brownfield 执行, greenfield 跳过）; mode=pipeline（developer→architect 链）。

> Relay note: 快速阶段（零人审）——照常派单: 队长 @mention 派 lead persona 真实执行, 产出由 phase 级人审覆盖, 不增设互审。

## 归属

- **phase 队**: aidlc-阶段三-孵化（P3）; 队长: aidlc-architect
- **lead persona**: aidlc-developer（非队长——P3 队长 @mention 派单执行）; pipeline 链: aidlc-developer 扫描 → aidlc-architect 合成（P3 队长参与阶段内合成, 无需额外派单）
- **reviewer**: 无

## 输入

- 无前置制品消费（扫描代码库本体）

## 产出

- 9 件代码知识库制品: business-overview / architecture / code-structure / api-documentation / component-inventory / technology-stack / dependencies / code-quality-assessment / reverse-engineering-timestamp

## 关键步骤

1. 守卫: 非 brownfield 报告跳过; 多仓时按 intent 登记仓集逐仓处理; 再跑守卫检查现有知识库保鲜度（NO_STORE/CURRENT/STALE/UNVERIFIED/UNKNOWN_SCOPE 决定复用/全量/聚焦扫描）;
2. developer 扫描: 包/模块/构建系统/API/框架/测试设施/质量指标/技术债, 产出结构化扫描交接文件（含 Scan Coverage）;
3. architect 基于扫描交接文件合成 9 件制品（architecture 必含交互图）, 全量替换或聚焦合并写入;
4. 交付并发进度锚评论。

## 完成动作（接力交接）

制品完成后由本队把交付摘要评论发到委派评论线程内, 并显式 @队长（mention markdown 字面量; 版本兼容注记见 relay-protocol.md 3.4）, 评论含本阶段 slug 与制品路径, 再写一条进度锚评论。**全部 33 个阶段统一此动作**; 批准与否不在 stage 级发生——本阶段产出由 phase 级人审覆盖（phase 全部阶段交付后, 环节负责人按人审清单核对、改派下一环节）。
