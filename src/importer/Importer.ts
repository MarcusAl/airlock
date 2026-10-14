import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Backend, Cloner } from "../backend/Backend.js";
import { SandboxPaths } from "../core/SandboxPaths.js";
import { type SandboxState, StateStore } from "../core/StateStore.js";
import { AirlockError } from "../errors.js";
import { type Detected, detectPreset } from "../presets/detect.js";
import { Git } from "../process/Git.js";
import type { ProcessRunner } from "../process/ProcessRunner.js";
import type { Finding } from "../scan/rules.js";
import { Scanner } from "../scan/Scanner.js";
import { Neutraliser } from "./Neutraliser.js";

const HTTPS_URL = /^https:\/\//;
const FALLBACK: Detected = { preset: "node", version: "24" };

export const defaultName = (source: string): string =>
  basename(source.replace(/\/+$/, ""))
    .replace(/\.git$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 40);

export interface ImportResult {
  readonly state: SandboxState;
  readonly findings: Finding[];
  readonly moved: string[];
  readonly warnings: string[];
}

export class Importer {
  private readonly runner: ProcessRunner;
  private readonly scanner: Scanner;
  private readonly neutraliser: Neutraliser;

  private readonly backend: Backend;
  private readonly cloner: Cloner;

  constructor(deps: {
    runner: ProcessRunner;
    backend: Backend;
    cloner: Cloner;
    scanner?: Scanner;
    neutraliser?: Neutraliser;
  }) {
    this.runner = deps.runner;
    this.backend = deps.backend;
    this.cloner = deps.cloner;
    this.scanner = deps.scanner ?? new Scanner();
    this.neutraliser = deps.neutraliser ?? new Neutraliser();
  }

  async import(source: string, name: string): Promise<ImportResult> {
    const paths = SandboxPaths.for(name);
    if (existsSync(paths.dir)) throw new AirlockError(`sandbox "${name}" already exists`);
    await this.clearLeftovers(name, paths);
    mkdirSync(paths.workspace, { recursive: true });
    try {
      return await this.prepare(source, name, paths);
    } catch (error) {
      rmSync(paths.dir, { recursive: true, force: true });
      throw error;
    }
  }

  private async prepare(source: string, name: string, paths: SandboxPaths): Promise<ImportResult> {
    await this.fetch(source, paths);
    const git = new Git(paths.workspace, this.runner);
    await git.run(["config", "core.hooksPath", "/dev/null"]);
    const findings = this.scanner.scan(paths.workspace);
    const { moved } = await this.neutraliser.run(paths, "import");
    const { detected, warnings } = this.detect(paths);
    const head = (await git.run(["rev-parse", "HEAD"])).trim();
    const state = this.initialState(source, name, head, moved, detected);
    new StateStore(paths).save(state);
    return { state, findings, moved, warnings };
  }

  private async clearLeftovers(name: string, paths: SandboxPaths): Promise<void> {
    const owner = await this.backend.owner(name);
    if (owner && owner !== paths.dir && existsSync(owner)) {
      throw new AirlockError(
        `a sandbox named "${name}" already exists in ${owner}; pick another --name`,
      );
    }
    await this.backend.remove(name);
  }

  private async fetch(source: string, paths: SandboxPaths): Promise<void> {
    if (HTTPS_URL.test(source)) return this.cloner.clone({ url: source }, paths.workspace);
    const local = resolve(source);
    if (!existsSync(local)) {
      throw new AirlockError(`not an https URL or an existing path: ${source}`);
    }
    if (existsSync(`${local}/.git`)) {
      return this.cloner.clone({ url: "/src", localPath: local }, paths.workspace);
    }
    return this.copyPlainDirectory(local, paths);
  }

  private async copyPlainDirectory(local: string, paths: SandboxPaths): Promise<void> {
    cpSync(local, paths.workspace, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (src) => !/\/(node_modules|\.git)(\/|$)/.test(src),
    });
    if (readdirSync(paths.workspace).length === 0) {
      throw new AirlockError("source directory is empty");
    }
    const git = new Git(paths.workspace, this.runner);
    await git.run(["init", "-q"]);
    await git.run(["config", "core.hooksPath", "/dev/null"]);
    await git.run(["add", "-A"]);
    await git.run([
      "-c",
      "user.name=airlock",
      "-c",
      "user.email=airlock@localhost",
      "commit",
      "-qm",
      "airlock: import",
    ]);
  }

  private detect(paths: SandboxPaths): { detected: Detected; warnings: string[] } {
    try {
      return { detected: detectPreset(paths.workspace), warnings: [] };
    } catch (error) {
      if (!(error instanceof AirlockError)) throw error;
      const warning = "unknown stack; defaulted to node 24; pass --preset on run";
      return { detected: { ...FALLBACK }, warnings: [warning] };
    }
  }

  private initialState(
    source: string,
    name: string,
    head: string,
    moved: string[],
    detected: Detected,
  ): SandboxState {
    return {
      name,
      source,
      importedCommit: head,
      preset: detected.preset,
      version: detected.version,
      net: "none",
      allow: [],
      ports: [],
      services: [],
      quarantined: moved,
      createdAt: new Date().toISOString(),
    };
  }
}
