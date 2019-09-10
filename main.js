'use strict';

/*
 * Created with @iobroker/create-adapter vunknown
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const request = require('request');
const schedule = require('node-schedule');
//const parser = require('cron-parser');
const util = require('util');
const dateFormat = require('dateformat');
//const Soap = require('./lib/fbsoap');

// Global
let gthis; //Global verfügbar machen

const html = '<table class="mdui-table"><thead><tr><th>Name</th><th>Status</th><th>Kommt</th><th>Geht</th></tr></thead><tbody>';
const html_history  = '<table class="mdui-table"><thead><tr><th>Status</th><th>Date</th></tr></thead><tbody>';
const html_end = '</body></table>';

// Debug Infos
/*function showdebug(sText) {
    if (debug == true) gthis.log.info(sText);
}*/

// Create HTML table row
function CreateHTMLRow (sUser, sStatus, sComming, sGoing) {
    let sHTML = '';
    sHTML += '<tr>';
    sHTML += '<td>' + sUser + '</td>';
    sHTML += '<td>' + (sStatus ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>') + '</td>';
    sHTML += '<td>' + sComming + '</td>';
    sHTML += '<td>' + sGoing + '</td>';
    sHTML += '</tr>';

    return sHTML;
}

// Create HTML history table row
function CreateHTMLHistoryRow (sStatus, sDate) {
    let sHTML = '';
    sHTML += '<tr>';
    sHTML += '<td>' + (sStatus ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>') + '</td>';
    sHTML += '<td>' + sDate + '</td>';
    sHTML += '</tr>';   

    return sHTML;
}

// Create JSON table row
function CreateJSONRow(sHeadUser, sUser, sHeadStatus, sStatus, sHeadComming, sComming, sHeadGoing, sGoing) {
    let sJson = '{';
    sJson += '"'  + sHeadUser + '":';
    sJson += '"'  + sUser + '"' + ',';
    sJson += '"'  + sHeadStatus + '":';
    sJson += '"'  + sStatus + '"' + ',';
    sJson += '"'  + sHeadComming + '":';
    sJson += '"'  + sComming + '"' + ',';
    sJson += '"'  + sHeadGoing + '":';
    sJson += '"'  + sGoing + '"' + '}';
    return sJson;
}

// Create JSON history table row
function CreateJSONHistoryRow(sHeadStatus, sStatus, sHeadDate, sDate) {
    let sJson = '{';
    sJson += '"'  + sHeadStatus + '"' + ':';
    sJson += '"'  + sStatus + '"' + ',';
    sJson += '"'  + sHeadDate + '"' + ':';
    sJson += '"'  + sDate + '"' + '}';
    return sJson;
}

// Put zeros in front
function aLZ(n){
    if(n <= 9){
        return '0' + n;
    }
    return n;
}

// Query Fritzbox
function soapAction(sIP, sUri, sService, sAction, sParameter, sVal) {
    const uri = 'http://' + sIP + ':49000';
    const urn = 'urn:dslforum-org:service:';
    //const urn = "urn:schemas-upnp-org:service:";
    let sPar = '';
    if (sParameter != ''){
        sPar = '" >' + '<' + sParameter + '>' + sVal + '</' + sParameter + '>' + '</u:' + sAction + '>';
    }else{
        sPar = '"/>';
    }
    const url = {
        uri: uri + sUri,
        headers: {
            'Content-Type': 'text/xml',
            'charset': 'utf-8',
            'SOAPAction': urn + sService + '#' + sAction
        },
        method: 'POST',
        body: 
            '<?xml version="1.0" encoding="utf-8"?>' +
            '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
                '<s:Body>' +
                    '<u:' + sAction + ' xmlns:u="' + urn + sService + sPar +
                '</s:Body>' +
            '</s:Envelope>' 
    };
    return new Promise((resolve, reject) => {
        request(url, (error, response, body) => {
            if (error) reject(error);
            if (!error && response.statusCode != 200) {
                reject('Invalid status code <' + response.statusCode + '>');
            }
            resolve(body);
        });
    });
}

async function createGlobalObjects(gthis) {
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
            def: html + html_end,
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP('html') == null) gthis.setState('html', html + html_end, true);
    
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
            def: html_history + html_end,
            read: true,
            write: false,
        },
        native: {},
    });
    if (await getStateP(member + '.historyHtml') == null) gthis.setState(member + '.historyHtml', html_history + html_end, true);
    
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
}

