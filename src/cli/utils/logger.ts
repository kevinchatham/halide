import process from 'node:process';
import { styleText } from 'node:util';

const useColors = process.stdout.isTTY === true;
const format = (styles: Parameters<typeof styleText>[0], msg: string): string =>
  useColors ? styleText(styles, msg) : msg;

/**
 * Output a message to the appropriate stream for CLI progress reporting.
 * @returns {void}
 */
export function cliLog(message: string): void {
  process.stdout.write(`${format(['gray', 'dim'], message)}\n`);
}

/**
 * Output a success message to stdout with a visual prefix.
 * @returns {void}
 */
export function cliSuccess(message: string): void {
  process.stdout.write(`${format(['green', 'bold'], '\u2713')} ${message}\n`);
}

/**
 * Output a warning to stderr with a visual prefix.
 * @returns {void}
 */
export function cliWarn(message: string): void {
  process.stderr.write(`${format(['yellow', 'bold'], '\u26a0')} ${message}\n`);
}

/**
 * Output an info/dry-run message to stdout with a visual prefix.
 * @returns {void}
 */
export function cliInfo(message: string): void {
  process.stdout.write(`${format(['cyan', 'bold'], '\u2139')} ${message}\n`);
}

/**
 * Output a multiline tree or block message to stdout without per-line prefixes.
 * Preserves the exact formatting of the message (e.g. box-drawing tree characters).
 */
export function cliTree(message: string): void {
  process.stdout.write(`${message}\n`);
}
