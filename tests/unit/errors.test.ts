import { describe, expect, it } from 'vitest';
import {
  AgentError,
  BudgetError,
  CancelledError,
  ContractError,
  FsError,
  NetworkError,
  UserError,
  VibeError,
} from '../../src/core/errors.js';

describe('typed exit codes', () => {
  it('maps each error class to its documented exit code', () => {
    expect(new UserError('x').exitCode).toBe(1);
    expect(new AgentError('x').exitCode).toBe(2);
    expect(new NetworkError('x').exitCode).toBe(3);
    expect(new ContractError('x').exitCode).toBe(4);
    expect(new FsError('x').exitCode).toBe(5);
    expect(new CancelledError().exitCode).toBe(6);
    expect(new BudgetError('x').exitCode).toBe(7);
  });

  it('every typed error is a VibeError with a name and optional hint', () => {
    const err = new UserError('bad input', 'try --help');
    expect(err).toBeInstanceOf(VibeError);
    expect(err.name).toBe('UserError');
    expect(err.hint).toBe('try --help');
  });
});
