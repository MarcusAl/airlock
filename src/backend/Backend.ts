export type NetMode = "none" | "allowlist" | "open";

export interface NetPolicy {
  readonly mode: NetMode;
  readonly allow: readonly string[];
}

export type ServiceName = "postgres" | "redis";

export interface ImageRef {
  readonly tag: string;
  readonly dockerfile: string;
  readonly refresh?: boolean;
}

export interface SandboxSpec {
  readonly name: string;
  readonly image: ImageRef;
  readonly workspace: string;
  readonly env: Readonly<Record<string, string>>;
  readonly workspaceVolumes: readonly string[];
  readonly policy: NetPolicy;
  readonly ports: readonly number[];
  readonly services: readonly ServiceName[];
}

export interface ExecRequest {
  readonly name: string;
  readonly command: string;
  readonly cwd: string;
  readonly envKeys: readonly string[];
  readonly tty: boolean;
}

export interface SandboxStatus {
  readonly name: string;
  readonly running: boolean;
}

export interface CloneSource {
  readonly url: string;
  readonly localPath?: string;
}

export interface Cloner {
  clone(source: CloneSource, destination: string): Promise<void>;
}

export interface Freezer {
  freeze<T>(name: string, work: () => Promise<T>): Promise<T>;
}

export interface Backend extends Freezer {
  up(spec: SandboxSpec): Promise<void>;
  resume(spec: SandboxSpec): Promise<boolean>;
  exec(request: ExecRequest): Promise<number>;
  remove(name: string): Promise<void>;
  list(): Promise<SandboxStatus[]>;
}
