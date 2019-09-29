'use strict';

const util = require('util');

async function createGlobalObjects(that, table, tableGuest) { //html + HTML_END
    const getStateP = util.promisify(that.getState);

	let opt = [
		//id, type, name, type, role, def, rd, wr, desc 
		//common.type (optional - (default is mixed==any type) (possible values: number, string, boolean, array, object, mixed, file)
		['info.connection', 'state', 'connection', 'boolean', 'indicator', false, true, false, 'Fritzbox connection state'],
		['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', '', true, false, 'last connection datetime'],
		['presence', 'state', 'presence', 'boolean', 'indicator', false, true, false, 'someone from the family is present'],
		['json', 'state', 'json', 'string', 'json', '[]', true, false, 'Json table'],
		['html', 'state', 'html', 'string', 'html', table, true, false, 'Html table'],
		['guest', 'state', 'guest', 'boolean', 'indicator', false, true, false, 'Guest is logged in'],
		['guest.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of guests'],
		['guest.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Guest list json'],
		['guest.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Guest list html'],
		['devices', 'state', 'devices', 'number', 'value', 0, true, false, 'Number of devices'],
		['activeDevices', 'state', 'activeDevices', 'number', 'value', 0, true, false, 'Number of active devices']
	]

	for(let i=0; i < opt.length; i++) { 
		await that.setObjectNotExists(opt[i][0], {
			type: opt[i][1],
			common: {
				name: opt[i][2],
				type: opt[i][3],
				role: opt[i][4],
				def: opt[i][5],
				read: opt[i][6],
				write: opt[i][7],
				desc: opt[i][8],
			},
			native: {},
		});
		if (await getStateP(opt[i][0]) == null) that.setState(opt[i][0], opt[i][5], true); //set default
	}
}

