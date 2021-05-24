const assert = require('assert');
const fb = require('../lib/fb');

describe('Simple Fb Test', () => {
    it('should return 2', async () => {
        this.Fb = await fb.Fb.init({
            host: this.config.ipaddress,
            uid: this.config.username,
            pwd: this.config.password
        }, this.config.ssl, this);
        assert.equal(1 + 1, 2);
    });
    it('should return 9', () => {
        assert.equal(3 * 3, 9);
    });
});