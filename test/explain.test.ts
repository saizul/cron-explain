import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CronError,
  en,
  explain,
  getLocale,
  type Locale,
  localeCodes,
  parse,
  registerLocale,
} from '../src/index.js';

/** [expression, English, Bangla] */
export const EXAMPLES: [string, string, string][] = [
  ['* * * * *', 'Every minute', 'প্রতি মিনিটে'],
  ['*/5 * * * *', 'Every 5 minutes', 'প্রতি ৫ মিনিট পরপর'],
  [
    '*/15 9-17 * * 1-5',
    'Every 15 minutes, between 09:00 and 17:59, Monday through Friday',
    'সোমবার থেকে শুক্রবার, ০৯:০০ থেকে ১৭:৫৯-এর মধ্যে, প্রতি ১৫ মিনিট পরপর',
  ],
  ['0 9 * * 1-5', 'At 09:00, Monday through Friday', 'সোমবার থেকে শুক্রবার, ০৯:০০-এ'],
  ['30 2 * * *', 'At 02:30, every day', 'প্রতিদিন ০২:৩০-এ'],
  ['0 9,17 * * *', 'At 09:00 and 17:00, every day', 'প্রতিদিন ০৯:০০ ও ১৭:০০-এ'],
  ['0 * * * *', 'Every hour', 'প্রতি ঘণ্টায়'],
  ['0 */2 * * *', 'Every 2 hours', 'প্রতি ২ ঘণ্টা পরপর'],
  ['15 */6 * * *', 'Every 6 hours, at minute 15', 'প্রতি ৬ ঘণ্টা পরপর, ১৫ মিনিটে'],
  ['5 * * * *', 'At minute 5 of every hour', 'প্রতি ঘণ্টার ৫ মিনিটে'],
  ['0,30 * * * *', 'At minutes 0 and 30 of every hour', 'প্রতি ঘণ্টার ০ ও ৩০ মিনিটে'],
  ['0 9-17 * * *', 'Every hour from 09:00 through 17:00', '০৯:০০ থেকে ১৭:০০ পর্যন্ত প্রতি ঘণ্টায়'],
  [
    '0 8-18/2 * * 1-5',
    'Every 2 hours from 08:00 through 18:00, Monday through Friday',
    'সোমবার থেকে শুক্রবার, ০৮:০০ থেকে ১৮:০০ পর্যন্ত প্রতি ২ ঘণ্টা পরপর',
  ],
  ['* 9 * * *', 'Every minute, between 09:00 and 09:59', '০৯:০০ থেকে ০৯:৫৯-এর মধ্যে, প্রতি মিনিটে'],
  ['0-30/5 * * * *', 'Every 5 minutes from minute 0 through 30', '০ থেকে ৩০ মিনিটের মধ্যে প্রতি ৫ মিনিট পরপর'],
  ['@daily', 'At 00:00, every day', 'প্রতিদিন ০০:০০-এ'],
  ['@weekly', 'At 00:00, on Sunday', 'রবিবারে, ০০:০০-এ'],
  ['@monthly', 'At 00:00, on day 1 of the month', 'মাসের ১ তারিখে, ০০:০০-এ'],
  ['@yearly', 'At 00:00, on day 1 of the month, in January', 'জানুয়ারি মাসে, মাসের ১ তারিখে, ০০:০০-এ'],
  ['@reboot', 'At system startup', 'সিস্টেম চালু হওয়ার সময়'],
  ['0 0 1,15 * *', 'At 00:00, on days 1 and 15 of the month', 'মাসের ১ ও ১৫ তারিখে, ০০:০০-এ'],
  ['0 0 L * *', 'At 00:00, on the last day of the month', 'মাসের শেষ দিনে, ০০:০০-এ'],
  ['0 17 LW * *', 'At 17:00, on the last weekday of the month', 'মাসের শেষ কর্মদিবসে (সোম–শুক্র), ১৭:০০-এ'],
  [
    '0 9 15W * *',
    'At 09:00, on the weekday nearest day 15 of the month',
    'মাসের ১৫ তারিখের নিকটতম কর্মদিবসে (সোম–শুক্র), ০৯:০০-এ',
  ],
  ['0 18 * * 5L', 'At 18:00, on the last Friday of the month', 'মাসের শেষ শুক্রবারে, ১৮:০০-এ'],
  ['0 10 * * MON#1', 'At 10:00, on the first Monday of the month', 'মাসের প্রথম সোমবারে, ১০:০০-এ'],
  ['0 12 * * MON,WED,FRI', 'At 12:00, on Monday, Wednesday and Friday', 'সোমবার, বুধবার ও শুক্রবারে, ১২:০০-এ'],
  ['0 0 1 * 1', 'At 00:00, on day 1 of the month or on Monday', 'মাসের ১ তারিখে অথবা সোমবারে, ০০:০০-এ'],
  ['0 0 * JAN-MAR *', 'At 00:00, January through March', 'জানুয়ারি থেকে মার্চ মাসে, ০০:০০-এ'],
  ['0 0 1 */3 *', 'At 00:00, on day 1 of the month, every 3 months', 'প্রতি ৩ মাস অন্তর, মাসের ১ তারিখে, ০০:০০-এ'],
  ['*/10 * * * * *', 'Every 10 seconds', 'প্রতি ১০ সেকেন্ড পরপর'],
  ['30 0 9 * * *', 'At 09:00:30, every day', 'প্রতিদিন ০৯:০০:৩০-এ'],
];

