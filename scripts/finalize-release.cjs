const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const target = path.join(root, "release/SceneLab-v1.4");
fs.mkdirSync(target, { recursive: true });
const files = [
  ["release/build/SceneLab-1.4.0-Windows-x64.zip", "SceneLab-1.4.0-Windows-x64.zip"],
  ["release/build/SceneLab-1.4.0-Setup-x64.exe", "SceneLab-1.4.0-Setup-x64.exe"],
  ["output/pdf/SceneLab_v1.4_使用说明.pdf", "SceneLab_v1.4_使用说明.pdf"],
  ["docs/先读我.txt", "先读我.txt"],
  ["docs/v1.4-更新说明.txt", "v1.4-更新说明.txt"],
];
const sums = [];
for (const [source, name] of files) {
  const destination = path.join(target, name);
  fs.copyFileSync(path.join(root, source), destination);
  const sha = crypto.createHash("sha256").update(fs.readFileSync(destination)).digest("hex");
  sums.push(`${sha}  ${name}`);
  console.log(`${name}  ${(fs.statSync(destination).size / 1024 / 1024).toFixed(1)} MiB`);
}
fs.writeFileSync(path.join(target, "SHA256SUMS.txt"), sums.join("\r\n") + "\r\n");
console.log(target);