async function checkPresence(gthis, ip, selHistory){
    let presence = false;
    const midnight = new Date();
    midnight.setHours(0,0,0);
    const dnow = new Date();
    let firstFalse = midnight;
    let bfirstFalse = false;
    let jsontab = '[';
    let sHTML = html;
    let fbcon = false; // connection to fritzbox

    //Promisify some async functions
    const getStateP = util.promisify(gthis.getState);
    const getObjectP = util.promisify(gthis.getObject);
    //const getHistoryP = util.promisify(gthis.getHistory);
    
    const dateformat = gthis.config.dateformat;

    // functions for family members
    for (let k = 0; k < gthis.config.familymembers.length; k++) {
        const device = gthis.config.familymembers[k]; //Row from family members table
        const member = device.familymember; 
        const mac = device.macaddress;
        const enabled = device.enabled;
        const formatted_date = dnow.getFullYear() + '-' + aLZ(dnow.getMonth() + 1) + '-' + aLZ(dnow.getDate()) + ' ' + aLZ(dnow.getHours()) + ':' + aLZ(dnow.getMinutes()) + ':' + aLZ(dnow.getSeconds());
        const fdate = dateFormat(dnow, dateformat);
        let bMemberActive = false; 
        let sHTMLhistory = html_history;
                
        if (enabled == true){ //Enabled in configuration settings
            try { //get fritzbox data
                const soap = await soapAction(ip, '/upnp/control/hosts', 'Hosts:1', 'GetSpecificHostEntry', 'NewMACAddress', mac);
                //var soap1 = await soapAction(ip, "upnp/control/wlanconfig1", "WLANConfiguration:1", "X_AVM-DE_GetWLANDeviceListPath", "", "");
                //gthis.log.info("soap1: " + soap1);
                
                const n = soap.search('NewActive>1</NewActive');
                if (soap != null){ 
                    fbcon = true; //connection established
                    gthis.setState('info.lastupdate', { val: formatted_date, ack: true });
                }
                
                let sComming = '';
                let sGoing = '';
                let sJSONhistory = '[';
                let curVal = await getStateP(member);
                
                //Calculation of '.since'
                const d1 = new Date(curVal.lc);
                const diff = Math.round((dnow - d1)/1000/60);
                if (curVal.val == true){
                    gthis.setState(member + '.present.since', { val: diff, ack: true });
                    gthis.setState(member + '.absent.since', { val: 0, ack: true });
                }
                if (curVal.val == false){
                    gthis.setState(member + '.absent.since', { val: diff, ack: true });
                    gthis.setState(member + '.present.since', { val: 0, ack: true });
                }

                //get history data
                let present = Math.round((dnow - midnight)/1000/60); //time from midnight to now = max. present time
                let absent = 0;
                //gthis.log.info(member + " present 1: " + present + "  absent: " + absent)

                const end = new Date().getTime();
                const start = midnight.getTime();
                let lastVal = null;
                let lastValCheck = false;
                const dPoint = await getObjectP('fb-checkpresence.0.' + member);
                //gthis.log.info(JSON.stringify(dPoint));

                const memb = member;
                if (selHistory != ''){
                    if (dPoint.common.custom[selHistory].enabled == true){
                        try {
                            gthis.sendTo(selHistory, 'getHistory', {
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
                                    gthis.sendTo(selHistory, 'getHistory', {
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
                                            for (let i = 0; i < result.result.length; i++) {
                                                if (result.result[i].val != null ){
                                                    const hdate = dateFormat(new Date(result.result[i].ts), dateformat);
                                                    sHTMLhistory += CreateHTMLHistoryRow(result.result[i].val, hdate);
                                                    sJSONhistory += CreateJSONHistoryRow('Active', result.result[i].val, 'Date', hdate);
                                                    if (i < result.result.length-1){
                                                        sJSONhistory += ',';
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

                                            sJSONhistory += ']';
                                            sHTMLhistory += html_end;
                                            gthis.setState(memb + '.history', { val: sJSONhistory, ack: true });
                                            gthis.setState(memb + '.historyHtml', { val: sHTMLhistory, ack: true });
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
                //analyse fritzbox response 
                if (n >= 0){ //member = true
                    bMemberActive = true;
                    presence = true;
                    gthis.log.info(member + ' (true): ' + soap);
                    if (curVal.val != null){
                        if (curVal.val == false){ //signal changing to true
                            //gthis.log.info(member + ".comming: " + fdate);
                            gthis.setState(member + '.comming', { val: fdate, ack: true });
                        }
                        gthis.setState(member, { val: true, ack: true });
                    }else{ //null value
                        gthis.log.error('object ' + member + ' is deleted!');
                    }
                }else{ //member = false
                    gthis.log.info(member + ' (false): ' + soap);
                    if (curVal != null){
                        if (curVal.val == true){ //signal changing to false
                            //gthis.log.info(member + ".going: " + fdate);
                            gthis.setState(member + '.going', { val: fdate, ack: true });
                        }
                        gthis.setState(member, { val: false, ack: true });
                    }else{ //null value
                        gthis.log.error('object ' + member + ' is deleted!');                               
                    }
                }
                curVal = await getStateP(member + '.comming');
                sComming = curVal.val;
                curVal = await getStateP(member + '.going');
                sGoing = curVal.val;
                jsontab += CreateJSONRow('Name', member, 'Active', bMemberActive, 'Kommt', sComming, 'Geht', sGoing);
                sHTML += CreateHTMLRow(member, bMemberActive, sComming, sGoing);
                if (k < gthis.config.familymembers.length-1){
                    jsontab += ',';
                }
            } catch (error) {
                gthis.setState('info.connection', { val: false, ack: true });
                gthis.log.error('ERROR:' + error);
            }
        }//enabled in configuration settings
        
    }// for end
    gthis.setState('info.connection', { val: fbcon, ack: true }); //Fritzbox connection established
    jsontab += ']';
    sHTML += html_end;  
    gthis.setState('json', { val: jsontab, ack: true });
    gthis.setState('html', { val: sHTML, ack: true });
    
    //one ore more family members are presence
    if (presence == true){
        gthis.setState('presence', { val: true, ack: true });
    }else{
        gthis.setState('presence', { val: false, ack: true });
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
        const cron = '*/' + this.config.interval + ' * * * *';
        //const interval = parser.parseExpression(cron);
        this.log.info('start fb-checkpresence: ip-address: ' + this.config.ipaddress + ' polling interval: ' + this.config.interval + ' (' + cron + ')');
        
        //Promisify some async functions
        //const getStateP = util.promisify(gthis.getState);
        //const getObjectP = util.promisify(gthis.getObject);
        //const getHistoryP = util.promisify(gthis.getHistory);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        
        const ipFritz = this.config.ipaddress;
        const selHistory = this.config.history;
        
        if (!this.config.familymembers) {
            this.log.info('no family members defined -> nothing to do');
            return;
        }else{
            /*
            For every state in the system there has to be also an object of type state
            Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
            */
            createGlobalObjects(this);
            
            //Create objects for family members
            for (let k = 0; k < this.config.familymembers.length; k++) {
                const device = this.config.familymembers[k];
                const member = device.familymember;
            
                if (device.enabled == true){
                    createMemberObjects(this, member);
                    //Enable history
                    if (selHistory != ''){
                        gthis.sendTo(selHistory, 'enableHistory', {
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
            }
        }           
        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');  

        checkPresence(gthis, ipFritz, selHistory); // Main function
        schedule.scheduleJob(cron, async function(){ // scheduler based on interval
            checkPresence(gthis, ipFritz, selHistory);
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