'use strict';

const assert = require('node:assert/strict');
const dateFormat = require('../lib/dateformat/dateformat');

describe('date formatting', () => {
    it('formats ordinal day suffixes', () => {
        /** @type {[number, string][]} */
        const cases = [
            [1, 'st'],
            [2, 'nd'],
            [3, 'rd'],
            [4, 'th'],
            [11, 'th'],
            [21, 'st'],
        ];

        for (const [day, suffix] of cases) {
            assert.equal(dateFormat(new Date(2026, 0, day), 'S'), suffix);
        }
    });

    it('formats ISO week numbers across year boundaries', () => {
        assert.equal(dateFormat(new Date(2021, 0, 1), 'W'), '53');
        assert.equal(dateFormat(new Date(2021, 0, 4), 'W'), '1');
    });
});
