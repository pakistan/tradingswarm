import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

const HASH_RE = /^[0-9a-f]{7,40}$/;
const BRANCH_RE = /^[a-zA-Z0-9._\/-]+$/;

export function validateHash(hash: string): void {
  if (!HASH_RE.test(hash)) {
    throw new Error(`Invalid commit hash: "${hash}"`);
  }
}

export function validateBranch(branch: string): void {
  if (!BRANCH_RE.test(branch)) {
    throw new Error(`Invalid branch name: "${branch}"`);
  }
}

export async function gitExec(repoDir: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFile('git', args, {
      cwd: repoDir,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return stdout;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`git ${args[0]} failed: ${message}`);
  }
}
