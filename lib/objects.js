'use strict';

//const FORBIDDEN_CHARS = /[\][.*,;'"`<>\\?\s]+/g;

//Helper function
//Exceptions
function exceptionObjects(name, message){
    this.name = name; 
    this.message = message;
    this.toString = function() {
        return this.name + ': ' + this.message;
    };
}

function errorHandler(adapter, error, title){
    if (typeof error === 'string') {
        adapter.log.warn(title + error);
    }
    else if (typeof error === 'object')
    {
        if (error instanceof exceptionObjects) {
            adapter.log.warn(error.toString());
        }else{
            adapter.log.warn(JSON.stringify(error));
        }
    }        

}

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
async function _createObjects(message, that, opt, enabled, adapterStates, memberStates) {
    try {
        for(let i=0; i < opt.length; i++) {
            let msg = '';
            if (enabled === false) break;
            const id = opt[i][0];
            const type = opt[i][1];
            const c = _common(type, opt, i);
            msg += 'id: ' + id;
            const obj = await that.getObjectAsync(id);
            if (obj) {
                const objExt = await that.extendObjectAsync(id, {type: type, common: c, native: {},});
                if (!objExt){
                    throw new exceptionObjects('exceptionCouldNotExtendObj', 'Could not extend object with id <' + id + '>');
                }
                msg += ' extend obj';
            }else{
                const objNotExist = await that.setObjectNotExistsAsync(id, {type: type, common: c, native: {}});
                if (!objNotExist){
                    throw new exceptionObjects('exceptionCouldNotCreateObj', 'Could not create object with id <' + id + '>');
                }
                msg += ' obj not exist';
            } 
            if (type == 'state') {
                const state = await that.getStateAsync(id);
                if (state.val == null){
                    //that.setState(id, c.def, true); //set default
                    state.val = c.def;
                }
                if (adapterStates){
                    const ind = that.adapterStates.findIndex(x => x.id == id);
                    if (ind == -1) adapterStates.push({id: id, state: state});
                    if (ind >= 0) adapterStates[ind].state.val = state.val;
                }
                //if (memberStates && id.includes('.presence')) memberStates.push(JSON.parse(JSON.stringify({id: id, state: state})));
                if (memberStates && id.includes('.presence')) memberStates.push({...{id: id, state: state}});
                msg += ' state';
            }
            //if (message == 'createGlobalObjects') that.log.debug(msg);
        }
        return true;          
    } catch (error) {
        errorHandler(that, error, 'createObjects: ');
        //that.log.error('_createObjects' + JSON.stringify(error));
        return false;    
    }
}

