import test from 'node:test';
import assert from 'node:assert/strict';
import {fiscalYear,fiscalRange,workDays} from '../assets/dates.js';
test('Thai fiscal year changes on 1 October',()=>{assert.equal(fiscalYear('2026-09-30'),2569);assert.equal(fiscalYear('2026-10-01'),2570);assert.deepEqual(fiscalRange(2570),['2026-10-01','2027-09-30']);});
test('workload counts weekdays and half days',()=>{assert.equal(workDays('2026-10-19','2026-10-25'),5);assert.equal(workDays('2026-10-19','2026-10-25','am'),2.5);assert.equal(workDays('2026-10-24','2026-10-25'),0);assert.equal(workDays('2026-10-20','2026-10-19'),0);});
