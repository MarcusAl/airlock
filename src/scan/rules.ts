import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { isQuarantined } from "../importer/quarantine.js";
import { escapesRoot, type RepoFile } from "./walk.js";

export type Severity = "high" | "medium";

export interface Finding {
  readonly rule: string;
  readonly severity: Severity;
  readonly path: string;
  readonly detail: string;
}

export interface Rule {
  readonly id: string;
  check(file: RepoFile): Finding[];
}

const MAX_READ = 2_000_000;
const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare", "prepublish"];
const SOURCE_EXT = /\.(c?m?[jt]sx?|py|rb|go|sh)$/;
const EDITOR_LOADED =
  /^(\.eslintrc\.c?js|\.babelrc\.js|\.prettierrc\.c?js|(eslint|vite|vitest|jest|webpack|next|tailwind|postcss|babel|prettier|rollup|svelte|nuxt|astro)\.config\.[cm]?[jt]s)$/;
const EXECUTES =
  /child_process|\beval\s*\(|new Function\b|\bexecSync\b|\bspawn\s*\(|https?\.request|\bfetch\s*\(|base64/;
const BLOB = /[A-Za-z0-9+/]{400,}={0,2}/;
const NATIVE_EXT = /\.(node|so|dylib|dll|exe)$/;
const MAGIC = ["7f454c46", "cffaedfe", "cefaedfe", "cafebabe", "4d5a"];

const text = (file: RepoFile): string =>
  file.kind === "file" && file.size <= MAX_READ ? readFileSync(file.abs, "utf8") : "";

const finding = (rule: string, severity: Severity, file: RepoFile, detail: string): Finding[] => [
  { rule, severity, path: file.path, detail },
];

const scriptsOf = (file: RepoFile): Record<string, string> | undefined => {
  try {
    return JSON.parse(text(file) || "{}").scripts ?? {};
  } catch {
    return undefined;
  }
};

const lifecycleScripts: Rule = {
  id: "lifecycle-script",
  check: (file) => {
    if (file.kind !== "file" || posix.basename(file.path) !== "package.json") return [];
    const scripts = scriptsOf(file);
    if (!scripts) return finding("lifecycle-script", "medium", file, "unparseable package.json");
    const found = LIFECYCLE.filter((name) => scripts[name]);
    if (found.length === 0) return [];
    const detail = found.map((name) => `${name}: ${scripts[name]}`).join("; ");
    return finding("lifecycle-script", "high", file, detail);
  },
};

const editorAgentConfig: Rule = {
  id: "editor-agent-config",
  check: (file) =>
    file.kind !== "nested-git" && isQuarantined(file.path)
      ? finding("editor-agent-config", "medium", file, "editor/agent config; quarantined")
      : [],
};

const configExecutesCode: Rule = {
  id: "config-executes-code",
  check: (file) =>
    EDITOR_LOADED.test(posix.basename(file.path)) && EXECUTES.test(text(file))
      ? finding(
          "config-executes-code",
          "high",
          file,
          "config loaded by editor extensions runs code",
        )
      : [],
};

const encodedBlob: Rule = {
  id: "encoded-blob",
  check: (file) =>
    SOURCE_EXT.test(file.path) && !file.path.endsWith(".min.js") && BLOB.test(text(file))
      ? finding("encoded-blob", "medium", file, "long base64-like string; possible hidden payload")
      : [],
};

const nativeBinary: Rule = {
  id: "native-binary",
  check: (file) => {
    if (file.kind !== "file") return [];
    const head = file.size > 0 ? readFileSync(file.abs).subarray(0, 4).toString("hex") : "";
    return NATIVE_EXT.test(file.path) || MAGIC.some((m) => head.startsWith(m))
      ? finding("native-binary", "high", file, "committed native binary")
      : [];
  },
};

const symlinkEscape: Rule = {
  id: "symlink-escape",
  check: (file) =>
    escapesRoot(file)
      ? finding("symlink-escape", "high", file, `points outside the repo: ${file.linkTarget}`)
      : [],
};

const nestedGit: Rule = {
  id: "nested-git",
  check: (file) =>
    file.kind === "nested-git"
      ? finding("nested-git", "high", file, "nested git repository; host git could run its filters")
      : [],
};

export const DEFAULT_RULES: readonly Rule[] = [
  lifecycleScripts,
  editorAgentConfig,
  configExecutesCode,
  encodedBlob,
  nativeBinary,
  symlinkEscape,
  nestedGit,
];
