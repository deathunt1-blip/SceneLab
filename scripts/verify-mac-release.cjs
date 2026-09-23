const fs = require("node:fs");
const assert = require("node:assert/strict");
const expected = JSON.parse(fs.readFileSync("release/mac-inventory.json", "utf8"));
const release = JSON.parse(fs.readFileSync("release/mac-uploaded.json", "utf8"));
const assets = JSON.parse(fs.readFileSync("release/mac-uploaded-assets.json", "utf8"));
const version = require("../package.json").version;
assert.equal(release.tag_name, `v${version}`);
assert.equal(release.draft, true, "Only verify our unpublished draft");
assert.equal(assets.length, expected.length);
for (const file of expected) {
  const remote = assets.find(asset => asset.name === file.name);
  assert.ok(remote, `Missing ${file.name}`);
  assert.equal(remote.state, "uploaded");
  assert.equal(remote.size, file.size);
  assert.equal(remote.digest, file.digest, `SHA-256 mismatch: ${file.name}`);
  console.log(`Verified ${file.name}: ${file.digest}`);
}
