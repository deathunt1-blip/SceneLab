const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const staging = path.join(root, "build/app");
// Only the isolated staging directory is replaced. Never copy working profiles.
if (path.relative(root, staging) !== path.join("build", "app")) throw new Error("Unsafe staging path");
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
for (const dir of ["dist", "electron"]) fs.cpSync(path.join(root, dir), path.join(staging, dir), { recursive: true });
const pkg = require(path.join(root, "package.json"));
fs.writeFileSync(path.join(staging, "package.json"), JSON.stringify({
  name: "scenelab", version: pkg.version, description: pkg.description,
  main: "electron/main.cjs", author: "SceneLab", private: true,
}, null, 2));
const packages = ["react", "react-dom", "scheduler", "three", "zustand", "lucide-react",
  "@fontsource/dm-sans", "@fontsource/ibm-plex-mono"];
let notices = "SceneLab v1.2 - Third-party notices\n\nElectron and Chromium licenses are provided separately in this folder.\n\n";
for (const name of packages) {
  const dir = path.join(root, "node_modules", name);
  const info = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const licenses = fs.readdirSync(dir).filter(f => /^(license|ofl|copying)/i.test(f));
  if (!licenses.length) throw new Error(`Missing license: ${name}`);
  notices += `\n${"=".repeat(72)}\n${name} ${info.version}\n${"=".repeat(72)}\n`;
  for (const file of licenses) notices += fs.readFileSync(path.join(dir, file), "utf8") + "\n";
}
fs.mkdirSync(path.join(root, "build/resources"), { recursive: true });
fs.writeFileSync(path.join(root, "build/resources/THIRD-PARTY-NOTICES.txt"), notices);
for (const file of ["output/pdf/SceneLab_v1.2_使用说明.pdf", "build/resources/icon.ico"]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Required release asset missing: ${file}`);
}
console.log(`Prepared SceneLab ${pkg.version}; application contains compiled UI and desktop host only.`);
