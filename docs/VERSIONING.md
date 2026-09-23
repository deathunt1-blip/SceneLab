# SceneLab 版本管理

## 分支与版本

- `main`：当前开发基线。每次推送和 Pull Request 自动运行测试与构建。
- 日常功能、修复从 `main` 创建独立分支，例如 `feature/...` 或 `fix/...`，通过 Pull Request 合并。
- 标签 `v1.0.0` 固定首个分发版本；已发布标签和附件不要覆盖。修复发布为 `v1.0.1`，新增兼容功能发布为 `v1.1.0`。
- `package.json` 与 `package-lock.json` 保存完整版本号，界面可以显示 `v1.0`。发布时同步界面、报告、安装器和说明书中的版本。
- 当前仓库未强制设置分支保护；上述规则为团队约定。

## 仓库与发布附件

源码、测试、内置相机数据、依赖锁文件、图标和文档生成脚本进入 Git。个人项目、缓存、开发依赖和构建目录不进入 Git。

安装程序、免安装 ZIP、PDF 使用说明、更新说明及 SHA-256 校验文件上传到对应 GitHub Release。不要把大体积分发程序提交到源码历史中。

## 发布流程

### macOS（v1.3.1 起）

在 macOS 13+ 上运行 `npm ci`、`npm test`，然后执行 `npm run package:mac -- --arm64` 或 `npm run package:mac -- --x64`。输出位于 `release/build`，包含 DMG 与 ZIP；Mac 指南来自仓库内 HTML，不依赖 Windows PDF 生成环境。`node scripts/smoke-mac.cjs` 在对应架构的 Mac 上验证归档和启动，使用独立临时用户目录与端口。

`.github/workflows/macos.yml` 对 PR、版本标签和手动触发分别在原生 arm64 / Intel 构建机打包。验证任务在另一台干净且具备图形能力的 macOS 构建机解包运行，检查签名完整性、架构、版本、帮助资源、DMG 安装链接及实际渲染。arm64 原生运行；Intel CI 虚拟机缺少可用 GPU，因此 x64 安装包在 Apple Silicon 上通过 Rosetta 完成渲染检查。发布应用保持默认图形设置，不依赖测试机上的额外渲染库。此检查不等于 Intel 实机 GPU 验收，也不替代下载后的 Gatekeeper 和真实用户设备验证。

先合并检查通过的 PR，为已验证的提交创建版本标签。标签工作流重新构建和换机验证，随后由 GitHub 构建机生成 SHA-256 清单、上传七个附件到草稿，并在逐项核对远端摘要和大小后公开 Release。只有发布任务获得仓库写权限，PR 构建没有发布权限。保留旧版本标签和附件，不覆盖已有发布；若上传中断，先检查草稿及其附件再重试，不能以覆盖正式版本的方式恢复。当前 Mac 分发采用 ad-hoc 签名，不能宣称 Apple 开发者签名或公证。Windows 最新分发版仍为 v1.3.0，其发布附件不覆盖。

### Windows（当前 v1.3.0 分发流程）

1. 更新版本号与 `CHANGELOG.md`，确认文档中的操作与界面一致。
2. 在 Windows x64 环境安装依赖并验证：

   ```powershell
   npm ci
   npm test
   npm run build
   ```

3. 使用装有 ReportLab、Pillow 的 Python 运行 `scripts/create-release-assets.py`。它使用 Windows 微软雅黑字体生成图标和 PDF；原始 Excel 重导入另需 openpyxl。
4. 运行 `npm run package:win`，检查安装版与免安装版。查看新版 PDF 全部页面，确认图表和文字完整。
5. 更新并运行 `scripts/finalize-release.cjs`，整理附件并生成 SHA-256 校验文件。此脚本、文档生成脚本和打包配置目前针对 1.3.0 命名，新版本需一起更新。
6. 提交最终内容，创建附注标签并推送。以该标签创建 GitHub Release，上传上述附件。
7. 核对远端标签对应的提交、附件大小及校验和。向同事发送 Release 链接。

每次发布前先导出项目和自定义相机库备份；构建用的测试账户不可混入分发包。
