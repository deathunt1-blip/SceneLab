const { app, BrowserWindow, session, shell, Menu, ipcMain, dialog } = require("electron");
const { guidePath, menuTemplate, editKeys } = require("./platform.cjs");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
let server;
let mainWindow;
app.setName("SceneLab");
if (process.platform === "win32") app.setAppUserModelId("com.scenelab.desktop");
// Keep the existing profile and origin when upgrading from Camera Planner.
// Release verification uses an isolated profile and port supplied by the test runner.
const profile = process.env.SCENELAB_USER_DATA_DIR;
if (profile && !path.isAbsolute(profile))
  throw new Error("Profile path must be absolute");
app.setPath("userData", profile || path.join(app.getPath("appData"), "Camera Planner"));
const port = profile ? Number(process.env.SCENELAB_PORT || 5179) : 5178;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local port");
const origin = `http://127.0.0.1:${port}`;
const openGuide = async () => {
  const error = await shell.openPath(
    guidePath({
      platform: process.platform,
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      exePath: app.getPath("exe"),
      sourceDir: __dirname,
    }),
  );
  if (error) dialog.showErrorBox("SceneLab 使用说明", error);
};
function createWindow() {
  const win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    title: `SceneLab v${app.getVersion()}`,
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#172b30",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...(process.platform === "darwin"
        ? { preload: path.join(__dirname, "preload.cjs") }
        : {}),
    },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin + "/")) event.preventDefault();
  });
  // Opt-in release checks run only with a separate profile, never user data.
  if (profile && process.env.SCENELAB_SMOKE_TEST === "1") {
    win.webContents.on("did-finish-load", async () => {
      try {
        const result = await win.webContents
          .executeJavaScript(`new Promise((resolve, reject) => {
          const started = Date.now();
          const timer = setInterval(() => {
            const canvas = document.querySelector('canvas');
            if (document.querySelector('#root button') && canvas && canvas.width > 0) {
              clearInterval(timer); resolve({ title: document.title, canvas: true, buttons: document.querySelectorAll('button').length });
            } else if (Date.now() - started > ${process.env.SCENELAB_SMOKE_EXECUTION === "rosetta" ? 120000 : 45000}) { clearInterval(timer); reject(new Error('Scene did not render')); }
          }, 250);
        })`);
        fs.writeFileSync(
          path.join(profile, "smoke.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
        fs.writeFileSync(path.join(profile, "smoke-result.json"), JSON.stringify(result));
      } catch (error) {
        console.error("SceneLab smoke failed:", error);
        app.exit(1);
      }
    });
  }
  win.loadURL(origin);
}
function restoreWindow() {
  if (!mainWindow && server?.listening) createWindow();
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on("second-instance", restoreWindow);
app.on("activate", restoreWindow);
ipcMain.on("scenelab:native-edit", (event, command) => {
  if (
    event.sender !== mainWindow?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  )
    return;
  if (
    !event.sender.getURL().startsWith(origin + "/") ||
    !Object.hasOwn(editKeys, command)
  )
    return;
  event.sender[command]();
});
if (ownsInstance)
  app.whenReady().then(() => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        menuTemplate(process.platform, {
          openGuide,
          edit: (command) => mainWindow?.webContents.send("scenelab:edit", command),
          showAbout: () => {
            const options = {
              type: "info",
              title: "SceneLab",
              message: `SceneLab v${app.getVersion()}`,
              detail:
                "光学动捕相机部署与理论精度仿真工作台\n使用说明：F1\n理论仿真结果需结合现场标定与实测验证。",
            };
            return mainWindow
              ? dialog.showMessageBox(mainWindow, options)
              : dialog.showMessageBox(options);
          },
        }),
      ),
    );
    const root = path.resolve(__dirname, "../dist");
    server = http.createServer((req, res) => {
      let file;
      try {
        file = path.resolve(
          root,
          "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
        );
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (file === root) file = path.join(root, "index.html");
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
      };
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": types[path.extname(file)] || "application/octet-stream",
        });
        res.end(data);
      });
    });
    // Stable origin preserves local project/library storage between launches.
    server.listen(port, "127.0.0.1", () => {
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      createWindow();
    });
    server.on("error", (err) => {
      require("electron").dialog.showErrorBox(
        "SceneLab",
        err.code === "EADDRINUSE"
          ? "本地运行端口已被占用。请先关闭已打开的 Camera Planner 或SceneLab窗口，再重新启动。"
          : err.message,
      );
      app.quit();
    });
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => server?.close());
