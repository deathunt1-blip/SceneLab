const path = require("node:path");

const editKeys = Object.freeze({
  undo: ["z", false],
  redo: ["z", true],
  cut: ["x", false],
  copy: ["c", false],
  paste: ["v", false],
  selectAll: ["a", false],
});

function guidePath({ platform, packaged, resourcesPath, exePath, sourceDir }) {
  if (platform === "darwin") {
    return packaged
      ? path.join(resourcesPath, "macOS-使用说明.html")
      : path.resolve(sourceDir, "../docs/macOS-使用说明.html");
  }
  return packaged
    ? path.join(path.dirname(exePath), "使用说明.pdf")
    : path.resolve(sourceDir, "../output/pdf/SceneLab_v1.4_使用说明.pdf");
}

function menuTemplate(platform, { openGuide, showAbout, edit }) {
  const help = {
    label: "帮助",
    submenu: [
      { label: "使用说明", accelerator: "F1", click: openGuide },
      { label: "关于 SceneLab", click: showAbout },
    ],
  };
  if (platform !== "darwin") return [help];
  return [
    {
      label: "SceneLab",
      submenu: [
        { label: "关于 SceneLab", click: showAbout },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        ["undo", "撤销"],
        ["redo", "重做"],
        ["cut", "剪切文本"],
        ["copy", "复制"],
        ["paste", "粘贴"],
        ["selectAll", "全选"],
      ].map(([command, label]) => ({
        label,
        accelerator: `Command+${editKeys[command][1] ? "Shift+" : ""}${editKeys[command][0].toUpperCase()}`,
        click: () => edit(command),
      })),
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "close" },
        { type: "separator" },
        { role: "front" },
      ],
    },
    help,
  ];
}

module.exports = { guidePath, menuTemplate, editKeys };
