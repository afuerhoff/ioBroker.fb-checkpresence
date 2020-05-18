'use strict';

//const util = require('util');

async function createGlobalObjects(that, table, tableGuest) { //html + HTML_END
    //const getStateP = util.promisify(that.getState);

    const opt = [
        //id, type, name, type, role, def, rd, wr, desc 
        //common.type (optional - (default is mixed==any type) (possible values: number, string, boolean, array, object, mixed, file)
        ['info.connection', 'state', 'info.connection', 'boolean', 'indicator', false, true, false, 'Fritzbox connection state'],
        ['info.X_AVM-DE_GetHostListPath', 'state', 'info.X_AVM-DE_GetHostListPath', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetHostListPath available'],
        ['info.GetSpecificHostEntry', 'state', 'info.GetSpecificHostEntry', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetSpecificHostEntry available'],
        ['info.X_AVM-DE_GetSpecificHostEntryByIP', 'state', 'info.X_AVM-DE_GetSpecificHostEntryByIP', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetSpecificHostEntryByIP available'],
        ['info.GetSecurityPort', 'state', 'info.GetSecurityPort', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetSecurityPort available'],
        ['info.extIp', 'state', 'info.extIp', 'string', 'value', '', true, false, 'external ip address'],
        ['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', new Date('1900-01-01T00:00:00'), true, false, 'last connection datetime'],
        ['presence', 'state', 'presence', 'boolean', 'indicator', false, true, false, 'someone from the family is present'],
        ['presenceAll', 'state', 'presenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are present'],
        ['presentMembers', 'state', 'presentMembers', 'string', 'value', '', true, false, 'who is present'],
        ['absentMembers', 'state', 'absentMembers', 'string', 'value', '', true, false, 'who is absent'],
        ['json', 'state', 'json', 'string', 'json', '[]', true, false, 'Json table'],
        ['html', 'state', 'html', 'string', 'html', table, true, false, 'Html table'],
        ['guest', 'state', 'guest', 'boolean', 'indicator', false, true, false, 'Guest is logged in'],
        ['guest.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of guests'],
        ['guest.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Guest list json'],
        ['guest.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Guest list html'],
        ['fb-devices', 'folder', 'fb-devices', '', '', '', true, false, 'folder for fritzbox devices'],
        ['fb-devices.count', 'state', 'fb-devices.count', 'number', 'value', 0, true, false, 'Number of fritzbox devices'],
        ['fb-devices.active', 'state', 'fb-devices.active', 'number', 'value', 0, true, false, 'Number of active devices'],
        ['fb-devices.inactive', 'state', 'fb-devices.inactive', 'number', 'value', 0, true, false, 'Number of inactive devices'],
        ['fb-devices.json', 'state', 'fb-devices.json', 'string', 'json', [], true, false, 'fritzbox device list json'],
        ['fb-devices.jsonActive', 'state', 'fb-devices.jsonActive', 'string', 'json', [], true, false, 'fritzbox active device list json'],
        ['fb-devices.jsonInactive', 'state', 'fb-devices.jsonInactive', 'string', 'json', [], true, false, 'fritzbox inactive device list json'],
        ['fb-devices.html', 'state', 'fb-devices.html', 'string', 'html', '', true, false, 'fritzbox device list html'],
        ['devices', 'state', 'devices', 'number', 'value', 0, true, false, 'Number of devices'],
        ['activeDevices', 'state', 'activeDevices', 'number', 'value', 0, true, false, 'Number of active devices'],
        ['blacklist', 'state', 'blacklist', 'boolean', 'indicator', false, true, false, 'Unknown devices'],
        ['blacklist.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of unknown devices'],
        ['blacklist.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Unknown devices list json'],
        ['blacklist.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Unknown devices list html'],
        ['whitelist', 'device', 'whitelist', '', '', '', true, false, 'whitelist'],
        ['whitelist.count', 'state', 'whitelist.count', 'number', 'value', 0, true, false, 'Number of whitelist devices'],
        ['whitelist.json', 'state', 'whitelist.json', 'string', 'json', '[]', true, false, 'whitelist devices json'],
        ['whitelist.html', 'state', 'whitelist.html', 'string', 'html', tableGuest, true, false, 'whitelist devices html']
    ];

    for(let i=0; i < opt.length; i++) { 
        await that.setObjectNotExistsAsync(opt[i][0], {
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
        if (await that.getStateAsync(opt[i][0]) == null) that.setState(opt[i][0], opt[i][5], true); //set default
    }
}

async function createMemberObjects(that, member, table) { //HTML_HISTORY + HTML_END
    //const getStateP = util.promisify(that.getState);
    const dnow = new Date();

    const opt = [
        //id, type, name, type, role, def, rd, wr, desc 
        //common.type (optional - (default is mixed==any type) (possible values: number, string, boolean, array, object, mixed, file)
        [member, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
        [member + '.presence', 'state', member + '.presence', 'boolean', 'indicator', false, true, false, 'state of the family member'],
        [member + '.history', 'state', 'history', 'string', 'json', [], true, false, 'history of the day as json table'],
        [member + '.historyHtml', 'state', 'historyHtml', 'string', 'html', table, true, false, 'history of the day as html table'],
        [member + '.going', 'state', 'going', 'string', 'date', dnow, true, false, 'time when you leaving the home'],
        [member + '.comming', 'state', 'comming', 'string', 'date', dnow, true, false, 'time when you arriving at home'],
        [member + '.speed', 'state', member + '.speed', 'string', 'value', '', true, false, 'Speed of the device'],
        [member + '.absent.since', 'state', member + '.absent.since', 'string', 'value', '0', true, false, 'absent since'],
        [member + '.present.since', 'state', member + '.present.since', 'string', 'value', '0', true, false, 'present since'],
        [member + '.absent.sum_day', 'state', member + '.absent.sum_day', 'string', 'value', '0', true, false, 'how long absent per day'],
        [member + '.present.sum_day', 'state', member + '.present.sum_day', 'string', 'value', '0', true, false, 'how long present per day']
    ];

    for(let i=0; i < opt.length; i++) { 
        await that.setObjectNotExistsAsync(opt[i][0], {
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
        if (await that.getStateAsync(opt[i][0]) == null) that.setState(opt[i][0], opt[i][5], true); //set default
    }
}

async function createFbDeviceObjects(that, device) { //HTML_HISTORY + HTML_END
    //const getStateP = util.promisify(that.getState);
    //const getObjectP = util.promisify(that.getObject);
    //const dnow = new Date();

    const opt = [
        //id, type, name, type, role, def, rd, wr, desc 
        //common.type (optional - (default is mixed==any type) (possible values: number, string, boolean, array, object, mixed, file)
        //[device, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
        ['fb-devices.' + device, 'device', 'fb-devices.' + device, '', '', '', true, false, device + ' infos'],
        ['fb-devices.' + device + '.macaddress', 'state', device + '.macaddress', 'string', 'value', '', true, false, 'MAC address of the device'],
        ['fb-devices.' + device + '.ipaddress', 'state', device + '.ipaddress', 'string', 'value', '', true, false, 'IP address of the device'],
        ['fb-devices.' + device + '.active', 'state', device + '.active', 'boolean', 'indicator', false, true, false, 'State of the device'],
        ['fb-devices.' + device + '.interfacetype', 'state', device + '.interfacetype', 'string', 'value', '', true, false, 'Interface type of the device'],
        ['fb-devices.' + device + '.speed', 'state', device + '.speed', 'string', 'value', '', true, false, 'Speed of the device'],
        ['fb-devices.' + device + '.guest', 'state', device + '.guest', 'boolean', 'indicator', false, true, false, 'Guest state of the device'],
        ['fb-devices.' + device + '.whitelist', 'state', device + '.whitelist', 'boolean', 'indicator', false, true, false, 'Whitelist member'],
        ['fb-devices.' + device + '.blacklist', 'state', device + '.blacklist', 'string', 'indicator', false, true, false, 'Blacklist member']
    ];

    for(let i=0; i < opt.length; i++) { 
        if (await that.getObjectAsync(opt[i][0])){
            await that.extendObjectAsync(opt[i][0], {
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
        }else{
            await that.setObjectNotExistsAsync(opt[i][0], {
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
        }
        if (await that.getStateAsync(opt[i][0]) == null) that.setState(opt[i][0], opt[i][5], true); //set default
    }
}

module.exports = {
    createGlobalObjects: createGlobalObjects,
    createMemberObjects: createMemberObjects,
    createFbDeviceObjects: createFbDeviceObjects
};