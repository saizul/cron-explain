// Run after `npm run build`: node examples/commonjs.cjs
const { explain, nextRun, validate } = require('../dist/cjs/index.js');

console.log(explain('@weekly'));
console.log(nextRun('0 9 * * MON', { tz: 'UTC', from: '2026-11-18T00:00:00Z' }).toISOString());

const result = validate('61 * * * *');
console.log(result.valid ? 'valid' : `invalid: ${result.errors[0].message}`);
