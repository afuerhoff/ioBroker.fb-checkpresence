'use strict';

const assert = require('node:assert/strict');
const { Fb } = require('../lib/fb');

describe('FRITZ!Box URL host formatting', () => {
    for (const host of ['2001:db8::1', '192.168.178.1', 'fritz.box']) {
        it(`creates a valid service URL for ${host}`, () => {
            const fb = new Fb({ host, uid: '', pwd: '' }, false, null);
            const url = new URL(fb.serviceUrl);

            assert.equal(url.hostname, host.includes(':') ? `[${host}]` : host);
            assert.equal(url.port, '49000');
            assert.equal(url.pathname, '/tr64desc.xml');
        });
    }
});
