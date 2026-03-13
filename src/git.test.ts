import { describe, it, expect } from 'vitest';
import { validateHash, validateBranch } from './git.js';

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
