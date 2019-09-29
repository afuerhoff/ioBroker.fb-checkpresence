'use strict';

/*
 * Created with @iobroker/create-adapter vunknown
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// load your modules here, e.g.:
const request = require('request');
const schedule = require('node-schedule');
const util = require('util');
const dateFormat = require('dateformat');
//own libraries
const fb = require('./lib/fb');
const obj = require('./lib/objects');

// Global
let gthis; //Global verfügbar machen

const HTML = '<table class="mdui-table"><thead><tr><th>Name</th><th>Status</th><th>Kommt</th><th>Geht</th></tr></thead><tbody>';
const HTML_HISTORY  = '<table class="mdui-table"><thead><tr><th>Status</th><th>Date</th></tr></thead><tbody>';
const HTML_END = '</body></table>';
const HTML_GUEST  = '<table class="mdui-table"><thead><tr><th>Hostname</th><th>IPAddress</th><th>MACAddress</th></tr></thead><tbody>';

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

async function checkPresence(gthis, cfg){
    const midnight = new Date();
    midnight.setHours(0,0,0);
    const dnow = new Date();
    let firstFalse = midnight;
    let bfirstFalse = false;

    //Promisify some async functions
    const getStateP = util.promisify(gthis.getState);
    const getObjectP = util.promisify(gthis.getObject);

	let devInfo = {
		host: cfg.ip,
		port: '49000',
		sslPort: null,
		uid: cfg.uid,
		pwd: cfg.pwd
	}
	let Fb = new fb.Fb(devInfo, gthis);
	
	const getHostNo = await Fb.soapAction(Fb, '/upnp/control/hosts', 'urn:dslforum-org:service:Hosts:1', 'GetHostNumberOfEntries', null);
	const hostNo = getHostNo['NewHostNumberOfEntries'];
	gthis.log.debug('hostNo: ' + hostNo);
	gthis.setState('devices', { val: hostNo, ack: true });
	gthis.setState('info.connection', { val: true, ack: true }); //Fritzbox connection established
	gthis.setState('info.lastUpdate', { val: dnow, ack: true });

	//get device list
	const hostPath = await Fb.soapAction(Fb, '/upnp/control/hosts', 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_GetHostListPath', null);
	const url = 'http://' + Fb.host + ':' + Fb.port + hostPath['NewX_AVM-DE_HostListPath'];
	gthis.log.debug('url: ' + url);
	let deviceList = await Fb.getDeviceList(url);
	const items = deviceList['List']['Item'];
	
	//analyse guests
	let guestCnt = 0;
	let activeCnt = 0;
	let htmlRow = HTML_GUEST;
	let jsonRow = '[';
	for (let i = 0; i < hostNo; i++) {
		if (items[i]['Active'] == 1){
			activeCnt += 1;
		}
		if (items[i]['X_AVM-DE_Guest'] == 1 && items[i]['Active'] == 1){
			htmlRow += createHTMLGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
			jsonRow += createJSONGuestRow(items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']);
			gthis.log.debug('Item: ' + items[i]['HostName'] + ' ' + items[i]['IPAddress'] + ' ' + items[i]['MACAddress']);
			guestCnt += 1;
		}
	}
	htmlRow += HTML_END;
	jsonRow += ']';
	
	gthis.setState('guest.listHtml', { val: htmlRow, ack: true });
	gthis.setState('guest.listJson', { val: jsonRow, ack: true });
	gthis.setState('guest.count', { val: guestCnt, ack: true });
	gthis.setState('activeDevices', { val: activeCnt, ack: true });
	if (guestCnt > 0) {
		gthis.setState('guest', { val: true, ack: true });
	}else {
		gthis.setState('guest', { val: false, ack: true });
	}

    // functions for family members
    let jsonTab = '[';
    let htmlTab = HTML;
    let presence = false;
    for (let k = 0; k < cfg.members.length; k++) {
        const memberRow = cfg.members[k]; //Row from family members table
        const member = memberRow.familymember; 
                
        if (memberRow.enabled == true){ //member enabled in configuration settings
            try { //get fritzbox data
				const hostEntry = await Fb.soapAction(Fb, '/upnp/control/hosts', 'urn:dslforum-org:service:Hosts:1', 'GetSpecificHostEntry', [[1, "NewMACAddress", memberRow.macaddress]]);
				let newActive = hostEntry['NewActive'];

				let memberActive = false; 
				let comming = null;
				let going = null;
				let curVal = await getStateP(member); //actual member state
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
						presence = true;
						if (curVal.val == false){ //signal changing to true
							gthis.log.debug('newActive ' + member + ' ' + newActive);
							gthis.setState(member, { val: true, ack: true });
							gthis.setState(member + '.comming', { val: dnow, ack: true });
							comming = dnow;
						}
					}else{ //member = false
						if (curVal.val == true){ //signal changing to false
							gthis.log.debug('newActive ' + member + ' ' + newActive);
							gthis.setState(member, { val: false, ack: true });
							gthis.setState(member + '.going', { val: dnow, ack: true });
							going = dnow;
						}
					}

				}else{
					gthis.log.error('error: content of object ' + member + ' is wrong!');                               
				}
				
				if (comming == null) { //if now change was occurs
					if (curVal.val == true){
						comming = new Date(curVal.lc);
						let val = await getStateP(member + '.comming');
						if (new Date(val.val) == 'Invalid Date'){
							gthis.setState(member + '.comming', { val: comming, ack: true });
						}
						
					}
				}
				if (going == null) { //if now change was occurs
					if (curVal.val == false){
						going = new Date(curVal.lc);
						let val = await getStateP(member + '.going');
						if (new Date(val.val) == 'Invalid Date'){
							gthis.setState(member + '.comming', { val: going, ack: true });
						}
					}
				}
                jsonTab += createJSONRow(cfg, 'Name', member, 'Active', memberActive, 'Kommt', comming, 'Geht', going);
                htmlTab += createHTMLRow(cfg, member, memberActive, comming, going);
                if (k < cfg.members.length-1){
                    jsonTab += ',';
                }

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
                                                            gthis.log.warn('lastVal = null');
                                                        }else{
                                                            if (lastVal == false && lastValCheck == true){
                                                                absent = Math.round((hTime - midnight.getTime())/1000/60);
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
                            gthis.log.info('Error: ' + ex.message);
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
                gthis.log.error('ERROR:' + error);
            }
        }//enabled in configuration settings
        
    }// for end
    jsonTab += ']';
    htmlTab += HTML_END;  
    gthis.setState('json', { val: jsonTab, ack: true });
    gthis.setState('html', { val: htmlTab, ack: true });
    
    //one ore more family members are presence
    if (presence == true){
        gthis.setState('presence', { val: true, ack: true });
    }else{
        gthis.setState('presence', { val: false, ack: true });
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
                gthis.log.info('enable history ' + '' + result.error);
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
        // this.on("message", this.onMessage);
        this.on('unload', this.onUnload);
        gthis = this;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        const cfg = {
            ip: this.config.ipaddress,
            port: '49000',
            iv: this.config.interval,
            history: this.config.history,
            dateFormat: this.config.dateformat,
            uid: this.config.username,
            pwd: this.config.password,
            members: this.config.familymembers
        };
		
        const cron = '*/' + cfg.iv + ' * * * *';
        this.log.info('start fb-checkpresence: ip-address: ' + cfg.ip + ' polling interval: ' + cfg.iv + ' (' + cron + ')');
        
        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        
        if (!cfg.members) {
            this.log.info('no family members defined -> nothing to do');
            return;
        }else{
            /*
            For every state in the system there has to be also an object of type state
            Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
            */
            obj.createGlobalObjects(this, HTML+HTML_END, HTML_GUEST+HTML_END);
            
            //Create objects for family members
            for (let k = 0; k < cfg.members.length; k++) {
                const memberRow = cfg.members[k];
                const member = memberRow.familymember;
            
                if (memberRow.enabled == true){
                    obj.createMemberObjects(this, member, HTML_HISTORY + HTML_END);
                    enableHistory(cfg, member);
                }
            }
        }           
        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');  

        await checkPresence(gthis, cfg); // Main function
        schedule.scheduleJob(cron, async function(){ // scheduler based on interval
            await checkPresence(gthis, cfg);
        });//schedule end 
    }//onReady

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
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

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //  if (typeof obj === "object" && obj.message) {
    //      if (obj.command === "send") {
    //          // e.g. send email or pushover or whatever
    //          this.log.info("send command");

    //          // Send response in callback if required
    //          if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    //      }
    //  }
    // }

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