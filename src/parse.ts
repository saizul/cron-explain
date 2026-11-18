import { CronError } from './errors.js';
import { FIELD_ORDER, FIELDS, type FieldSpec, MACROS } from './fields.js';
import type { CronExpression, CronField, CronIssue, CronPart, FieldName, ParseOptions } from './types.js';

const FIELD_HINT = 'expected 5 fields (minute hour day-of-month month day-of-week) or 6 with seconds first';

/** Raised inside field parsing and turned into a CronIssue. */
class FieldProblem {
  constructor(
    readonly code: CronIssue['code'],
    readonly message: string,
  ) {}
}

function fail(code: CronIssue['code'], message: string): never {
  throw new FieldProblem(code, message);
}

function parseNumber(token: string, spec: FieldSpec): number {
  let n: number;
  if (/^\d+$/.test(token)) {
    n = Number(token);
  } else if (/^[a-z]+$/i.test(token)) {
    const index = spec.names?.indexOf(token.toUpperCase()) ?? -1;
    if (index < 0) {
      const hint = spec.names ? `; use ${spec.names[0]}-${spec.names[spec.names.length - 1]} or numbers` : '';
      fail('UNKNOWN_NAME', `"${token}" is not a valid ${spec.label} name${hint}`);
    }
    n = index + (spec.namesStart ?? 0);
  } else {
    fail('INVALID_TOKEN', `"${token}" is not a number`);
  }
  if (n < spec.min || n > spec.max) {
    fail('OUT_OF_RANGE', `${token} is out of range (${spec.min}-${spec.max})`);
  }
  return n;
}

function parseWeekday(token: string): number {
  return parseNumber(token, FIELDS.dayOfWeek) % 7;
}

