import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateHash, validateBranch, gitExec } from './git.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('validateHash', () => {
  it('accepts valid short hash', () => {
    expect(() => validateHash('abc1234')).not.toThrow();
  });

  it('accepts valid full hash', () => {
    expect(() => validateHash('abc123def456abc123def456abc123def456abc1')).not.toThrow();
  });

  it('rejects hash with uppercase', () => {
    expect(() => validateHash('ABC1234')).toThrow('Invalid commit hash');
  });

  it('rejects hash shorter than 7 chars', () => {
    expect(() => validateHash('abc12')).toThrow('Invalid commit hash');
  });

  it('rejects hash with special chars', () => {
    expect(() => validateHash('abc12; rm -rf')).toThrow('Invalid commit hash');
  });
});

describe('validateBranch', () => {
  it('accepts valid branch names', () => {
    expect(() => validateBranch('main')).not.toThrow();
    expect(() => validateBranch('feature/my-branch')).not.toThrow();
    expect(() => validateBranch('worker-1/ad-revenue')).not.toThrow();
  });

  it('rejects branch with spaces', () => {
    expect(() => validateBranch('my branch')).toThrow('Invalid branch name');
  });

  it('rejects branch with semicolons', () => {
    expect(() => validateBranch('main; rm -rf /')).toThrow('Invalid branch name');
  });
});

describe('gitExec', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naanhub-git-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs git init successfully', async () => {
    const result = await gitExec(tmpDir, ['init']);
    expect(result).toContain('Initialized');
  });

  it('throws on invalid git command', async () => {
    await expect(gitExec(tmpDir, ['not-a-command'])).rejects.toThrow('git not-a-command failed');
  });
});
