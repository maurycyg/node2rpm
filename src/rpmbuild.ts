import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import { glob } from "glob";
import * as xutil from "./util.js";
import type {
  BuildOptions,
  BuildContext,
  RpmSpec,
  FileEntry,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);
const SPEC_TEMPLATE = fs.readFileSync(path.join(__dirname, "../spec"), {
  encoding: "utf8",
});

function formatTemplate(
  template: string,
  args: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    args[key] !== undefined ? String(args[key]) : match,
  );
}

function createRpmSpec(opts: BuildOptions): RpmSpec {
  return {
    summary: opts.summary ?? "RPM Summary",
    description: opts.description ?? "RPM Description",
    files: [],
    version: opts.version ?? "0.0.1",
    release: opts.release ?? 1,
    sources: [],
    url: opts.url ?? "nourl",
    name: opts.name ?? "package",
    license: opts.license ?? "GPL+",
    group: opts.group ?? "Applications/Internet",
    requires: opts.requires ?? [],
  };
}

function getGlobBase(pattern: string): string {
  const globChars = ["*", "?", "[", "{"];
  let firstGlobIdx = pattern.length;
  for (const ch of globChars) {
    const idx = pattern.indexOf(ch);
    if (idx !== -1 && idx < firstGlobIdx) firstGlobIdx = idx;
  }
  const prefix = pattern.substring(0, firstGlobIdx);
  const dir = prefix.endsWith("/") ? prefix : path.dirname(prefix) + "/";
  return path.normalize(dir);
}

function joinGlobPath(p: string, addedp: string): string {
  if (addedp[0] === "!") {
    return "!" + path.join(p, addedp.substring(1));
  }
  return path.join(p, addedp);
}

export interface RpmBuilderEvents {
  message: (phase: string, ...args: unknown[]) => void;
}

export class RpmBuilder extends EventEmitter {
  async build(opts: BuildOptions): Promise<BuildContext> {
    const ctx = this.init(opts);
    await this.removeRpmRootDir(ctx);
    await this.setupRpmRoot(ctx);
    await this.prepTgz(ctx);
    await this.doTgz(ctx);
    await this.writeSpec(ctx);
    await this.performBuild(ctx);
    return ctx;
  }

  private init(opts: BuildOptions): BuildContext {
    this.emit("message", "init", opts);

    const spec = createRpmSpec(opts);
    const cwd = xutil.resolve(opts.cwd ?? ".");
    const specTemplate = opts.specFile
      ? fs.readFileSync(path.resolve(cwd, opts.specFile), "utf8")
      : (opts.specTemplate ?? SPEC_TEMPLATE);
    return {
      spec,
      specTemplate,
      buildArch: opts.buildArch ?? "noarch",
      installScript: opts.installScript ?? [],
      cwd,
      fullname: opts.name + "-" + opts.version,
      _files: opts.files,
      _sources: [],
      verbose: opts.verbose ?? false,
      rpmRootDir: xutil.resolve(opts.rpmRootDir ?? "~/rpmbuild"),
    };
  }

  private async performBuild(ctx: BuildContext): Promise<void> {
    if (ctx.specFileName == null) throw new Error("specFileName not set");
    this.emit("message", "performBuild", ctx.specFileName, ctx.rpmRootDir);
    ctx.rpms = await xutil.rpmbuild(ctx.specFileName, ctx.rpmRootDir, ctx);
  }

  private async removeRpmRootDir(ctx: BuildContext): Promise<void> {
    this.emit("message", "removeRpmRootDir", ctx.rpmRootDir);
    await fsp.rm(ctx.rpmRootDir, { recursive: true, force: true });
  }

  private async writeSpec(ctx: BuildContext): Promise<void> {
    const specOpts = ctx.spec;
    const args: Record<string, string | number> = {
      summary: specOpts.summary,
      name: specOpts.name,
      buildArch: ctx.buildArch,
      installScript: ctx.installScript.join("\n"),
      version: specOpts.version,
      release: specOpts.release,
      description: specOpts.description,
      files: specOpts.files.join("\n"),
      url: specOpts.url,
      license: specOpts.license,
      group: specOpts.group,
      rpmRootDir: ctx.rpmRootDir,
      sources: specOpts.sources
        .map((item, idx) => "SOURCE" + idx + ": " + item)
        .join("\n"),
      requires: specOpts.requires.map((item) => "Requires: " + item).join("\n"),
    };
    const spec = formatTemplate(ctx.specTemplate ?? SPEC_TEMPLATE, args);

    const specFileName = path.join(
      ctx.rpmRootDir,
      "SPECS",
      ctx.fullname + ".spec",
    );
    this.emit("message", "writeSpec", specFileName);

    await fsp.writeFile(specFileName, spec, { encoding: "utf8" });
    ctx.specFileName = specFileName;
  }