async function _enableHistory(that, cfg, group, familyMember, historyAlive) {
    try {
        let alias = '';
        const member = familyMember;
        //const memberPath = group + member; 
        let id = null;
        if (group == '' && that.config.compatibility === true){
            id = group == '' ? member : group + member + '.presence';
        }
        if (group == '' && that.config.compatibility === false){
            id = 'familyMembers.' + member + '.presence';
        }
        if (group != ''){
            id = group + member + '.presence';
        }

        if (historyAlive === true){
            const result = await that.sendToAsync(cfg.history, 'getEnabledDPs', {});
            if (result[`${that.namespace}` + '.' + id] != undefined && result[`${that.namespace}` + '.' + id].aliasId != undefined){
                alias = result[`${that.namespace}` + '.' + id].aliasId;
            }
            if (result[`${that.namespace}` + '.' + id] != undefined && result[`${that.namespace}` + '.' + id].enabled == true){
                return true;
            }else{
                const result2 = await that.sendToAsync(cfg.history, 'enableHistory', {
                    id: `${that.namespace}` + '.' + id,
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
        }
    } catch (error) {
        errorHandler(that, error, 'enableHistory: ');
        return false;
    }
}

async function createGlobalObjects(that, adapterStates, table, tableGuest, enabled) {
    try {
        const optGeneral = [
            // Legende: o - optional
            //id, type, common.name (o), common.type (o), common.role, common.def (o), common.rd, common.wr, common.desc (o) 
            //common.type (possible values: number, string, boolean, array, object, mixed, file)

            //info objects, states
            ['info.connection', 'state', 'info.connection', 'boolean', 'indicator.connected', false, true, false, 'Fritzbox connection state'],
            ['info.X_AVM-DE_GetHostListPath', 'state', 'info.X_AVM-DE_GetHostListPath', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetHostListPath available'],
            ['info.X_AVM-DE_GetMeshListPath', 'state', 'info.X_AVM-DE_GetMeshListPath', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetMeshListPath available'],
            ['info.GetSpecificHostEntry', 'state', 'info.GetSpecificHostEntry', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetSpecificHostEntry available'],
            ['info.X_AVM-DE_GetSpecificHostEntryByIP', 'state', 'info.X_AVM-DE_GetSpecificHostEntryByIP', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetSpecificHostEntryByIP available'],
            ['info.GetSecurityPort', 'state', 'info.GetSecurityPort', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetSecurityPort available'],
            ['info.GetInfo', 'state', 'info.GetInfo', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetInfo available'],
            ['info.SetEnable', 'state', 'info.SetEnable', 'boolean', 'indicator', false, true, false, 'Fritzbox service SetEnable available'],
            ['info.WLANConfiguration3-GetInfo', 'state', 'info.WLANConfiguration3-GetInfo', 'boolean', 'indicator', false, true, false, 'Fritzbox service WLANConfiguration3-GetInfo available'],
            ['info.WLANConfiguration3-GetSecurityKeys', 'state', 'info.GetSecurityKeys', 'boolean', 'indicator', false, true, false, 'Fritzbox service WLANConfiguration3-GetSecurityKeys available'],
            ['info.ForceTermination', 'state', 'info.ForceTermination', 'boolean', 'indicator', false, true, false, 'Fritzbox service ForceTermination available'],
            ['info.GetCommonLinkProperties', 'state', 'info.GetCommonLinkProperties', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetCommonLinkProperties available'],
            ['info.X_AVM-DE_GetCurrentUser', 'state', 'info.X_AVM-DE_GetCurrentUser', 'boolean', 'indicator', false, true, false, 'Fritzbox service X_AVM-DE_GetCurrentUser available'],
            ['info.DisallowWANAccessByIP', 'state', 'info.DisallowWANAccessByIP', 'boolean', 'indicator', false, true, false, 'Fritzbox service DisallowWANAccessByIP available'],
            ['info.GetWANAccessByIP', 'state', 'info.GetWANAccessByIP', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetWANAccessByIP available'],
            ['info.Reboot', 'state', 'info.Reboot', 'boolean', 'indicator', false, true, false, 'Fritzbox service Reboot available'],
            ['info.DeviceInfo1-GetInfo', 'state', 'info.DeviceInfo1-GetInfo', 'boolean', 'indicator', false, true, false, 'Fritzbox service DeviceInfo1-GetInfo available'],
            ['info.GetDefaultConnectionService', 'state', 'info.GetDefaultConnectionService', 'boolean', 'indicator', false, true, false, 'Fritzbox service GetDefaultConnectionService available'],
            ['info.extIp', 'state', 'info.extIp', 'string', 'value', '', true, false, 'external ip address'],
            ['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', (new Date('1900-01-01T00:00:00')).toString(), true, false, 'last connection datetime'],

            //general states
            ['reconnect', 'state', 'reconnect', 'boolean', 'button', false, true, true, 'Reconnect Fritzbox'],
            ['reboot', 'state', 'reboot', 'boolean', 'button', false, true, true, 'Reboot Fritzbox'],
            
            //general family member states
            /*['familyMembers', 'folder', 'familyMembers', '', '', '', true, false, 'folder for family groups'],
            ['presence', 'state', 'presence', 'boolean', 'indicator', false, true, false, 'someone from the family are present'],
            ['presenceAll', 'state', 'presenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are present'],
            ['absence', 'state', 'absence', 'boolean', 'indicator', false, true, false, 'someone from the family are absent'],
            ['absenceAll', 'state', 'absenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are absent'],
            ['presentMembers', 'state', 'presentMembers', 'string', 'value', '', true, false, 'who is present'],
            ['absentMembers', 'state', 'absentMembers', 'string', 'value', '', true, false, 'who is absent'],
            ['presentCount', 'state', 'presentCount', 'number', 'value', 0, true, false, 'who is present'],
            ['absentCount', 'state', 'absentCount', 'number', 'value', 0, true, false, 'who is absent'],
            ['json', 'state', 'json', 'string', 'json', '[]', true, false, 'Json table'],
            ['html', 'state', 'html', 'string', 'html', table, true, false, 'Html table']*/
        ];
        let optGuest = [];
        if(that.config.compatibility === true){
            optGuest = [
                //guest objects, states
                ['guest', 'state', 'guest', 'boolean', 'indicator', false, true, false, 'Guest is logged in'],
                ['guest.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of guests'],
                ['guest.presentGuests', 'state', 'presentGuests', 'string', 'value', '', true, false, 'Guests present'],
                ['guest.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Guest list json'],
                ['guest.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Guest list html'],
                ['guest.presence', 'state', 'guest.presence', 'boolean', 'indicator', false, true, false, 'a guest is present'],
                ['guest.wlan', 'state', 'guest.wlan', 'boolean', 'indicator', false, true, true, 'guest wlan is on or off']
            ];
        }else{
            optGuest = [
                //guest objects, states
                ['guest', 'folder', 'guest', '', '', '', true, false, 'Guest is logged in'],
                ['guest.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of guests'],
                ['guest.presentGuests', 'state', 'presentGuests', 'string', 'value', '', true, false, 'Guests present'],
                ['guest.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Guest list json'],
                ['guest.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Guest list html'],
                ['guest.presence', 'state', 'guest.presence', 'boolean', 'indicator', false, true, false, 'a guest is present'],
                ['guest.wlan', 'state', 'guest.wlan', 'boolean', 'indicator', false, true, true, 'guest wlan is on or off']
            ];
        }
        const optQR = [
            ['guest.wlanQR', 'state', 'guest.wlanQR', 'string', 'value', '', true, true, 'guest wlan QR code']
        ];
        let optDev = [
            //fb-devices objects, states
            ['fb-devices', 'folder', 'fb-devices', '', '', '', true, false, 'folder for fritzbox devices'],
            ['fb-devices.count', 'state', 'fb-devices.count', 'number', 'value', 0, true, false, 'Number of fritzbox devices'],
            ['fb-devices.active', 'state', 'fb-devices.active', 'number', 'value', 0, true, false, 'Number of active devices'],
            ['fb-devices.inactive', 'state', 'fb-devices.inactive', 'number', 'value', 0, true, false, 'Number of inactive devices'],
            ['fb-devices.json', 'state', 'fb-devices.json', 'string', 'json', '[]', true, false, 'fritzbox device list json'],
            ['fb-devices.mesh', 'state', 'fb-devices.mesh', 'string', 'json', '[]', true, false, 'fritzbox mesh list json'],
            ['fb-devices.jsonActive', 'state', 'fb-devices.jsonActive', 'string', 'json', '[]', true, false, 'fritzbox active device list json'],
            ['fb-devices.jsonInactive', 'state', 'fb-devices.jsonInactive', 'string', 'json', '[]', true, false, 'fritzbox inactive device list json'],
            ['fb-devices.html', 'state', 'fb-devices.html', 'string', 'html', '', true, false, 'fritzbox device list html'],
        ];
        if(that.config.compatibility === true){
            //only for compatibility
            const optDev2 = [
                ['devices', 'state', 'devices', 'number', 'value', 0, true, false, 'Number of devices'],
                ['activeDevices', 'state', 'activeDevices', 'number', 'value', 0, true, false, 'Number of active devices']
            ];
            optDev = optDev.concat(optDev2);
        }

        let optWlBl = [];
        if(that.config.compatibility === true){
            optWlBl = [
                //blacklist objects, states
                ['blacklist', 'state', 'blacklist', 'boolean', 'indicator', false, true, false, 'Unknown devices'],
                ['blacklist.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of unknown devices'],
                ['blacklist.presence', 'state', 'blacklist.presence', 'boolean', 'indicator', false, true, false, 'a device is not listed in the whitelist and is active'],
                ['blacklist.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Unknown devices list json'],
                ['blacklist.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Unknown devices list html'],
                //whitelist objects, states
                ['whitelist', 'folder', 'whitelist', '', '', '', true, false, 'whitelist'],
                ['whitelist.count', 'state', 'whitelist.count', 'number', 'value', 0, true, false, 'Number of whitelist devices'],
                ['whitelist.json', 'state', 'whitelist.json', 'string', 'json', '[]', true, false, 'whitelist devices json'],
                ['whitelist.html', 'state', 'whitelist.html', 'string', 'html', tableGuest, true, false, 'whitelist devices html']
            ];
        }else{
            optWlBl = [
                //blacklist objects, states
                ['blacklist', 'folder', 'blacklist', '', '', '', true, false, 'Unknown devices'],
                ['blacklist.count', 'state', 'count', 'number', 'value', 0, true, false, 'Number of unknown devices'],
                ['blacklist.presence', 'state', 'blacklist.presence', 'boolean', 'indicator', false, true, false, 'a device is not listed in the whitelist and is active'],
                ['blacklist.listJson', 'state', 'listJson', 'string', 'json', '[]', true, false, 'Unknown devices list json'],
                ['blacklist.listHtml', 'state', 'listHtml', 'string', 'html', tableGuest, true, false, 'Unknown devices list html'],
                //whitelist objects, states
                ['whitelist', 'folder', 'whitelist', '', '', '', true, false, 'whitelist'],
                ['whitelist.count', 'state', 'whitelist.count', 'number', 'value', 0, true, false, 'Number of whitelist devices'],
                ['whitelist.json', 'state', 'whitelist.json', 'string', 'json', '[]', true, false, 'whitelist devices json'],
                ['whitelist.html', 'state', 'whitelist.html', 'string', 'html', tableGuest, true, false, 'whitelist devices html']
            ];
        }
        let opt = optGeneral;
        if (that.config.enableWl == true) opt = opt.concat(optWlBl);
        if (that.config.fbdevices == true) opt = opt.concat(optDev);
        if (that.config.guestinfo == true) opt = opt.concat(optGuest);
        if (that.config.qrcode == true) opt = opt.concat(optQR);
        
        if (that.config.compatibility == true){
            that.log.warn('The state "guest" will not longer exist in a future version. Please use "guest.presence" instead!');
            that.log.warn('The state "blacklist" will not longer exist in a future version. Please use "blacklist.presence" instead!');
            that.log.warn('The state "activeDevices" will not longer exist in a future version. Please use "fb-devices.active" instead!');
            that.log.warn('The state "devices" will not longer exist in a future version. Please use "fb-devices.count" instead!');
        }

        await _createObjects('createGlobalObjects', that, opt, enabled, adapterStates, null);
        that.log.info('createGlobalObjects finished successfully');
        return true;
    } catch (error) {
        errorHandler(that, error, 'createGlobalObjects: ');
        //that.log.error('createGlobalObjects: ' + error.message + ' - ' + error.stack);
        return false;
    }
}

async function createMemberObjects(that, membersFiltered, familyGroups, adapterStates, memberStates, cfg, table, enabled, historyAlive) {
    try {
        if (membersFiltered == undefined || membersFiltered.length == 0) {
            throw new exceptionObjects('infoNoFamilyMembers', 'no family members defined! Objects are not created!');
        }else{
            //Create objects for family members
            for (let g = 0; g < familyGroups.length; g++) {
                const group = familyGroups[g];
                let opt = [];
                if (group == ''  && that.config.compatibility === true) {
                    opt = [                
                        //general family member states
                        ['familyMembers', 'folder', 'familyMembers', '', '', '', true, false, 'folder for family groups'],
                        ['presence', 'state', 'presence', 'boolean', 'indicator', false, true, false, 'someone from the family are present'],
                        ['presenceAll', 'state', 'presenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are present'],
                        ['absence', 'state', 'absence', 'boolean', 'indicator', false, true, false, 'someone from the family are absent'],
                        ['absenceAll', 'state', 'absenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are absent'],
                        ['presentMembers', 'state', 'presentMembers', 'string', 'value', '', true, false, 'who is present'],
                        ['absentMembers', 'state', 'absentMembers', 'string', 'value', '', true, false, 'who is absent'],
                        ['presentCount', 'state', 'presentCount', 'number', 'value', 0, true, false, 'who is present'],
                        ['absentCount', 'state', 'absentCount', 'number', 'value', 0, true, false, 'who is absent'],
                        ['json', 'state', 'json', 'string', 'json', '[]', true, false, 'Json table'],
                        ['html', 'state', 'html', 'string', 'html', table, true, false, 'Html table']
                    ];
                }

                //general group states
                if (group == '' && that.config.compatibility === false){ 
                    opt = [                
                        ['familyMembers', 'folder', 'familyMembers', '', '', '', true, false, 'folder for family groups'],
                        ['familyMembers' + '.presence', 'state', 'familyMembers' + '.presence', 'boolean', 'indicator', false, true, false, 'someone from the family are present'],
                        ['familyMembers' + '.presenceAll', 'state', 'familyMembers' + '.presenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are present'],
                        ['familyMembers' + '.absence', 'state', 'familyMembers' + '.absence', 'boolean', 'indicator', false, true, false, 'someone from the family are absent'],
                        ['familyMembers' + '.absenceAll', 'state', 'familyMembers' + '.absenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are absent'],
                        ['familyMembers' + '.presentMembers', 'state', 'familyMembers' + '.presentMembers', 'string', 'value', '', true, false, 'who is present'],
                        ['familyMembers' + '.absentMembers', 'state', 'familyMembers' + '.absentMembers', 'string', 'value', '', true, false, 'who is absent'],
                        ['familyMembers' + '.presentCount', 'state', 'familyMembers' + '.presentCount', 'number', 'value', 0, true, false, 'who is present'],
                        ['familyMembers' + '.absentCount', 'state', 'familyMembers' + '.absentCount', 'number', 'value', 0, true, false, 'who is absent'],
                        ['familyMembers' + '.json', 'state', 'familyMembers' + '.json', 'string', 'json', '[]', true, false, 'Json table'],
                        ['familyMembers' + '.html', 'state', 'familyMembers' + '.html', 'string', 'html', table, true, false, 'Html table']
                    ];
                }
                if (group != ''){ 
                    opt = [                
                        ['familyMembers', 'folder', 'familyMembers', '', '', '', true, false, 'folder for family groups'],
                        ['familyMembers.' + group, 'folder', 'familyMembers.' + group, '', '', '', true, false, 'folder for family group'],
                        ['familyMembers.' + group + '.presence', 'state', 'familyMembers.' + group + '.presence', 'boolean', 'indicator', false, true, false, 'someone from the family are present'],
                        ['familyMembers.' + group + '.presenceAll', 'state', 'familyMembers.' + group + '.presenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are present'],
                        ['familyMembers.' + group + '.absence', 'state', 'familyMembers.' + group + '.absence', 'boolean', 'indicator', false, true, false, 'someone from the family are absent'],
                        ['familyMembers.' + group + '.absenceAll', 'state', 'familyMembers.' + group + '.absenceAll', 'boolean', 'indicator', false, true, false, 'All of the family are absent'],
                        ['familyMembers.' + group + '.presentMembers', 'state', 'familyMembers.' + group + '.presentMembers', 'string', 'value', '', true, false, 'who is present'],
                        ['familyMembers.' + group + '.absentMembers', 'state', 'familyMembers.' + group + '.absentMembers', 'string', 'value', '', true, false, 'who is absent'],
                        ['familyMembers.' + group + '.presentCount', 'state', 'familyMembers.' + group + '.presentCount', 'number', 'value', 0, true, false, 'who is present'],
                        ['familyMembers.' + group + '.absentCount', 'state', 'familyMembers.' + group + '.absentCount', 'number', 'value', 0, true, false, 'who is absent'],
                        ['familyMembers.' + group + '.json', 'state', 'familyMembers.' + group + '.json', 'string', 'json', '[]', true, false, 'Json table'],
                        ['familyMembers.' + group + '.html', 'state', 'familyMembers.' + group + '.html', 'string', 'html', table, true, false, 'Html table']
                    ];
                }
                await _createObjects('createMemberObjects', that, opt, enabled, adapterStates);
            }
            //Create objects for family members
            for (let k = 0; k < membersFiltered.length; k++) {
                const memberRow = membersFiltered[k];
                const member = memberRow.familymember;
                const group = memberRow.group == '' ? '' : 'familyMembers.' + memberRow.group + '.';
                let opt = [];
                if (group == '' && that.config.compatibility === true){
                    opt = [
                        [group + member, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
                        [group + member + '.presence', 'state', member + '.presence', 'boolean', 'indicator', false, true, false, 'state of the family member'],
                        [group + member + '.history', 'state', 'history', 'string', 'json', '[]', true, false, 'history of the day as json table'],
                        [group + member + '.historyHtml', 'state', 'historyHtml', 'string', 'html', table, true, false, 'history of the day as html table'],
                        [group + member + '.going', 'state', 'going', 'string', 'date', (new Date()).toString(), true, false, 'time when you leaving the home'],
                        [group + member + '.comming', 'state', 'comming', 'string', 'date', (new Date()).toString(), true, false, 'time when you arriving at home'],
                        [group + member + '.speed', 'state', member + '.speed', 'number', 'value', 0, true, false, 'Speed of the device', 'Mbit/s'],
                        [group + member + '.absent.since', 'state', member + '.absent.since', 'number', 'value', 0, true, false, 'absent since', 'min'],
                        [group + member + '.present.since', 'state', member + '.present.since', 'number', 'value', 0, true, false, 'present since', 'min'],
                        [group + member + '.absent.sum_day', 'state', member + '.absent.sum_day', 'number', 'value', 0, true, false, 'how long absent per day', 'min'],
                        [group + member + '.present.sum_day', 'state', member + '.present.sum_day', 'number', 'value', 0, true, false, 'how long present per day', 'min']
                    ];
                    that.log.warn('The state "' + `${that.namespace}` + '.' + member + '" will not longer exist in a future version. Please use ' + `${that.namespace}` + '.' + member + '.presence" instead!');
                }
                if (group == '' && that.config.compatibility === false){
                    opt = [
                        ['familyMembers.' + group + member, 'folder', group + member, '', '', '', true, false, 'Family member'],
                        ['familyMembers.' + group + member + '.presence', 'state', member + '.presence', 'boolean', 'indicator', false, true, false, 'state of the family member'],
                        ['familyMembers.' + group + member + '.history', 'state', 'history', 'string', 'json', '[]', true, false, 'history of the day as json table'],
                        ['familyMembers.' + group + member + '.historyHtml', 'state', 'historyHtml', 'string', 'html', table, true, false, 'history of the day as html table'],
                        ['familyMembers.' + group + member + '.going', 'state', 'going', 'string', 'date', (new Date()).toString(), true, false, 'time when you leaving the home'],
                        ['familyMembers.' + group + member + '.comming', 'state', 'comming', 'string', 'date', (new Date()).toString(), true, false, 'time when you arriving at home'],
                        ['familyMembers.' + group + member + '.speed', 'state', member + '.speed', 'number', 'value', 0, true, false, 'Speed of the device', 'Mbit/s'],
                        ['familyMembers.' + group + member + '.absent.since', 'state', member + '.absent.since', 'number', 'value', 0, true, false, 'absent since', 'min'],
                        ['familyMembers.' + group + member + '.present.since', 'state', member + '.present.since', 'number', 'value', 0, true, false, 'present since', 'min'],
                        ['familyMembers.' + group + member + '.absent.sum_day', 'state', member + '.absent.sum_day', 'number', 'value', 0, true, false, 'how long absent per day', 'min'],
                        ['familyMembers.' + group + member + '.present.sum_day', 'state', member + '.present.sum_day', 'number', 'value', 0, true, false, 'how long present per day', 'min']
                    ];
                }
                if (group != ''){
                    opt = [
                        [group + member, 'folder', group + member, '', '', '', true, false, 'Family member'],
                        [group + member + '.presence', 'state', member + '.presence', 'boolean', 'indicator', false, true, false, 'state of the family member'],
                        [group + member + '.history', 'state', 'history', 'string', 'json', '[]', true, false, 'history of the day as json table'],
                        [group + member + '.historyHtml', 'state', 'historyHtml', 'string', 'html', table, true, false, 'history of the day as html table'],
                        [group + member + '.going', 'state', 'going', 'string', 'date', (new Date()).toString(), true, false, 'time when you leaving the home'],
                        [group + member + '.comming', 'state', 'comming', 'string', 'date', (new Date()).toString(), true, false, 'time when you arriving at home'],
                        [group + member + '.speed', 'state', member + '.speed', 'number', 'value', 0, true, false, 'Speed of the device', 'Mbit/s'],
                        [group + member + '.absent.since', 'state', member + '.absent.since', 'number', 'value', 0, true, false, 'absent since', 'min'],
                        [group + member + '.present.since', 'state', member + '.present.since', 'number', 'value', 0, true, false, 'present since', 'min'],
                        [group + member + '.absent.sum_day', 'state', member + '.absent.sum_day', 'number', 'value', 0, true, false, 'how long absent per day', 'min'],
                        [group + member + '.present.sum_day', 'state', member + '.present.sum_day', 'number', 'value', 0, true, false, 'how long present per day', 'min']
                    ];
                }
                await _createObjects('createMemberObjects', that, opt, enabled, adapterStates, memberStates);
                if (cfg.history != ''){
                    await _enableHistory(that, cfg, group, member, historyAlive);
                }else{
                    that.log.info('History function for ' + member + ' disabled. Please select a history adapter in the configuration dialog!');
                }
            }
            that.log.info('createMemberObjects finished successfully');
            return true;
        }         
    } catch (error) {
        errorHandler(that, error, 'createMemberObjects: ');
        return false;      
    }
}

async function createFbDeviceObjects(that, adapterStates, hosts, enabled) { 
    try {
        if (hosts == null) throw new exceptionObjects('exceptionHostsNull', 'hosts object is null');
        if (that.config.fbdevices == true){
            for (let i = 0; i < hosts.length; i++) {
                const device = hosts[i]['hnOrg'];
                //const n = items.indexOfObject('HostName', items[i]['HostName'], i);
                //if (n != -1 ) gthis.log.warn('duplicate fritzbox device item. Please correct the hostname in the fritzbox settings for the device -> ' + items[i]['HostName'] + ' ' + items[i]['MACAddress']);
                const hostName = hosts[i]['hn'];
                const opt = [
                    //[device, 'state', 'member', 'boolean', 'indicator', false, true, false, 'Family member'],
                    ['fb-devices.' + hostName, 'device', 'fb-devices.' + hostName, '', '', '', true, false, device],
                    ['fb-devices.' + hostName + '.meshstate', 'state', 'fb-devices.' + hostName + '.meshstate', 'boolean', 'indicator', false, true, false, 'meshstate state of the device'],
                    ['fb-devices.' + hostName + '.macaddress', 'state', hostName + '.macaddress', 'string', 'info.mac', '', true, false, 'MAC address of the device'],
                    ['fb-devices.' + hostName + '.ipaddress', 'state', hostName + '.ipaddress', 'string', 'info.ip', '', true, false, 'IP address of the device'],
                    ['fb-devices.' + hostName + '.active', 'state', hostName + '.active', 'boolean', 'indicator', false, true, false, 'State of the device'],
                    ['fb-devices.' + hostName + '.disabled', 'state', hostName + '.disabled', 'boolean', 'indicator', false, true, true, 'device disabled?'],
                    ['fb-devices.' + hostName + '.interfacetype', 'state', hostName + '.interfacetype', 'string', 'value', '', true, false, 'Interface type of the device'],
                    ['fb-devices.' + hostName + '.speed', 'state', hostName + '.speed', 'number', 'value', 0, true, false, 'Speed of the device', 'Mbit/s'],
                    ['fb-devices.' + hostName + '.guest', 'state', hostName + '.guest', 'boolean', 'indicator', false, true, false, 'Guest state of the device'],
                    ['fb-devices.' + hostName + '.whitelist', 'state', hostName + '.whitelist', 'boolean', 'indicator', false, true, false, 'Whitelist member'],
                    ['fb-devices.' + hostName + '.blacklist', 'state', hostName + '.blacklist', 'boolean', 'indicator', false, true, false, 'Blacklist member']
                ];
                await _createObjects('createFbDeviceObjects', that, opt, enabled, adapterStates);
            }
        }
        return true;
    } catch (error) {
        errorHandler(that, error, 'createFbDeviceObjects: ');
        //that.log.warn('createFbDeviceObjects: ' + error.message + ' - ' + error.stack);
        return false;    
    }
}

/*async function createMeshObjects(that, items, channel, enabled) { 
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
            }
        }
        return true;
    } catch (error) {
        that.log.warn('createMeshObjects: ' + error.message + ' - ' + error.stack);
        return false;      
    }
}*/

async function createMeshObject(that, hostname, channel, enabled) { 
    try {
        const hostName = hostname; //hostname.replace(FORBIDDEN_CHARS, '-');
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
        errorHandler(that, error, 'createMeshObject: ');
        //that.log.warn('createMeshObject: ' + error.message + ' - ' + error.stack);
        return false;      
    }
}

module.exports = {
    createGlobalObjects: createGlobalObjects,
    createMemberObjects: createMemberObjects,
    createFbDeviceObjects: createFbDeviceObjects,
    //createMeshObjects: createMeshObjects,
    createMeshObject: createMeshObject
};