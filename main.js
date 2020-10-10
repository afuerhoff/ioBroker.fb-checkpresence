'use strict';
/*
 * Created with @iobroker/create-adapter vunknown
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// load your modules here, e.g.:
//const util = require('util');
const dateFormat = require('dateformat');
//own libraries
const fb = require('./lib/fb');
const obj = require('./lib/objects');
let Fb = null;

// Global
let gthis; //Global verfügbar machen
const urn = 'urn:dslforum-org:service:';

const HTML = '<table class="mdui-table"><thead><tr><th>Name</th><th>Status</th><th>Kommt</th><th>Geht</th></tr></thead><tbody>';
const HTML_HISTORY  = '<table class="mdui-table"><thead><tr><th>Status</th><th>Date</th></tr></thead><tbody>';
const HTML_END = '</body></table>';
const HTML_GUEST  = '<table class="mdui-table"><thead><tr><th>Hostname</th><th>IPAddress</th><th>MACAddress</th></tr></thead><tbody>';
const HTML_FB  = '<table class="mdui-table"><thead><tr><th>Hostname</th><th>IPAddress</th><th>MACAddress</th><th>Active</th><th>Type</th></tr></thead><tbody>';

//http://fritz.box:49000/tr64desc.xml
//Actions
let GETPATH = false;
let GETMESHPATH = false;
let GETBYMAC = false;
let GETBYIP = false;
let GETPORT = false;
let GETEXTIP = false;
let SETENABLE = false;
let WLAN3INFO = false;
let DEVINFO = false;

let allDevices = [];
let jsonTab;
let htmlTab;
let enabled = true;
let errorCnt = 0;
const errorCntMax = 10;

function showError(errorMsg) {
    if (errorCnt < errorCntMax) {
        errorCnt+=1;
        gthis.log.error(errorMsg);
    } else {
        gthis.log.debug('maximum error count reached! Error messages are suppressed');
        //gthis.setState('info.connection', { val: false, ack: true });
    }
}

// Create HTML table row
function createHTMLRow (cfg, sUser, sStatus, comming, going) {
    let html = '';
    html += '<tr>';
    html += '<td>' + sUser + '</td>';
    html += '<td>' + (sStatus ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>') + '</td>';
    html += '<td>' + dateFormat(comming, cfg.dateFormat) + '</td>';
    html += '<td>' + dateFormat(going, cfg.dateFormat) + '</td>';
    html += '</tr>';

    return html;
}

// Create HTML history table row
function createHTMLHistoryRow (cfg, sStatus, sDate) {
    let html = '';
    html += '<tr>';
    html += '<td>' + (sStatus ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>') + '</td>';
    html += '<td>' + dateFormat(sDate, cfg.dateFormat) + '</td>';
    html += '</tr>';   

    return html;
}

// Create HTML guest row
function createHTMLGuestRow (hostName, ipAddress, macAddress) {
    let html = '';
    html += '<tr>';
    html += '<td>' + hostName + '</td>';
    html += '<td>' + ipAddress + '</td>';
    html += '<td>' + macAddress + '</td>';
    html += '</tr>';   

    return html;
}

// Create HTML guest row
function createHTMLFbDeviceRow (hostName, ipAddress, macAddress, active, type) {
    let html = '';
    html += '<tr>';
    html += '<td>' + hostName + '</td>';
    html += '<td>' + ipAddress + '</td>';
    html += '<td>' + macAddress + '</td>';
    html += '<td>' + active + '</td>';
    html += '<td>' + type + '</td>';
    html += '</tr>';   

    return html;
}

// Create JSON table row
//function createJSONRow(cnt, maxcnt, cfg, sHeadUser, sUser, sHeadStatus, sStatus, sHeadComming, comming, sHeadGoing, going) {
function createJSONRow(cfg, sHeadUser, sUser, sHeadStatus, sStatus, sHeadComming, comming, sHeadGoing, going) {
    let json = '{';
    json += '"'  + sHeadUser + '":';
    json += '"'  + sUser + '"' + ',';
    json += '"'  + sHeadStatus + '":';
    json += '"'  + sStatus + '"' + ',';
    json += '"'  + sHeadComming + '":';
    json += '"'  + dateFormat(comming, cfg.dateFormat) + '"' + ',';
    json += '"'  + sHeadGoing + '":';
    json += '"'  + dateFormat(going, cfg.dateFormat) + '"' + '},';
    /*if (cnt < maxcnt-1){
        json += ',';
    }*/
    return json;
}

// Create JSON history table row
function createJSONHistoryRow(cnt, cfg, sHeadStatus, sStatus, sHeadDate, sDate) {
    let json = '{';
    if (cnt != 0){
        json = ',{';
    }
    json += '"'  + sHeadStatus + '"' + ':';
    json += '"'  + sStatus + '"' + ',';
    json += '"'  + sHeadDate + '"' + ':';
    json += '"'  + dateFormat(sDate, cfg.dateFormat) + '"' + '}';
    return json;
}

// Create JSON history table row
function createJSONGuestRow(cnt, hostName, ipAddress, macAddress) {
    let json = '{';
    if (cnt != 0){
        json = ',{';
    }
    json += '"'  + 'Hostname' + '":';
    json += '"'  + hostName + '"' + ',';
    json += '"'  + 'IP-Address' + '":';
    json += '"'  + ipAddress + '"' + ',';
    json += '"'  + 'MAC-Address' + '":';
    json += '"'  + macAddress + '"}';
    return json;
}

// Create JSON history table row
function createJSONFbDeviceRow(cnt, hostName, ipAddress, macAddress, active, type) {
    let json = '{';
    if (cnt != 0){
        json = ',{';
    }
    json += '"'  + 'Hostname' + '":';
    json += '"'  + hostName + '"' + ',';
    json += '"'  + 'IP-Address' + '":';
    json += '"'  + ipAddress + '"' + ',';
    json += '"'  + 'MAC-Address' + '":';
    json += '"'  + macAddress + '"' + ',';
    json += '"'  + 'Active' + '":';
    json += '"'  + active + '"' + ',';
    json += '"'  + 'Type' + '":';
    json += '"'  + type + '"}';
    return json;
}

