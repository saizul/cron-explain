import { CronError } from '../errors.js';
import { bn } from './bn.js';
import { en } from './en.js';
import type { Locale } from './types.js';

const registry = new Map<string, Locale>([
  [en.code, en],
  [bn.code, bn],
]);

/** Adds or replaces a locale. Codes are matched case-insensitively. */
export function registerLocale(locale: Locale): void {
  registry.set(locale.code.toLowerCase(), locale);
}

/** The codes of every registered locale. */
export function localeCodes(): string[] {
  return [...registry.keys()];
}

/**
 * Finds a locale by code. "bn-BD" falls back to "bn" when there is no exact
 * match. Throws a CronError for unknown codes.
 */
export function getLocale(code: string): Locale {
  const wanted = code.toLowerCase();
  const found = registry.get(wanted) ?? registry.get(wanted.split('-')[0] ?? '');
  if (!found) {
    throw CronError.of('INVALID_OPTION', `unknown locale "${code}"; available: ${localeCodes().join(', ')}`);
  }
  return found;
}

export { bn, en };
export type { Clauses, Locale } from './types.js';
