'use strict';
/*
 * Created with @iobroker/create-adapter vunknown
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// load your modules here, e.g.:
const util = require('util');
const dateFormat = require('dateformat');
//own libraries
const fb = require('./lib/fb');
const obj = require('./lib/objects');

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

let GETPATH = false;
let GETBYMAC = false;
let GETBYIP = false;
let GETPORT = false;

let allDevices = [];
let jsonTab;
let htmlTab;
let scheduledJob;
let errorCnt = 0;
const errorCntMax = 10;

function showError(errorMsg) {
    if (errorCnt < errorCntMax) {
        errorCnt+=1;
        gthis.log.error(errorMsg);
    } else {
        gthis.log.debug('maximum error count reached! Error messages are suppressed');
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
function createJSONRow(cnt, maxcnt, cfg, sHeadUser, sUser, sHeadStatus, sStatus, sHeadComming, comming, sHeadGoing, going) {
    let json = '{';
    json += '"'  + sHeadUser + '":';
    json += '"'  + sUser + '"' + ',';
    json += '"'  + sHeadStatus + '":';
    json += '"'  + sStatus + '"' + ',';
    json += '"'  + sHeadComming + '":';
    json += '"'  + dateFormat(comming, cfg.dateFormat) + '"' + ',';
    json += '"'  + sHeadGoing + '":';
    json += '"'  + dateFormat(going, cfg.dateFormat) + '"' + '}';
    if (cnt < maxcnt-1){
        json += ',';
    }
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
        const url = 'http://' + Fb.host + ':' + Fb.port + hostPath['NewX_AVM-DE_HostListPath'];
        //gthis.log.debug('getDeviceList url: ' + JSON.stringify(hostPath));
        const deviceList = await Fb.getDeviceList(url);
        gthis.log.debug('getDeviceList: ' + JSON.stringify(deviceList['List']['Item']));
        gthis.setState('devices', { val: deviceList['List']['Item'].length, ack: true });
        gthis.setState('info.connection', { val: true, ack: true }); //Fritzbox connection established
        gthis.setState('info.lastUpdate', { val: new Date(), ack: true });
        errorCnt = 0;
        return deviceList['List']['Item'];
    }  catch (e) {
        showError('getDeviceList: '+ e);
        gthis.setState('info.connection', { val: false, ack: true });
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
        for (let i = 0; i < items.length; i++) {
            await obj.createFbDeviceObjects(gthis, items[i]['HostName']);
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
            gthis.setState('fb-devices.' + items[i]['HostName'] + '.macaddress', { val: items[i]['MACAddress'], ack: true });
            gthis.setState('fb-devices.' + items[i]['HostName'] + '.ipaddress', { val: items[i]['IPAddress'], ack: true });
            gthis.setState('fb-devices.' + items[i]['HostName'] + '.active', { val: items[i]['Active'], ack: true });
            gthis.setState('fb-devices.' + items[i]['HostName'] + '.interfacetype', { val: items[i]['InterfaceType'], ack: true });
            gthis.setState('fb-devices.' + items[i]['HostName'] + '.guest', { val: items[i]['X_AVM-DE_Guest'], ack: true });
            gthis.setState('fb-devices.' + items[i]['HostName'] + '.whitelist', { val: foundwl, ack: true });
            gthis.setState('fb-devices.' + items[i]['HostName'] + '.blacklist', { val: ! (foundwl && items[i]['X_AVM-DE_Guest']), ack: true });
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

        gthis.setState('guest.listHtml', { val: htmlRow, ack: true });
        gthis.setState('guest.listJson', { val: jsonRow, ack: true });
        gthis.setState('guest.count', { val: guestCnt, ack: true });

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
        gthis.log.debug('getDeviceInfo active: '+ activeCnt);
        if (blCnt > 0) {
            gthis.setState('blacklist', { val: true, ack: true });
        }else {
            gthis.setState('blacklist', { val: false, ack: true });
        }
        gthis.log.debug('getDeviceInfo unknown: '+ blCnt);
    }  catch (e) {
        showError('getDeviceInfo: '+ e);
        gthis.setState('info.connection', { val: false, ack: true });
    }    
}

async function getActive(index, cfg, memberRow, dnow, presence, Fb){
    try {
        //Promisify some async functions
        const getStateP = util.promisify(gthis.getState);
        const re = /^[a-fA-F0-9:]{17}|[a-fA-F0-9]{12}$/;
        let hostEntry = null;
        const member = memberRow.familymember; 

        if (memberRow.macaddress.match(re) && memberRow.macaddress.match(re) == memberRow.macaddress){
            hostEntry = await Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'GetSpecificHostEntry', [[1, 'NewMACAddress', memberRow.macaddress]]);
        }else{
            hostEntry = await Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetSpecificHostEntryByIP', [[1, 'NewIPAddress', memberRow.macaddress]]);
        }
        const newActive = hostEntry['NewActive'];
        gthis.log.debug('getActive ' + member + ' ' + newActive);

        let memberActive = false; 
        let comming = null;
        let going = null;
        const curVal = await getStateP(member); //actual member state
        const curValNew = await getStateP(member + '.presence'); //actual member state
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
                        
        const comming1 = await getStateP(member + '.comming');
        comming = comming1.val;
        const going1 = await getStateP(member + '.going');
        going = going1.val;
        if (comming1.val == null) {
            comming = new Date(curVal.lc);
            gthis.setState(member + '.comming', { val: comming, ack: true });
        }
        if (going1.val == null) {
            going = new Date(curVal.lc);
            gthis.setState(member + '.going', { val: going, ack: true });
        }
        jsonTab += createJSONRow(index, cfg.members.length, cfg, 'Name', member, 'Active', memberActive, 'Kommt', comming, 'Geht', going);
        htmlTab += createHTMLRow(cfg, member, memberActive, comming, going);
        gthis.log.debug('getActive ' + jsonTab);
        return curVal;
    }  catch (e) {
        showError('getActive: ' + e);
        gthis.setState('info.connection', { val: false, ack: true });
    }    
}

async function checkPresence(gthis, cfg, Fb){
    try {
        const getObjectP = util.promisify(gthis.getObject);

        const midnight = new Date();
        midnight.setHours(0,0,0);
        const dnow = new Date();
        if (GETPATH == true){
            const items = await getDeviceList(gthis, cfg, Fb);
            getDeviceInfo(items, cfg);
        }

        // functions for family members
        jsonTab = '[';
        htmlTab = HTML;
        const presence = {
            all: true,
            one: false
        };
        
        for (let k = 0; k < cfg.members.length; k++) {
            const memberRow = cfg.members[k]; //Row from family members table
            const member = memberRow.familymember; 

            if (memberRow.enabled == true && GETBYMAC == true && GETBYIP == true){ //member enabled in configuration settings
                //gthis.log.debug('testaf');
                try { //get fritzbox data
                    const curVal = await getActive(k, cfg, memberRow, dnow, presence, Fb);

                    //get history data
                    let present = Math.round((dnow - midnight)/1000/60); //time from midnight to now = max. present time
                    let absent = 0;

                    const end = new Date().getTime();
                    const start = midnight.getTime();
                    let lastVal = null;
                    let lastValCheck = false;
                    const dPoint = await getObjectP('fb-checkpresence.0.' + member);

                    const memb = member;
                    if (cfg.history != ''){
                        //gthis.log.debug('history start');
                        if (dPoint.common.custom[cfg.history].enabled == true){
                            try {
                                gthis.sendTo(cfg.history, 'getHistory', {
                                    id: 'fb-checkpresence.0.' + memb,
                                    options:{
                                        end:        end,
                                        start:      start,
                                        aggregate: 'none'
                                    }
                                }, function (result1) {
                                    if (result1 == null) {
                                        gthis.log.info('list history ' + memb + ' ' + result1.error);
                                    }else{
                                        const cntActualDay = result1.result.length;
                                        //gthis.log.debug('history cntActualDay: ' + cntActualDay);
                                        gthis.sendTo(cfg.history, 'getHistory', {
                                            id: 'fb-checkpresence.0.' + memb,
                                            options: {
                                                end:        end,
                                                count:      cntActualDay + 10,
                                                aggregate: 'none'
                                            }
                                        }, function (result) {
                                            if (result == null) {
                                                gthis.log.info('list history ' + memb + ' ' + result.error);
                                            }else{
                                                let htmlHistory = HTML_HISTORY;
                                                let jsonHistory = '[';
                                                let bfirstFalse = false;
                                                let firstFalse = midnight;
                                                let cntLastVal = 0;
                                                for (let i = result.result.length-1-cntActualDay; i >= 0; i--) {
                                                    if (result.result[i].val != null){
                                                        cntLastVal = i;
                                                        //gthis.log.debug('history cntLastVal: ' + cntLastVal + ' lastVal: ' + result.result[i].val + ' ' + new Date(result.result[i].ts));
                                                        break;
                                                    }
                                                }
                                                let cnt = 0;
                                                for (let i = cntLastVal; i < result.result.length; i++) {
                                                    if (result.result[i].val != null ){
                                                        const hdate = dateFormat(new Date(result.result[i].ts), cfg.dateformat);
                                                        htmlHistory += createHTMLHistoryRow(cfg, result.result[i].val, hdate);
                                                        jsonHistory += createJSONHistoryRow(cnt, cfg, 'Active', result.result[i].val, 'Date', hdate);
                                                        cnt += 1;
                                                        const hTime = new Date(result.result[i].ts);
                                                        //gthis.log.debug('history: ' + result.result[i].val + ' time: ' + hTime);
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
                                gthis.setState('info.connection', { val: false, ack: true });
                                showError('checkPresence: ' + ex.message);
                            }
                        }else{
                            gthis.log.info('History not enabled');
                        }
                    }else{//history enabled
                        gthis.setState(memb + '.history', { val: 'disabled', ack: true });
                        gthis.setState(memb + '.historyHtml', { val: 'disabled', ack: true });
                        gthis.setState(memb + '.present.sum_day', { val: -1, ack: true });
                        gthis.setState(memb + '.absent.sum_day', { val: -1, ack: true });
                    }
                    
                } catch (error) {
                    gthis.setState('info.connection', { val: false, ack: true });
                    showError('checkPresence: ' + error);
                }
            }//enabled in configuration settings
            
        }// for end
        jsonTab += ']';
        htmlTab += HTML_END;  

        gthis.setState('json', { val: jsonTab, ack: true });
        gthis.setState('html', { val: htmlTab, ack: true });
    
        gthis.setState('presenceAll', { val: presence.all, ack: true });
        gthis.setState('presence', { val: presence.one, ack: true });
    }
    catch (error) {
        showError('checkPresence: ' + error);
        gthis.setState('info.connection', { val: false, ack: true });
    }
}

function enableHistory(cfg, member) {
    if (cfg.history != ''){
        gthis.sendTo(cfg.history, 'enableHistory', {
            id: 'fb-checkpresence.0.' + member,
            options: {
                changesOnly:  true,
                debounce:     0,
                retention:    31536000,
                maxLength:    10,
                changesMinDelta: 0,
                aliasId: ''
            }
        }, function (result) {
            if (result.error) {
                showError('enable history: ' + '' + result.error);
            }
            if (result.success) {
                //gthis.log.info('enable history ' + " " + result.success);
            }
        });
    }else{
        gthis.log.info('History disabled');
    }
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
        this.on('ready', this.onReady);
        //this.on('objectChange', this.onObjectChange);
        //this.on('stateChange', this.onStateChange);
        this.on('message', this.onMessage);
        this.on('unload', this.onUnload);
        gthis = this;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        try {
            // Initialize your adapter here
            const getForeignObjectP = util.promisify(this.getForeignObject);

            const sysobj =  await getForeignObjectP('system.config');
            if (sysobj && sysobj.native && sysobj.native.secret) {
                gthis.config.password = decrypt(sysobj.native.secret, this.config.password);
            } else {
                gthis.config.password = decrypt('SdoeQ85NTrg1B0FtEyzf', this.config.password);
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
            this.log.info('start fb-checkpresence: ip-address: ' + cfg.ip + ' polling interval: ' + cfg.iv + ' Min.');
            this.log.debug('configuration user: ' + this.config.username);
            this.log.debug('configuration history: ' + this.config.history);
            this.log.debug('configuration dateformat: ' + this.config.dateformat);
            this.log.debug('configuration familymembers: ' + JSON.stringify(this.config.familymembers));
            
            const devInfo = {
                host: this.config.ipaddress,
                port: '49000',
                sslPort: null,
                uid: this.config.username,
                pwd: this.config.password
            };
            const Fb = new fb.Fb(devInfo, this);

            //check if the functions are supported by avm
            GETPATH = await Fb.chkService(TR064_HOSTS, 'X_AVM-DE_GetHostListPath');
            GETBYMAC = await Fb.chkService(TR064_HOSTS, 'GetSpecificHostEntry');
            GETBYIP = await Fb.chkService(TR064_HOSTS, 'X_AVM-DE_GetSpecificHostEntryByIP');
            GETPORT = await Fb.chkService(TR064_DEVINFO, 'GetSecurityPort');
            //gthis.log.info('GETPATH ' + GETPATH);

            const result = await Fb.soapAction(Fb, '/upnp/control/deviceinfo', 'urn:dslforum-org:service:DeviceInfo:1', 'GetSecurityPort', null);
            if (GETPORT == true){
                Fb._sslPort = parseInt(result['NewSecurityPort']);
                gthis.log.debug('sslPort ' + Fb._sslPort);
            }

            //Create global objects
            obj.createGlobalObjects(this, HTML+HTML_END, HTML_GUEST+HTML_END);
            this.log.debug('createGlobalObjects');

            if (!cfg.members) {
                this.log.info('no family members defined -> nothing to do');
                return;
            }else{
                //Create objects for family members
                for (let k = 0; k < cfg.members.length; k++) {
                    const memberRow = cfg.members[k];
                    const member = memberRow.familymember;
                    if (memberRow.enabled == true){
                        obj.createMemberObjects(this, member, HTML_HISTORY + HTML_END);
                        this.log.debug('createMemberObjects ' + member);
                        enableHistory(cfg, member);
                    }
                }
            }           
            // in this template all states changes inside the adapters namespace are subscribed
            this.subscribeStates('*');  

            await checkPresence(gthis, cfg, Fb); // Main function
            this.log.debug('checkPresence first run');
            scheduledJob = setInterval(async function(){
                await checkPresence(gthis, cfg, Fb);
                gthis.log.debug('checkPresence scheduled');
            }, cron);
        } catch (error) {
            gthis.setState('info.connection', { val: false, ack: true });
            showError('onReady: ' + error);
        }
    }//onReady

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            clearInterval(scheduledJob);
            //scheduledJob.cancel();
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
    /*onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
        }
    }*/

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