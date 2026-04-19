// Add shebang + chmod +x to dist/bin/logex.js so `npm install -g` works.
import { readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";

const target = "dist/bin/logex.js";

if (!existsSync(target)) {
  console.error(`[postbuild-cli] ${target} not found. Did tsc run?`);
  process.exit(1);
}

const src = readFileSync(target, "utf-8");
const SHEBANG = "#!/usr/bin/env node\n";
const withShebang = src.startsWith("#!")
  ? src
  : SHEBANG + src;
writeFileSync(target, withShebang);
chmodSync(target, 0o755);
console.log(`[postbuild-cli] shebang + chmod applied to ${target}`);
