import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createAIService, trustedSender, ENDPOINT } = require("../electron/ai.cjs");
const directories: string[] = [];
const key = "sk-" + "unit-test".repeat(4);
function setup(fetch = vi.fn()) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "scenelab-ai-test-"));
  directories.push(directory);
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from([...s].reverse().join("")),
    decryptString: (b: Buffer) => [...b.toString()].reverse().join(""),
  };
  return {
    directory,
    safeStorage,
    fetch,
    service: createAIService({ directory, safeStorage, fetch }),
  };
}
afterEach(() =>
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);
describe("main-process AI boundary", () => {
  it("starts disabled, stores only OS-encrypted credentials and never returns the key", () => {
    const { directory, service, fetch } = setup();
    expect(service.status()).toEqual({
      enabled: false,
      hasKey: false,
      model: "kimi-k2.6",
    });
    service.configure({ enabled: true, model: "kimi-k2.6", key });
    expect(readFileSync(path.join(directory, "ai-config.json"), "utf8")).not.toContain(
      key,
    );
    expect(JSON.stringify(service.status())).not.toContain(key);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      service.configure({ enabled: false, model: "kimi-k2.6", remove: true }),
    ).toEqual({ enabled: false, hasKey: false, model: "kimi-k2.6" });
  });
  it("refuses plaintext storage backends and invalid config", () => {
    const { directory, safeStorage } = setup();
    const service = createAIService({
      directory,
      safeStorage: { ...safeStorage, isEncryptionAvailable: () => false },
      fetch: vi.fn(),
    });
    expect(() => service.configure({ enabled: true, key, model: "kimi-k2.6" })).toThrow(
      "aiEncryption",
    );
    expect(() =>
      service.configure({ enabled: true, key, model: "https://evil.example" }),
    ).toThrow("aiInvalidConfig");
  });
  it("sends minimal constraints to a fixed official endpoint with bounded JSON-only output", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: '{"count":16}' } }],
          }),
        ),
    );
    const { service } = setup(fetch);
    service.configure({ enabled: true, model: "kimi-k2.6", key });
    const result = await service.request("parse", {
      text: "16 cameras",
      current: { count: 8, secret: "do-not-send", objects: [1] },
      models: [{ id: "camera", name: "Camera", notes: "private-notes" }],
    });
    expect(result).toEqual({ content: '{"count":16}' });
    const [url, request] = fetch.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; redirect: string; body: string },
    ];
    expect(url).toBe(ENDPOINT);
    expect(url).toBe("https://api.moonshot.cn/v1/chat/completions");
    expect(request.redirect).toBe("error");
    expect(request.headers.Authorization).toBe(`Bearer ${key}`);
    expect(request.body).not.toContain(key);
    expect(request.body).not.toContain("do-not-send");
    expect(request.body).not.toContain("private-notes");
    expect(JSON.parse(request.body).response_format).toEqual({ type: "json_object" });
  });
  it("redacts server errors and does not expose responses echoing credentials", async () => {
    const fetch = vi.fn(
        async () => new Response(key + " sensitive server error", { status: 401 }),
      ),
      { service } = setup(fetch);
    service.configure({ enabled: true, model: "kimi-k2.6", key });
    expect(
      await service.request("explain", { facts: [{ id: "a", text: "Coverage 80%" }] }),
    ).toEqual({ error: "aiHTTP401" });
  });
  it("does not accept arbitrary tools, oversized requests, or hidden project fields", async () => {
    const { service, fetch } = setup();
    service.configure({ enabled: true, model: "kimi-k2.6", key });
    expect(await service.request("fetch", { url: "http://evil.example" })).toEqual({
      error: "aiInvalidResponse",
    });
    expect(
      await service.request("parse", { text: "a".repeat(4001), current: {}, models: [] }),
    ).toEqual({ error: "aiInvalidResponse" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cancels in-flight requests and prevents concurrent API spend", async () => {
    const fetch = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const { service } = setup(fetch);
    service.configure({ enabled: true, model: "kimi-k2.6", key });
    const request = service.request("explain", { facts: [{ id: "a", text: "a" }] });
    expect(await service.request("explain", { facts: [{ id: "b", text: "b" }] })).toEqual(
      { error: "aiBusy" },
    );
    service.cancel();
    expect(await request).toEqual({ error: "aiNetwork" });
  });
  it("rejects foreign windows, subframes and lookalike origins", () => {
    const frame = {},
      contents = { mainFrame: frame, getURL: () => "http://127.0.0.1:5178/" },
      window = { webContents: contents };
    expect(
      trustedSender(
        { sender: contents, senderFrame: frame },
        window,
        "http://127.0.0.1:5178",
      ),
    ).toBe(true);
    expect(
      trustedSender(
        { sender: contents, senderFrame: {} },
        window,
        "http://127.0.0.1:5178",
      ),
    ).toBe(false);
    expect(
      trustedSender(
        { sender: { ...contents }, senderFrame: frame },
        window,
        "http://127.0.0.1:5178",
      ),
    ).toBe(false);
    contents.getURL = () => "http://127.0.0.1:5178.evil.example/";
    expect(
      trustedSender(
        { sender: contents, senderFrame: frame },
        window,
        "http://127.0.0.1:5178",
      ),
    ).toBe(false);
  });
});