function parseSpecial(item: string, spec: FieldSpec): CronPart | undefined {
  const upper = item.toUpperCase();
  if (spec.name === 'dayOfMonth') {
    if (upper === 'L') return { kind: 'lastDay' };
    if (upper === 'LW') return { kind: 'lastWeekday' };
    if (/^L-\d+$/.test(upper)) {
      fail(
        'UNSUPPORTED',
        `"${item}" (days before the end of the month) is not supported yet; use L for the last day`,
      );
    }
    const w = /^(\d+)W$/.exec(upper);
    if (w) return { kind: 'nearestWeekday', day: parseNumber(w[1]!, spec) };
    return undefined;
  }
  if (spec.name === 'dayOfWeek') {
    if (upper === 'L') {
      fail('UNSUPPORTED', '"L" alone in day-of-week is ambiguous; use 6 or SAT, or 5L for the last Friday');
    }
    const last = /^([0-9A-Z]+)L$/.exec(upper);
    if (last) return { kind: 'lastOfMonth', weekday: parseWeekday(last[1]!) };
    const hash = /^([0-9A-Z]+)#(\d+)$/.exec(upper);
    if (hash) {
      const nth = Number(hash[2]);
      if (nth < 1 || nth > 5) fail('OUT_OF_RANGE', `"${item}": the number after # must be 1-5`);
      return { kind: 'nth', weekday: parseWeekday(hash[1]!), nth };
    }
    return undefined;
  }
  if (/[LW#]/.test(upper) && /\d/.test(upper)) {
    fail('UNSUPPORTED', `"${item}": L, W and # are only allowed in day-of-month and day-of-week`);
  }
  return undefined;
}

function parseItem(item: string, spec: FieldSpec): CronPart {
  if (item === '') fail('INVALID_TOKEN', 'empty list item (check for a stray comma)');
  if (/^h(\(|$)/i.test(item)) {
    fail('UNSUPPORTED', `"${item}": hashed values (H) are a Jenkins extension and are not supported`);
  }
  if (item === '*' || item === '?') {
    if (item === '?' && spec.name !== 'dayOfMonth' && spec.name !== 'dayOfWeek') {
      fail('INVALID_TOKEN', '"?" is only allowed in day-of-month and day-of-week');
    }
    return { kind: 'any' };
  }
  const special = parseSpecial(item, spec);
  if (special) return special;

  const slash = item.split('/');
  if (slash.length > 2) fail('INVALID_STEP', `"${item}" has more than one "/"`);
  const [base = '', stepText] = slash;
  let step = 1;
  if (stepText !== undefined) {
    if (!/^\d+$/.test(stepText))
      fail('INVALID_STEP', `step "${stepText}" in "${item}" is not a whole number`);
    step = Number(stepText);
    if (step === 0) fail('INVALID_STEP', `step 0 in "${item}" would never advance; use 1 or more`);
  }
  if (base === '*') {
    if (stepText === undefined) return { kind: 'any' };
    return {
      kind: 'range',
      from: spec.min,
      to: spec.name === 'dayOfWeek' ? 6 : spec.max,
      step,
      wildcard: true,
    };
  }
  const dash = base.split('-');
  if (dash.length > 2) fail('INVALID_RANGE', `"${base}" is not a valid range`);
  if (dash.length === 2) {
    const from = parseNumber(dash[0]!, spec);
    const to = parseNumber(dash[1]!, spec);
    if (from > to) {
      fail(
        'INVALID_RANGE',
        `range "${base}" goes backwards; split it, e.g. "${dash[0]}-${spec.max},${spec.min}-${dash[1]}"`,
      );
    }
    return { kind: 'range', from, to, step, wildcard: false };
  }
  const value = parseNumber(base, spec);
  if (stepText !== undefined) {
    return {
      kind: 'range',
      from: value,
      to: spec.name === 'dayOfWeek' ? 6 : spec.max,
      step,
      wildcard: false,
    };
  }
  return { kind: 'value', value };
}

function expandValues(parts: CronPart[], spec: FieldSpec): number[] {
  const set = new Set<number>();
  for (const part of parts) {
    if (part.kind === 'any') {
      for (let v = spec.min; v <= (spec.name === 'dayOfWeek' ? 6 : spec.max); v++) set.add(v);
    } else if (part.kind === 'value') {
      set.add(part.value);
    } else if (part.kind === 'range') {
      for (let v = part.from; v <= part.to; v += part.step) set.add(v);
    }
  }
  const values = [...set].map((v) => (spec.name === 'dayOfWeek' ? v % 7 : v));
  return [...new Set(values)].sort((a, b) => a - b);
}

function parseField(source: string, name: FieldName): CronField {
  const spec = FIELDS[name];
  const parts = source.split(',').map((item) => parseItem(item, spec));
  const any = parts.length === 1 && parts[0]!.kind === 'any';
  return { name, source, parts, values: expandValues(parts, spec), any };
}

function fixedSecond(): CronField {
  return { name: 'second', source: '0', parts: [{ kind: 'value', value: 0 }], values: [0], any: false };
}

/** Collects every problem in the expression instead of stopping at the first. */
export function check(expression: string, options: ParseOptions = {}): CronExpression | CronIssue[] {
  if (typeof expression !== 'string') {
    return [{ code: 'INVALID_OPTION', message: 'the expression must be a string' }];
  }
  const source = expression.trim();
  if (source === '') return [{ code: 'EMPTY', message: `the expression is empty; ${FIELD_HINT}` }];

  let body = source;
  let macro: string | undefined;
  if (source.startsWith('@')) {
    macro = source.toLowerCase();
    if (macro === '@reboot') {
      const star = (name: FieldName): CronField => parseField('*', name);
      return {
        source,
        macro,
        reboot: true,
        hasSeconds: false,
        second: fixedSecond(),
        minute: star('minute'),
        hour: star('hour'),
        dayOfMonth: star('dayOfMonth'),
        month: star('month'),
        dayOfWeek: star('dayOfWeek'),
      };
    }
    const expanded = MACROS[macro];
    if (expanded === undefined) {
      if (/^@every\b/.test(macro)) {
        return [
          { code: 'UNSUPPORTED', message: '"@every <duration>" is not cron syntax and is not supported' },
        ];
      }
      return [
        {
          code: 'UNKNOWN_MACRO',
          message: `unknown macro "${source}"; supported: ${Object.keys(MACROS).join(', ')}, @reboot`,
          token: source,
        },
      ];
    }
    body = expanded;
  }

  const tokens = body.split(/\s+/);
  const mode = options.seconds ?? 'optional';
  if (tokens.length === 7) {
    return [
      { code: 'UNSUPPORTED', message: '7 fields given: a year field is not supported; use 5 or 6 fields' },
    ];
  }
  if (tokens.length !== 5 && tokens.length !== 6) {
    return [{ code: 'FIELD_COUNT', message: `${tokens.length} field(s) given; ${FIELD_HINT}` }];
  }
  if (tokens.length === 6 && mode === 'forbidden') {
    return [{ code: 'FIELD_COUNT', message: '6 fields given but seconds are not allowed; use 5 fields' }];
  }
  if (tokens.length === 5 && mode === 'required') {
    return [{ code: 'FIELD_COUNT', message: '5 fields given but a seconds field is required; use 6 fields' }];
  }

  const hasSeconds = tokens.length === 6;
  const names = hasSeconds ? FIELD_ORDER : FIELD_ORDER.slice(1);
  const issues: CronIssue[] = [];
  const fields: Partial<Record<FieldName, CronField>> = {};
  names.forEach((name, i) => {
    const text = tokens[i]!;
    try {
      fields[name] = parseField(text, name);
    } catch (err) {
      if (!(err instanceof FieldProblem)) throw err;
      issues.push({
        code: err.code,
        message: `${FIELDS[name].label}: ${err.message}`,
        field: name,
        token: text,
      });
    }
  });
  if (issues.length > 0) return issues;

  const result: CronExpression = {
    source,
    reboot: false,
    hasSeconds,
    second: fields.second ?? fixedSecond(),
    minute: fields.minute!,
    hour: fields.hour!,
    dayOfMonth: fields.dayOfMonth!,
    month: fields.month!,
    dayOfWeek: fields.dayOfWeek!,
  };
  if (macro !== undefined) result.macro = macro;
  return result;
}

/**
 * Parses a cron expression. Throws a {@link CronError} that lists every
 * invalid field when the expression is not valid.
 */
export function parse(expression: string, options: ParseOptions = {}): CronExpression {
  const result = check(expression, options);
  if (Array.isArray(result)) throw new CronError(result);
  return result;
}

/** Accepts either an expression string or an already parsed expression. */
export function toExpression(input: string | CronExpression, options: ParseOptions = {}): CronExpression {
  return typeof input === 'string' ? parse(input, options) : input;
}

function partToString(part: CronPart): string {
  switch (part.kind) {
    case 'any':
      return '*';
    case 'value':
      return String(part.value);
    case 'range': {
      const base = part.wildcard ? '*' : `${part.from}-${part.to}`;
      return part.step === 1 ? base : `${base}/${part.step}`;
    }
    case 'lastDay':
      return 'L';
    case 'lastWeekday':
      return 'LW';
    case 'nearestWeekday':
      return `${part.day}W`;
    case 'lastOfMonth':
      return `${part.weekday}L`;
    case 'nth':
      return `${part.weekday}#${part.nth}`;
  }
}

/**
 * Returns the expression in a canonical form: macros expanded, names turned
 * into numbers, `?` written as `*` and `a/n` written as `a-max/n`.
 */
export function normalize(input: string | CronExpression, options: ParseOptions = {}): string {
  const expr = toExpression(input, options);
  if (expr.reboot) return '@reboot';
  const names = expr.hasSeconds ? FIELD_ORDER : FIELD_ORDER.slice(1);
  return names.map((name) => expr[name].parts.map(partToString).join(',')).join(' ');
}
