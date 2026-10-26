'use strict';

/**
 * Check whether a configured IP matches one of a host's IP addresses.
 *
 * @param {string} hostAddresses - One IP address or a comma-separated list
 * @param {string} configuredAddress - The configured IP address
 * @returns {boolean} Whether the configured address is present
 */
function matchesIpAddress(hostAddresses, configuredAddress) {
    if (typeof hostAddresses !== 'string' || typeof configuredAddress !== 'string') {
        return false;
    }

    const address = configuredAddress.trim();
    return address !== '' && hostAddresses.split(',').some(hostAddress => hostAddress.trim() === address);
}

module.exports = { matchesIpAddress };
