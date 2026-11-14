'use strict';

/** Descriptions and types of the additional aggregate states. */
const definitions = {
    presenceFiltered: ['boolean', 'indicator.presence', 'At least one enabled family member is present (filtered)'],
    presenceAllFiltered: ['boolean', 'indicator.presence', 'All enabled family members are present (filtered)'],
    absenceFiltered: ['boolean', 'indicator', 'At least one enabled family member is absent (filtered)'],
    absenceAllFiltered: ['boolean', 'indicator', 'All enabled family members are absent (filtered)'],
    presentMembersFiltered: ['string', 'text', 'Present enabled family members (filtered)'],
    absentMembersFiltered: ['string', 'text', 'Absent enabled family members (filtered)'],
    presentCountFiltered: ['number', 'value', 'Number of present enabled family members (filtered)'],
    absentCountFiltered: ['number', 'value', 'Number of absent enabled family members (filtered)'],
};

/**
 * Aggregate one completed polling cycle, without adding another filter delay.
 * Unknown member results invalidate the snapshot instead of claiming absence.
 *
 * @param {{name: string, present: boolean | null}[]} members enabled members
 * @returns {Record<string, boolean | number | string> | null} filtered snapshot, or unknown
 */
function aggregate(members) {
    if (!members.length || members.some(member => typeof member.present !== 'boolean')) {
        return null;
    }
    const present = members.filter(member => member.present);
    const absent = members.filter(member => !member.present);
    return {
        presenceFiltered: present.length > 0,
        presenceAllFiltered: absent.length === 0,
        absenceFiltered: absent.length > 0,
        absenceAllFiltered: present.length === 0,
        presentMembersFiltered: present.map(member => member.name).join(', '),
        absentMembersFiltered: absent.map(member => member.name).join(', '),
        presentCountFiltered: present.length,
        absentCountFiltered: absent.length,
    };
}

/**
 * Write additional states only; existing raw aggregate states are untouched.
 *
 * @param {ioBroker.Adapter} adapter adapter instance
 * @param {string} prefix group path including trailing dot (or empty in compatibility mode)
 * @param {{name: string, present: boolean | null}[]} members enabled members
 */
async function publish(adapter, prefix, members) {
    const values = aggregate(members);
    for (const name of Object.keys(definitions)) {
        await adapter.setStateChangedAsync(prefix + name, {
            val: values ? values[name] : null,
            ack: true,
            q: values ? 0 : 0x40,
        });
    }
}

module.exports = { definitions, aggregate, publish };
