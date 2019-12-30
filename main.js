'use strict';
/*
 * Created with @iobroker/create-adapter vunknown
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
//const adapter = utils.adapter('fb-checkpresence');

// load your modules here, e.g.:
const schedule = require('node-schedule');
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
const TR064_DEVINFO = '/deviceinfoSCPD.xml';
const TR064_HOSTS = '/hostsSCPD.xml';

let GETENTRIES = false;
let GETPATH = false;
let GETBYMAC = false;
let GETBYIP = false;
let GETPORT = false;

const allDevices = [];
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

// Create JSON table row
function createJSONRow(cfg, sHeadUser, sUser, sHeadStatus, sStatus, sHeadComming, comming, sHeadGoing, going) {
    let json = '{';
    json += '"'  + sHeadUser + '":';
    json += '"'  + sUser + '"' + ',';
    json += '"'  + sHeadStatus + '":';
    json += '"'  + sStatus + '"' + ',';
    json += '"'  + sHeadComming + '":';
    json += '"'  + dateFormat(comming, cfg.dateFormat) + '"' + ',';
    json += '"'  + sHeadGoing + '":';
    json += '"'  + dateFormat(going, cfg.dateFormat) + '"' + '}';

    return json;
}

// Create JSON history table row
function createJSONHistoryRow(cfg, sHeadStatus, sStatus, sHeadDate, sDate) {
    let json = '{';
    json += '"'  + sHeadStatus + '"' + ':';
    json += '"'  + sStatus + '"' + ',';
    json += '"'  + sHeadDate + '"' + ':';
    json += '"'  + dateFormat(sDate, cfg.dateFormat) + '"' + '}';
    return json;
}

// Create JSON history table row
function createJSONGuestRow(hostName, ipAddress, macAddress) {
    let json = '{';
    json += '"'  + 'Hostname' + '":';
    json += '"'  + hostName + '"' + ',';
    json += '"'  + 'IP-Address' + '":';
    json += '"'  + ipAddress + '"' + ',';
    json += '"'  + 'MAC-Address' + '":';
    json += '"'  + macAddress + '"}';
    return json;
}

function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

async function getHostNo(gthis, cfg, Fb, dnow){
    try {
        //get hostNo
        const getHostNo = await Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'GetHostNumberOfEntries', null);
        const hostNo = getHostNo['NewHostNumberOfEntries'];
        gthis.log.debug('getHostNo: ' + hostNo);
        gthis.setState('devices', { val: hostNo, ack: true });
        gthis.setState('info.connection', { val: true, ack: true }); //Fritzbox connection established
        gthis.setState('info.lastUpdate', { val: dnow, ack: true });
        return hostNo;
    }  catch (e) {
        showError('getHostNo: '+e.message);
        //gthis.log.error('getHostNo: '+e.message);
    }    
}

async function getDeviceList(gthis, cfg, Fb){
    try {
        //get device list
        const hostPath = await Fb.soapAction(Fb, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetHostListPath', null);
        const url = 'http://' + Fb.host + ':' + Fb.port + hostPath['NewX_AVM-DE_HostListPath'];
        const deviceList = await Fb.getDeviceList(url);
        gthis.log.debug('getDeviceList: ' + JSON.stringify(deviceList['List']['Item']));
        errorCnt = 0;
        return deviceList['List']['Item'];
    }  catch (e) {
        showError('getDeviceList: '+e.message);
        //gthis.log.error('getDeviceList: '+e.message);
    }   
}

async function getGuests(items, hostNo, cfg){
    try {
        //analyse guests
        let guestCnt = 0;
        let activeCnt = 0;
        let unknownCnt = 0;
        let htmlRow = HTML_GUEST;
        let htmlBlRow = HTML_GUEST;
        let jsonRow = '[';
        let jsonBlRow = '[';
        for (let i = 0; i < hostNo; i++) {
            if (items[i]['Active'] == 1){ // active devices
                activeCnt += 1;
            }
            if (items[i]['X_AVM-DE_Guest'] == 1 && items[i]['Active'] == 1){ //active guests
                htmlRow += createHTMLGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                jsonRow += createJSONGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                gthis.log.debug('getGuests: ' + items[i]['HostName'] + ' ' + items[i]['IPAddress'] + ' ' + items[i]['MACAddress']);
                guestCnt += 1;
            }
            let foundwl = false;
            for(let w = 0; w < cfg.wl.length; w++) {
                if (cfg.wl[w].white_macaddress == items[i]['MACAddress']){
                    foundwl = true;
                    break;
                }
            }
            if (foundwl == false){
                unknownCnt += 1;
                htmlBlRow += createHTMLGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
                jsonBlRow += createJSONGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
            } 
        }
        htmlRow += HTML_END;
        jsonRow += ']';
        htmlBlRow += HTML_END;
        jsonBlRow += ']';
        
        gthis.setState('guest.listHtml', { val: htmlRow, ack: true });
        gthis.setState('guest.listJson', { val: jsonRow, ack: true });
        gthis.setState('guest.count', { val: guestCnt, ack: true });
        gthis.setState('activeDevices', { val: activeCnt, ack: true });
        gthis.setState('blacklist.count', { val: unknownCnt, ack: true });
        gthis.setState('blacklist.listHtml', { val: htmlBlRow, ack: true });
        gthis.setState('blacklist.listJson', { val: jsonBlRow, ack: true });

        if (guestCnt > 0) {
            gthis.setState('guest', { val: true, ack: true });
        }else {
            gthis.setState('guest', { val: false, ack: true });
        }
        gthis.log.debug('getGuests active: '+ activeCnt);
        if (unknownCnt > 0) {
            gthis.setState('blacklist', { val: true, ack: true });
        }else {
            gthis.setState('blacklist', { val: false, ack: true });
        }
        gthis.log.debug('getGuests unknown: '+ unknownCnt);
    }  catch (e) {
        showError('getGuests: '+ e.message);
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
        //gthis.log.info('getActive ' + member + ' ' + JSON.stringify(hostEntry));

        let memberActive = false; 
        let comming = null;
        let going = null;
        const curVal = await getStateP(member); //actual member state
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
                    gthis.setState(member + '.comming', { val: dnow, ack: true });
                    comming = dnow;
                }
                if (curVal.val == null){
                    gthis.log.warn('Member value is null! Value set to true');
                    gthis.setState(member, { val: true, ack: true });
                }
            }else{ //member = false
                presence.all = false;
                if (curVal.val == true){ //signal changing to false
                    gthis.log.debug('newActive ' + member + ' ' + newActive);
                    gthis.setState(member, { val: false, ack: true });
                    gthis.setState(member + '.going', { val: dnow, ack: true });
                    going = dnow;
                }
                if (curVal.val == null){
                    gthis.log.warn('Member value is null! Value set to false');
                    gthis.setState(member, { val: false, ack: true });
                }
            }

        }else{
            showError('getActive: content of object ' + member + ' is wrong!'); 
            //gthis.log.error('getActive: content of object ' + member + ' is wrong!');                               
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
        jsonTab += createJSONRow(cfg, 'Name', member, 'Active', memberActive, 'Kommt', comming, 'Geht', going);
        htmlTab += createHTMLRow(cfg, member, memberActive, comming, going);
        if (index < cfg.members.length-1){
            jsonTab += ',';
        }
        gthis.log.debug('getActive ' + jsonTab);
        return curVal;
    }  catch (e) {
        showError('getActive: '+e.message);
        //gthis.log.error('getActive: '+e.message);
    }    
}

async function checkPresence(gthis, cfg, Fb){
    try {
        const getObjectP = util.promisify(gthis.getObject);

        const midnight = new Date();
        midnight.setHours(0,0,0);
        const dnow = new Date();

        if (GETENTRIES == true && GETPATH == true){
            const hostNo = await getHostNo(gthis, cfg, Fb, dnow);
            const items = await getDeviceList(gthis, cfg, Fb);
            getGuests(items, hostNo, cfg);
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
                        gthis.log.debug('history start');
                        if (dPoint.common.custom[cfg.history].enabled == true){
                            try {
                                gthis.sendTo(cfg.history, 'getHistory', {
                                    id: 'fb-checkpresence.0.' + memb,
                                    options:{
                                        end:        end,
                                        start:      start,
                                        aggregate: 'onchange'
                                    }
                                }, function (result1) {
                                    if (result1 == null) {
                                        gthis.log.info('list history ' + memb + ' ' + result1.error);
                                    }else{
                                        let cnt = result1.result.length;
                                        if (cnt == 0) cnt += 1;
                                        gthis.sendTo(cfg.history, 'getHistory', {
                                            id: 'fb-checkpresence.0.' + memb,
                                            options: {
                                                end:        end,
                                                count:      cnt,
                                                aggregate: 'onchange'
                                            }
                                        }, function (result) {
                                            if (result == null) {
                                                gthis.log.info('list history ' + memb + ' ' + result.error);
                                            }else{
                                                let htmlHistory = HTML_HISTORY;
                                                let jsonHistory = '[';
                                                let bfirstFalse = false;
                                                let firstFalse = midnight;
                                                for (let i = 0; i < result.result.length; i++) {
                                                    if (result.result[i].val != null ){
                                                        const hdate = dateFormat(new Date(result.result[i].ts), cfg.dateformat);
                                                        htmlHistory += createHTMLHistoryRow(cfg, result.result[i].val, hdate);
                                                        jsonHistory += createJSONHistoryRow(cfg, 'Active', result.result[i].val, 'Date', hdate);
                                                        if (i < result.result.length-1){
                                                            jsonHistory += ',';
                                                        }
                                                        const hTime = new Date(result.result[i].ts);
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
                                //gthis.log.error('checkPresence: ' + ex.message);
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
                    //gthis.log.error('checkPresence:' + error);
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
        //gthis.log.error('checkPresence: ' + error);
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
                //gthis.log.error('enable history: ' + '' + result.error);
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
        this.on('objectChange', this.onObjectChange);
        this.on('stateChange', this.onStateChange);
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

            // The adapters config (in the instance object everything under the attribute "native") is accessible via
            // this.config:
            const getForeignObjectP = util.promisify(this.getForeignObject);

            const sysobj =  await getForeignObjectP('system.config');
            //this.config.info('test ' + obj);
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
            
            const cron = '*/' + cfg.iv + ' * * * *';
            this.log.info('start fb-checkpresence: ip-address: ' + cfg.ip + ' polling interval: ' + cfg.iv + ' (' + cron + ')');
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
            GETENTRIES = await Fb.chkService(TR064_HOSTS, 'GetHostNumberOfEntries');
            GETPATH = await Fb.chkService(TR064_HOSTS, 'X_AVM-DE_GetHostListPath');
            GETBYMAC = await Fb.chkService(TR064_HOSTS, 'GetSpecificHostEntry');
            GETBYIP = await Fb.chkService(TR064_HOSTS, 'X_AVM-DE_GetSpecificHostEntryByIP');
            GETPORT = await Fb.chkService(TR064_DEVINFO, 'GetSecurityPort');

            const result = await Fb.soapAction(Fb, '/upnp/control/deviceinfo', 'urn:dslforum-org:service:DeviceInfo:1', 'GetSecurityPort', null);
            Fb._sslPort = parseInt(result['NewSecurityPort']);
            gthis.log.debug('sslPort ' + Fb._sslPort);

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
            scheduledJob = schedule.scheduleJob(cron, async function(){ // scheduler based on interval
                await checkPresence(gthis, cfg, Fb);
                gthis.log.debug('checkPresence scheduled');
            });//schedule end 
        } catch (e) {
            showError('onReady: ' + e.message);
        }
    }//onReady

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            scheduledJob.cancel();
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
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.debug(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
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

                        let hostNo = 0;
                        let items;
                        if (GETENTRIES == true && GETPATH == true){
                            hostNo =  await getHostNo(this, null, Fb, new Date());
                            items =  await getDeviceList(this, null, Fb);
                        }
                        
                        //gthis.log.info('items ' + JSON.stringify(items));
                        for (let i = 0; i < hostNo; i++) {
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
            //gthis.log.error('onMessage: '+e.message);
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