async function createMemberObjects(that, member, table) { //HTML_HISTORY + HTML_END
    const getStateP = util.promisify(that.getState);

	let opt = [
		//id, type, name, type, role, def, rd, wr, desc 
		//common.type (optional - (default is mixed==any type) (possible values: number, string, boolean, array, object, mixed, file)
		[member, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
		[member + '.history', 'state', 'history', 'string', 'json', [], true, false, 'history of the day as json table'],
		[member + '.historyHtml', 'state', 'historyHtml', 'string', 'html', table, true, false, 'history of the day as html table'],
		[member + '.going', 'state', 'going', 'string', 'date', '', true, false, 'time when you leaving the home'],
		[member + '.comming', 'state', 'comming', 'string', 'date', '', true, false, 'time when you arriving at home'],
		[member + '.absent.since', 'state', member + '.absent.since', 'string', 'value', '0', true, false, 'absent since'],
		[member + '.present.since', 'state', member + '.present.since', 'string', 'value', '0', true, false, 'present since'],
		[member + '.absent.sum_day', 'state', member + '.absent.sum_day', 'string', 'value', '0', true, false, 'how long absent per day'],
		[member + '.present.sum_day', 'state', member + '.present.sum_day', 'string', 'value', '0', true, false, 'how long present per day']
	]

	for(let i=0; i < opt.length; i++) { 
		await that.setObjectNotExists(opt[i][0], {
			type: opt[i][1],
			common: {
				name: opt[i][2],
				type: opt[i][3],
				role: opt[i][4],
				def: opt[i][5],
				read: opt[i][6],
				write: opt[i][7],
				desc: opt[i][8],
			},
			native: {},
		});
		if (await getStateP(opt[i][0]) == null) that.setState(opt[i][0], opt[i][5], true); //set default
	}
}

/*async function createGlobalObjects(gthis, opt) {
    //Create higher-level objects
    
    //Promisify some async functions
    const getStateP = util.promisify(gthis.getState);

    await gthis.setObjectNotExists('info.connection', {
        type: 'state',
        common: {
            name: 'Fritzbox connection state',
            type: 'boolean',
            role: 'indicator',
            def: false,
            read: true,
            write: false,
        },
        native: {},
    });
    // Reset connection state at start
    gthis.setState('info.connection', false, true);

    await gthis.setObjectNotExists('presence', {
        type: 'state',
        common: {
            name: 'someone from the family is present',
            type: 'boolean',
            role: 'indicator',
            def: false,
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP('presence') == null) gthis.setState('presence', false, true);

    await gthis.setObjectNotExists('json', {
        type: 'state',
        common: {
            name: 'JSON table',
            type: 'string',
            role: 'json',
            def: '[]',
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP('json') == null) gthis.setState('json', '[]', true);

    await gthis.setObjectNotExists('html', {
        type: 'state',
        common: {
            name: 'HTML table',
            type: 'string',
            role: 'html',
            def: html + HTML_END,
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP('html') == null) gthis.setState('html', html + HTML_END, true);
    
    await gthis.setObjectNotExists('info.lastupdate', {
        type: 'state',
        common: {
            name: 'last connection',
            type: 'string',
            role: 'date',
            def: '',
            read: true,
            write: false,
        },
        native: {},
    }); 

    await gthis.setObjectNotExists('guest', {
        type: 'state',
        common: {
            name: 'visitor is logged in',
            type: 'boolean',
            role: 'indicator',
            def: false,
            read: true,
            write: false,
        },
        native: {},
    }); 
    if (await getStateP('guest') == null) gthis.setState('guest', false, true);

    await gthis.setObjectNotExists('guest.count', {
        type: 'state',
        common: {
            name: 'number of visitors are logged in',
            type: 'number',
            role: 'value',
            def: 0,
            read: true,
            write: false,
        },
        native: {},
    }); 
    if (await getStateP('guest.count') == null) gthis.setState('guest.count', 0, true);

    await gthis.setObjectNotExists('guest.listJson', {
        type: 'state',
        common: {
            name: 'list of visitors',
            type: 'string',
            role: 'json',
            def: '[]',
            read: true,
            write: false,
        },
        native: {},
    }); 
    if (await getStateP('guest.listJson') == null) gthis.setState('guest.listJson', '[]', true);

    await gthis.setObjectNotExists('guest.listHtml', {
        type: 'state',
        common: {
            name: 'list of visitors',
            type: 'string',
            role: 'html',
            def: HTML_GUEST + HTML_END,
            read: true,
            write: false,
        },
        native: {},
    }); 
    if (await getStateP('guest.listHtml') == null) gthis.setState('guest.listHtml', HTML_GUEST + HTML_END, true);

    await gthis.setObjectNotExists('devices', {
        type: 'state',
        common: {
            name: 'devices',
            type: 'number',
            role: 'value',
            def: 0,
            read: true,
            write: false,
        },
        native: {},
    }); 
    if (await getStateP('devices') == null) gthis.setState('devices', 0, true);

    await gthis.setObjectNotExists('activeDevices', {
        type: 'state',
        common: {
            name: 'active  devices',
            type: 'number',
            role: 'value',
            def: 0,
            read: true,
            write: false,
        },
        native: {},
    }); 
    if (await getStateP('activeDevices') == null) gthis.setState('activeDevices', 0, true);
}

async function createMemberObjects(gthis, member){
    //Promisify some async functions
    const getStateP = util.promisify(gthis.getState);


    await gthis.setObjectNotExists(member, {
        type: 'state',
        common: {
            name: 'family member',
            type: 'boolean',
            role: 'indicator',
            def: false,
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member) == null) gthis.setState(member, false, true);

    await gthis.setObjectNotExists(member + '.history', {
        type: 'state',
        common: {
            name: 'history of the day as json table',
            type: 'string',
            role: 'json',
            def: '[]',
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.history') == null) gthis.setState(member + '.history', '[]', true);

    await gthis.setObjectNotExists(member + '.historyHtml', {
        type: 'state',
        common: {
            name: 'history of the day as html table',
            type: 'string',
            role: 'html',
            def: HTML_HISTORY + HTML_END,
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.historyHtml') == null) gthis.setState(member + '.historyHtml', HTML_HISTORY + HTML_END, true);
    
    await gthis.setObjectNotExists(member + '.going', {
        type: 'state',
        common: {
            name: 'time when you leaving the home',
            type: 'string',
            role: 'date',
            unit: '',
            def: '-',
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.going') == null) gthis.setState(member + '.going', '-', true);
    
    await gthis.setObjectNotExists(member + '.comming', {
        type: 'state',
        common: {
            name: 'time when you arriving at home',
            type: 'string',
            role: 'date',
            unit: '',
            def: '-',
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.comming') == null) gthis.setState(member + '.comming', '-', true);
    
    await gthis.setObjectNotExists(member + '.absent.since', {
        type: 'state',
        common: {
            name: 'absent since',
            type: 'string',
            role: 'value',
            unit: 'min.',
            def: '-',
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.absent.since') == null) gthis.setState(member + '.absent.since', '-', true);

    await gthis.setObjectNotExists(member + '.present.since', {
        type: 'state',
        common: {
            name: 'present since',
            type: 'string',
            role: 'value',
            unit: 'min.',
            def: '-',
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.present.since') == null) gthis.setState(member + '.present.since', '-', true);

    await gthis.setObjectNotExists(member + '.absent.sum_day', {
        type: 'state',
        common: {
            name: 'how long absent per day',
            type: 'string',
            role: 'value',
            unit: 'min.',
            def: '-',
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.absent.sum_day') == null) gthis.setState(member + '.absent.sum_day', '-', true);
    
    await gthis.setObjectNotExists(member + '.present.sum_day', {
        type: 'state',
        common: {
            name: 'how long present per day',
            type: 'string',
            role: 'value',
            unit: 'min.',
            def: '-',
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.present.sum_day') == null) gthis.setState(member + '.present.sum_day', '-', true);
}*/

module.exports = {
	createGlobalObjects: createGlobalObjects,
	createMemberObjects: createMemberObjects
};