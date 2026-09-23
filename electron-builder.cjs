const path = require("node:path");

module.exports = {
  appId: "com.scenelab.desktop",
  productName: "SceneLab",
  electronVersion: require("electron/package.json").version,
  // Windows uses the local runtime; macOS downloads the requested architecture.
  ...(process.platform === "win32"
    ? { electronDist: path.join(__dirname, "node_modules/electron/dist") }
    : {}),
  directories: {
    app: "build/app",
    output: "release/build",
    buildResources: "build/resources",
  },
  asar: true,
  npmRebuild: false,
  files: ["dist/**/*", "electron/**/*", "package.json"],
  win: {
    extraFiles: [
      { from: "docs/AUTO_DEPLOY.md", to: "AUTO_DEPLOY.md" },
      { from: "docs/REPORT_PACKAGE_FORMAT.md", to: "技术报告包格式说明.md" },
      { from: "output/pdf/SceneLab_v1.4_使用说明.pdf", to: "使用说明.pdf" },
      { from: "docs/先读我.txt", to: "先读我.txt" },
      { from: "docs/v1.4-更新说明.txt", to: "v1.4-更新说明.txt" },
      { from: "docs/v1.4.1-更新说明.md", to: "v1.4.1-更新说明.md" },
      { from: "build/resources/THIRD-PARTY-NOTICES.txt", to: "THIRD-PARTY-NOTICES.txt" },
      { from: "examples", to: "示例相机参数" },
    ],
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "zip", arch: ["x64"] },
    ],
    executableName: "SceneLab",
    icon: "build/resources/icon.ico",
    artifactName: "SceneLab-${version}-Windows-${arch}.zip",
  },
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.productivity",
    minimumSystemVersion: "13.0.0",
    icon: "electron/icon.png",
    artifactName: "SceneLab-${version}-macOS-${arch}.${ext}",
    // Ad-hoc signing preserves bundle integrity; this is not Developer ID signing.
    sign: "scripts/sign-mac.cjs",
    hardenedRuntime: false,
    notarize: false,
    extraResources: [
      { from: "docs/AUTO_DEPLOY.md", to: "AUTO_DEPLOY.md" },
      { from: "docs/macOS-使用说明.html", to: "macOS-使用说明.html" },
      { from: "docs/REPORT_PACKAGE_FORMAT.md", to: "技术报告包格式说明.md" },
      { from: "build/resources/THIRD-PARTY-NOTICES.txt", to: "THIRD-PARTY-NOTICES.txt" },
      { from: "examples", to: "示例相机参数" },
    ],
  },
  dmg: {
    title: "SceneLab ${version}",
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
    window: { width: 540, height: 380 },
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "SceneLab",
    uninstallDisplayName: "SceneLab v1.4",
    deleteAppDataOnUninstall: false,
    runAfterFinish: false,
    installerLanguages: ["zh_CN", "en_US"],
    language: "2052",
    artifactName: "SceneLab-${version}-Setup-${arch}.exe",
  },
};
