import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { guidePath, menuTemplate, editKeys } = require("../electron/platform.cjs");

describe("desktop platform integration", () => {
  it("loads the Mac guide from Resources, not beside the executable", () => {
    expect(
      guidePath({
        platform: "darwin",
        packaged: true,
        resourcesPath: "/Apps/SceneLab.app/Contents/Resources",
        exePath: "/Apps/SceneLab.app/Contents/MacOS/SceneLab",
      }),
    ).toBe(path.join("/Apps/SceneLab.app/Contents/Resources", "macOS-使用说明.html"));
  });
  it("retains the Windows guide location", () => {
    expect(
      guidePath({
        platform: "win32",
        packaged: true,
        exePath: path.resolve("SceneLab/SceneLab.exe"),
      }),
    ).toBe(path.resolve("SceneLab/使用说明.pdf"));
  });
  it("uses the checked-in Mac help for source launches", () => {
    expect(
      guidePath({
        platform: "darwin",
        packaged: false,
        sourceDir: path.resolve("electron"),
      }),
    ).toBe(path.resolve("docs/macOS-使用说明.html"));
  });
  it("routes Mac edit shortcuts to scene handlers instead of native text-only roles", () => {
    const edit = vi.fn();
    const menu = menuTemplate("darwin", { edit, openGuide: vi.fn(), showAbout: vi.fn() });
    expect(menu[0].submenu.some((item: { role: string }) => item.role === "quit")).toBe(
      true,
    );
    const submenu = menu[1].submenu;
    for (const [index, command] of Object.keys(editKeys).entries()) {
      expect(submenu[index].role).toBeUndefined();
      submenu[index].click();
      expect(edit).toHaveBeenLastCalledWith(command);
    }
    expect(submenu[1].accelerator).toBe("Command+Shift+Z");
    expect(menuTemplate("win32", {}).map((m: { label: string }) => m.label)).toEqual([
      "帮助",
    ]);
  });
});

function preload(editable: boolean, handled: boolean) {
  let receive: (event: unknown, command: string) => void;
  const send = vi.fn();
  const dispatchEvent = vi.fn(() => !handled);
  const target = { closest: () => editable, dispatchEvent };
  class KeyboardEvent {
    constructor(
      public type: string,
      public options: unknown,
    ) {}
  }
  vm.runInNewContext(readFileSync(path.resolve("electron/preload.cjs"), "utf8"), {
    require: () => ({
      ipcRenderer: {
        on: (_channel: string, fn: typeof receive) => {
          receive = fn;
        },
        send,
      },
    }),
    document: { activeElement: target, body: target },
    KeyboardEvent,
  });
  return { receive: (command: string) => receive({}, command), send, dispatchEvent };
}

describe("Mac edit routing", () => {
  it("keeps native copy/paste/undo within text fields", () => {
    const p = preload(true, false);
    for (const command of Object.keys(editKeys)) p.receive(command);
    expect(p.dispatchEvent).not.toHaveBeenCalled();
    expect(p.send.mock.calls.map((c) => c[1])).toEqual(Object.keys(editKeys));
  });
  it("dispatches cancellable Command shortcuts to selected scene objects exactly once", () => {
    const p = preload(false, true);
    p.receive("copy");
    expect(p.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "keydown",
        options: expect.objectContaining({
          key: "c",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      }),
    );
    expect(p.send).not.toHaveBeenCalled();
  });
  it("uses native text selection when the scene does not consume a command", () => {
    const p = preload(false, false);
    p.receive("selectAll");
    expect(p.send).toHaveBeenCalledWith("scenelab:native-edit", "selectAll");
  });
  it("ignores unknown commands and object prototype properties", () => {
    const p = preload(false, true);
    p.receive("reload");
    p.receive("constructor");
    p.receive("__proto__");
    expect(p.dispatchEvent).not.toHaveBeenCalled();
    expect(p.send).not.toHaveBeenCalled();
  });
});
