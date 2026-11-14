'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const filtered = require('../lib/filteredPresence');
const objects = require('../lib/objects');

// Load the real adapter methods without starting a controller or connecting to a FRITZ!Box.
const filename = path.join(__dirname, '../main.js');
const localRequire = createRequire(filename);
const sandbox = {
    module: {exports: {}},
    require: name => name === '@iobroker/adapter-core' ? {Adapter: class {}} : localRequire(name),
};
vm.runInNewContext(`${fs.readFileSync(filename, 'utf8')}\nmodule.exports = FbCheckpresence;`, sandbox);
const Adapter = sandbox.module.exports;

function harness(compatibility = false, newfilter = true) {
    const adapter = Object.create(Adapter.prototype);
    const states = new Map();
    const definitions = new Map();
    Object.assign(adapter, {
        config: {compatibility, newfilter, history: 'history.0', delay: 240, dateformat: 'yyyy.mm.dd HH:MM:ss', familymembers: []},
        namespace: 'fb-checkpresence.0', enabled: true, Fb: {GETBYMAC: true, GETPATH: false},
        log: {info() {}, warn() {}, debug() {}}, HTML: '', HTML_END: '', HTML_HISTORY: '', jsonTab: [], htmlTab: '',
        historyAlive: {val: true}, adapterStates: [], memberStates: [],
        getObjectAsync: async id => definitions.get(id) || {common: {custom: {'history.0': {enabled: true}}}},
        getStateAsync: async id => states.get(id) || null,
        setStateChangedAsync: async (id, state) => states.set(id, {...state, lc: states.get(id)?.lc || Date.now()}),
        setObjectNotExistsAsync: async (id, object) => { definitions.set(id, object); return {id}; },
        extendObjectAsync: async (id, object) => { definitions.set(id, object); return {id}; },
        getAdapterState: () => false,
        getMemberPropertiesFromFBDevices() {},
        getActive: async row => row.raw,
        errorHandler: error => { throw error; },
        getHistoryData: async () => ({result: []}),
    });
    return {adapter, states, definitions};
}

