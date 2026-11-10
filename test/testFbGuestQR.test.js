'use strict';

const assert = require('node:assert/strict');
const { Fb } = require('../lib/fb');

const createAdapter = () => ({
    config: { qrcodecolor: '#123456' },
    log: { info() {}, warn() {} },
});

describe('FRITZ!Box guest WLAN QR code', () => {
    it('loads the guest WLAN SSID when QR generation runs without guest info polling', async () => {
        const fb = new Fb({ host: 'fritz.box', uid: '', pwd: '' }, false, createAdapter());
        fb.WLAN4INFO = true;
        fb.WLAN4GETSECKEY = true;
        const calls = [];
        fb.soapAction = async (_url, _service, action) => {
            calls.push(action);
            if (action === 'GetInfo') {
                return { NewEnable: '1', NewSSID: 'Guest WiFi', NewBeaconType: 'WPA2' };
            }
            if (action === 'GetSecurityKeys') {
                return { NewKeyPassphrase: 'secret' };
            }
            return null;
        };

        const svg = await fb.getGuestQR();

        assert.deepEqual(calls, ['GetInfo', 'GetSecurityKeys']);
        assert.ok(svg);
        assert.match(svg, /fill="#123456"/);
    });

    it('reports an unavailable secured-network passphrase without throwing a TypeError', async () => {
        const warnings = [];
        const adapter = createAdapter();
        adapter.log.warn = message => warnings.push(message);
        const fb = new Fb({ host: 'fritz.box', uid: '', pwd: '' }, false, adapter);
        fb.ssid = 'Guest WiFi';
        fb.beaconType = 'WPA2';
        fb.WLAN4GETSECKEY = true;
        fb.soapAction = async () => ({ NewKeyPassphrase: null });

        assert.equal(await fb.getGuestQR(), undefined);
        assert.ok(warnings.some(message => message.includes('guest WLAN passphrase is unavailable')));
    });
});
