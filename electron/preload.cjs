const { ipcRenderer } = require("electron");
// Sandboxed preloads cannot require local modules. Keep this small allowlist
// aligned with platform.cjs; expose no Node or IPC API to the page.
const editKeys = {
  undo: ["z", false],
  redo: ["z", true],
  cut: ["x", false],
  copy: ["c", false],
  paste: ["v", false],
  selectAll: ["a", false],
};
ipcRenderer.on("scenelab:edit", (_event, command) => {
  if (!Object.hasOwn(editKeys, command)) return;
  const target = document.activeElement || document.body;
  if (target.closest("input,textarea,select,[contenteditable]")) {
    ipcRenderer.send("scenelab:native-edit", command);
    return;
  }
  const [key, shiftKey] = editKeys[command];
  // Existing scene and sidebar handlers retain their dialog/focus guards.
  const handled = !target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: `Key${key.toUpperCase()}`,
      metaKey: true,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
  if (!handled) ipcRenderer.send("scenelab:native-edit", command);
});
