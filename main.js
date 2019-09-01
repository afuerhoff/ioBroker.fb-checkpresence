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
var parser = require('cron-parser');
var util = require('util');

var gthis; //Global verfügbar machen

// HTML Tabelle
function CreateHTMLRow (sUser, sStatus, sComming, sGoing) {
	var sHTML = "";
	sHTML += "<tr>";
	sHTML += "<td>"+sUser+"</td>"
	sHTML += "<td>"+(sStatus ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>')+"</td>"
	sHTML += "<td>"+sComming+"</td>"
	sHTML += "<td>"+sGoing+"</td>"
	sHTML += "</tr>";	

	return sHTML;
}

// JSON Tabelle
function CreateRow(sHeadUser, sUser, sHeadStatus, sStatus, sHeadComming, sComming, sHeadGoing, sGoing) {
	var sJson = "{";
	sJson += '"'  + sHeadUser + '":';
	sJson += '"'  + sUser + '"' + ",";
	sJson += '"'  + sHeadStatus + '"' + ":";
	sJson += '"'  + sStatus + '"' + ",";
	sJson += '"'  + sHeadComming + '"' + ":";
	sJson += '"'  + sComming + '"' + ",";
	sJson += '"'  + sHeadGoing + '"' + ":";
	sJson += '"'  + sGoing + '"' + "}";
	return sJson;
}

// Nullen voranstellen
function aLZ(n){
  if(n <= 9){
    return "0" + n;
  }
  return n
}

// Fritzbox abfragen
function userAction(sIP, sUri, sService, sAction, sParameter, sVal) {
    var uri = "http://" + sIP + ":49000";
    const urn = "urn:dslforum-org:service:";
    var sPar = "";
    if (sParameter != ""){
        sPar = "<" + sParameter + ">" + sVal + "</" + sParameter + ">";
    }
    var url = {
        uri: uri + sUri,
        headers: {
            'Content-Type': 'text/xml',
            'charset': 'utf-8',
            'SOAPAction': urn + sService + '#' + sAction
        },
        method: 'POST',
        body: 
            '<?xml version="1.0" encoding="utf-8"?>' +
            '<s:Envelope s:encodingStyle="http://schemas.xmluser.org/user/encoding/" xmlns:s="http://schemas.xmluser.org/user/envelope/">' +
                '<s:Body>' +
                    '<u:' + sAction + ' xmlns:u="' + urn + sService + '" >' +
                    sPar +
                    '</u:' + sAction + '>' +
                '</s:Body>' +
            '</s:Envelope>' 
    }
	return new Promise((resolve, reject) => {
		request(url, (error, response, body) => {
			if (error) reject(error);
			if (response.statusCode != 200) {
				reject('Invalid status code <' + response.statusCode + '>');
			}
			resolve(body);
		});
	});
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
		gthis=this;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
		let sCron = "*/" + this.config.interval + " * * * *";
		let interval = parser.parseExpression(sCron);

        this.log.info('start fb-checkpresence: ip-address: ' + this.config.ipaddress + ' polling interval: ' + this.config.interval + " (" + sCron + ")");
		const getStateP = util.promisify(gthis.getState);
		const getObjectP = util.promisify(gthis.getObject);
		const getHistoryP = util.promisify(gthis.getHistory);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
		let sIpfritz = this.config.ipaddress;
		if (!this.config.familymembers) {
			this.log.info('no family members defined -> nothing to do');
			return
		}else{
			/*
			For every state in the system there has to be also an object of type state
			Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
			*/
			//Übergeordnete Objekte anlegen
			await this.setObjectNotExists("info.connection", {
				type: "state",
				common: {
					name: "Fritzbox connection stable",
					type: "boolean",
					role: "indicator",
					def: false,
					read: true,
					write: false,
				},
				native: {},
			});
			// Reset connection state at start
			gthis.setState('info.connection', false, true);

			await this.setObjectNotExists("presence", {
				type: "state",
				common: {
					name: "presence",
					type: "boolean",
					role: "indicator",
					def: false,
					read: true,
					write: false,
				},
				native: {},
			});
			if (await getStateP('presence') == null) gthis.setState('presence', false, true);

			await this.setObjectNotExists("json", {
				type: "state",
				common: {
					name: "JSON table",
					type: "string",
					role: "json",
					def: "[]",
					read: true,
					write: false,
				},
				native: {},
			});
			if (await getStateP('json') == null) gthis.setState('json', "[]", true);

			await this.setObjectNotExists("html", {
				type: "state",
				common: {
					name: "HTML table",
					type: "string",
					role: "html",
					def: "<table class='mdui-table' ><thead><tr><th>Name</th><th>Status</th><th>Kommt</th><th>Geht</th></tr></thead><tbody></body></table>" ,
					read: true,
					write: false,
				},
				native: {},
			});
			if (await getStateP('html') == null) gthis.setState('html', "<table class='mdui-table' ><thead><tr><th>Name</th><th>Status</th><th>Kommt</th><th>Geht</th></tr></thead><tbody></body></table>", true);
			
			await this.setObjectNotExists("info.lastupdate", {
				type: "state",
				common: {
					name: "last connection date/time",
					type: "string",
					role: "date",
					def: "never",
					read: true,
					write: false,
				},
				native: {},
			});
			
			//Objekte für Familienmitglieder anlegen
			for (var k = 0; k < this.config.familymembers.length; k++) {
				var device = this.config.familymembers[k];
				var member = device.familymember;
				var mac = device.macaddress;
				var enabled = device.enabled;
				
				if (enabled == true){
					await this.setObjectNotExists(member, {
						type: "state",
						common: {
							name: "used device of family member",
							type: "boolean",
							role: "indicator",
							def: false,
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member) == null) gthis.setState(member, false, true);

					await this.setObjectNotExists(member + ".history", {
						type: "state",
						common: {
							name: "24h history of family member",
							type: "string",
							role: "json",
							def: "[]",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member + ".history") == null) gthis.setState(member + ".history", "[]", true);
					
					await this.setObjectNotExists(member + ".going", {
						type: "state",
						common: {
							name: "leaving home",
							type: "string",
							role: "date",
							unit: "",
							def: "-",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member + ".going") == null) gthis.setState(member + ".going", "-", true);
					
					await this.setObjectNotExists(member + ".comming", {
						type: "state",
						common: {
							name: "arriving at home",
							type: "string",
							role: "date",
							unit: "",
							def: "-",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member + ".comming") == null) gthis.setState(member + ".comming", "-", true);
					
					await this.setObjectNotExists(member + ".absent.since", {
						type: "state",
						common: {
							name: "how long away from home",
							type: "string",
							role: "value",
							unit: "min.",
							def: "-",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member + ".absent.since") == null) gthis.setState(member + ".absent.since", "-", true);

					await this.setObjectNotExists(member + ".present.since", {
						type: "state",
						common: {
							name: "how long at home",
							type: "string",
							role: "value",
							unit: "min.",
							def: "-",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member + ".present.since") == null) gthis.setState(member + ".present.since", "-", true);

					await this.setObjectNotExists(member + ".absent.sum_day", {
						type: "state",
						common: {
							name: "how long absent per day",
							type: "string",
							role: "value",
							unit: "min.",
							def: "-",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member + ".absent.sum_day") == null) gthis.setState(member + ".absent.sum_day", "-", true);
					
					await this.setObjectNotExists(member + ".present.sum_day", {
						type: "state",
						common: {
							name: "how long present per day",
							type: "string",
							role: "value",
							unit: "min.",
							def: "-",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member + ".present.sum_day") == null) gthis.setState(member + ".present.sum_day", "-", true);
					
					//History einschalten
					gthis.sendTo('history.0', 'enableHistory', {
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
							gthis.log.info('enable history ' + member + " " + result.error);
						}
						if (result.success) {
							gthis.log.info('enable history ' + member + " " + result.success);
						}
					});
				}
			}
		}			
		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates("*");	

		var pres = false;
		var j = schedule.scheduleJob(sCron, async function(){
			let midnight = new Date();
			midnight.setHours(0,0,0);
			let dnow = new Date();
			//let present = dnow.getTime() - midnight.getTime();
			let firstFalse = midnight;
			let bfirstFalse = false;
			pres = false;
			let jsontab = "[";
			let sHTML = "<table class='mdui-table' ><thead><tr><th>Name</th><th>Status</th><th>Kommt</th><th>Geht</th></tr></thead><tbody>";
			let fbcon = false; // connection to fritzbox
			for (var k = 0; k < gthis.config.familymembers.length; k++) {
				var device = gthis.config.familymembers[k]; //Zeile aus der Tabelle Familymembers
				var member = device.familymember; 
				var mac = device.macaddress;
				var enabled = device.enabled;
				let current_datetime = new Date();
				let formatted_date = current_datetime.getFullYear() + "-" + aLZ(current_datetime.getMonth() + 1) + "-" + aLZ(current_datetime.getDate()) + " " + aLZ(current_datetime.getHours()) + ":" + aLZ(current_datetime.getMinutes()) + ":" + aLZ(current_datetime.getSeconds());
				var bActive = false; 
				
				if (enabled == true){ //in configuration settings
					try { //get fritzbox data
						var user = await userAction(sIpfritz, "/upnp/control/hosts", "Hosts:1", "GetSpecificHostEntry", "NewMACAddress", mac);
						var n = user.search("NewActive>1</NewActive");
						if (user != null){ 
							fbcon = true; //connection established
							gthis.setState("info.lastupdate", { val: formatted_date, ack: true });
						}
						let sComming = "";
						let sGoing = "";
						let sHistory = "[";
						let curVal = await getStateP(member);

						let d1 = new Date(curVal.lc)
						let diff = Math.round((dnow - d1)/1000/60);
						if (curVal.val == true){
							gthis.setState(member + ".present.since", { val: diff, ack: true });
							gthis.setState(member + ".absent.since", { val: 0, ack: true });
						}
						if (curVal.val == false){
							gthis.setState(member + ".absent.since", { val: diff, ack: true });
							gthis.setState(member + ".present.since", { val: 0, ack: true });
						}

						//get history data
						let present = Math.round((dnow - midnight)/1000/60);
						let absent = 0;
						if (curVal.val == true && curVal.lc < midnight.getTime()){
							absent = 0;
							present = Math.round((dnow - midnight)/1000/60);
						}
						if (curVal.val == false && curVal.lc < midnight.getTime()){
							absent = Math.round((dnow - midnight)/1000/60);
							present = 0;
						}

						var end = new Date().getTime();
						let start = (end-midnight.getTime());
						let lastVal = false;
						let dPoint = await getObjectP('fb-checkpresence.0.' + member);
						//gthis.log.info(JSON.stringify(dPoint));
						if (dPoint.common.custom['history.0'].enabled == true){
							try {
								gthis.sendTo('history.0', 'getHistory', {
									id: 'fb-checkpresence.0.' + member,
									options:{
									end:        end,
									start:      start, //end - 86400000, //1 day
									aggregate: 'onchange'}
								}, function (result) {
									if (result == null) {
										gthis.log.info('list history ' + member + " " + result.error);
									}else{
										gthis.sendTo('history.0', 'getHistory', {
											id: 'fb-checkpresence.0.' + member,
											options: {
												end:        end,
												count:		result.result.length + 1,
												aggregate: 'onchange'
											}
										}, function (result) {
											if (result == null) {
												gthis.log.info('list history ' + member + " " + result.error);
											}else{
												for (var i = 0; i < result.result.length; i++) {
													if (result.result[i].val != null ){
														//Json History aufbauen
														gthis.log.info("History " + member + ": " + result.result[i].val + ' ' + new Date(result.result[i].ts).toString());
														sHistory += '{"'  + "Active" + '"' + ":";
														sHistory += '"'  + result.result[i].val + '"' + ",";
														sHistory += '"'  + "Date" + '"' + ":";
														sHistory += '"'  + new Date(result.result[i].ts).toString() + '"}';
														if (i < result.result.length-1){
															sHistory += ",";
														}
														
														let hTime = new Date(result.result[i].ts);
														if (hTime >= midnight.getTime()){
															if (lastVal == null){
																
															}else{
																if (lastVal == false){
																	absent = Math.round((hTime - midnight.getTime())/1000/60);
																	if (result.result[i].val == false){
																		if (bfirstFalse == false){
																			firstFalse = new Date(result.result[i].ts);
																			bfirstFalse = true;
																		}
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
														}	
													}
												}
												if (bfirstFalse == true){
													absent += Math.round((dnow - firstFalse.getTime())/1000/60);
												}
												present -= absent;

												gthis.setState(member + ".present.sum_day", { val: (present), ack: true });
												gthis.setState(member + ".absent.sum_day", { val: absent, ack: true });

												sHistory += ']';
												gthis.setState(member + ".history", { val: sHistory, ack: true });
											}
										});
									}
								});
							} catch (ex) {
								gthis.log.info("Error: " + ex.message);
							}
						}else{
							gthis.log.info("History not enabled");
						}
						
						//analyse fritzbox response 
						if (n >= 0){ //member = true
							bActive = true;
							pres = true;
							gthis.log.info(member + " (true): " + user);
							if (curVal.val != null){
								if (curVal.val == false){ //signal changing to true
									gthis.log.info(member + ".comming: " + formatted_date);
									gthis.setState(member + ".comming", { val: formatted_date, ack: true });
								}
								gthis.setState(member, { val: true, ack: true });
							}else{ //null value
								gthis.log.error("object " + member + " is deleted!");
							}
						}else{ //member = false
								gthis.log.info(member + " (false): " + user);
								if (curVal != null){
									if (curVal.val == true){ //signal changing to false
										gthis.log.info(member + ".going: " + formatted_date);
										gthis.setState(member + ".going", { val: formatted_date, ack: true });
									}
									gthis.setState(member, { val: false, ack: true });
								}else{ //null value
									gthis.log.error("object " + member + " is deleted!");								
								}
						}
						curVal = await getStateP(member + ".comming");
						sComming = curVal.val;
						curVal = await getStateP(member + ".going");
						sGoing = curVal.val;
						jsontab += CreateRow("Name", member, "Active", bActive, "Kommt", sComming, "Geht", sGoing);
						sHTML += CreateHTMLRow(member, bActive, sComming, sGoing);
						if (k < gthis.config.familymembers.length-1){
							jsontab += ",";
						}
					} catch (error) {
						gthis.setState("info.connection", { val: false, ack: true });
						gthis.log.error('ERROR:' + error);
					}
				}
				
			}
			gthis.setState("info.connection", { val: fbcon, ack: true });
			jsontab += "]";
			sHTML += "</body></table>";  
			gthis.setState("json", { val: jsontab, ack: true });
			gthis.setState("html", { val: sHTML, ack: true });
			if (pres == true){
				gthis.setState("presence", { val: true, ack: true });
			}else{
				gthis.setState("presence", { val: false, ack: true });
			}
		});
    }

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
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
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
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    // 	if (typeof obj === "object" && obj.message) {
    // 		if (obj.command === "send") {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info("send command");

    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    // 		}
    // 	}
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