async function getDeviceInfo(items, mesh, cfg){
    try {
        //analyse guests
        let guestCnt = 0;
        let activeCnt = 0;
        let inactiveCnt = 0;
        let blCnt = 0;
        let wlCnt = 0;
        let htmlRow = HTML_GUEST;
        let htmlBlRow = HTML_GUEST;
        let htmlFbDevices = HTML_FB;
        let jsonRow = '[';
        let jsonBlRow = '[';
        let jsonWlRow = '[';
        let jsonFbDevices = '[';
        let jsonFbDevActive = '[';
        let jsonFbDevInactive = '[';
        const enabledMeshInfo = gthis.config.meshinfo;

        obj.createFbDeviceObjects(gthis, items, enabled);
        if (!items) return false;

        for (let i = 0; i < items.length; i++) {
            if (enabled == false) break;
            let deviceType = '-';
            if (items[i]['X_AVM-DE_Guest'] == 1){
                deviceType = 'guest';
            }
            if (items[i]['Active'] == 1){ // active devices
                jsonFbDevActive += createJSONFbDeviceRow(activeCnt, items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress'], items[i]['Active'], deviceType);
                activeCnt += 1;
            }else{
                jsonFbDevInactive += createJSONFbDeviceRow(inactiveCnt, items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress'], items[i]['Active'], deviceType);
                inactiveCnt += 1;
            }
            if (items[i]['X_AVM-DE_Guest'] == 1 && items[i]['Active'] == 1){ //active guests
                htmlRow += createHTMLGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                jsonRow += createJSONGuestRow(guestCnt, items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                gthis.log.debug('getDeviceInfo: ' + items[i]['HostName'] + ' ' + items[i]['IPAddress'] + ' ' + items[i]['MACAddress']);
                guestCnt += 1;
            }
            let foundwl = false;
            for(let w = 0; w < cfg.wl.length; w++) {
                if (cfg.wl[w].white_macaddress == items[i]['MACAddress']){
                    foundwl = true;
                    break;
                }
            }
            if (foundwl == false && items[i]['X_AVM-DE_Guest'] == 0){ //&& items[i]['Active'] == 1
                deviceType = 'blacklist';
                htmlBlRow += createHTMLGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                jsonBlRow += createJSONGuestRow(blCnt, items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                blCnt += 1;
            } 
            if (foundwl == true ){
                deviceType = 'whitelist';
                //htmlWlRow += createHTMLGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                jsonWlRow += createJSONGuestRow(wlCnt, items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                wlCnt += 1;
            }
            htmlFbDevices += createHTMLFbDeviceRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress'], items[i]['Active'], deviceType);
            jsonFbDevices += createJSONFbDeviceRow(i, items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress'], items[i]['Active'], deviceType);
            
            let hostName = items[i]['HostName'];
            if (hostName.includes('.')){
                hostName = hostName.replace('.', '-');
            }
            gthis.setState('fb-devices.' + hostName + '.macaddress', { val: items[i]['MACAddress'], ack: true });
            gthis.setState('fb-devices.' + hostName + '.ipaddress', { val: items[i]['IPAddress'], ack: true });
            gthis.setState('fb-devices.' + hostName + '.active', { val: items[i]['Active'], ack: true });
            gthis.setState('fb-devices.' + hostName + '.interfacetype', { val: items[i]['InterfaceType'], ack: true });
            gthis.setState('fb-devices.' + hostName + '.speed', { val: items[i]['X_AVM-DE_Speed'], ack: true });
            gthis.setState('fb-devices.' + hostName + '.guest', { val: items[i]['X_AVM-DE_Guest'], ack: true });
            gthis.setState('fb-devices.' + hostName + '.whitelist', { val: foundwl, ack: true });
            gthis.setState('fb-devices.' + hostName + '.blacklist', { val: ! (foundwl && items[i]['X_AVM-DE_Guest']), ack: true });
            for (let k=0; k<cfg.members.length; k++){
                if (cfg.members[k].macaddress == items[i]['MACAddress']){
                    gthis.setState(cfg.members[k].familymember + '.speed', { val: items[i]['X_AVM-DE_Speed'], ack: true });
                    break;
                }
            }

            //Get mesh info for device
            if (GETMESHPATH != null && GETMESHPATH == true && enabledMeshInfo == true){
                if (mesh != null){
                    let meshdevice = mesh.find(el => el.device_mac_address === items[i]['MACAddress']);
                    if (meshdevice == null) {
                        meshdevice = mesh.find(el => el.device_name === items[i]['HostName']);
                    }
                    if (meshdevice != null) {
                        gthis.setState('fb-devices.' + hostName + '.meshstate', { val: true, ack: true });
                        for (let ni = 0; ni < meshdevice['node_interfaces'].length; ni++) {
                            const nInterface = meshdevice['node_interfaces'][ni];
                            let interfaceName = nInterface['name'];
                            if (interfaceName == '') interfaceName = nInterface['type'];
                            //gthis.log.info('createMeshObjects2 ' + JSON.stringify(items[i]));
                            obj.createMeshObjects(gthis, [items[i]], ni, enabled);
                            /*const hostname = items[i]['HostName'];
                            if (hostname.includes('.')){
                                hostName = hostname.replace('.', '-');
                            }*/

                            gthis.setState('fb-devices.' + hostName + '.' + ni + '.name', { val: nInterface['name'], ack: true });
                            gthis.setState('fb-devices.' + hostName + '.' + ni + '.type', { val: nInterface['type'], ack: true });
                            //gthis.setState('fb-devices.' + hostName + '.' + ni + '.security', { val: nInterface['security'], ack: true });
                            
                            if (nInterface['node_links'].length > 0){ //filter empty interfaces
                                let link = '';
                                let data_rate_rx = 0;
                                let data_rate_tx = 0;

                                for (let nl = 0; nl < nInterface['node_links'].length; nl++) {
                                    const nodelinks = nInterface['node_links'][nl]; 
                                    if ( nodelinks['state'] == 'CONNECTED'){
                                        if (nodelinks['node_1_uid'] != meshdevice['uid']){ //Top connection
                                            const node1 = mesh.find(el => el.uid === nodelinks['node_1_uid']);
                                            if (link != '') link += ',';
                                            link += node1['device_name'];
                                        }
                                        if (nodelinks['node_2_uid'] != meshdevice['uid']){ //Down connection
                                            const node1 = mesh.find(el => el.uid === nodelinks['node_2_uid']);
                                            if (link != '') link += ',';
                                            link += node1['device_name'];
                                        }
                                        data_rate_rx = nodelinks['cur_data_rate_rx'] / 1000;
                                        data_rate_tx = nodelinks['cur_data_rate_tx'] / 1000;
                                    }
                                    gthis.setState('fb-devices.' + hostName + '.' + ni + '.link', { val: link, ack: true });
                                    gthis.setState('fb-devices.' + hostName + '.' + ni + '.cur_data_rate_rx', { val: data_rate_rx, ack: true });
                                    gthis.setState('fb-devices.' + hostName + '.' + ni + '.cur_data_rate_tx', { val: data_rate_tx, ack: true });
                                }
                            }
                        }
                    }else{
                        gthis.setState('fb-devices.' + hostName + '.meshstate', { val: false, ack: true });
                    }
                }
            }


        }
        jsonRow += ']';
        jsonBlRow += ']';
        jsonWlRow += ']';
        htmlRow += HTML_END;
        htmlBlRow += HTML_END;
        htmlFbDevices += HTML_END;
        jsonFbDevices += ']';
        jsonFbDevActive += ']';
        jsonFbDevInactive += ']';
        
        gthis.setState('fb-devices.count', { val: items.length, ack: true });
        gthis.setState('fb-devices.json', { val: jsonFbDevices, ack: true });
        gthis.setState('fb-devices.jsonActive', { val: jsonFbDevActive, ack: true });
        gthis.setState('fb-devices.jsonInactive', { val: jsonFbDevInactive, ack: true });
        gthis.setState('fb-devices.html', { val: htmlFbDevices, ack: true });
        gthis.setState('fb-devices.active', { val: activeCnt, ack: true });
        gthis.setState('fb-devices.inactive', { val: inactiveCnt, ack: true });

        gthis.setState('guest.listHtml', { val: htmlRow, ack: true });
        gthis.setState('guest.listJson', { val: jsonRow, ack: true });
        gthis.setState('guest.count', { val: guestCnt, ack: true });
        gthis.setState('guest.presence', { val: guestCnt == 0 ? false : true, ack: true });

        gthis.setState('activeDevices', { val: activeCnt, ack: true });

        gthis.setState('blacklist.count', { val: blCnt, ack: true });
        gthis.setState('blacklist.listHtml', { val: htmlBlRow, ack: true });
        gthis.setState('blacklist.listJson', { val: jsonBlRow, ack: true });
        
        gthis.setState('whitelist.json', { val: jsonWlRow, ack: true });
        gthis.setState('whitelist.count', { val: cfg.wl.length, ack: true });

        if (guestCnt > 0) {
            gthis.setState('guest', { val: true, ack: true });
        }else {
            gthis.setState('guest', { val: false, ack: true });
        }
        gthis.log.debug('getDeviceInfo activeCnt: '+ activeCnt);
        if (blCnt > 0) {
            gthis.setState('blacklist', { val: true, ack: true });
        }else {
            gthis.setState('blacklist', { val: false, ack: true });
        }
        gthis.log.debug('getDeviceInfo blCnt: '+ blCnt);
        return true;
    } catch (error) {
        gthis.log.error('getDeviceInfo: ' + error);
        return false;
    }
}

async function resyncFbObjects(items){
    try {
        // Get all fb-device objects of this adapter
        if (gthis.config.syncfbdevices == true){
            gthis.getDevices(async function (err, devices) {
                try {
                    for (const id in devices) {
                        if (devices[id] != undefined && devices[id].common != undefined){
                            const dName = devices[id].common.name;
                            let found = false;
                            if (dName.includes('fb-devices')){
                                for(let i=0;i<items.length;i++){
                                    let hostName = items[i]['HostName'];
                                    if (hostName.includes('.')){
                                        hostName = hostName.replace('.', '-');
                                    }
                                    if (dName.includes(hostName)) {
                                        found = true;
                                        break;
                                    }
                                }
                                if (found == false && !dName.includes('whitelist')){
                                    gthis.log.info('object to delete <' + dName + '>');
                                    gthis.getStates(dName + '.*', async function (err, states) {
                                        for (const idS in states) {
                                            //gthis.log.info(JSON.stringify(idS));
                                            gthis.delObject(idS, function(err){
                                                if (err) {
                                                    gthis.log.error('cannot delete object: ' + idS + ' Error: ' + err);
                                                }
                                                gthis.delState(idS, function(err){
                                                    if (err) {
                                                        gthis.log.error('cannot delete state: ' + idS + ' Error: ' + err);
                                                    }
                                                });
                                            });
                                        }
                                    });
                                    gthis.delObject(devices[id]._id, function(err){
                                        if (err) {
                                            gthis.log.error('cannot delete device : ' + id + ' Error: ' + err);
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    gthis.log.error(error);
                }
                gthis.log.debug('fb-devices synchronized');
                const adapterObj = await gthis.getForeignObjectAsync(`system.adapter.${gthis.namespace}`);
                adapterObj.native.syncfbdevices = false;
                gthis.config.syncfbdevices = false;
                await gthis.setForeignObjectAsync(`system.adapter.${gthis.namespace}`, adapterObj);
            }); 
        }
    } catch (error) {
        gthis.log.error('resyncFbObjects ' + error);
    }
}

function getActive(index, cfg, memberRow, dnow, presence, Fb){
    return new Promise((resolve, reject) => {
    //try {
        //if (enabled === false) return null;
        //const re = /^[a-fA-F0-9:]{17}|[a-fA-F0-9]{12}$/;
        const member = memberRow.familymember; 
        const mac = memberRow.macaddress; 
        const ip = memberRow.ipaddress; 
        if (memberRow.useip == undefined || ip == undefined){
            //presence.err = 'Please edit configuration in admin view and save it! Some items (use ip, ip-address) are missing';
            //gthis.log.error(presence.err);
            reject('Please edit configuration in admin view and save it! Some items (use ip, ip-address) are missing'); 
        }else{
            let pr = null;
            if (memberRow.useip == false){
                if (mac != ''){
                    pr = Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'GetSpecificHostEntry', [[1, 'NewMACAddress', memberRow.macaddress]], true);
                }else{
                    //presence.err = 'The configured mac-address for member ' + member + ' is empty. Please insert a valid mac-address!';
                    //gthis.log.warn(presence.err);
                    reject('The configured mac-address for member ' + member + ' is empty. Please insert a valid mac-address!');
                }
            }else{
                if (GETBYIP == true && ip != ''){
                    pr = Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetSpecificHostEntryByIP', [[1, 'NewIPAddress', memberRow.ipaddress]], true);
                }else{
                    if (memberRow.ipaddress == '') {
                        //presence.err = 'The configured ip-address for ' + member + ' is empty. Please insert a valid ip-address!';
                        //gthis.log.warn(presence.err);
                        reject('The configured ip-address for ' + member + ' is empty. Please insert a valid ip-address!');
                    }
                    if (GETBYIP == false) {
                        //presence.err = 'The service X_AVM-DE_GetSpecificHostEntryByIP for ' + member + ' is not supported';
                        //gthis.log.warn(presence.err);
                        reject('The service X_AVM-DE_GetSpecificHostEntryByIP for ' + member + ' is not supported');
                    }
                }
            }
            if(enabled == false) {
                //presence.err = 'canceld from adapter';
                resolve(presence);
            } 
            Promise.all([pr]).then(hostEntry => {
                if(hostEntry[0].result === false){
                    if (hostEntry[0].errorMsg.errorDescription == 'NoSuchEntryInArray'){
                        reject('mac or ipaddress from member ' + member + ' not found in fritzbox device list');
                        //gthis.log.warn('mac or ipaddress from member ' + member + ' not found in fritzbox device list');
                    } else if (hostEntry[0].errorMsg.errorDescription == 'Invalid Args'){
                        //gthis.log.warn('invalid arguments for member ' + member);
                        reject('invalid arguments for member ' + member);
                    } else {
                        //gthis.log.warn('member ' + member + ': ' + hostEntry.errorMsg.errorDescription);
                        reject('member ' + member + ': ' + hostEntry.errorMsg.errorDescription);
                    }
                }
                if (hostEntry[0] && hostEntry[0].result == true){
                    const newActive = hostEntry[0].resultData['NewActive'] == 1 ? true : false;
                    //let memberActive = false; 
                    let comming = null;
                    let going = null;
                    gthis.getStateAsync(member + '.presence').then(function(curVal){ //actual member state
                        /*if (curVal == null ) {
                            presence.err = 'can not get actual value';
                            reject(presence, err);
                        }*/
                        if (curVal && curVal.val != null){
                            //calculation of '.since'
                            const diff = Math.round((dnow - new Date(curVal.lc))/1000/60);
                            if (curVal.val == true){
                                gthis.setState(member + '.present.since', { val: diff, ack: true });
                                gthis.setState(member + '.absent.since', { val: 0, ack: true });
                            }
                            if (curVal.val == false){
                                gthis.setState(member + '.absent.since', { val: diff, ack: true });
                                gthis.setState(member + '.present.since', { val: 0, ack: true });
                            }
                            //analyse member presence
                            if (newActive == true){ //member = true
                                //memberActive = true;
                                presence.one = true;
                                presence.allAbsence = false;
                                if (presence.presentMembers == '') {
                                    presence.presentMembers += member;
                                }else{
                                    presence.presentMembers += ', ' + member;
                                }
                                //gthis.log.info(presence.presentMembers);
                                if (curVal.val == false){ //signal changing to true
                                    gthis.log.info('newActive ' + member + ' ' + newActive);
                                    gthis.setState(member, { val: true, ack: true });
                                    gthis.setState(member + '.presence', { val: true, ack: true });
                                    gthis.setState(member + '.comming', { val: dnow, ack: true });
                                    comming = dnow;
                                }
                                if (curVal.val == null){
                                    gthis.log.warn('Member value is null! Value set to true');
                                    gthis.setState(member, { val: true, ack: true });
                                    gthis.setState(member + '.presence', { val: true, ack: true });
                                }
                            }else{ //member = false
                                presence.all = false;
                                presence.oneAbsence = true;
                                if (presence.absentMembers == '') {
                                    presence.absentMembers += member;
                                }else{
                                    presence.absentMembers += ', ' + member;
                                }
                                if (curVal.val == true){ //signal changing to false
                                    gthis.log.info('newActive ' + member + ' ' + newActive);
                                    gthis.setState(member, { val: false, ack: true });
                                    gthis.setState(member + '.presence', { val: false, ack: true });
                                    gthis.setState(member + '.going', { val: dnow, ack: true });
                                    going = dnow;
                                }
                                if (curVal.val == null){
                                    gthis.log.warn('Member value is null! Value set to false');
                                    gthis.setState(member, { val: false, ack: true });
                                    gthis.setState(member + '.presence', { val: false, ack: true });
                                }
                            }
                            gthis.setState(member, { val: newActive, ack: true });
                            gthis.setState(member + '.presence', { val: newActive, ack: true });
                            presence.val = newActive;
                            //gthis.log.info(JSON.stringify(presence));
                            //if(enabled == false) return null;
                            Promise.all([gthis.getStateAsync(member + '.comming'), gthis.getStateAsync(member + '.going')]).then(values => {
                                const comming1 = values[0];
                                comming = comming1.val;
                                const going1 = values[1];
                                going = going1.val;
                                if (comming1.val == null) {
                                    comming = new Date(curVal.lc);
                                    gthis.setState(member + '.comming', { val: comming, ack: true });
                                }
                                if (going1.val == null) {
                                    going = new Date(curVal.lc);
                                    gthis.setState(member + '.going', { val: going, ack: true });
                                }
                                jsonTab += createJSONRow(cfg, 'Name', member, 'Active', newActive, 'Kommt', comming, 'Geht', going);
                                htmlTab += createHTMLRow(cfg, member, newActive, comming, going);
                                //gthis.log.debug('getActive ' + jsonTab);
                                resolve(presence);
                            }).catch(function(error){
                                reject('getActive: ' + JSON.stringify(error));
                            });              
                        }else{
                            reject('getActive: object ' + member + ' does not exist!');
                            //showError('getActive: content of object ' + member + ' is wrong!'); 
                        }
                    }).catch(function(error){
                        reject('getActive presence: ' + JSON.stringify(error));
                    }); 
                }
            }).catch(function(error){
                gthis.log.error('getActive ' + JSON.stringify(error));
                reject(error);
            });
        }
    });
}

Array.prototype.indexOfObject = function (property, value, ind=-1) {
    for (let i = 0, len = this.length; i < len; i++) {
        if (i != ind && this[i][property] === value) return i;
    }
    return -1;
};

class FbCheckpresence extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'fb-checkpresence',
        });
        this.on('ready', this.onReady.bind(this));
        //this.on('objectChange', this.onObjectChange);
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        gthis = this;
        enabled = true;
        errorCnt = 0;
        Fb = null;
        allDevices = [];
        this.timeout1 = null;
        this.timeout2 = null;
    }

    decrypt(key, value) {
        let result = '';
        for (let i = 0; i < value.length; ++i) {
            result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
        }
        return result;
    }

    loopFamily(cron, cfg, Fb) {
        try {            
            //const start = process.hrtime();
            gthis.timeout1 = setTimeout(async function() {
                const work = process.hrtime();
                //const crontime = process.hrtime(start);
                gthis.log.debug('loopFamily starts');
                if (DEVINFO == true) {
                    const res = Fb.connectionCheck(); //Sets the connection led
                    if(res.result === false) gthis.log.error('connectionCheck: '  + JSON.stringify(res));
                }
                await gthis.checkPresence(gthis, cfg, Fb);
                const time = process.hrtime(work);
                gthis.log.debug('loopFamily ends after ' + time + ' s');
                if (cron >= 10000) gthis.loopFamily(cron, cfg, Fb);
            }, cron);
        } catch (error) {
            this.log.error('loopFamily ' + error);            
        }
    }

    async loopDevices(cron, cfg, Fb) {
        try {            
            gthis.timeout2 = setTimeout(async function() {
                const work = process.hrtime();
                gthis.log.debug('loopDevices starts');
                if (GETPATH != null && GETPATH == true && gthis.config.fbdevices == true){
                    const itemlist = await Fb.getDeviceList();
                    const extIp = (GETEXTIP != null && GETEXTIP == true) ? Fb.getExtIp() : Promise.resolve();
                    const guestWlan = (WLAN3INFO != null && WLAN3INFO == true) ? Fb.getGuestWlan() : Promise.resolve();
                    const enabledMeshInfo = gthis.config.meshinfo;
                    const meshlist = (GETMESHPATH != null && GETMESHPATH == true && enabledMeshInfo == true) ? Fb.getMeshList() : Promise.resolve();
                    await Promise.all([meshlist, extIp, guestWlan, itemlist]).then(results => {
                        getDeviceInfo(results[3], results[0], cfg);
                    }).catch(function(error){
                        gthis.log.error('loopDevices: ' + error);
                    });
                }
                const time = process.hrtime(work);
                gthis.log.debug('loopDevices2 ends after ' + time + ' s');
                if (cron >= 10000) gthis.loopDevices(cron, cfg, Fb);
            }, cron);
        } catch (error) {
            this.log.error('loopDevices ' + error);            
        }
    }

    async stopAdapter(){
        //this.log.warn('Adapter stops');
        const adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        adapterObj.common.enabled = false;  // Adapter ausschalten
        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        try {
            // Initialize your adapter here
            //Logging of adapter start
            this.log.info('start fb-checkpresence: ip-address: "' + this.config.ipaddress + '" - interval devices: ' + this.config.interval + ' Min.' + ' - interval members: ' + this.config.intervalFamily + ' s');
            this.log.debug('configuration user: <' + this.config.username + '>');
            this.log.debug('configuration history: <' + this.config.history + '>');
            this.log.debug('configuration dateformat: <' + this.config.dateformat + '>');
            this.log.debug('configuration familymembers: ' + JSON.stringify(this.config.familymembers));
            this.log.debug('configuration fb-devices ' + this.config.fbdevices);
            this.log.debug('configuratuion mesh info: ' + this.config.meshinfo);            

            //decrypt fritzbox password
            const sysObj =  await this.getForeignObjectAsync('system.config');
            if (sysObj && sysObj.native && sysObj.native.secret) {
                this.config.password = this.decrypt(sysObj.native.secret, this.config.password);
            } else {
                this.config.password = this.decrypt('SdoeQ85NTrg1B0FtEyzf', this.config.password);
            }

            //Configuration changes if needed
            let adapterObj = (await this.getForeignObjectAsync(`system.adapter.${this.namespace}`));
            let adapterObjChanged = false; //for changes
            
            //if interval <= 0 than set to 1
            if (this.config.interval <= 0) {
                adapterObj.native.interval = 1;
                adapterObjChanged = true;
                this.config.interval = 1;
                this.log.warn('interval is less than 1. Set to 1 Min.');
            }

            //create new configuration items -> workaround for older versions
            for(let i=0;i<this.config.familymembers.length;i++){
                if (this.config.familymembers[i].useip == undefined) {
                    adapterObj.native.familymembers[i].useip = false;
                    adapterObj.native.familymembers[i].ipaddress = '';
                    adapterObjChanged = true;
                }
            }

            if (adapterObjChanged === true){ //Save changes
                await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
            }

            const cfg = {
                ip: this.config.ipaddress,
                port: '49000',
                iv: this.config.interval,
                history: this.config.history,
                dateFormat: this.config.dateformat,
                uid: this.config.username,
                pwd: this.config.password,
                members: this.config.familymembers,
                wl: this.config.whitelist
            };
            
            const cron = cfg.iv * 60000;
            const cronFamily = this.config.intervalFamily * 1000; //One second multiplied with minimum 10
            
            const devInfo = {
                host: this.config.ipaddress,
                port: '49000',
                sslPort: null,
                uid: this.config.username,
                pwd: this.config.password
            };

            Fb = await fb.Fb.init(devInfo, this);
            //Fb = new fb.Fb(devInfo, this);
            if(Fb.services === null) {
                gthis.log.error('Can not get services! Adapter stops');
                this.stopAdapter();
            }

            //Check if services/actions are supported
            GETPATH = await Fb.chkService('X_AVM-DE_GetHostListPath', 'Hosts1');
            GETMESHPATH = await Fb.chkService('X_AVM-DE_GetMeshListPath', 'Hosts1');
            GETBYMAC = await Fb.chkService('GetSpecificHostEntry', 'Hosts1');
            GETBYIP = await Fb.chkService('X_AVM-DE_GetSpecificHostEntryByIP', 'Hosts1');
            GETPORT = await Fb.chkService('GetSecurityPort', 'DeviceInfo1');
            GETEXTIP = await Fb.chkService('GetInfo', 'WANPPPConnection1');
            if ( GETEXTIP == false) GETEXTIP = await Fb.chkService('GetInfo', 'WANIPConnection1');
            SETENABLE = await Fb.chkService('SetEnable', 'WLANConfiguration3');
            WLAN3INFO = await Fb.chkService('GetInfo', 'WLANConfiguration3');
            DEVINFO = await Fb.chkService('GetInfo', 'DeviceInfo1');
            await Fb.chkService('DisallowWANAccessByIP', 'X_AVM-DE_HostFilter');
            await Fb.chkService('GetWANAccessByIP', 'X_AVM-DE_HostFilter');
            
            //const test = await Fb.soapAction(Fb, '/upnp/control/deviceconfig', 'urn:dslforum-org:service:DeviceConfig:1', 'X_AVM-DE_CreateUrlSID', null);

            //Create global objects
            await obj.createGlobalObjects(this, HTML+HTML_END, HTML_GUEST+HTML_END, enabled);
            await obj.createMemberObjects(this, cfg, HTML_HISTORY + HTML_END, enabled);

            //create Fb devices
            if (GETPATH != null && GETPATH == true && gthis.config.fbdevices == true){
                const items = await Fb.getDeviceList(gthis, cfg, Fb);
                if (items != null){
                    await Promise.all([
                        obj.createFbDeviceObjects(gthis, items, enabled),
                        obj.createMeshObjects(gthis, items, 0, enabled) //create channel 0 as default interface
                    ]).catch(function(error){
                        gthis.log.error('createFbDeviceObjects ' + error);
                    });
                }else{
                    this.log.error('createFbDeviceObjects -> ' + "can't read devices from fritzbox! Adapter stops");
                    adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                    adapterObj.common.enabled = false;  // Adapter ausschalten
                    await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
                }
                resyncFbObjects(items);
            }

            // states changes inside the adapters namespace are subscribed
            this.subscribeStates(`${gthis.namespace}` + '.guest.wlan');
            this.subscribeStates(`${gthis.namespace}` + '.fb-devices.*.disabled');  

            //get uuid for transaction
            //const sSid = await Fb.soapAction(Fb, '/upnp/control/deviceconfig', urn + 'DeviceConfig:1', 'X_GenerateUUID', null);
            //const uuid = sSid['NewUUID'].replace('uuid:', '');
            this.loopFamily(1000, cfg, Fb); //Execute family loop
            this.loopDevices(2000, cfg, Fb);
            this.loopFamily(cronFamily, cfg, Fb); //Execute family loop
            this.loopDevices(cron, cfg, Fb);
        } catch (error) {
            showError('onReady: ' + error);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            enabled = false;
            this.timeout1 && clearTimeout(this.timeout1);
            this.timeout1 = null;
            this.timeout2 && clearTimeout(this.timeout2);
            this.timeout2 = null;
            Fb.exitRequest;
            this.log.info('cleaned everything up ...');
            callback && callback();
        } catch (e) {
            this.log.error(e);
            callback && callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    /*onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.debug(`object ${id} deleted`);
        }
    }*/

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        try {
            if (state) {
                if (id == `${gthis.namespace}` + '.guest.wlan' && SETENABLE == true && state.ack === false){
                    this.log.info(`state1 ${id} changed: ${state.val} (ack = ${state.ack})`);
                    const val = state.val ? '1' : '0';
                    const guestwlan = await Fb.soapAction(Fb, '/upnp/control/wlanconfig3', urn + 'WLANConfiguration:3', 'SetEnable', [[1, 'NewEnable', val]]);
                    if (guestwlan['status'] != 200 || guestwlan['result'] == false) {
                        this.log.error(JSON.stringify(guestwlan));
                        gthis.setState(id, { val: state.val, ack: true });
                    }
                }

                if (id.includes('disabled') && state.ack === false){
                    this.log.info(`state2 ${id} changed: ${state.val} (ack = ${state.ack})`);
                    const ipId = id.replace('.disabled', '') + '.ipaddress';
                    const ipaddress = await gthis.getStateAsync(ipId);
                    const val = state.val ? '1' : '0';
                    gthis.log.info('ip ' + JSON.stringify(ipaddress.val) + ' ' + val);
                    const disabled = await Fb.soapAction(Fb, '/upnp/control/x_hostfilter', urn + 'X_AVM-DE_HostFilter:1', 'DisallowWANAccessByIP', [[1, 'NewIPv4Address', ipaddress.val],[2, 'NewDisallow', val]]);
                    if (disabled['status'] != 200 || disabled['result'] == false) {
                        this.log.error(JSON.stringify('DisallowWANAccessByIP ' + disabled));
                    }else{
                        await Fb.getWanAccess(ipaddress);
                        gthis.setState(id, { val: state.val, ack: true });
                    }
                }
            }

            /*if (state) {
                // The state was changed
                this.log.info(`system.adapter.${this.namespace}`);
                this.log.info(`state2 ${id} changed: ${state.val} (ack = ${state.ack})`);
            } else {
                // The state was deleted
                this.log.debug(`state ${id} deleted`);
            }*/
        } catch (error) {
            this.log.error('state change: ' + JSON.stringify(error));            
        }
    }

    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.message" property to be set to true in io-package.json
     * @param {ioBroker.Message} obj
     */
    async onMessage(obj) {
        try {
            if (!obj) return;
            if (typeof obj === 'object' && obj.message) {

                // eslint-disable-next-line no-inner-declarations
                function reply(result) {
                    gthis.sendTo (obj.from, obj.command, JSON.stringify(result), obj.callback);
                }

                switch (obj.command) {
                    case 'discovery':{
                        allDevices = [];
                        let onlyActive, reread;
                        if (typeof obj.message === 'object') {
                            onlyActive = obj.message.onlyActive;
                            reread = obj.message.reread;
                        }
                        if (!obj.callback) return false;
                        if (!reread && allDevices.length > 0 && allDevices.onlyActive === onlyActive) {
                            reply(allDevices);
                            return true;
                        }
                        allDevices.onlyActive = onlyActive;

                        const devInfo = {
                            host: this.config.ipaddress,
                            port: '49000',
                            sslPort: null,
                            uid: this.config.username,
                            pwd: this.config.password
                        };
                        const Fb = new fb.Fb(devInfo, this);

                        let items;
                        if (GETPATH == true){
                            items =  await Fb.getDeviceList(this, null, Fb);
                            if (items == null){
                                return;
                            }
                            for (let i = 0; i < items.length; i++) {
                                const active = items[i]['Active'];
                                if (!onlyActive || active) {
                                    allDevices.push ({
                                        name: items[i]['HostName'],
                                        ip: items[i]['IPAddress'],
                                        mac: items[i]['MACAddress'],
                                        active: active
                                    });
                                }
                            }
                        }
                        reply(allDevices);
                        return true;}
                    default:
                        this.log.warn('Unknown command: ' + obj.command);
                        break;
                }
                if (obj.callback) gthis.sendTo(obj.from, obj.command, obj.message, obj.callback);
                return true;    
            }
        } catch (e) {
            showError('onMessage: '+e.message);
        }
    }

    async checkPresence(gthis, cfg, Fb){
        return new Promise((resolve, reject) => {
            const midnight = new Date(); //Date of day change 
            midnight.setHours(0,0,0);
            const dnow = new Date(); //Actual date and time for comparison

            // functions for family members
            jsonTab = '[';
            htmlTab = HTML;

            let count = 0;
            let length = cfg.members.length; //Correction if not all members enabled
            for (let k = 0; k < cfg.members.length; k++){
                if (cfg.members[k].enabled == false) length--;
            }
            let presence = {val: null, all: true, one: false, presentMembers: '', absentMembers: '', allAbsence: true, oneAbsence: false };
            for (let k = 0; k < cfg.members.length; k++) { //loop over family members
                if (enabled == false) break; //cancel if disabled over unload
                const memberRow = cfg.members[k]; //Row from family members table
                const member = memberRow.familymember; 
                if (memberRow.enabled == true && GETBYMAC == true){ //member enabled in configuration settings and service is supported
                    Promise.all([getActive(k, cfg, memberRow, dnow, presence, Fb), gthis.getObjectAsync(`${gthis.namespace}` + '.' + member)]).then((values) => {
                        count++;
                        const curVal = values[0];
                        presence = curVal;
                        const dPoint = values[1];
                        if (curVal != null){
                            //get history data
                            let present = Math.round((dnow - midnight)/1000/60); //time from midnight to now = max. present time
                            let absent = 0;

                            const end = new Date().getTime();
                            const start = midnight.getTime();
                            let lastVal = null;
                            let lastValCheck = false;

                            const memb = member;
                            if (cfg.history != ''){
                                if (dPoint.common.custom != undefined && dPoint.common.custom[cfg.history].enabled == true){
                                    try {
                                        gthis.sendTo(cfg.history, 'getHistory', {
                                            id: `${gthis.namespace}` + '.' + memb,
                                            //id: 'fb-checkpresence.0.' + memb,
                                            options:{
                                                end:        end,
                                                start:      start,
                                                ignoreNull: true,
                                                aggregate: 'onchange'
                                            }
                                        }, function (result1) {
                                            if (result1 == null) {
                                                reject('can not read history from ' + memb + ' ' + result1.error);
                                            }else{
                                                const cntActualDay = result1.result.length;
                                                gthis.log.debug('history cntActualDay: ' + cntActualDay);
                                                gthis.sendTo(cfg.history, 'getHistory', {
                                                    id: `${gthis.namespace}` + '.' + memb,
                                                    options: {
                                                        end:        end,
                                                        count:      cntActualDay+1,
                                                        ignoreNull: true,
                                                        aggregate: 'onchange'
                                                    }
                                                }, function (result) {
                                                    if (result == null) {
                                                        reject('can not read history from ' + memb + ' ' + result.error);
                                                    }else{
                                                        let htmlHistory = HTML_HISTORY;
                                                        let jsonHistory = '[';
                                                        let bfirstFalse = false;
                                                        let firstFalse = midnight;
                                                        gthis.log.debug('history ' + memb + ' cntActualDay: ' + cntActualDay + ' cntHistory: ' + result.result.length);
                                                        let cnt = 0;
                                                        
                                                        let i = 0;
                                                        for (let iv = 0; iv < result.result.length; iv++) {
                                                            if (enabled == false) break;
                                                            if (result.result[0].ts < result.result[result.result.length-1].ts){ //Workaround for history sorting behaviour
                                                                i = iv;
                                                            }else{
                                                                i = result.result.length - iv - 1;
                                                            }
                                                            if (result.result[i].val != null ){
                                                                const hdate = dateFormat(new Date(result.result[i].ts), cfg.dateformat);
                                                                htmlHistory += createHTMLHistoryRow(cfg, result.result[i].val, hdate);
                                                                jsonHistory += createJSONHistoryRow(cnt, cfg, 'Active', result.result[i].val, 'Date', hdate);
                                                                cnt += 1;
                                                                const hTime = new Date(result.result[i].ts);
                                                                //gthis.log.debug('history ' + memb + ' ' + result.result[i].val + ' time: ' + hTime);
                                                                if (hTime >= midnight.getTime()){
                                                                    if (lastVal == null){
                                                                        //if no lastVal exists
                                                                        lastVal = curVal.val; 
                                                                        lastValCheck = true;
                                                                        gthis.log.info(memb + ': No history before this day is available (lastVal = null)');
                                                                    }else{
                                                                        if (lastVal == false && lastValCheck == true){
                                                                            absent = Math.round((hTime - midnight.getTime())/1000/60);
                                                                            lastValCheck = false;
                                                                        }
                                                                        if (result.result[i].val == false){
                                                                            if (bfirstFalse == false){
                                                                                firstFalse = new Date(result.result[i].ts);
                                                                                bfirstFalse = true;
                                                                            }
                                                                        }
                                                                        if (result.result[i].val == true){
                                                                            if (bfirstFalse == true){
                                                                                bfirstFalse = false;
                                                                                absent += Math.round((hTime - firstFalse.getTime())/1000/60);
                                                                            }
                                                                        }
                                                                    }
                                                                }else{
                                                                    gthis.log.debug('history lastVal ' + memb + ' ' + result.result[i].val + ' time: ' + hTime);
                                                                    lastVal = result.result[i].val;
                                                                    lastValCheck = true;
                                                                }   
                                                            }
                                                        }
                                                        if (bfirstFalse == true){
                                                            bfirstFalse = false;
                                                            absent += Math.round((dnow - firstFalse.getTime())/1000/60);
                                                        }
                                                        present -= absent;
                                                        
                                                        gthis.setState(memb + '.present.sum_day', { val: present, ack: true });
                                                        gthis.setState(memb + '.absent.sum_day', { val: absent, ack: true });

                                                        jsonHistory += ']';
                                                        htmlHistory += HTML_END;
                                                        gthis.setState(memb + '.history', { val: jsonHistory, ack: true });
                                                        gthis.setState(memb + '.historyHtml', { val: htmlHistory, ack: true });
                                                    }
                                                });
                                            }
                                        });
                                    } catch (ex) {
                                        reject('checkPresence history: ' + ex.message);
                                    }
                                }else{
                                    gthis.log.info('History from ' + memb + ' not enabled');
                                }
                            }else{//history enabled
                                gthis.setState(memb + '.history', { val: 'disabled', ack: true });
                                gthis.setState(memb + '.historyHtml', { val: 'disabled', ack: true });
                                gthis.setState(memb + '.present.sum_day', { val: -1, ack: true });
                                gthis.setState(memb + '.absent.sum_day', { val: -1, ack: true });
                            }
                        }
                        if (count == length) {
                            //gthis.log.info('count == length ' + JSON.stringify(presence));
                            jsonTab = jsonTab.substr(0, jsonTab.length-1); //delete last comma
                            jsonTab += ']';
                            htmlTab += HTML_END;  

                            gthis.setState('json', { val: jsonTab, ack: true });
                            gthis.setState('html', { val: htmlTab, ack: true });
                        
                            gthis.setState('presenceAll', { val: presence.all, ack: true });
                            gthis.setState('absenceAll', { val: presence.allAbsence, ack: true });
                            gthis.setState('presence', { val: presence.one, ack: true });
                            gthis.setState('absence', { val: presence.oneAbsence, ack: true });
                            gthis.setState('absentMembers', { val: presence.absentMembers, ack: true });
                            gthis.setState('presentMembers', { val: presence.presentMembers, ack: true });
                            resolve(true);
                        }
                    }).catch(function(error){
                        reject('checkPresence: ' + JSON.stringify(error));
                    }); 
                }//enabled in configuration settings
            }// for end
            //return true;
        });
    }

}

if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new FbCheckpresence(options);
} else {
    // otherwise start the instance directly
    new FbCheckpresence();
}