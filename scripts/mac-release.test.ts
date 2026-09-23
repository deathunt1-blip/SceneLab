import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
function verify(change: (release: any) => void = () => {}) {
  const tmpRoot = path.resolve(os.tmpdir());
  const dir = mkdtempSync(path.join(tmpRoot, "scenelab-release-test-"));
  const expected = Array.from({ length: 7 }, (_, i) => ({ name: `asset-${i}`, size: 100 + i, digest: `sha256:${"a".repeat(64)}` }));
  const release = { tag_name: `v${version}`, draft: true, assets: expected.map(file => ({ ...file, state: "uploaded" })) };
  change(release);
  try {
    mkdirSync(path.join(dir, "release"));
    writeFileSync(path.join(dir, "release/mac-inventory.json"), JSON.stringify(expected));
    writeFileSync(path.join(dir, "release/mac-uploaded.json"), JSON.stringify(release));
    writeFileSync(path.join(dir, "release/mac-uploaded-assets.json"), JSON.stringify(release.assets));
    return spawnSync(process.execPath, [path.join(root, "scripts/verify-mac-release.cjs")], { cwd: dir, encoding: "utf8" });
  } finally {
    if (!dir.startsWith(tmpRoot + path.sep) || !path.basename(dir).startsWith("scenelab-release-test-")) throw new Error("Unsafe test cleanup path");
    rmSync(dir, { recursive: true, force: true });
  }
}
it("accepts all seven completed attachments regardless of API order", () => {
  expect(verify(release => release.assets.reverse()).status).toBe(0);
});
it("blocks publishing when an uploaded byte digest differs", () => {
  const result = verify(release => { release.assets[0].digest = `sha256:${"b".repeat(64)}`; });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("SHA-256 mismatch");
});
it("blocks an incomplete upload inventory", () => {
  expect(verify(release => release.assets.pop()).status).not.toBe(0);
});
it("refuses an already published release", () => {
  expect(verify(release => { release.draft = false; }).status).not.toBe(0);
});
it("refuses a different version's release", () => {
  expect(verify(release => { release.tag_name = "v0.0.0"; }).status).not.toBe(0);
});
