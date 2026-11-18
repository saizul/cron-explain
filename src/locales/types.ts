import type { TimeShape } from '../explain/shape.js';
import type { CronPart } from '../types.js';

/** The clauses of a description, already rendered by the locale. */
export interface Clauses {
  time: string;
  /** Present when day-of-month is restricted. */
  dayOfMonth?: string;
  /** Present when day-of-week is restricted. */
  dayOfWeek?: string;
  /** Present when the month is restricted. */
  month?: string;
  /** True when the time is a list of exact times and no day or month is restricted. */
  everyDay: boolean;
}

/**
 * Everything needed to describe cron expressions in one language. See
 * `src/locales/en.ts` for a complete, commented example and CONTRIBUTING.md
 * for a step-by-step guide to adding a locale.
 */
export interface Locale {
  /** BCP 47 code, e.g. "en", "bn", "pt-BR". */
  code: string;
  /** The language's own name, e.g. "English", "বাংলা". */
  name: string;
  /** Converts ASCII digits in a string to the locale's digits. */
  digits(text: string): string;
  /** Weekday names, Sunday first. */
  weekdays: readonly string[];
  /** Month names, January first. */
  months: readonly string[];
  /** The description of `@reboot`. */
  reboot: string;
  /** Renders the time-of-day clause. */
  time(shape: TimeShape): string;
  /** Renders a restricted day-of-month field. */
  dayOfMonth(parts: CronPart[]): string;
  /** Renders a restricted day-of-week field. Weekday numbers are 0-7 (0 and 7 = Sunday). */
  dayOfWeek(parts: CronPart[]): string;
  /** Renders a restricted month field. Month numbers are 1-12. */
  month(parts: CronPart[]): string;
  /** Joins the clauses into the final sentence. */
  sentence(clauses: Clauses): string;
  /** Labels used by the command-line interface. */
  labels: {
    next(count: number): string;
    previous(count: number): string;
    warnings: string;
    timeZone: string;
    noRuns: string;
    reboot: string;
  };
}
