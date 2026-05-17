import process from 'node:process';

/** Output a message to the appropriate stream for CLI progress reporting. */
export function cliLog(message: string): void {
  process.stdout.write(`${message}\n`);
}

/** Output a success message to stdout with a visual prefix. */
export function cliSuccess(message: string): void {
  process.stdout.write(`\u2713 ${message}\n`);
}

/** Output a warning to stderr with a visual prefix. */
export function cliWarn(message: string): void {
  process.stderr.write(`\u26a0 ${message}\n`);
}

/** Output an info/dry-run message to stdout with a visual prefix. */
export function cliInfo(message: string): void {
  process.stdout.write(`\u2139 ${message}\n`);
}
