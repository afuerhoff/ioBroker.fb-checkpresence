'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSON5 = require('json5');

const config = JSON5.parse(
    fs.readFileSync(path.join(__dirname, '..', 'admin', 'jsonConfig.json5'), 'utf8'),
);
const expression = config.items.main.items.ipaddress.validator;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const validate = new AsyncFunction('data', `return ${expression}`);

describe('IP-address validator', () => {
    const cases = [
        ['192.168.178.1', true],
        ['fritz.box', true],
        ['2001:db8::1', true],
        ['192.168', false],
        ['192.168.x', false],
        ['256.1.1.1', false],
        ['bad!', false],
        ['', false],
    ];

    for (const [value, expected] of cases) {
        it(`validates ${JSON.stringify(value)} as ${expected ? 'valid' : 'invalid'}`, async () => {
            assert.equal(await validate({ ipaddress: value }), expected);
        });
    }
});