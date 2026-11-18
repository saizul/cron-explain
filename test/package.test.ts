import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import * as esm from '../src/index.js';

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('package', () => {
  it('the CommonJS build exposes the same API', () => {
    const cjs = require('../cjs/index.js') as typeof esm;
    assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
    assert.equal(cjs.explain('0 9 * * 1-5'), 'At 09:00, Monday through Friday');
  });

  it('the CommonJS folder is marked as commonjs', () => {
    assert.equal(JSON.parse(read('../cjs/package.json')).type, 'commonjs');
  });

  it('has no runtime dependencies and versions agree', () => {
    const pkg = JSON.parse(read('../../package.json'));
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.version, esm.VERSION);
    assert.equal(pkg.name, '@saizul/cron-explain');
    assert.equal(pkg.bin['cron-explain'], './dist/esm/cli.js');
  });

  it('the CLI entry starts with a shebang', () => {
    assert.ok(read('../esm/cli.js').startsWith('#!/usr/bin/env node'));
  });

  it('every row of the README examples table matches explain()', () => {
    const readme = read('../../README.md');
    const section = readme.slice(readme.indexOf('## Examples'), readme.indexOf('## Warnings'));
    const rows = [...section.matchAll(/^\| `([^`]+)` \| (.+?) \| (.+?) \|$/gm)];
    assert.ok(rows.length >= 15, `found ${rows.length} rows`);
    for (const [, expr, english, bangla] of rows) {
      assert.equal(esm.explain(expr!), english, expr);
      assert.equal(esm.explain(expr!, { locale: 'bn' }), bangla, expr);
    }
  });

  it('the README documents every warning and error code', () => {
    const readme = read('../../README.md');
    const codes = [
      'EVERY_SECOND',
      'EVERY_MINUTE',
      'EVERY_MINUTE_IN_HOUR',
      'DOM_DOW_OR',
      'STEP_OVERFLOW',
      'UNEVEN_STEP',
      'NEVER_RUNS',
      'SKIPS_SHORT_MONTHS',
      'DST_SENSITIVE',
      'EMPTY',
      'FIELD_COUNT',
      'UNKNOWN_MACRO',
      'INVALID_TOKEN',
      'OUT_OF_RANGE',
      'INVALID_RANGE',
      'INVALID_STEP',
      'UNKNOWN_NAME',
      'UNSUPPORTED',
      'INVALID_TIMEZONE',
      'INVALID_OPTION',
      'NO_SCHEDULE',
    ];
    for (const code of codes) assert.ok(readme.includes(`\`${code}\``), code);
  });
});
