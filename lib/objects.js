'use strict';

function _common(type, opt, i){
    const c = {};

    if (type == 'state' || type == 'channel' || type == 'device' || type == 'folder') {
        c.name = opt[i][2];
        c.desc = opt[i][8];
    } 
    if (type == 'state' || type == 'channel'){
        c.role = opt[i][4];
    }
    if (type == 'state'){
        c.type = opt[i][3];
        c.def = opt[i][5];
        c.read = opt[i][6];
        c.write = opt[i][7];
        if (opt[i][9] != 'undefinded') c.unit = opt[i][9];
    }
    if (type == 'device' || type == 'folder'){
        if (opt[i][10] != 'undefinded') c.icon = opt[i][10];
    }
    return c;
}

async function createGlobalObjects(that, table, tableGuest) {
    try {
        const opt = [
            // Legende: o - optional
            //id, type, common.name (o), common.type (o), common.role, common.def (o), common.rd, common.wr, common.desc (o) 
            //common.type (possible values: number, string, boolean, array, object, mixed, file)

            //info objects, states
            ['info.connection', 'state', 'info.connection', 'boolean', 'indicator', false, true, false, 'Fritzbox connection state'],
            ['info.X_AVM-DE_GetHostListPath', 'state', 'info.X_AVM-DE_GetHostListPath', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetHostListPath available'],
            ['info.GetSpecificHostEntry', 'state', 'info.GetSpecificHostEntry', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetSpecificHostEntry available'],
            ['info.X_AVM-DE_GetSpecificHostEntryByIP', 'state', 'info.X_AVM-DE_GetSpecificHostEntryByIP', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetSpecificHostEntryByIP available'],
            ['info.GetSecurityPort', 'state', 'info.GetSecurityPort', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetSecurityPort available'],
            ['info.GetInfo', 'state', 'info.GetInfo', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetInfo available'],
            ['info.extIp', 'state', 'info.extIp', 'string', 'value', '', true, false, 'external ip address'],
            ['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', new Date('1900-01-01T00:00:00'), true, false, 'last connection datetime'],

            //general states
            ['presence', 'state', 'presence', 'boolean', 'indicator', false, true, false, 'someone from the family is present'],
            ['presenceAll', 'state', 'presenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are present'],
            ['presentMembers', 'state', 'presentMembers', 'string', 'value', '', true, false, 'who is present'],
            ['absentMembers', 'state', 'absentMembers', 'string', 'value', '', true, false, 'who is absent'],
            ['json', 'state', 'json', 'string', 'json', '[]', true, false, 'Json table'],
            ['html', 'state', 'html', 'string', 'html', table, true, false, 'Html table'],
            ['devices', 'state', 'devices', 'number', 'value', 0, true, false, 'Number of devices'],
            ['activeDevices', 'state', 'activeDevices', 'number', 'value', 0, true, false, 'Number of active devices'],

            //guest objects, states
            ['guest', 'state', 'guest', 'boolean', 'indicator', false, true, false, 'Guest is logged in'],
            ['guest.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of guests'],
            ['guest.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Guest list json'],
            ['guest.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Guest list html'],
            ['guest.presence', 'state', 'guest.presence', 'boolean', 'indicator', false, true, false, 'a guest is present'],
            ['guest.wlan', 'state', 'guest.wlan', 'boolean', 'indicator', false, true, true, 'guest wlan is on or off'],

            //fb-devices objects, states
            ['fb-devices', 'folder', 'fb-devices', '', '', '', true, false, 'folder for fritzbox devices'],
            ['fb-devices.count', 'state', 'fb-devices.count', 'number', 'value', 0, true, false, 'Number of fritzbox devices'],
            ['fb-devices.active', 'state', 'fb-devices.active', 'number', 'value', 0, true, false, 'Number of active devices'],
            ['fb-devices.inactive', 'state', 'fb-devices.inactive', 'number', 'value', 0, true, false, 'Number of inactive devices'],
            ['fb-devices.json', 'state', 'fb-devices.json', 'string', 'json', [], true, false, 'fritzbox device list json'],
            ['fb-devices.mesh', 'state', 'fb-devices.mesh', 'string', 'json', [], true, false, 'fritzbox mesh list json'],
            ['fb-devices.jsonActive', 'state', 'fb-devices.jsonActive', 'string', 'json', [], true, false, 'fritzbox active device list json'],
            ['fb-devices.jsonInactive', 'state', 'fb-devices.jsonInactive', 'string', 'json', [], true, false, 'fritzbox inactive device list json'],
            ['fb-devices.html', 'state', 'fb-devices.html', 'string', 'html', '', true, false, 'fritzbox device list html'],

            //blacklist objects, states
            ['blacklist', 'state', 'blacklist', 'boolean', 'indicator', false, true, false, 'Unknown devices'],
            ['blacklist.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of unknown devices'],
            ['blacklist.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Unknown devices list json'],
            ['blacklist.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Unknown devices list html'],

            //whitelist objects, states
            ['whitelist', 'folder', 'whitelist', '', '', '', true, false, 'whitelist'],
            ['whitelist.count', 'state', 'whitelist.count', 'number', 'value', 0, true, false, 'Number of whitelist devices'],
            ['whitelist.json', 'state', 'whitelist.json', 'string', 'json', '[]', true, false, 'whitelist devices json'],
            ['whitelist.html', 'state', 'whitelist.html', 'string', 'html', tableGuest, true, false, 'whitelist devices html']
        ];

        for(let i=0; i < opt.length; i++) {
            const id = opt[i][0];
            const type = opt[i][1];
            const c = _common(type, opt, i);
            //that.log.info(JSON.stringify(c));
            if (await that.getObjectAsync(id)){
                await that.extendObjectAsync(id, {
                    type: type,
                    common: c,
                    native: {},
                });
            }else{
                await that.setObjectNotExistsAsync(id, {
                    type: type,
                    common: c,
                    native: {},
                });
            }
            if (type == 'state' && await that.getStateAsync(id) == null) that.setState(id, c.def, true); //set default
        }  
    } catch (error) {
        that.log.error(error);        
    }
}

async function createMemberObjects(that, member, table) { 
    try {
        const opt = [
            [member, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
            [member + '.presence', 'state', member + '.presence', 'boolean', 'indicator', false, true, false, 'state of the family member'],
            [member + '.history', 'state', 'history', 'string', 'json', [], true, false, 'history of the day as json table'],
            [member + '.historyHtml', 'state', 'historyHtml', 'string', 'html', table, true, false, 'history of the day as html table'],
            [member + '.going', 'state', 'going', 'string', 'date', new Date(), true, false, 'time when you leaving the home'],
            [member + '.comming', 'state', 'comming', 'string', 'date', new Date(), true, false, 'time when you arriving at home'],
            [member + '.speed', 'state', member + '.speed', 'string', 'value', '', true, false, 'Speed of the device'],
            [member + '.absent.since', 'state', member + '.absent.since', 'string', 'value', '0', true, false, 'absent since'],
            [member + '.present.since', 'state', member + '.present.since', 'string', 'value', '0', true, false, 'present since'],
            [member + '.absent.sum_day', 'state', member + '.absent.sum_day', 'string', 'value', '0', true, false, 'how long absent per day'],
            [member + '.present.sum_day', 'state', member + '.present.sum_day', 'string', 'value', '0', true, false, 'how long present per day']
        ];

        for(let i=0; i < opt.length; i++) { 
            const id = opt[i][0];
            const type = opt[i][1];
            const c = _common(type, opt, i);
            if (await that.getObjectAsync(id)){
                await that.extendObjectAsync(id, {
                    type: type,
                    common: c, 
                    native: {},
                });
            }else{
                await that.setObjectNotExistsAsync(id, {
                    type: type,
                    common: c,
                    native: {},
                });
            }
            if (type == 'state' && await that.getStateAsync(id) == null) that.setState(id, c.def, true); //set default
        }  
    } catch (error) {
        that.log.error(error);        
    }
}

async function createFbDeviceObjects(that, device) { 
    try {
        let hostName = device;
        if (device.includes('.')){
            hostName = hostName.replace('.', '-');
        }

        const opt = [
            //[device, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
            ['fb-devices.' + hostName, 'device', 'fb-devices.' + hostName, '', '', '', true, false, hostName + ' infos'],
            ['fb-devices.' + hostName + '.meshstate', 'state', 'fb-devices.' + hostName + '.meshstate', 'boolean', 'indicator', '', true, false, 'meshstate state of the device'],
            ['fb-devices.' + hostName + '.macaddress', 'state', hostName + '.macaddress', 'string', 'value', '', true, false, 'MAC address of the device'],
            ['fb-devices.' + hostName + '.ipaddress', 'state', hostName + '.ipaddress', 'string', 'value', '', true, false, 'IP address of the device'],
            ['fb-devices.' + hostName + '.active', 'state', hostName + '.active', 'boolean', 'indicator', false, true, false, 'State of the device'],
            ['fb-devices.' + hostName + '.interfacetype', 'state', hostName + '.interfacetype', 'string', 'value', '', true, false, 'Interface type of the device'],
            ['fb-devices.' + hostName + '.speed', 'state', hostName + '.speed', 'string', 'value', '', true, false, 'Speed of the device'],
            ['fb-devices.' + hostName + '.guest', 'state', hostName + '.guest', 'boolean', 'indicator', false, true, false, 'Guest state of the device'],
            ['fb-devices.' + hostName + '.whitelist', 'state', hostName + '.whitelist', 'boolean', 'indicator', false, true, false, 'Whitelist member'],
            ['fb-devices.' + hostName + '.blacklist', 'state', hostName + '.blacklist', 'string', 'indicator', false, true, false, 'Blacklist member']
        ];

        for(let i=0; i < opt.length; i++) { 
            const id = opt[i][0];
            const type = opt[i][1];
            const c = _common(type, opt, i);
            if (await that.getObjectAsync(id)){
                await that.extendObjectAsync(id, {
                    type: type,
                    common: c,
                    native: {},
                });
            }else{
                await that.setObjectNotExistsAsync(id, {
                    type: type,
                    common: c,
                    native: {},
                });
            }
            if (type == 'state' && await that.getStateAsync(id) == null) that.setState(id, c.def, true); //set default
        }  
    } catch (error) {
        that.log.error(error);        
    }
}

async function createMeshObjects(that, device, channel) { 
    try {
        let hostName = device;
        //that.log.info(channel);
        if (device.includes('.')){
            hostName = hostName.replace('.', '-');
        }

        const opt = [
            //[device, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
            ['fb-devices.' + hostName + '.' + channel, 'channel', 'fb-devices.' + hostName + '.' + channel, '', '', '', true, false, hostName + ' interface'],
            ['fb-devices.' + hostName + '.' + channel + '.name', 'state', 'fb-devices.' + hostName + '.' + channel + '.name', 'string', 'value', '', true, false, 'name of the interface'],
            //['fb-devices.' + hostName + '.' + channel + '.security', 'state', 'fb-devices.' + hostName + '.' + channel + '.security', 'string', 'value', '', true, false, 'security of the interface'],
            ['fb-devices.' + hostName + '.' + channel + '.link', 'state', 'fb-devices.' + hostName + '.' + channel + '.link', 'string', 'value', '', true, false, 'links of the interface'],
            ['fb-devices.' + hostName + '.' + channel + '.cur_data_rate_rx', 'state', 'fb-devices.' + hostName + '.' + channel + '.cur_data_rate_rx', 'string', 'value', '', true, false, 'Current data rate rx of the interface', 'Mbit/s'],
            ['fb-devices.' + hostName + '.' + channel + '.cur_data_rate_tx', 'state', 'fb-devices.' + hostName + '.' + channel + '.cur_data_rate_tx', 'string', 'value', '', true, false, 'Current data rate tx of the interface', 'Mbit/s'],
            ['fb-devices.' + hostName + '.' + channel + '.type', 'state', 'fb-devices.' + hostName + '.' + channel + '.type', 'string', 'value', '', true, false, 'type of the interface']
        ];

        for(let i=0; i < opt.length; i++) { 
            const id = opt[i][0];
            const type = opt[i][1];
            const c = _common(type, opt, i);
            if (await that.getObjectAsync(id)){
                await that.extendObjectAsync(id, {
                    type: type,
                    common: c,
                    native: {},
                });
            }else{
                await that.setObjectNotExistsAsync(id, {
                    type: type,
                    common: c,
                    native: {},
                });
            }
            if (type == 'state' && await that.getStateAsync(id) == null) that.setState(id, c.def, true); //set default
        }  
    } catch (error) {
        that.log.error(error);        
    }
}

module.exports = {
    createGlobalObjects: createGlobalObjects,
    createMemberObjects: createMemberObjects,
    createFbDeviceObjects: createFbDeviceObjects,
    createMeshObjects: createMeshObjects
};