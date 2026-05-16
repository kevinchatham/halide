import type { Logger } from '../types/app';
import type { SecurityAuthConfig } from '../types/security';
import { serverConfigSchema } from './schema';

/** Partial auth config subset used for async secret validation. */
type AuthInput = Pick<SecurityAuthConfig, 'strategy' | 'secret'>;

/**
 * A single validation error with field location and message.
 *
 * Used by {@link ValidationResult} to report configuration issues found
 * during validation. The `field` uses dot-notation to identify the exact
 * nested path (e.g., `'security.auth.secret'`).
 */
export type ValidationError = {
  /** Dot-notation path to the offending field (e.g., `'security.auth.secret'`). */
  field: string;
  /** Human-readable error description explaining what went wrong. */
  message: string;
};

/**
 * Result of validation with collected errors and warnings.
 *
 * When `valid` is true, `errors` is empty and `warnings` may contain
 * non-blocking advisory messages about config choices (e.g., rate limiting
 * without a Redis client).
 *
 * Returned by {@link validateServerConfig} and {@link validateAuthSecret}.
 */
export type ValidationResult = {
  /** List of accumulated validation errors. Empty when `valid` is true. */
  errors: ValidationError[];
  /** Whether validation passed (no errors). */
  valid: boolean;
  /** Non-blocking warnings about config choices (e.g., rate limit without Redis). */
  warnings?: ValidationError[];
};

/** Collect non-blocking warnings from config that are not handled by Zod. */
/** Collect non-blocking warnings from config that are not handled by Zod. */
function collectValidationWarnings(config: Record<string, unknown>): ValidationError[] {
  const warnings: ValidationError[] = [];
  const rateLimit = (config.security as Record<string, unknown> | undefined)?.rateLimit as
    | Record<string, unknown>
    | undefined;
  if (rateLimit && !rateLimit.redisClient) {
    warnings.push({
      field: 'security.rateLimit',
      message:
        'Rate limiting is configured without redisClient. Fallback to in-memory store is per-instance only and will not share state across multiple server instances; configure redisClient for distributed rate limiting.',
    });
  }
  return warnings;
}

/**
 * Parse the Zod schema and collect cross-field warnings, returning (errors, warnings) without throwing.
 * @typeParam TConfig - The server configuration type.
 * @param config - The server configuration to validate.
 * @returns An object containing `errors` and `warnings` arrays.
 */
function parseConfig<TConfig extends Record<string, unknown>>(
  config: TConfig,
): { errors: ValidationError[]; warnings: ValidationError[] } {
  const result = serverConfigSchema.safeParse(config);
  const errors: ValidationError[] = result.success
    ? []
    : result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'unknown',
        message: issue.message,
      }));
  const warnings = result.success ? collectValidationWarnings(config) : [];
  return { errors, warnings };
}

/**
 * Validate an async auth secret by calling it and checking the resolved value.
 *
 * Zod already validates string-based secrets synchronously; this only handles
 * function-based secrets that return a Promise. Checks that the resolved
 * value is a non-empty string.
 *
 * @param auth - Partial auth config to validate (strategy and secret fields).
 * @returns A `ValidationResult` with any errors from resolving the secret.
 */
export async function validateAuthSecret(auth?: AuthInput): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  if (auth?.strategy === 'bearer' && auth.secret && typeof auth.secret === 'function') {
    const secretValue = auth.secret();
    if (secretValue instanceof Promise) {
      try {
        const resolved = await secretValue;
        if (typeof resolved === 'string' && resolved === '') {
          errors.push({
            field: 'auth.secret',
            message: 'auth.secret must not be empty for bearer strategy',
          });
        }
      } catch {
        errors.push({
          field: 'auth.secret',
          message: 'auth.secret function rejected — secret could not be resolved',
        });
      }
    }
  }

  return { errors, valid: errors.length === 0 };
}

/**
 * Synchronously validate a server configuration object.
 *
 * Uses Zod schemas with superRefine for structural and cross-field validation.
 * Throws if the config contains function-based auth secrets, as they cannot be
 * validated synchronously — use {@link validateServerConfig} for async secret support.
 *
 * Emits warnings via `logger` for non-blocking issues (e.g., rate limiting without Redis).
 *
 * @typeParam TConfig - The server configuration type.
 * @param config - The server configuration to validate.
 * @param logger - Optional logger for emitting validation warnings.
 * @throws {Error} When validation fails with a message listing all errors.
 */
export function validateServerConfigSync<TConfig extends Record<string, unknown>>(
  config: TConfig,
  logger?: Logger<unknown>,
): void {
  const { errors, warnings } = parseConfig(config);

  // Reject function-based secrets — they require async resolution
  const auth = (config as { security?: { auth?: AuthInput } })?.security?.auth;
  if (auth?.secret && typeof auth.secret === 'function') {
    errors.push({
      field: 'security.auth.secret',
      message:
        'Function-based auth secrets cannot be validated synchronously. Pass a string secret, or use `validateServerConfig` for async secret resolution.',
    });
  }

  if (errors.length > 0) {
    throw new Error(
      'Configuration validation failed:\n' +
        errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n'),
    );
  }

  for (const w of warnings) {
    logger?.warn(`[Halide] ${w.field}: ${w.message}`);
  }
}

/**
 * Validate a server configuration object.
 *
 * Uses Zod schemas with superRefine for structural and cross-field validation.
 * Returns a {@link ValidationResult} instead of throwing, allowing callers to
 * handle validation errors programmatically. Resolves async auth secrets
 * (function-based secrets) and validates the resolved value.
 *
 * @typeParam TConfig - The server configuration type.
 * @param config - The server configuration to validate.
 * @returns A `ValidationResult` with any errors and warnings.
 */
export async function validateServerConfig<TConfig extends Record<string, unknown>>(
  config: TConfig,
): Promise<ValidationResult> {
  const { errors, warnings } = parseConfig(config);

  // Run async auth secret validation (function-based secrets only; string secrets are validated by Zod)
  const asyncResult = await validateAuthSecret(
    (config as { security?: { auth?: AuthInput } })?.security?.auth,
  );
  const asyncErrors = asyncResult.errors;

  const allErrors = [...errors, ...asyncErrors];
  return {
    errors: allErrors,
    valid: allErrors.length === 0,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
