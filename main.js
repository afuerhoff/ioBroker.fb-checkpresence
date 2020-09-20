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
const TR064_DEVINFO = '/deviceinfoSCPD.xml';
const TR064_HOSTS = '/hostsSCPD.xml';
const TR06_WANPPPCONN = '/wanpppconnSCPD.xml';
const TR06_WANIPCONN = '/wanipconnSCPD.xml';

let GETPATH = false;
let GETMESHPATH = false;
let GETBYMAC = false;
let GETBYIP = false;
let GETPORT = false;
let GETEXTIP = false;

let allDevices = [];
let jsonTab;
let htmlTab;
let scheduledJob;
let scheduledJobFamily;
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

function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

async function getDeviceList(gthis, cfg, Fb){
    try {
        //get device list
        const hostPath = await Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetHostListPath', null);
        if (hostPath.result != false){
            const url = 'http://' + Fb.host + ':' + Fb.port + hostPath.resultData['NewX_AVM-DE_HostListPath'];
            const deviceList = await Fb.getDeviceList(url);
            if (deviceList != null){
                gthis.log.debug('getDeviceList: ' + JSON.stringify(deviceList['List']['Item']));
                gthis.setState('devices', { val: deviceList['List']['Item'].length, ack: true });
                //gthis.setState('info.connection', { val: true, ack: true }); //Fritzbox connection established
                errorCnt = 0;
                return deviceList['List']['Item'];
            }else{
                return null;
            }
        }else{
            //gthis.log.error('can not read hostListPath!');
            return null;
        }
    } catch (e) {
        showError('getDeviceList: '+ e);
        //gthis.setState('info.connection', { val: false, ack: true });
        return null;
    }   
}

async function getMeshList(gthis, cfg, Fb){
    try {
        //get device list
        const meshPath = await Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetMeshListPath', null);
        if (meshPath.result != false){
            const url = 'http://' + Fb.host + ':' + Fb.port + meshPath.resultData['NewX_AVM-DE_MeshListPath'];
            const meshList = await Fb.getMeshList(url);
            if (meshList != null){
                gthis.log.debug('getMeshList: ' + JSON.stringify(meshList['nodes']));
                //gthis.setState('devices', { val: deviceList['List']['Item'].length, ack: true });
                //gthis.setState('info.connection', { val: true, ack: true }); //Fritzbox connection established
                errorCnt = 0;
                return meshList['nodes'];
            }else{
                return null;
            }
        }else{
            //gthis.log.error('can not read hostListPath!');
            return null;
        }
    } catch (e) {
        showError('getMeshList: '+ e);
        //gthis.setState('info.connection', { val: false, ack: true });
        return null;
    }   
}

