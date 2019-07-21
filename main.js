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
function CreateRow(sHeadUser, sUser, sHeadStatus, sStatus, sHeadComming,sComming, sHeadGoing,sGoing) {
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
		var sCron = "*/" + this.config.interval + " * * * *";
		var interval = parser.parseExpression(sCron);

        this.log.info('start fb-checkpresence: ip-address: ' + this.config.ipaddress + ' polling interval: ' + this.config.interval + " (" + sCron + ")");
		const getStateP = util.promisify(gthis.getState);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
		var sIpfritz = this.config.ipaddress;
		if (!this.config.familymembers) {
			this.log.info('no family members defined');
			return
		}else{
			/*
			For every state in the system there has to be also an object of type state
			Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
			*/
			await this.setObjectNotExists("info.connection", {
				type: "state",
				common: {
					name: "Fritzbox connection",
					type: "boolean",
					role: "indicator",
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
					role: "indicator",
					read: true,
					write: false,
				},
				native: {},
			});
			if (await getStateP('json') == null) gthis.setState('json', "", true);

			await this.setObjectNotExists("html", {
				type: "state",
				common: {
					name: "HTML table",
					type: "string",
					role: "indicator",
					read: true,
					write: false,
				},
				native: {},
			});
			if (await getStateP('html') == null) gthis.setState('html', "", true);
			
			for (var k = 0; k < this.config.familymembers.length; k++) {
				var device = this.config.familymembers[k];
				var member = device.familymember;
				var mac = device.macaddress;
				var enabled = device.enabled;
				
				if (enabled == true){
					await this.setObjectNotExists(member, {
						type: "state",
						common: {
							name: member,
							type: "boolean",
							role: "indicator",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member) == null) gthis.setState(member, false, true);
					await this.setObjectNotExists(member + ".going", {
						type: "state",
						common: {
							name: member + ".going",
							type: "string",
							role: "indicator",
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
							name: member + ".comming",
							type: "string",
							role: "indicator",
							def: "-",
							read: true,
							write: false,
						},
						native: {},
					});
					if (await getStateP(member + ".comming") == null) gthis.setState(member + ".comming", "-", true);
				}
			}
		}			
		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates("*");	

		var pres = false;
		var j = schedule.scheduleJob(sCron, async function(){
			pres = false;
			let jsontab = "[";
			let sHTML = "<table class='mdui-table' ><thead><tr><th>Name</th><th>Status</th><th>Kommt</th><th>Geht</th></tr></thead><tbody>";
			let fbcon = false; // connection to fritzbox
			for (var k = 0; k < gthis.config.familymembers.length; k++) {
				var device = gthis.config.familymembers[k]; //Zeile aus der Tabelle Familymembers
				var member = device.familymember; 
				var mac = device.macaddress;
				var enabled = device.enabled;
				let current_datetime = new Date()
				let formatted_date = current_datetime.getFullYear() + "-" + aLZ(current_datetime.getMonth() + 1) + "-" + aLZ(current_datetime.getDate()) + " " + aLZ(current_datetime.getHours()) + ":" + aLZ(current_datetime.getMinutes()) + ":" + aLZ(current_datetime.getSeconds())
				var bActive = false; 
				
				if (enabled == true){
					try {
						var user = await userAction(sIpfritz, "/upnp/control/hosts", "Hosts:1", "GetSpecificHostEntry", "NewMACAddress", mac);
						var n = user.search("NewActive>1</NewActive");
						if (user != null) fbcon = true;
						let sComming = "";
						let sGoing = "";
						let curVal = await getStateP(member);
						if (n >= 0){
							bActive = true;
							pres = true;
							gthis.log.info(member + " (true): " + user);
							if (curVal.val != null){
								if (curVal.val == false){
									gthis.log.info(member + ".comming: " + formatted_date);
									gthis.setState(member + ".comming", { val: formatted_date, ack: true });
								}
								gthis.setState(member, { val: true, ack: true });
							}else{
								gthis.log.error("object " + member + " is deleted!")
							}
						}else{
								gthis.log.info(member + " (false): " + user);
								if (curVal != null){
									if (curVal.val == true){
										gthis.log.info(member + ".going: " + formatted_date);
										gthis.setState(member + ".going", { val: formatted_date, ack: true });
									}
									gthis.setState(member, { val: false, ack: true });
								}else{
									gthis.log.error("object " + member + " is deleted!")									
								}
						}
						/*if (!await getStateP(member + ".comming")){
							curVal = await getStateP(member + ".comming");
							gthis.log.info("val: " + curVal.val);
							sComming = curVal.val;
						}*/
						curVal = await getStateP(member + ".comming");
						gthis.log.info("val: " + curVal.val);
						sComming = curVal.val;
						/*if (!await getStateP(member + ".going")){
							curVal = await getStateP(member + ".going");
							gthis.log.info("val: " + curVal.val);
							sGoing = curVal.val;
						}*/
						curVal = await getStateP(member + ".going");
						gthis.log.info("val: " + curVal.val);
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