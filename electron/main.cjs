const { app, BrowserWindow, session, shell, Menu } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
let server;
let mainWindow;
app.setName("SceneLab");
app.setAppUserModelId("com.scenelab.desktop");
// Keep the existing profile and origin when upgrading from Camera Planner.
// Release verification uses an isolated profile and port supplied by the test runner.
const profile = process.env.SCENELAB_USER_DATA_DIR;
if (profile && !path.isAbsolute(profile)) throw new Error("Profile path must be absolute");
app.setPath("userData", profile || path.join(app.getPath("appData"), "Camera Planner"));
const port = profile ? Number(process.env.SCENELAB_PORT || 5179) : 5178;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local port");
const openGuide = () => shell.openPath(app.isPackaged
  ? path.join(path.dirname(app.getPath("exe")), "使用说明.pdf")
  : path.resolve(__dirname, "../output/pdf/SceneLab_v1.2_使用说明.pdf"));
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
if (ownsInstance)
  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "帮助", submenu: [
        { label: "使用说明", accelerator: "F1", click: openGuide },
        { label: "关于SceneLab", click: () => require("electron").dialog.showMessageBox(mainWindow, {
          type: "info", title: "SceneLab", message: "SceneLab v1.2",
          detail: "光学动捕相机部署与理论精度仿真工作台\n使用说明：F1\n理论仿真结果需结合现场标定与实测验证。",
        }) },
      ] },
    ]));
    const root = path.resolve(__dirname, "../dist");
    server = http.createServer((req, res) => {
      let file;
      try {
        file = path.resolve(
          root,
          "." +
            decodeURIComponent(new URL(req.url, "http://localhost").pathname),
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
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
        });
        res.end(data);
      });
    });
    // Stable origin preserves local project/library storage between launches.
    server.listen(port, "127.0.0.1", () => {
      const origin = `http://127.0.0.1:${port}`;
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      const win = new BrowserWindow({
        width: 1560,
        height: 980,
        minWidth: 1080,
        minHeight: 720,
        title: "SceneLab v1.2",
        icon: path.join(__dirname, "icon.png"),
        backgroundColor: "#172b30",
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      mainWindow = win;
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(origin + "/")) event.preventDefault();
      });
      win.loadURL(origin);
    });
    server.on("error", (err) => {
      require("electron").dialog.showErrorBox("SceneLab", err.code === "EADDRINUSE"
        ? "本地运行端口已被占用。请先关闭已打开的 Camera Planner 或SceneLab窗口，再重新启动。"
        : err.message);
      app.quit();
    });
  });
app.on("window-all-closed", () => {
  server?.close();
  app.quit();
});