async function getDeviceInfo(items, cfg){
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

        //Get mesh info
        let mesh = null;
        const enabledMeshInfo = gthis.config.meshinfo;
        //gthis.log.info('function mesh info: ' + enabledMeshInfo);            
        if (GETMESHPATH != null && GETMESHPATH == true && enabledMeshInfo == true){
            mesh = await getMeshList(gthis, cfg, Fb);
            if (mesh != null) gthis.setState('fb-devices.mesh', { val: JSON.stringify(mesh), ack: true }); //raw data
            //gthis.log.info(' meshdevice ' + JSON.stringify(mesh));
        }

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
            /*const active = await gthis.getStateAsync('fb-devices.' + items[i]['HostName'] + '.active');
            if(active.ts <= Date.now() - 10000 ) {
                gthis.log.info(items[i]['HostName'] + ' 1 ' + active.val);
                gthis.setState('fb-devices.' + items[i]['HostName'] + '.active', { val: items[i]['Active'], ack: true });
            }else{
                if(items[i]['Active'] == true) gthis.setState('fb-devices.' + items[i]['HostName'] + '.active', { val: items[i]['Active'], ack: true });
                gthis.log.info(items[i]['HostName'] + ' 2 ' + active.val);
            }*/
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
                        //gthis.log.info(items[i]['HostName'] + ' meshdevice ' + JSON.stringify(meshdevice));
                    }
                    if (meshdevice != null) {
                        gthis.setState('fb-devices.' + hostName + '.meshstate', { val: true, ack: true });
                        //gthis.log.info('Mesh Device: ' + hostName + ' ' + JSON.stringify(meshdevice));
                        //items[i]
                        for (let ni = 0; ni < meshdevice['node_interfaces'].length; ni++) {
                            const nInterface = meshdevice['node_interfaces'][ni];
                            let interfaceName = nInterface['name'];
                            if (interfaceName == '') interfaceName = nInterface['type'];
                            
                            await obj.createMeshObjects(gthis, items[i]['HostName'], ni);
                            const hostname = items[i]['HostName'];
                            if (hostname.includes('.')){
                                hostName = hostname.replace('.', '-');
                            }

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
                                            //gthis.log.info(JSON.stringify(node1));
                                            //gthis.log.info('mesh ' + node['device_name'] + ' ' + interFace['uid'] + ' ' + interFace['name'] + ' ' + nodelinks['type'] + ' -> ' + JSON.stringify(nodelinks['node_1_uid']) + ' ' + nodelinks['node_interface_1_uid'] + ' ' + node1['uid'] + ' ' + ' ' + node1['device_name']);
                                            if (link != '') link += ',';
                                            link += node1['device_name'];
                                            //gthis.log.info('mesh ' + meshdevice['uid'] + ' ' + meshdevice['device_name'] + ' ' + nInterface['uid'] + ' '  + nInterface['name'] + ' ' + nodelinks['uid'] + ' ' + nodelinks['type'] + ' -> ' + JSON.stringify(nodelinks['node_1_uid']) + ' ' + nodelinks['node_interface_1_uid'] + ' ' + node1['uid'] + ' ' + node1['device_name']);
                                        }
                                        if (nodelinks['node_2_uid'] != meshdevice['uid']){ //Down connection
                                            const node1 = mesh.find(el => el.uid === nodelinks['node_2_uid']);
                                            //gthis.log.info(JSON.stringify(node1));
                                            if (link != '') link += ',';
                                            link += node1['device_name'];
                                            //gthis.log.info('mesh ' + meshdevice['uid'] + ' ' + meshdevice['device_name'] + ' ' + nInterface['uid'] + ' '  + nInterface['name'] + ' ' + nodelinks['uid'] + ' ' + nodelinks['type'] + ' -> ' + JSON.stringify(nodelinks['node_2_uid']) + ' ' + nodelinks['node_interface_2_uid'] + ' ' + node1['uid'] + ' ' + node1['device_name']);
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
    }  catch (e) {
        showError('getDeviceInfo: '+ e);
        //gthis.setState('info.connection', { val: false, ack: true });
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
                                            gthis.log.info(JSON.stringify(idS));
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
        gthis.log.error(error);
    }
}

