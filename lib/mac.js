'use strict';

/**
 * @param {unknown} hostAddresses comma-separated MAC addresses
 * @param {unknown} configuredAddress configured MAC address
 * @returns {boolean} whether the configured address is present exactly
 */
function matchesMacAddress(hostAddresses, configuredAddress) {
    if (typeof hostAddresses !== 'string' || typeof configuredAddress !== 'string') {
        return false;
    }

    const normalize = value => value.trim().replace(/[-:.]/g, '').toLowerCase();
    const address = normalize(configuredAddress);
    return address !== '' && hostAddresses.split(',').some(hostAddress => normalize(hostAddress) === address);
}

module.exports = { matchesMacAddress };