  private async setupRpmRoot(ctx: BuildContext): Promise<void> {
    this.emit("message", "setupRpmRoot", ctx.rpmRootDir);
    const dirs = ["RPMS", "SRPMS", "BUILD", "SOURCES", "SPECS", "tmp"].map(
      (d) => path.join(ctx.rpmRootDir, d),
    );
    await Promise.all(dirs.map((dir) => fsp.mkdir(dir, { recursive: true })));
  }

  private async doTgz(ctx: BuildContext): Promise<void> {
    if (ctx.tgzDir == null) throw new Error("tgzDir not set");
    const tgzFile = path.join(
      ctx.rpmRootDir,
      "SOURCES",
      ctx.fullname + ".tar.gz",
    );
    ctx.spec.sources.push(path.basename(tgzFile));

    this.emit("message", "doTgz", tgzFile, ctx.tgzDir);

    try {
      await execAsync("tar -czf " + tgzFile + " .", { cwd: ctx.tgzDir });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      throw new Error("tgz failed, exit code " + err.code);
    }
    ctx._sources.push(tgzFile);
  }

  private async prepTgz(ctx: BuildContext): Promise<void> {
    const files = ctx._files;
    const tgzDir = path.join(ctx.rpmRootDir, "tmp", "tgz");
    this.emit("message", "prepTgz", tgzDir);

    interface PrepItem {
      outDir: string;
      p: string[];
      chmod: string | undefined;
    }
    const items: PrepItem[] = [];

    for (const f in files) {
      const file: FileEntry = files[f];
      let chmod: string | undefined;
      let p: string[];

      if (Array.isArray(file)) {
        p = file.map((item) => joinGlobPath(ctx.cwd, item));
      } else if (typeof file === "object" && file !== null && "path" in file) {
        if (Array.isArray(file.path)) {
          p = file.path.map((item) => joinGlobPath(ctx.cwd, item));
        } else {
          p = [joinGlobPath(ctx.cwd, file.path)];
        }
        chmod = file.chmod;
      } else {
        p = [joinGlobPath(ctx.cwd, file as string)];
      }

      const outDir = path.join(tgzDir, ctx.fullname, f);
      ctx.spec.files.push(path.join(f, "*"));
      items.push({ outDir, p, chmod });
    }

    await Promise.all(
      items.map(async (item) => {
        await fsp.mkdir(item.outDir, { recursive: true });

        const positivePatterns = item.p.filter((p) => !p.startsWith("!"));
        const ignorePatterns = item.p
          .filter((p) => p.startsWith("!"))
          .map((p) => p.slice(1));

        for (const pattern of positivePatterns) {
          const base = getGlobBase(pattern);
          const matches = await glob(pattern, {
            ignore: ignorePatterns,
            dot: true,
          });

          for (const filePath of matches) {
            const relativePath = filePath.substring(base.length);
            const destPath = path.join(item.outDir, relativePath);
            const stats = await fsp.stat(filePath);

            if (stats.isDirectory()) {
              await fsp.mkdir(destPath, { recursive: true });
            } else {
              await fsp.mkdir(path.dirname(destPath), { recursive: true });
              await fsp.copyFile(filePath, destPath);
              if (item.chmod) {
                await fsp.chmod(destPath, item.chmod);
              }
            }
          }
        }
      }),
    );

    ctx.tgzDir = tgzDir;
  }
}

const defaultInstance = new RpmBuilder();

/** Convenience: build using the default RpmBuilder instance. */
export async function build(opts: BuildOptions): Promise<BuildContext> {
  return defaultInstance.build(opts);
}

export default defaultInstance;
export type {
  BuildOptions,
  BuildContext,
  FileEntry,
  RpmResult,
  RpmSpec,
} from "./types.js";
