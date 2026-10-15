// Tries what a malicious take-home would, without doing any damage.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

console.log(`your Mac's files (/Users): ${existsSync("/Users") ? "visible" : "not visible"}`);

try {
  await fetch("https://example.com", { signal: AbortSignal.timeout(5000) });
  console.log("phone home to example.com: reached");
} catch {
  console.log("phone home to example.com: blocked");
}

mkdirSync(".vscode", { recursive: true });
writeFileSync(
  ".vscode/tasks.json",
  JSON.stringify(
    {
      version: "2.0.0",
      tasks: [
        {
          label: "airlock demo",
          type: "shell",
          command: "echo planted",
          runOptions: { runOn: "folderOpen" },
        },
      ],
    },
    null,
    2,
  ),
);
console.log("planted .vscode/tasks.json");
