/**
 * A single path or array of glob patterns, or an object with path(s) and optional chmod.
 */
export type FileEntry =
  | string
  | string[]
  | { path: string | string[]; chmod?: string };

/**
 * Options passed to build().
 */
export interface BuildOptions {
  name: string;
  version: string;
  summary?: string;
  description?: string;
  files: Record<string, FileEntry>;
  installScript?: string[];
  release?: number;
  url?: string;
  license?: string;
  group?: string;
  requires?: string[];
  cwd?: string;
  rpmRootDir?: string;
  buildArch?: string;
  /** Path to a custom spec file (relative to `cwd` or absolute). Same placeholders as built-in: {{name}}, {{version}}, etc. */
  specFile?: string;
  /** Inline spec template string. Ignored if `specFile` is set. */
  specTemplate?: string;
  verbose?: boolean;
}

/**
 * Resolved RPM spec metadata (internal).
 */
export interface RpmSpec {
  summary: string;
  description: string;
  files: string[];
  version: string;
  release: number;
  sources: string[];
  url: string;
  name: string;
  license: string;
  group: string;
  requires: string[];
}

/**
 * Result of rpmbuild invocation.
 */
export interface RpmResult {
  rpm: string | null;
  srpm: string | null;
}

/**
 * Full context returned from build().
 */
export interface BuildContext {
  spec: RpmSpec;
  specTemplate: string;
  buildArch: string;
  installScript: string[];
  cwd: string;
  fullname: string;
  _files: Record<string, FileEntry>;
  _sources: string[];
  verbose: boolean;
  rpmRootDir: string;
  specFileName?: string;
  tgzDir?: string;
  rpms?: RpmResult;
}
