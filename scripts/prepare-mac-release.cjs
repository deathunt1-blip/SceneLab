const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const version = require(path.join(root, "package.json")).version;
const dir = path.join(root, "release/mac-distribution");
const files = ["arm64", "x64"].flatMap(arch => ["dmg", "zip"].map(ext => `SceneLab-${version}-macOS-${arch}.${ext}`));
fs.mkdirSync(dir, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, "release/build", file), path.join(dir, file));
const guide = `SceneLab-${version}-macOS-Guide-ZH.html`;
fs.copyFileSync(path.join(root, "docs/macOS-使用说明.html"), path.join(dir, guide));
const readme = "READ-ME-macOS-ZH.txt";
fs.copyFileSync(path.join(root, "docs/macOS-先读我.txt"), path.join(dir, readme));
files.push(guide, readme);
const hashes = files.map(file => `${crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("hex")}  ${file}`);
fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), hashes.join("\n") + "\n");
const entries = [...files, "SHA256SUMS.txt"].map(name => ({
  name,
  size: fs.statSync(path.join(dir, name)).size,
  digest: "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex"),
}));
// The expected inventory stays outside the directory uploaded to the release.
fs.writeFileSync(path.join(root, "release/mac-inventory.json"), JSON.stringify(entries, null, 2));
assert.equal(entries.length, 7);
console.log(hashes.join("\n"));
