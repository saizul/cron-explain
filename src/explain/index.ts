import { getLocale } from '../locales/index.js';
import type { Clauses, Locale } from '../locales/types.js';
import { toExpression } from '../parse.js';
import type { CronExpression, ParseOptions } from '../types.js';
import { timeShape } from './shape.js';

export interface ExplainOptions extends ParseOptions {
  /** A registered locale code ("en", "bn") or a Locale object. Default "en". */
  locale?: string | Locale;
}

/**
 * Describes a cron expression in plain language.
 *
 * ```ts
 * explain('*\/15 9-17 * * 1-5');
 * // 'Every 15 minutes, between 09:00 and 17:59, Monday through Friday'
 * explain('*\/15 9-17 * * 1-5', { locale: 'bn' });
 * // 'সোমবার থেকে শুক্রবার, ০৯:০০ থেকে ১৭:৫৯-এর মধ্যে, প্রতি ১৫ মিনিট পরপর'
 * ```
 */
export function explain(input: string | CronExpression, options: ExplainOptions = {}): string {
  const locale = typeof options.locale === 'object' ? options.locale : getLocale(options.locale ?? 'en');
  const expr = toExpression(input, options);
  if (expr.reboot) return locale.reboot;
  const shape = timeShape(expr);
  const clauses: Clauses = {
    time: locale.time(shape),
    everyDay: shape.kind === 'times' && expr.dayOfMonth.any && expr.dayOfWeek.any && expr.month.any,
  };
  if (!expr.dayOfMonth.any) clauses.dayOfMonth = locale.dayOfMonth(expr.dayOfMonth.parts);
  if (!expr.dayOfWeek.any) clauses.dayOfWeek = locale.dayOfWeek(expr.dayOfWeek.parts);
  if (!expr.month.any) clauses.month = locale.month(expr.month.parts);
  return locale.sentence(clauses);
}
