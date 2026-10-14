import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Sandbox } from "../core/Sandbox.js";

export type ExportFormat = "zip" | "patch" | "bundle";

export class Exporter {
  async export(sandbox: Sandbox, format: ExportFormat, out?: string): Promise<string> {
    const state = sandbox.store.load();
    const file = out ? resolve(out) : this.defaultFile(sandbox, format);
    await this.write(sandbox, format, file, state.importedCommit);
    sandbox.store.save({
      ...state,
      exportedHead: (await sandbox.git.run(["rev-parse", "HEAD"])).trim(),
    });
    return file;
  }

  private defaultFile(sandbox: Sandbox, format: ExportFormat): string {
    mkdirSync(sandbox.paths.exports, { recursive: true });
    return join(
      sandbox.paths.exports,
      `${sandbox.paths.name}-${new Date().toISOString().replaceAll(":", "-")}.${format}`,
    );
  }

  private async write(
    sandbox: Sandbox,
    format: ExportFormat,
    file: string,
    base: string,
  ): Promise<void> {
    if (format === "zip") await sandbox.git.run(["archive", "--format=zip", "-o", file, "HEAD"]);
    if (format === "bundle") await sandbox.git.run(["bundle", "create", file, "--all"]);
    if (format === "patch")
      writeFileSync(file, await sandbox.git.run(["format-patch", "--stdout", `${base}..HEAD`]));
  }
}