describe('Filtered presence aggregates', () => {
    for (const [values, expected] of [
        [[true, false], [true, false, true, false]],
        [[false, true], [true, false, true, false]],
        [[true, true], [true, true, false, false]],
        [[false, false], [false, false, true, true]],
    ]) {
        it(`aggregates ${values.join('/')} with consistent counts and names`, () => {
            const result = filtered.aggregate(values.map((present, i) => ({name: `P${i}`, present})));
            assert.ok(result);
            assert.deepEqual(['presenceFiltered', 'presenceAllFiltered', 'absenceFiltered', 'absenceAllFiltered'].map(k => result[k]), expected);
            assert.equal(Number(result.presentCountFiltered) + Number(result.absentCountFiltered), 2);
            assert.equal(result.presentMembersFiltered, values.flatMap((v, i) => v ? [`P${i}`] : []).join(', '));
        });
    }
    it('does not claim absence for missing members or an empty configuration', () => {
        assert.equal(filtered.aggregate([]), null);
        assert.equal(filtered.aggregate([{name: 'P', present: null}]), null);
    });
    it('marks an unknown aggregate with null and nonzero quality', async () => {
        const {adapter, states} = harness();
        await filtered.publish(adapter, 'familyMembers.', [{name: 'P', present: null}]);
        assert.equal(states.get('familyMembers.absenceAllFiltered').val, null);
        assert.equal(states.get('familyMembers.absenceAllFiltered').q, 64);
    });

    for (const compatibility of [false, true]) {
        it(`publishes filtered groups and the overall family (compatibility=${compatibility})`, async () => {
            const {adapter, states} = harness(compatibility);
            adapter.config.familymembers = [
                {enabled: true, familymember: 'A', group: 'Upstairs', raw: false, filtered: true},
                {enabled: true, familymember: 'B', group: '', raw: false, filtered: false},
                {enabled: true, familymember: 'C', group: 'Downstairs', raw: false, filtered: false},
                {enabled: false, familymember: 'Disabled', group: '', raw: true, filtered: true},
            ];
            adapter.calcMemberAttributesNew = async row => row.filtered;
            await adapter.checkPresence(false);
            const prefix = compatibility ? '' : 'familyMembers.';
            assert.equal(states.get(`${prefix}presenceFiltered`).val, true);
            assert.equal(states.get(`${prefix}presentCountFiltered`).val, 1);
            assert.equal(states.get(`${prefix}absentCountFiltered`).val, 2);
            assert.equal(states.get('familyMembers.Upstairs.presenceFiltered').val, true);
            assert.equal(states.get('familyMembers.Downstairs.absenceAllFiltered').val, true);
            assert.equal(states.get(`${prefix}presence`).val, false); // original raw output unchanged
        });
        it(`creates aggregate objects even when all people have named groups (compatibility=${compatibility})`, async () => {
            const {adapter, definitions} = harness(compatibility);
            // Report no pre-existing objects so the real object creation path is exercised.
            adapter.getObjectAsync = async id => definitions.get(id) || null;
            adapter.config.history = '';
            const members = [{enabled: true, familymember: 'A', group: 'Upstairs'}];
            await objects.createMemberObjects(adapter, members, ['Upstairs'], adapter.adapterStates, adapter.memberStates, adapter.config, '', true, {val: false});
            const prefix = compatibility ? '' : 'familyMembers.';
            for (const name of Object.keys(filtered.definitions)) {
                assert.ok(definitions.has(prefix + name), name);
                assert.equal(definitions.get(prefix + name).common.write, false);
                assert.ok(definitions.has(`familyMembers.Upstairs.${name}`));
            }
        });
    }
    it('uses the legacy filtered results when the new history filter is disabled', async () => {
        const {adapter, states} = harness(false, false);
        adapter.config.familymembers = [{enabled: true, familymember: 'A', group: '', raw: true}];
        adapter.calcMemberAttributes = async () => {};
        await adapter.checkPresence(false);
        assert.equal(states.get('familyMembers.presenceFiltered').val, true);
    });
    it('does not treat a failed device lookup as absence', async () => {
        const {adapter, states} = harness();
        adapter.config.familymembers = [{enabled: true, familymember: 'A', group: '', raw: null}];
        await adapter.checkPresence(false);
        assert.equal(states.get('familyMembers.presenceFiltered').q, 64);
    });
    for (const [label, raw, usefilter, history, expected] of [
        ['short disconnect', false, true, [{ts: Date.now() - 600000, val: true}, {ts: Date.now() - 30000, val: false}], true],
        ['sustained absence', false, true, [{ts: Date.now() - 600000, val: true}, {ts: Date.now() - 300000, val: false}], false],
        ['immediate arrival', true, true, [{ts: Date.now() - 600000, val: false}], true],
        ['disabled per-person filter', false, false, [{ts: Date.now() - 600000, val: true}], false],
        ['empty history fallback', true, true, [], true],
    ]) {
        it(`returns the same filtered value used by the person state: ${label}`, async () => {
            const {adapter, states} = harness();
            states.set('familyMembers.A.presence', {val: raw, lc: Date.now() - 30000, q: 0});
            adapter.getHistoryData = async () => ({result: history});
            const presence = {one: false, allAbsence: true, presentCount: 0, absentCount: 0, presentMembers: '', absentMembers: ''};
            const value = await adapter.calcMemberAttributesNew({familymember: 'A', group: '', usefilter}, 0, raw, new Date(), presence);
            assert.equal(value, expected);
            assert.equal(states.get('familyMembers.A.presenceFiltered').val, expected);
        });
    }
    it('invalidates stale filtered absence when the history adapter is unavailable', async () => {
        const {adapter, states} = harness();
        adapter.historyAlive = {val: false};
        states.set('familyMembers.A.presenceFiltered', {val: false, q: 0});
        const value = await adapter.calcMemberAttributesNew({familymember: 'A', group: '', usefilter: true}, 0, false, new Date(), {absentMembers: '', absentCount: 0});
        assert.equal(value, null);
        assert.equal(states.get('familyMembers.A.presenceFiltered').q, 64);
    });
});
