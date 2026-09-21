# SceneLab 技术报告包格式 1.0

`.scenelab-report` 是 UTF-8 JSON 与 PNG 组成的 ZIP 容器。读取方首先读取 `manifest.json`，按路径与图片角色查找素材。`format_version` 独立于 SceneLab 软件版本；读取方应忽略未知的新增字段。

本格式是当前方案的工程成果出口，不能替代 `.cameraplanner.json` 项目备份，不包含 PDF、完整体素数组或其他方案。导出在本机完成，不需要网络、Python 或额外服务。

## 入口 manifest.json

- `format`: 固定 `scenelab-report`。
- `format_version`: 当前 `1.0`。
- `producer`: `name` 与软件 `version`。
- `project`: 项目 `name`、`scheme_name`、`scheme_revision`、包生成时间 `generated_at`（ISO 8601）。
- `files.project` / `files.analysis`: 两份 JSON 的包内相对路径。
- `images[]`: `role`、`view`、`file`、`clip_m`、`image_size_px`。`clip_m` 是截图的高度裁切上限，不是统计范围。统计使用完整计算空间。
- `camera_views`: 默认 `{ "included": false }`；启用时包含 `index` 路径和 `count`。
- `diagnostics.included`: 默认 `false`，只有用户主动勾选才为 `true`。

六张必备图片角色：`deployment/perspective`、`coverage/top`、`coverage/perspective`、`accuracy/perspective`、`accuracy/front`、`accuracy/side`。当前版本的额外截图使用 `role: manual`。颜色与现有技术报告相同，PNG 不包含 PDF 中单独排版的图例。

## project.json

`name`、`project_id`、`scheme_id`、`scheme_name`、`scheme_revision`、`boundary_m` 描述当前工程；`units` 与 `coordinate_system` 明确坐标、长度、角度、Marker 毫米直径和传感器像素约定。

`scheme` 完整保留当前 Scheme 的现有定义，包括边界、仿真设置、全部对象和命名分组，不附带其他方案。对象位置/尺寸为米、旋转为度，Marker 直径为毫米；刚体内部 Marker 坐标为刚体局部坐标，世界位置由刚体位姿决定。

`cameras[]` 额外提供直接读取相机事实的入口：名称、启用/可见/锁定状态、安装与分组关系、`pose.position_m`、`pose.rotation_deg` 和完整 `camera_model`。`camera_model` 与 `scheme.objects[].camera_model_snapshot` 来自同一快照，未建立另一套型号映射。包含用户自建型号、镜头配置、畸变、双目基线、原始 catalog、备注和编辑时间。内部型号 ID 仅供 SceneLab 关联，理解相机不需要查询外部产品库。

世界原点为地面中心，Z 向上，场地范围为 X ±长度/2、Y ±宽度/2、Z 0…高度。相机零姿态朝世界 +Y，正 yaw 朝 +X，正 pitch 抬头，roll 绕光轴。其他对象采用 `Rz(yaw) Ry(pitch) Rx(roll)`。相机局部 +X 是图像右方，+Y 是图像下方，+Z 是光轴；双目位置为两目中心。

## analysis.json

该文件直接复制当前有效 `SimulationResult` 的摘要值，不通过图片/OCR或重新计算得到。

| 字段 | 单位或语义 |
| --- | --- |
| `scheme_id`, `scheme_name`, `scheme_revision` | 分析所属方案 |
| `generated_at` | 分析时间（包生成时间另见 manifest） |
| `settings.boundary_m` | 实际计算边界 |
| `settings.voxel_m` | 用户设定采样间距 |
| `settings.actual_voxel_size_m` | 按边界分割后的 XYZ 实际单元尺寸 |
| `settings.marker_diameter_mm`, `error_threshold_mm` | 本次分析设置 |
| `sampling.valid_voxels`, `excluded_voxels`, `invalid_accuracy_voxels` | 有效、障碍物内部排除、不可定位采样点数 |
| `coverage_percent.ge1`…`ge5` | ≥1…≥5 有效视点覆盖，0–100 百分数；双目至多提供两个视点 |
| `average_view_count` | 平均有效视点数 |
| `accuracy_mm.mean`, `p90`, `p95` | 理论 1σ 三维位置 RMS，毫米；无可定位点时为 `null` |
| `threshold_percent.under_0_3mm`, `under_0_5mm` | ≤0.3 / ≤0.5 mm 达标率，0–100 百分数 |
| `elapsed_ms` | 计算耗时，毫秒 |
| `statistics` | 覆盖/达标率分母和精度统计范围说明 |

百分数以全部有效采样点为分母；精度均值和分位数只统计可定位点。保存原始精度值，不应用界面的小数位格式。`positions`、`counts`、`errors` 三个体素数组不导出。

仅在启用内部诊断时出现 `diagnostics: { included: true, issues: [...] }`。每条 issue 包含 `type`、`count`、代表点 `position_m`，类型沿用现有 coverage / accuracy / occluded / small / geometry。关闭时不输出 issue 点。

## 可选 camera_views/index.json

只有主动勾选时才生成该目录。`views[]` 每项包含 `camera_id`、`camera_name`、`enabled`、`eye`（单目 `null`，双目 `left` / `right`）、`model`、`resolution`、`image`、`image_size_px`、`image_kind`、`markers[]`。`image` 路径相对于 index 所在目录。停用相机仍可作为工程资产导出，`enabled` 明确其状态。

PNG 复用现有报告的 CameraDiagram，属于 `diagram_overview`，Marker 符号为了可读性放大；最长边至多 2048 px，原始传感器分辨率始终在 `resolution` 中保存。不要按 PNG 符号大小测量像素。

`markers[]` 中 `diameter_mm`、`u_px` / `v_px`、`width_px` / `height_px` 使用现有 `cameraImage()` 计算值，像素坐标对应原始传感器分辨率；后方或非有限投影的坐标用 `null`。`valid` 和 `reasons` 与现有报告一致。可见 Marker/刚体参与此预览；隐藏对象仍保留在 project.json。双目每个眼位独立导出。文件名经过 Windows 安全化并带序号，重名相机不会覆盖。

## 一致性与兼容

只有 `result.schemeId == scheme.id` 且 `result.revision == scheme.revision` 时可导出。核心 PNG 必须属于该版本，热图还必须对应当前分析时间。缺失图片可在弹窗中重新生成。导出期间捕获独立方案快照，并在生成结束、下载前再次检查；场景或分析改变则终止本次导出。取消操作不会下载半成品。

v1.0 / v1.1 / v1.2 项目结构、相机库与 PDF 打印入口保留。扩展的报告图片元数据只在当前运行会话使用，不改项目存储 schema。
