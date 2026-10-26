'use strict';

const assert = require('node:assert/strict');
const { Fb } = require('../lib/fb');

describe('FRITZ!Box HTTPS agent', () => {
    const originalGetSSLPort = Fb.prototype._getSSLPort;
    const originalGetAccessRights = Fb.prototype._getAccessRights;
    const originalGetServices = Fb.prototype._getServices;

    before(() => {
        Fb.prototype._getSSLPort = async function () {
            this._sslPort = 443;
        };
        Fb.prototype._getAccessRights = async () => {};
        Fb.prototype._getServices = async () => false;
    });

    after(() => {
        Fb.prototype._getSSLPort = originalGetSSLPort;
        Fb.prototype._getAccessRights = originalGetAccessRights;
        Fb.prototype._getServices = originalGetServices;
    });

    it('verifies certificates when configured', async () => {
        const fb = await Fb.init({ host: 'fritz.box', uid: '', pwd: '' }, true, null, true);

        assert.equal(fb.agent.options.rejectUnauthorized, true);
    });

    it('keeps certificate verification disabled by default for compatibility', async () => {
        const fb = await Fb.init({ host: 'fritz.box', uid: '', pwd: '' }, true, null);

        assert.equal(fb.agent.options.rejectUnauthorized, false);
    });
});