async function getActive(index, cfg, memberRow, dnow, presence, Fb){
    try {
        //const re = /^[a-fA-F0-9:]{17}|[a-fA-F0-9]{12}$/;
        let hostEntry = null;
        const member = memberRow.familymember; 
        const mac = memberRow.macaddress; 
        const ip = memberRow.ipaddress; 
        if (memberRow.useip == undefined || ip == undefined){
            hostEntry ={result: false};
            gthis.log.error('Please edit configuration in admin view and save it! Some items (use ip, ip-address) in new version are missing');  
        }else{
            if (memberRow.useip == false){
                if (mac != ''){
                    hostEntry = await Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'GetSpecificHostEntry', [[1, 'NewMACAddress', memberRow.macaddress]], true);
                    if(hostEntry.result === false){
                        if (hostEntry.errorMsg.errorDescription == 'NoSuchEntryInArray'){
                            gthis.log.warn('macaddress ' + mac + ' from member ' + member + ' not found in fritzbox device list');
                        } else if (hostEntry.errorMsg.errorDescription == 'Invalid Args'){
                            gthis.log.warn('invalid arguments for macaddress ' + mac + ' from member ' + member);
                        } else {
                            gthis.log.warn('macaddress ' + mac + ' from member ' + member + ': ' + hostEntry.errorMsg.errorDescription);
                        }
                        hostEntry = {result: true, resultData: {NewActive: 0}};
                    }
                }else{
                    gthis.log.warn('The configured mac-address for member ' + member + ' is empty. Please insert a valid mac-address!');
                    hostEntry ={result: false};
                }
            }else{ //true
                if (GETBYIP == true && ip != ''){
                    hostEntry = await Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetSpecificHostEntryByIP', [[1, 'NewIPAddress', memberRow.ipaddress]], true);
                    if(hostEntry.result === false){
                        if (hostEntry.errorMsg.errorDescription == 'NoSuchEntryInArray'){
                            gthis.log.warn('ipaddress ' + ip + ' from member ' + member + ' not found in fritzbox device list');
                        } else if (hostEntry.errorMsg.errorDescription == 'Invalid Args') {
                            gthis.log.warn('invalid arguments for ipaddress ' + ip + ' from member ' + member);
                        } else {
                            gthis.log.warn('ipaddress ' + ip + ' from member ' + member + ': ' + hostEntry.errorMsg.errorDescription);
                        }
                        hostEntry = {result: true, resultData: {NewActive: 0}};
                    }
                }else{
                    if (memberRow.ipaddress == '') gthis.log.warn('The configured ip-address for ' + member + ' is empty. Please insert a valid ip-address!');
                    if (GETBYIP == false) gthis.log.warn('The service X_AVM-DE_GetSpecificHostEntryByIP for ' + member + ' is not supported');
                    hostEntry ={result: false};
                }
            }
        }
        if (hostEntry != null && hostEntry.result != false){
            //gthis.setState('info.connection', { val: true, ack: true });
            const newActive = hostEntry.resultData['NewActive'];

            let memberActive = false; 
            let comming = null;
            let going = null;
            const curVal = await gthis.getStateAsync(member); //actual member state
            const curValNew = await gthis.getStateAsync(member + '.presence'); //actual member state
            if (curVal == null || curValNew == null) return null;
            if (curVal.val != curValNew.val) { //Workaround for new object
                gthis.setState(member + '.presence', { val: curVal.val, ack: true });
            }
            if (curVal.val != null){
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
                if (newActive == 1){ //member = true
                    memberActive = true;
                    presence.one = true;
                    if (presence.oneNames == '') {
                        presence.oneNames += member;
                    }else{
                        presence.oneNames += ', ' + member;
                    }
                    if (curVal.val == false){ //signal changing to true
                        gthis.log.debug('newActive ' + member + ' ' + newActive);
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
                    if (presence.allNames == '') {
                        presence.allNames += member;
                    }else{
                        presence.allNames += ', ' + member;
                    }
                    if (curVal.val == true){ //signal changing to false
                        gthis.log.debug('newActive ' + member + ' ' + newActive);
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

            }else{
                showError('getActive: content of object ' + member + ' is wrong!'); 
            }
                            
            const comming1 = await gthis.getStateAsync(member + '.comming');
            comming = comming1.val;
            const going1 = await gthis.getStateAsync(member + '.going');
            going = going1.val;
            if (comming1.val == null) {
                comming = new Date(curVal.lc);
                gthis.setState(member + '.comming', { val: comming, ack: true });
            }
            if (going1.val == null) {
                going = new Date(curVal.lc);
                gthis.setState(member + '.going', { val: going, ack: true });
            }
            jsonTab += createJSONRow(cfg, 'Name', member, 'Active', memberActive, 'Kommt', comming, 'Geht', going);
            htmlTab += createHTMLRow(cfg, member, memberActive, comming, going);
            gthis.log.debug('getActive ' + jsonTab);
            return curVal;
        }else{
            //gthis.log.error('can not read hostEntry! <' + 'status=' + hostEntry.status + ' errNo=' + hostEntry.errNo + ' ' + hostEntry.errorMsg + '>');
            return null;
        }
    }  catch (e) {
        showError('getActive: ' + e);
        //gthis.setState('info.connection', { val: false, ack: true });
        return null;
    }    
}

async function checkPresence(gthis, cfg, Fb){
    try {
        const midnight = new Date();
        midnight.setHours(0,0,0);
        const dnow = new Date();

        // functions for family members
        jsonTab = '[';
        htmlTab = HTML;
        const presence = {
            all: true,
            one: false,
            oneNames: '',
            allNames: ''
        };
        
        //connection check
        const info = await Fb.soapAction(Fb, '/upnp/control/deviceinfo', 'urn:dslforum-org:service:DeviceInfo:1', 'GetInfo', null);
        if (info.status == 200){
            gthis.setState('info.connection', { val: true, ack: true });
            gthis.setState('info.lastUpdate', { val: new Date(), ack: true });
        }else{
            gthis.setState('info.connection', { val: false, ack: true });
        }
        //gthis.log.info('' + JSON.stringify(info.status));

        //Get extIp
        if (GETEXTIP != null && GETEXTIP == true){
            let extIp = await Fb.soapAction(Fb, '/upnp/control/wanpppconn1', 'urn:dslforum-org:service:WANPPPConnection:1', 'GetInfo', null, true);
            gthis.log.debug(JSON.stringify(extIp));
            if (extIp != 'undefined' && extIp.result != false){
                const extIpOld = gthis.getStateAsync('info.extIp');
                if (extIpOld.val != extIp.resultData['NewExternalIPAddress'] ) gthis.setState('info.extIp', { val: extIp.resultData['NewExternalIPAddress'], ack: true });
            }else{
                extIp = await Fb.soapAction(Fb, '/upnp/control/wanipconnection1', 'urn:dslforum-org:service:WANIPConnection:1', 'GetInfo', null, true);
                gthis.log.debug(JSON.stringify(extIp));
                if (extIp != 'undefined' && extIp.result != false){
                    const extIpOld = gthis.getStateAsync('info.extIp');
                    if (extIpOld.val != extIp.resultData['NewExternalIPAddress'] ) gthis.setState('info.extIp', { val: extIp.resultData['NewExternalIPAddress'], ack: true });
                }else{
                    gthis.log.warn('can not read external ip address');
                }
            }
        }else{
            gthis.log.warn('can not read external ip address');
        }

        for (let k = 0; k < cfg.members.length; k++) {
            if (enabled == false) break;
            const memberRow = cfg.members[k]; //Row from family members table
            const member = memberRow.familymember; 

            if (memberRow.enabled == true && GETBYMAC == true){ //member enabled in configuration settings
                try { //get fritzbox data
                    const curVal = await getActive(k, cfg, memberRow, dnow, presence, Fb);
                    if (curVal != null){
                        //get history data
                        let present = Math.round((dnow - midnight)/1000/60); //time from midnight to now = max. present time
                        let absent = 0;

                        const end = new Date().getTime();
                        const start = midnight.getTime();
                        let lastVal = null;
                        let lastValCheck = false;
                        //const dPoint = await getObjectP('fb-checkpresence.0.' + member);
                        //gthis.log.info(`${gthis.namespace}` + '.' + member);
                        //const dPoint = await getObjectP(`${gthis.namespace}` + '.' + member);
                        const dPoint = await gthis.getObjectAsync(`${gthis.namespace}` + '.' + member);

                        const memb = member;
                        if (cfg.history != ''){
                            //gthis.log.info('history start' + JSON.stringify(dPoint.common));
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
                                            gthis.log.warn('can not read history from ' + memb + ' ' + result1.error);
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
                                                    gthis.log.warn('can not read history from ' + memb + ' ' + result.error);
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
                                    //gthis.setState('info.connection', { val: false, ack: true });
                                    showError('checkPresence: ' + ex.message);
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
                } catch (error) {
                    //gthis.setState('info.connection', { val: false, ack: true });
                    showError('checkPresence: ' + error);
                }
            }//enabled in configuration settings
            
        }// for end
        jsonTab = jsonTab.substr(0, jsonTab.length-1); //delete last comma
        jsonTab += ']';
        htmlTab += HTML_END;  

        gthis.setState('json', { val: jsonTab, ack: true });
        gthis.setState('html', { val: htmlTab, ack: true });
    
        gthis.setState('presenceAll', { val: presence.all, ack: true });
        gthis.setState('presence', { val: presence.one, ack: true });
        gthis.setState('absentMembers', { val: presence.allNames, ack: true });
        gthis.setState('presentMembers', { val: presence.oneNames, ack: true });
        return true;
    }
    catch (error) {
        showError('checkPresence: ' + error);
        //gthis.setState('info.connection', { val: false, ack: true });
        return false;
    }
}

function enableHistory(cfg, member) {
    try {
        let alias = '';
        gthis.sendTo(cfg.history, 'getEnabledDPs', {}, function (result) {
            if (result[`${gthis.namespace}` + '.' + member] != undefined && result[`${gthis.namespace}` + '.' + member].aliasId != undefined){
                alias = result[`${gthis.namespace}` + '.' + member].aliasId;
            }
            gthis.sendTo(cfg.history, 'enableHistory', {
                id: `${gthis.namespace}` + '.' + member,
                options: {
                    changesOnly:  true,
                    debounce:     0,
                    retention:    31536000,
                    maxLength:    10,
                    changesMinDelta: 0,
                    aliasId: alias
                }
            }, function (result2) {
                if (result2.error) {
                    showError('enableHistory.3 ' + member + ' ' + result2.error);
                }
                if (result2.success) {
                    gthis.log.debug('enableHistory.2 ' + member + ' ' + result2.success);
                }
            });
        });
    } catch (error) {
        gthis.log.error('enableHistory ' + error);        
    }
}

Array.prototype.indexOfObject = function (property, value, ind=-1) {
    for (let i = 0, len = this.length; i < len; i++) {
        if (i != ind && this[i][property] === value) return i;
    }
    return -1;
};

async function _sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}


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
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        try {
            // Initialize your adapter here
            //const getForeignObjectP = util.promisify(this.getForeignObject);

            const sysObj =  await this.getForeignObjectAsync('system.config');
            let adapterObj = (await this.getForeignObjectAsync(`system.adapter.${this.namespace}`));
            let adapterObjChanged = false;
   
            if (sysObj && sysObj.native && sysObj.native.secret) {
                gthis.config.password = decrypt(sysObj.native.secret, this.config.password);
            } else {
                gthis.config.password = decrypt('SdoeQ85NTrg1B0FtEyzf', this.config.password);
            }

            //if interval <= 0 than set to 1 
            if (this.config.interval <= 0) {
                adapterObj.native.interval = 1;
                adapterObjChanged = true;
                //await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
                this.config.interval = 1;
                this.log.warn('interval is less than 1. Set to 1 Min.');
            }

            //create new configuration items 
            for(let i=0;i<this.config.familymembers.length;i++){
                if (this.config.familymembers[i].useip == undefined) {
                    adapterObj.native.familymembers[i].useip = false;
                    adapterObj.native.familymembers[i].ipaddress = '';
                    adapterObjChanged = true;
                    //await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
                }
            }

            if (adapterObjChanged === true){
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
            
            //const cron = '*/' + cfg.iv + ' * * * *';
            const cron = cfg.iv * 60000;
            const cronFamily = this.config.intervalFamily * 1000;
            this.log.info('start fb-checkpresence: ip-address: ' + cfg.ip + ' polling interval: ' + cfg.iv + ' Min.');
            this.log.debug('configuration user: <' + this.config.username + '>');
            this.log.debug('configuration history: <' + this.config.history + '>');
            this.log.debug('configuration dateformat: <' + this.config.dateformat + '>');
            this.log.debug('configuration familymembers: ' + JSON.stringify(this.config.familymembers));
            this.log.debug('configuratuion mesh info: ' + this.config.meshinfo);            
            
            const devInfo = {
                host: this.config.ipaddress,
                port: '49000',
                sslPort: null,
                uid: this.config.username,
                pwd: this.config.password
            };
            Fb = new fb.Fb(devInfo, this);

            //check if the functions are supported by avm
            GETPATH = await Fb.chkService(TR064_HOSTS, 'X_AVM-DE_GetHostListPath');
            GETMESHPATH = await Fb.chkService(TR064_HOSTS, 'X_AVM-DE_GetMeshListPath');
            GETBYMAC = await Fb.chkService(TR064_HOSTS, 'GetSpecificHostEntry');
            GETBYIP = await Fb.chkService(TR064_HOSTS, 'X_AVM-DE_GetSpecificHostEntryByIP');
            GETPORT = await Fb.chkService(TR064_DEVINFO, 'GetSecurityPort');
            GETEXTIP = await Fb.chkService(TR06_WANPPPCONN, 'GetInfo');
            if ( GETEXTIP == false) GETEXTIP = await Fb.chkService(TR06_WANIPCONN, 'GetInfo');

            //const test = await Fb.soapAction(Fb, '/upnp/control/deviceconfig', 'urn:dslforum-org:service:DeviceConfig:1', 'X_AVM-DE_CreateUrlSID', null);
            //gthis.log.info(JSON.stringify(test));

            if (GETPORT != null && GETPORT == true){
                const port = await Fb.soapAction(Fb, '/upnp/control/deviceinfo', 'urn:dslforum-org:service:DeviceInfo:1', 'GetSecurityPort', null);
                if (port.result != false){
                    Fb._sslPort = parseInt(port.resultData['NewSecurityPort']);
                    gthis.log.debug('sslPort ' + Fb._sslPort);
                }else{
                    gthis.log.error('can not read security port! <' + 'status=' + port.status + ' errNo=' + port.errNo + ' ' + port.errorMsg + '>');
                    //gthis.log.error('can not read security port! <' + port.errorMsg + '>');
                }
            }else{
                adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                adapterObj.common.enabled = false;  // Adapter ausschalten
                await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
            }

            //Create global objects
            obj.createGlobalObjects(this, HTML+HTML_END, HTML_GUEST+HTML_END);
            this.log.debug('createGlobalObjects');

            //create Fb devices
            const enabledFbDevices = gthis.config.fbdevices;
            gthis.log.debug('function fb-devices ' + enabledFbDevices);
            if (GETPATH != null && GETPATH == true && enabledFbDevices == true){
                const items = await getDeviceList(gthis, cfg, Fb);
                if (items != null){
                    for (let i = 0; i < items.length; i++) {
                        //const n = items.indexOfObject('HostName', items[i]['HostName'], i);
                        //if (n != -1 ) gthis.log.warn('duplicate fritzbox device item. Please correct the hostname in the fritzbox settings for the device -> ' + items[i]['HostName'] + ' ' + items[i]['MACAddress']);
                        await obj.createFbDeviceObjects(gthis, items[i]['HostName']);
                        await obj.createMeshObjects(gthis, items[i]['HostName'], 0); //create channel 0 as default interface
                    }
                    this.log.debug('Fritzbox device objects succesfully created');
                }else{
                    this.log.error('createFbDeviceObjects -> ' + "can't read devices from fritzbox!");
                    adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                    adapterObj.common.enabled = false;  // Adapter ausschalten
                    await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
                    //return null;
                }
                await resyncFbObjects(items);
            }

            if (!cfg.members) {
                this.log.info('no family members defined -> some functions are disabled');
            }else{
                //Create objects for family members
                for (let k = 0; k < cfg.members.length; k++) {
                    const memberRow = cfg.members[k];
                    const member = memberRow.familymember;
                    if (memberRow.enabled == true){
                        obj.createMemberObjects(this, member, HTML_HISTORY + HTML_END);
                        this.log.debug('createMemberObjects ' + member);
                        if (cfg.history != ''){
                            enableHistory(cfg, member);
                        }else{
                            gthis.log.info('History function disabled');
                        }
                    }
                }
            }           
            // in this template all states changes inside the adapters namespace are subscribed
            this.subscribeStates('guest.wlan');  

            //Get device info
            let items = null;
            if (GETPATH != null && GETPATH == true && enabledFbDevices == true){
                items = await getDeviceList(gthis, cfg, Fb);
                if (items != null){
                    getDeviceInfo(items, cfg);
                }
            }

            await checkPresence(gthis, cfg, Fb); // Main function
            this.log.debug('checkPresence first run');

            //get uuid for transaction
            //const sSid = await Fb.soapAction(Fb, '/upnp/control/deviceconfig', urn + 'DeviceConfig:1', 'X_GenerateUUID', null);
            //const uuid = sSid['NewUUID'].replace('uuid:', '');
            scheduledJobFamily = setInterval(async function(){
                await checkPresence(gthis, cfg, Fb);
                gthis.log.debug('checkPresence scheduled');
            }, cronFamily);

            scheduledJob = setInterval(async function(){
                //start transaction
                //const startTransaction = await Fb.soapAction(Fb, '/upnp/control/deviceconfig', urn + 'DeviceConfig:1', 'ConfigurationStarted', [[1, 'NewSessionID', uuid]]);
                //gthis.log.debug('checkPresence start transaction -> ' + JSON.stringify(startTransaction));
 
                //Get device info
                let items = null;
                if (GETPATH != null && GETPATH == true && enabledFbDevices == true){
                    items = await getDeviceList(gthis, cfg, Fb);
                    if (items != null){
                        getDeviceInfo(items, cfg);
                    }
                }
                
                //stop transaction
                //const stopTransaction = await Fb.soapAction(Fb, '/upnp/control/deviceconfig', urn + 'DeviceConfig:1', 'ConfigurationFinished', null);
                //gthis.log.debug('checkPresence ' + JSON.stringify(stopTransaction));
                gthis.log.debug('getDeviceInfo scheduled');
            }, cron);
        } catch (error) {
            //gthis.setState('info.connection', { val: false, ack: true });
            showError('onReady: ' + error);
        }
    }//onReady

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            enabled = false;
            clearInterval(scheduledJob);
            clearInterval(scheduledJobFamily);
            gthis.log.info('cleaned everything up ...');
            await _sleep(3000);
            gthis.log.info('cleaned everything up 1...');
            //setTimeout(callback(), 3000);
            callback();
        } catch (e) {
            callback();
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
        if (id == `${gthis.namespace}` + '.guest.wlan'){
            let guestwlan;
            this.log.info(`state1 ${id} changed: ${state.val} (ack = ${state.ack})`);
            if (state.val == true){
                guestwlan = await Fb.soapAction(Fb, '/upnp/control/wlanconfig3', urn + 'WLANConfiguration:3', 'SetEnable', [[1, 'NewEnable', 1]]);
                if (guestwlan['status'] != 200 || guestwlan['result'] == false) this.log.error(JSON.stringify(guestwlan));
            }else{
                guestwlan = await Fb.soapAction(Fb, '/upnp/control/wlanconfig3', urn + 'WLANConfiguration:3', 'SetEnable', [[1, 'NewEnable', 0]]);
                if (guestwlan['status'] != 200 || guestwlan['result'] == false) this.log.error(JSON.stringify(guestwlan));
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
                            items =  await getDeviceList(this, null, Fb);
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