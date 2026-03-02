import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { RpmResult } from "./types.js";

const execAsync = promisify(exec);

export function resolve(p: string): string {
  p = p.replace(/^~\//, (process.env.HOME ?? "") + "/");
  return path.resolve(p);
}

export async function mkdirp(p: string): Promise<string> {
  try {
    await execAsync("mkdir -p " + p);
    return p;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    throw new Error("mkdir failed, exit code " + err.code);
  }
}

export interface RpmbuildOptions {
  verbose?: boolean;
}

export async function rpmbuild(
  specFile: string,
  rpmRoot: string,
  opts: RpmbuildOptions,
): Promise<RpmResult> {
  const cmd = 'rpmbuild -bb -D "%_topdir ' + rpmRoot + '" ' + specFile;
  const rpms: RpmResult = { rpm: null, srpm: null };
  try {
    const { stdout } = await execAsync(cmd, { cwd: rpmRoot });
    if (stdout) {
      const trimmed = stdout.trim();
      if (opts.verbose) {
        console.log(trimmed);
      }
      const m = trimmed.match(/(\/.+\..+\.rpm)/);
      if (m && m.length > 0) {
        rpms.rpm = m[0];
      }
    }
    return rpms;
  } catch (error) {
    console.log(error);
    const err = error as NodeJS.ErrnoException;
    throw new Error("rpmbuild failed, exit code " + err.code);
  }
}
