'use strict';

const FORBIDDEN_CHARS = /[\][.*,;'"`<>\\?\s]+/g;

//Helper function
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

//Helper function for creating and upating objects
async function _createObjects(message, that, opt, enabled, adapterStates) {
    try {
        for(let i=0; i < opt.length && enabled == true; i++) {
            const id = opt[i][0];
            const type = opt[i][1];
            const c = _common(type, opt, i);
            const obj = await that.getObjectAsync(id);
            if (obj) {
                const objExt = await that.extendObjectAsync(id, {type: type, common: c, native: {},});
                if (!objExt){
                    throw ('Could not extend object with id <' + id + '>');
                }
            }else{
                const objNotExist = await that.setObjectNotExistsAsync(id, {type: type, common: c, native: {}});
                if (!objNotExist){
                    throw ('Could not create object with id <' + id + '>');
                }
            } 
            if (type == 'state') {
                const state = await that.getStateAsync(id);
                if (state.val == null){
                    that.setState(id, c.def, true); //set default
                    state.val = c.def;
                }
                if (adapterStates) adapterStates.push({id: id, state: state});
            }
        }
        return true;          
    } catch (error) {
        that.log.error('_createObjects' + JSON.stringify(error));
        return false;    
    }
}

async function _enableHistory(that, cfg, familyMember) {
    try {
        let alias = '';
        const member = familyMember;
        const result = await that.sendToAsync(cfg.history, 'getEnabledDPs', {});
        if (result[`${that.namespace}` + '.' + member] != undefined && result[`${that.namespace}` + '.' + member].aliasId != undefined){
            alias = result[`${that.namespace}` + '.' + member].aliasId;
        }
        if (result[`${that.namespace}` + '.' + member] != undefined && result[`${that.namespace}` + '.' + member].enabled == true){
            return true;
        }else{
            const result2 = await that.sendToAsync(cfg.history, 'enableHistory', {
                id: `${that.namespace}` + '.' + member,
                options: {
                    changesOnly:  true,
                    debounce:     0,
                    retention:    31536000,
                    maxLength:    10,
                    changesMinDelta: 0,
                    aliasId: alias
                }
            });
            if (result2.error) {
                return false;
            }
            if (result2.success) {
                that.log.debug('enableHistory.2 ' + member + ' ' + result2.success);
                return true;
            }
        }
        //}else{
        //}
    } catch (error) {
        return false;
    }
}

async function createGlobalObjects(that, adapterStates, table, tableGuest, enabled) {
    try {
        const opt = [
            // Legende: o - optional
            //id, type, common.name (o), common.type (o), common.role, common.def (o), common.rd, common.wr, common.desc (o) 
            //common.type (possible values: number, string, boolean, array, object, mixed, file)

            //info objects, states
            ['info.connection', 'state', 'info.connection', 'boolean', 'indicator', false, true, false, 'Fritzbox connection state'],
            ['info.X_AVM-DE_GetHostListPath', 'state', 'info.X_AVM-DE_GetHostListPath', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetHostListPath available'],
            ['info.X_AVM-DE_GetMeshListPath', 'state', 'info.X_AVM-DE_GetMeshListPath', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetMeshListPath available'],
            ['info.GetSpecificHostEntry', 'state', 'info.GetSpecificHostEntry', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetSpecificHostEntry available'],
            ['info.X_AVM-DE_GetSpecificHostEntryByIP', 'state', 'info.X_AVM-DE_GetSpecificHostEntryByIP', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetSpecificHostEntryByIP available'],
            ['info.GetSecurityPort', 'state', 'info.GetSecurityPort', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetSecurityPort available'],
            ['info.GetInfo', 'state', 'info.GetInfo', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetInfo available'],
            ['info.SetEnable', 'state', 'info.SetEnable', 'boolean', 'indicator', false, true, false, 'Fritzbox service SetEnable available'],
            ['info.WLANConfiguration3-GetInfo', 'state', 'info.WLANConfiguration3-GetInfo', 'boolean', 'indicator', false, true, false, 'Fritzbox service WLANConfiguration3-GetInfo available'],
            ['info.WLANConfiguration3-GetSecurityKeys', 'state', 'info.GetSecurityKeys', 'boolean', 'indicator', false, true, false, 'Fritzbox service WLANConfiguration3-GetSecurityKeys available'],
            ['info.X_AVM-DE_GetCurrentUser', 'state', 'info.X_AVM-DE_GetCurrentUser', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetCurrentUser available'],
            ['info.DisallowWANAccessByIP', 'state', 'info.DisallowWANAccessByIP', 'boolean', 'indicator', false, true, false, 'Fritzbox service DisallowWANAccessByIP available'],
            ['info.GetWANAccessByIP', 'state', 'info.GetWANAccessByIP', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetWANAccessByIP available'],
            ['info.Reboot', 'state', 'info.Reboot', 'boolean', 'indicator', false, true, false, 'Fritzbox service Reboot available'],
            ['info.DeviceInfo1-GetInfo', 'state', 'info.DeviceInfo1-GetInfo', 'boolean', 'indicator', false, true, false, 'Fritzbox service DeviceInfo1-GetInfo available'],

            ['info.extIp', 'state', 'info.extIp', 'string', 'value', '', true, false, 'external ip address'],
            ['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', new Date('1900-01-01T00:00:00'), true, false, 'last connection datetime'],

            //general states
            ['presence', 'state', 'presence', 'boolean', 'indicator', false, true, false, 'someone from the family are present'],
            ['presenceAll', 'state', 'presenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are present'],
            ['absence', 'state', 'absence', 'boolean', 'indicator', false, true, false, 'someone from the family are absent'],
            ['absenceAll', 'state', 'absenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are absent'],
            ['presentMembers', 'state', 'presentMembers', 'string', 'value', '', true, false, 'who is present'],
            ['absentMembers', 'state', 'absentMembers', 'string', 'value', '', true, false, 'who is absent'],
            ['presentCount', 'state', 'presentCount', 'number', 'value', 0, true, false, 'who is present'],
            ['absentCount', 'state', 'absentCount', 'number', 'value', 0, true, false, 'who is absent'],
            ['json', 'state', 'json', 'string', 'json', '[]', true, false, 'Json table'],
            ['html', 'state', 'html', 'string', 'html', table, true, false, 'Html table'],
            ['devices', 'state', 'devices', 'number', 'value', 0, true, false, 'Number of devices'],
            ['reboot', 'state', 'reboot', 'boolean', 'indicator', false, true, true, 'Reboot Fritzbox'],
            ['activeDevices', 'state', 'activeDevices', 'number', 'value', 0, true, false, 'Number of active devices'],

            //guest objects, states
            ['guest', 'state', 'guest', 'boolean', 'indicator', false, true, false, 'Guest is logged in'],
            ['guest.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of guests'],
            ['guest.presentGuests', 'state', 'presentGuests', 'string', 'value', '', true, false, 'Guests present'],
            ['guest.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Guest list json'],
            ['guest.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Guest list html'],
            ['guest.presence', 'state', 'guest.presence', 'boolean', 'indicator', false, true, false, 'a guest is present'],
            ['guest.wlanQR', 'state', 'guest.wlanQR', 'string', 'value', false, true, true, 'guest wlan QR code'],
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
        await _createObjects('createGlobalObjects', that, opt, enabled, adapterStates);
        that.log.info('createGlobalObjects finished successfully');
        return true;
    } catch (error) {
        that.log.error('createGlobalObjects: ' + error.message + ' - ' + error.stack);
        return false;
    }
}

async function createMemberObjects(that, adapterStates, cfg, table, enabled) {
    try {
        if (cfg.members.length == 0) {
            throw('no family members defined! Objects are not created!');
        }else{
            //Create objects for family members
            const membersFiltered = cfg.members.filter(x => x.enabled == true);
            for (let k = 0; k < membersFiltered.length; k++) {
                const memberRow = membersFiltered[k];
                const member = memberRow.familymember;
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
                await _createObjects('createMemberObjects', that, opt, enabled, adapterStates);
                if (cfg.history != ''){
                    await _enableHistory(that, cfg, member);
                }else{
                    that.log.info('History function for ' + member + ' disabled. Please select a history adapter in the configuration dialog!');
                }
            }
            that.log.info('createMemberObjects finished successfully');
            return true;
        }         
    } catch (error) {
        that.log.warn('createMemberObjects: ' + + error.message + ' - ' + error.stack);
        return false;      
    }
}

async function createFbDeviceObjects(that, adapterStates, hosts, enabled) { 
    try {
        if (!hosts) throw('createFbDeviceObjects: hosts = null');
        //let count=0;
        //const length = hosts.length;
        for (let i = 0; i < hosts.length; i++) {
            const device = hosts[i]['hn'];
            //const n = items.indexOfObject('HostName', items[i]['HostName'], i);
            //if (n != -1 ) gthis.log.warn('duplicate fritzbox device item. Please correct the hostname in the fritzbox settings for the device -> ' + items[i]['HostName'] + ' ' + items[i]['MACAddress']);
            const hostName = device.replace(FORBIDDEN_CHARS, '-');
            const opt = [
                //[device, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
                ['fb-devices.' + hostName, 'device', 'fb-devices.' + hostName, '', '', '', true, false, device],
                ['fb-devices.' + hostName + '.meshstate', 'state', 'fb-devices.' + hostName + '.meshstate', 'boolean', 'indicator', '', true, false, 'meshstate state of the device'],
                ['fb-devices.' + hostName + '.macaddress', 'state', hostName + '.macaddress', 'string', 'value', '', true, false, 'MAC address of the device'],
                ['fb-devices.' + hostName + '.ipaddress', 'state', hostName + '.ipaddress', 'string', 'value', '', true, false, 'IP address of the device'],
                ['fb-devices.' + hostName + '.active', 'state', hostName + '.active', 'boolean', 'indicator', false, true, false, 'State of the device'],
                ['fb-devices.' + hostName + '.disabled', 'state', hostName + '.disabled', 'boolean', 'indicator', false, true, true, 'device disabled?'],
                ['fb-devices.' + hostName + '.interfacetype', 'state', hostName + '.interfacetype', 'string', 'value', '', true, false, 'Interface type of the device'],
                ['fb-devices.' + hostName + '.speed', 'state', hostName + '.speed', 'number', 'value', '', true, false, 'Speed of the device', 'Mbit/s'],
                ['fb-devices.' + hostName + '.guest', 'state', hostName + '.guest', 'boolean', 'indicator', false, true, false, 'Guest state of the device'],
                ['fb-devices.' + hostName + '.whitelist', 'state', hostName + '.whitelist', 'boolean', 'indicator', false, true, false, 'Whitelist member'],
                ['fb-devices.' + hostName + '.blacklist', 'state', hostName + '.blacklist', 'string', 'indicator', false, true, false, 'Blacklist member']
            ];
            await _createObjects('createFbDeviceObjects', that, opt, enabled, adapterStates);
            //count++;
            /*if (length == count) {
                return true;
            }*/
        }
        //that.log.info('createFbDeviceObjects finished successfully');
        return true;
    } catch (error) {
        that.log.warn('createFbDeviceObjects: ' + error.message + ' - ' + error.stack);
        return false;    
    }
}

async function createMeshObjects(that, items, channel, enabled) { 
    try {
        //let count = 0;
        //const length = items.length;
        for (let i = 0; i < items.length; i++) {
            const device = items[i]['HostName'];
            const hostName = device.replace(FORBIDDEN_CHARS, '-');
            const opt = [
                //[device, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
                ['fb-devices.' + hostName + '.' + channel, 'channel', 'fb-devices.' + hostName + '.' + channel, '', '', '', true, false, hostName + ' interface'],
                ['fb-devices.' + hostName + '.' + channel + '.name', 'state', 'fb-devices.' + hostName + '.' + channel + '.name', 'string', 'value', '', true, false, 'name of the interface'],
                //['fb-devices.' + hostName + '.' + channel + '.security', 'state', 'fb-devices.' + hostName + '.' + channel + '.security', 'string', 'value', '', true, false, 'security of the interface'],
                ['fb-devices.' + hostName + '.' + channel + '.link', 'state', 'fb-devices.' + hostName + '.' + channel + '.link', 'string', 'value', '', true, false, 'links of the interface'],
                ['fb-devices.' + hostName + '.' + channel + '.rx_rcpi', 'state', 'fb-devices.' + hostName + '.' + channel + '.rx_rcpi', 'number', 'value', 0, true, false, 'Current rx_rcpi of the interface', 'dBm'],
                ['fb-devices.' + hostName + '.' + channel + '.cur_data_rate_rx', 'state', 'fb-devices.' + hostName + '.' + channel + '.cur_data_rate_rx', 'number', 'value', 0, true, false, 'Current data rate rx of the interface', 'Mbit/s'],
                ['fb-devices.' + hostName + '.' + channel + '.cur_data_rate_tx', 'state', 'fb-devices.' + hostName + '.' + channel + '.cur_data_rate_tx', 'number', 'value', 0, true, false, 'Current data rate tx of the interface', 'Mbit/s'],
                ['fb-devices.' + hostName + '.' + channel + '.type', 'state', 'fb-devices.' + hostName + '.' + channel + '.type', 'string', 'value', '', true, false, 'type of the interface']
            ];
            await _createObjects('createMeshObjects', that, opt, enabled);
            //count++;
            /*if (length == count) {
                return true;
            }*/
        }
        return true;
    } catch (error) {
        that.log.warn('createMeshObjects: ' + error.message + ' - ' + error.stack);
        return false;      
    }
}

async function createMeshObject(that, hostname, channel, enabled) { 
    try {
        const hostName = hostname.replace(FORBIDDEN_CHARS, '-');
        const opt = [
            //[device, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
            ['fb-devices.' + hostName + '.' + channel, 'channel', 'fb-devices.' + hostName + '.' + channel, '', '', '', true, false, hostName + ' interface'],
            ['fb-devices.' + hostName + '.' + channel + '.name', 'state', 'fb-devices.' + hostName + '.' + channel + '.name', 'string', 'value', '', true, false, 'name of the interface'],
            //['fb-devices.' + hostName + '.' + channel + '.security', 'state', 'fb-devices.' + hostName + '.' + channel + '.security', 'string', 'value', '', true, false, 'security of the interface'],
            ['fb-devices.' + hostName + '.' + channel + '.link', 'state', 'fb-devices.' + hostName + '.' + channel + '.link', 'string', 'value', '', true, false, 'links of the interface'],
            ['fb-devices.' + hostName + '.' + channel + '.rx_rcpi', 'state', 'fb-devices.' + hostName + '.' + channel + '.rx_rcpi', 'number', 'value', 0, true, false, 'Current rx_rcpi of the interface', 'dBm'],
            ['fb-devices.' + hostName + '.' + channel + '.cur_data_rate_rx', 'state', 'fb-devices.' + hostName + '.' + channel + '.cur_data_rate_rx', 'number', 'value', 0, true, false, 'Current data rate rx of the interface', 'Mbit/s'],
            ['fb-devices.' + hostName + '.' + channel + '.cur_data_rate_tx', 'state', 'fb-devices.' + hostName + '.' + channel + '.cur_data_rate_tx', 'number', 'value', 0, true, false, 'Current data rate tx of the interface', 'Mbit/s'],
            ['fb-devices.' + hostName + '.' + channel + '.type', 'state', 'fb-devices.' + hostName + '.' + channel + '.type', 'string', 'value', '', true, false, 'type of the interface']
        ];
        await _createObjects('createMeshObject', that, opt, enabled);
        return true;
    } catch (error) {
        that.log.warn('createMeshObject: ' + error.message + ' - ' + error.stack);
        return false;      
    }
}

module.exports = {
    createGlobalObjects: createGlobalObjects,
    createMemberObjects: createMemberObjects,
    createFbDeviceObjects: createFbDeviceObjects,
    createMeshObjects: createMeshObjects,
    createMeshObject: createMeshObject
};