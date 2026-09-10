export type HostErrorCode =
  | "invalid_path"
  | "outside_workspace"
  | "not_found"
  | "permission_denied"
  | "conflict"
  | "timeout"
  | "cancelled"
  | "output_limit_exceeded"
  | "unsupported"
  | "internal_error";

export type HostFailure = Readonly<{
  ok: false;
  code: HostErrorCode;
  message: string;
  retryable: boolean;
}>;

export type HostSuccess<T> = Readonly<{ ok: true; value: T }>;
export type HostResult<T> = HostSuccess<T> | HostFailure;
export type WorkspaceRequest = Readonly<{ workspaceId: string }>;
export type WorkspacePathRequest = WorkspaceRequest & Readonly<{ path: string }>;

export type TruncatedText = Readonly<{
  content: string;
  encoding: "utf-8" | "utf-16le" | "binary" | "unknown";
  bytesRead: number;
  truncated: boolean;
  contentHash?: string;
}>;

export interface FileSystemPort {
  list(input: WorkspacePathRequest & Readonly<{ depth: number; limit: number }>): Promise<
    HostResult<readonly Readonly<{ path: string; kind: "file" | "directory" | "symlink"; size?: number }>[]>
  >;
  read(input: WorkspacePathRequest & Readonly<{ byteLimit: number }>): Promise<HostResult<TruncatedText>>;
  search(
    input: WorkspaceRequest & Readonly<{ query: string; paths: readonly string[]; resultLimit: number; byteLimit: number }>,
  ): Promise<HostResult<readonly Readonly<{ path: string; line: number; preview: string }>[]>>;
}

export interface GitPort {
  status(input: WorkspaceRequest): Promise<HostResult<TruncatedText>>;
  diff(
    input: WorkspaceRequest & Readonly<{ paths: readonly string[]; staged: boolean; byteLimit: number }>,
  ): Promise<HostResult<TruncatedText>>;
}

export interface ShellPort {
  run(
    input: WorkspaceRequest & Readonly<{
      command: string;
      cwd: string;
      timeoutMs: number;
      outputLimit: number;
      environmentAllowlist: readonly string[];
      cancellation: "process-tree";
      signal?: AbortSignal;
    }>,
  ): Promise<HostResult<Readonly<{
    exitCode: number | null;
    stdout: TruncatedText;
    stderr: TruncatedText;
    timedOut: boolean;
    cancelled: boolean;
  }>>>;
}

export interface PatchPort {
  preview(
    input: WorkspaceRequest & Readonly<{ patch: string; expectedBaseHash?: string }>,
  ): Promise<HostResult<Readonly<{ previewId: string; diffArtifactId: string; affectedPaths: readonly string[] }>>>;
  apply(
    input: WorkspaceRequest & Readonly<{ previewId: string; idempotencyKey: string }>,
  ): Promise<HostResult<Readonly<{ beforeHash: string; afterHash: string; readbackArtifactId: string }>>>;
  readback(
    input: WorkspaceRequest & Readonly<{ idempotencyKey: string }>,
  ): Promise<HostResult<Readonly<{ outcome: "applied" | "not_applied" | "unknown"; afterHash?: string }>>>;
}

export interface WorkspaceHostPort {
  readonly files: FileSystemPort;
  readonly git: GitPort;
  readonly shell: ShellPort;
  readonly patch: PatchPort;
}