describe('explain: examples', () => {
  for (const [expr, english, bangla] of EXAMPLES) {
    it(`${expr} (en)`, () => assert.equal(explain(expr), english));
    it(`${expr} (bn)`, () => assert.equal(explain(expr, { locale: 'bn' }), bangla));
  }
});

describe('explain: more shapes', () => {
  const cases: [string, string][] = [
    ['* * * * * *', 'Every second'],
    ['0 * * * * *', 'Every minute'],
    ['15,45 * * * * *', 'At seconds 15 and 45'],
    ['10-20/5 * * * * *', 'Every 5 seconds from second 10 through 20'],
    ['30 */5 * * * *', 'At second 30, every 5 minutes'],
    ['30 0 * * * *', 'Every hour, at second 30'],
    ['10-20 * * * *', 'Every minute from minute 10 through 20'],
    ['*/15 */2 * * *', 'Every 15 minutes, during every 2nd hour'],
    ['*/30 9,12,17 * * *', 'Every 30 minutes, during hours 9, 12 and 17'],
    ['0 1,2,3,4,5,6,7 * * *', 'At minute 0, during hours 1, 2, 3, 4, 5, 6 and 7'],
    ['0 0 1-7 * *', 'At 00:00, on days 1 through 7 of the month'],
    ['0 0 */2 * *', 'At 00:00, on every 2nd day of the month'],
    ['0 0 1-15/7 * *', 'At 00:00, on every 7th day of the month from day 1 through 15'],
    ['0 0 1,L * *', 'At 00:00, on day 1 and the last day of the month'],
    ['0 0 * * */2', 'At 00:00, on every 2nd day of the week'],
    ['0 0 * * 1-5/2', 'At 00:00, on every 2nd day of the week from Monday through Friday'],
    ['0 0 * * 5-7', 'At 00:00, Friday through Sunday'],
    ['0 0 * * 1,3-5', 'At 00:00, on Monday and Wednesday through Friday'],
    ['0 0 * * 1#3,5L', 'At 00:00, on the third Monday of the month and the last Friday of the month'],
    ['0 0 1 1,7 *', 'At 00:00, on day 1 of the month, in January and July'],
    ['0 0 1 2-12/2 *', 'At 00:00, on day 1 of the month, every 2 months from February through December'],
    ['0 9 * * 1', 'At 09:00, on Monday'],
  ];
  for (const [expr, english] of cases) {
    it(expr, () => assert.equal(explain(expr), english));
  }

  it('describes the same shapes in Bangla', () => {
    assert.equal(explain('* * * * * *', { locale: 'bn' }), 'প্রতি সেকেন্ডে');
    assert.equal(
      explain('*/30 9,12,17 * * *', { locale: 'bn' }),
      'কেবল ৯, ১২ ও ১৭ নম্বর ঘণ্টায়, প্রতি ৩০ মিনিট পরপর',
    );
    assert.equal(explain('0 0 * * 1#3,5L', { locale: 'bn' }), 'মাসের তৃতীয় সোমবার ও মাসের শেষ শুক্রবারে, ০০:০০-এ');
    assert.equal(explain('0 0 1,L * *', { locale: 'bn' }), 'মাসের ১ তারিখ ও শেষ দিনে, ০০:০০-এ');
    assert.equal(explain('0 0 */2 * *', { locale: 'bn' }), 'মাসের প্রতি ২ দিন অন্তর, ০০:০০-এ');
    assert.equal(explain('30 */5 * * * *', { locale: 'bn' }), 'প্রতি ৫ মিনিট পরপর, ৩০ সেকেন্ডে');
    assert.equal(explain('0 0 * * */2', { locale: 'bn' }), 'সপ্তাহের প্রতি ২ দিন অন্তর, ০০:০০-এ');
  });

  it('accepts a parsed expression', () => {
    assert.equal(explain(parse('0 9 * * 1-5')), 'At 09:00, Monday through Friday');
  });

  it('uses only Bangla digits in Bangla output', () => {
    for (const [expr] of EXAMPLES) {
      assert.doesNotMatch(explain(expr, { locale: 'bn' }), /[0-9]/, expr);
    }
  });
});

describe('locales', () => {
  it('lists the built-in locales', () => {
    assert.deepEqual(localeCodes().slice(0, 2), ['en', 'bn']);
  });

  it('falls back from a region code to the language', () => {
    assert.equal(getLocale('bn-BD').code, 'bn');
    assert.equal(getLocale('EN-us').code, 'en');
  });

  it('rejects unknown locales', () => {
    assert.throws(
      () => explain('* * * * *', { locale: 'xx' }),
      (err: unknown) => {
        return (
          err instanceof CronError && err.code === 'INVALID_OPTION' && /available: en, bn/.test(err.message)
        );
      },
    );
  });

  it('accepts a Locale object and registered custom locales', () => {
    const shouty: Locale = { ...en, code: 'en-x-shout', sentence: (c) => en.sentence(c).toUpperCase() };
    assert.equal(explain('0 9 * * *', { locale: shouty }), 'AT 09:00, EVERY DAY');
    registerLocale(shouty);
    assert.equal(explain('0 9 * * *', { locale: 'en-x-shout' }), 'AT 09:00, EVERY DAY');
  });
});
