/**
 * Typed errors → typed process exit codes (aabclitool pattern).
 *
 *   0 = success
 *   1 = user error (bad input, missing prerequisite, generic failure)
 *   2 = agent error (the agent CLI failed / returned garbage)
 *   3 = network error (provider/API unreachable)
 *   4 = contract violation (capability envelope / JSON parse mismatch)
 *   5 = filesystem error
 *   6 = cancelled (Ctrl+C / user abort)
 *   7 = budget exceeded (cost guard refused to spend)
 */
export type VibeExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export class VibeError extends Error {
  readonly exitCode: VibeExitCode;
  readonly hint?: string;

  constructor(message: string, exitCode: VibeExitCode = 1, hint?: string) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

export class UserError extends VibeError {
  constructor(message: string, hint?: string) {
    super(message, 1, hint);
  }
}

export class AgentError extends VibeError {
  constructor(message: string, hint?: string) {
    super(message, 2, hint);
  }
}

export class NetworkError extends VibeError {
  constructor(message: string, hint?: string) {
    super(message, 3, hint);
  }
}

export class ContractError extends VibeError {
  constructor(message: string, hint?: string) {
    super(message, 4, hint);
  }
}

export class FsError extends VibeError {
  constructor(message: string, hint?: string) {
    super(message, 5, hint);
  }
}

export class CancelledError extends VibeError {
  constructor(message = 'Cancelled.') {
    super(message, 6);
  }
}

export class BudgetError extends VibeError {
  constructor(message: string, hint?: string) {
    super(message, 7, hint);
  }
}
