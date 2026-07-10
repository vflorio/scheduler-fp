import { execSync, spawn } from "node:child_process";
import { watch } from "node:fs";

const CONFIG_PATH = process.argv[2] ?? "config.example.json";
const CONFIG_FLAG = process.argv[3] === "--url" ? "--config-url" : "--config";
const SRC_DIR = "../src";
const CORE_SRC = "../../../packages/core/src";

let child = null;
let buildTimeout = null;
let restartTimeout = null;

const color = (colorCode) => (text) => `\x1b[${colorCode}m${text}\x1b[0m`;
const cyan = color("36");
const red = color("31");
const yellow = color("33");

function build() {
  console.log(cyan("[dev] Building..."));
  try {
    execSync("npx vite build", { stdio: "pipe" });
    console.log(cyan("[dev] Build OK"));
    return true;
  } catch (e) {
    console.error(red("[dev] Build FAILED"));
    console.error(e.stderr?.toString() ?? e.message);
    return false;
  }
}

function startProcess() {
  if (child) {
    child.kill("SIGTERM");
    child = null;
  }

  console.log(cyan(`[dev] Starting: node dist/index.js ${CONFIG_FLAG} ${CONFIG_PATH}`));
  child = spawn("node", ["dist/index.js", CONFIG_FLAG, CONFIG_PATH], { stdio: "inherit" });

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.log(yellow(`[dev] Process exited with code ${code}`));
    }
    child = null;
  });
}

function rebuild() {
  if (build()) startProcess();
}

function restart() {
  console.log(cyan("[dev] Config changed - restarting (no rebuild)"));
  startProcess();
}

function debounce(fn, key) {
  const timers = { build: buildTimeout, restart: restartTimeout };
  if (timers[key]) clearTimeout(timers[key]);
  const t = setTimeout(fn, 200);
  if (key === "build") buildTimeout = t;
  else restartTimeout = t;
}

// Watch sorgenti (src/ + core)
for (const dir of [SRC_DIR, CORE_SRC]) {
  try {
    watch(dir, { recursive: true }, (_, filename) => {
      if (!filename?.endsWith(".ts")) return;
      console.log(cyan(`[dev] Source changed: ${dir}/${filename}`));
      debounce(rebuild, "build");
    });
  } catch {
    // Ignora se la cartella non esiste
  }
}

// Watch config (solo restart, no rebuild)
watch(CONFIG_PATH, () => {
  debounce(restart, "restart");
});

// Cleanup
process.on("SIGINT", () => {
  if (child) child.kill("SIGTERM");
  process.exit(0);
});
process.on("SIGTERM", () => {
  if (child) child.kill("SIGTERM");
  process.exit(0);
});

// Avvio iniziale
rebuild();
