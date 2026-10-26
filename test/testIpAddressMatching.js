'use strict';

const assert = require('node:assert/strict');
const { matchesIpAddress } = require('../lib/ip');

describe('IP address matching', () => {
    it('matches an exact address', () => {
        assert.equal(matchesIpAddress('192.168.1.1', '192.168.1.1'), true);
    });

    it('does not match an address that only shares a prefix', () => {
        assert.equal(matchesIpAddress('192.168.1.10', '192.168.1.1'), false);
    });

    it('matches an exact address in a comma-separated list', () => {
        assert.equal(matchesIpAddress('192.168.1.10, 192.168.1.1', '192.168.1.1'), true);
    });

    it('trims whitespace around addresses', () => {
        assert.equal(matchesIpAddress(' 192.168.1.1 ', ' 192.168.1.1 '), true);
    });

    it('does not match empty or non-string values', () => {
        assert.equal(matchesIpAddress('', ''), false);
        assert.equal(matchesIpAddress(undefined, '192.168.1.1'), false);
    });
});
