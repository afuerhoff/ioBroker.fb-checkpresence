'use strict';
/*
 * Created with @iobroker/create-adapter vunknown
 */

// The adapter-core module gives you access to the core ioBroker functions
const utils = require('@iobroker/adapter-core');

// load your modules here, e.g.:
const dateFormat = require('dateformat');

// own libraries
const fb = require('./lib/fb');
const obj = require('./lib/objects');

/*Array.prototype.indexOfObject = function (property, value, ind=-1) {
    for (let i = 0, len = this.length; i < len; i++) {
        if (i != ind && this[i][property] === value) return i;
    }
    return -1;
};*/

class FbCheckpresence extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'fb-checkpresence',
        });
        //events
        this.on('ready', this.onReady.bind(this));
        //this.on('objectChange', this.onObjectChange);
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        //constants
        this.urn = 'urn:dslforum-org:service:';
        this.HTML = '<table class="mdui-table"><thead><tr><th>Name</th><th>Status</th><th>Kommt</th><th>Geht</th></tr></thead><tbody>';
        this.HTML_HISTORY  = '<table class="mdui-table"><thead><tr><th>Status</th><th>Date</th></tr></thead><tbody>';
        this.HTML_END = '</body></table>';
        this.HTML_GUEST  = '<table class="mdui-table"><thead><tr><th>Hostname</th><th>IPAddress</th><th>MACAddress</th></tr></thead><tbody>';
        this.HTML_FB  = '<table class="mdui-table"><thead><tr><th>Hostname</th><th>IPAddress</th><th>MACAddress</th><th>Active</th><th>Type</th></tr></thead><tbody>';
        //this.FORBIDDEN_CHARS = /[\]\[*,;'"`<>\\?]/g;
        this.errorCntMax = 10;

        this.allDevices = [];
        this.jsonTab;
        this.htmlTab;
        this.enabled = true;
        this.errorCnt = 0;
        this.Fb = null;
        this.timeout = null;

        //http://fritz.box:49000/tr64desc.xml
        //used actions
        this.GETPATH = false;
        this.GETMESHPATH = false;
        this.GETBYMAC = false;
        this.GETBYIP = false;
        this.GETPORT = false;
        this.GETEXTIP = false;
        this.SETENABLE = false;
        this.WLAN3INFO = false;
        this.DEVINFO = false;
        this.GETWANACCESSBYIP = false;
        this.DISALLOWWANACCESSBYIP = false;
        this.REBOOT = false;
    }

    decrypt(key, value) {
        let result = '';
        for (let i = 0; i < value.length; ++i) {
            result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
        }
        return result;
    }

    showError(errorMsg) {
        if (this.errorCnt < this.errorCntMax) {
            this.errorCnt+=1;
            this.log.error(errorMsg);
        } else {
            this.log.debug('maximum error count reached! Error messages are suppressed');
        }
    }

    createHTMLTableRow (dataArray) {
        let html = '';
        html += '<tr>'; //new row
        for(let c=0; c < dataArray.length; c++){
            html += '<td>' + dataArray[c] + '</td>'; //columns
        }
        html += '</tr>'; //row end
        return html;
    }

    createJSONTableRow(cnt, dataArray) {
        let json = '{';
        if (cnt != 0){
            json = ',{';
        }
        for(let c=0; c < dataArray.length; c=c+2){
            json += '"'  + dataArray[c] + '":';
            if (c == dataArray.length-2){
                json += '"'  + dataArray[c+1] + '"}';
            }else{
                json += '"'  + dataArray[c+1] + '",';
            }
        }
        return json;
    }

    async resyncFbObjects(items){
        try {
            // Get all fb-device objects of this adapter
            if (items && this.config.syncfbdevices == true){
                const devices = await this.getDevicesAsync();
                for (const id in devices) {
                    if (devices[id] != undefined && devices[id].common != undefined){
                        const dName = devices[id].common.name;
                        const shortName = dName.replace('fb-devices.', '');
                        let found = false;
                        if (dName.includes('fb-devices.')){
                            for(let i=0;i<items.length;i++){
                                let hostName = items[i]['HostName'];
                                if (hostName.includes('.')){
                                    hostName = hostName.replace('.', '-');
                                }
                                if (shortName == hostName) {
                                    found = true;
                                    break;
                                }
                            }
                            if (found == false && !dName.includes('whitelist')){
                                const states = await this.getStatesAsync(dName + '.*');
                                for (const idS in states) {
                                    await this.delObjectAsync(idS);
                                    await this.delStateAsync(idS);
                                }
                                const ch = await this.getChannelsOfAsync();
                                for (const c in ch) {
                                    if (ch[c]._id.includes(dName + '.')){
                                        await this.delObjectAsync(ch[c]._id);
                                    }
                                }
                                await this.delObjectAsync(devices[id]._id);
                                this.log.info('device <' + devices[id]._id + '> successfully deleted');
                            }
                        }
                    }
                }
                this.log.info('fb-devices synchronized successfully');
                const adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                adapterObj.native.syncfbdevices = false;
                this.config.syncfbdevices = false;
                await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);

            }
        } catch (error) {
            this.log.error('resyncFbObjects ' + JSON.stringify(error));
        }
    }

    loop(cnt1, cnt2, int1, int2, cfg) {
        try {
            const gthis = this;
            this.timeout = setTimeout(async function() {
                try {
                    cnt1++;
                    cnt2++;
                    const work = process.hrtime();
                    let time = null;
                    if (cnt1 == int1){
                        //gthis.log.info('loopFamily starts');
                        if (gthis.DEVINFO == true) {
                            await gthis.Fb.connectionCheck(); //Sets the connection led
                        }
                        cnt1 = 0;
                        //const itemlist = await Fb.getDeviceList();
                        await gthis.checkPresence(cfg);
                        time = process.hrtime(work);
                        gthis.log.debug('loopFamily ends after ' + time + ' s');
                    }
                    if (cnt2 == int2){
                        //gthis.log.debug('loopDevices starts');
                        if (gthis.DEVINFO == true) {
                            await gthis.Fb.connectionCheck(); //Sets the connection led
                        }
                        cnt2 = 0;
                        if (gthis.GETPATH != null && gthis.GETPATH == true && gthis.config.fbdevices == true){
                            let meshlist = null;
                            const itemlist = await gthis.Fb.getDeviceList();
                            if (gthis.GETEXTIP != null && gthis.GETEXTIP == true) await gthis.Fb.getExtIp();
                            if (gthis.WLAN3INFO != null && gthis.WLAN3INFO == true) await gthis.Fb.getGuestWlan('guest.wlan');
                            if (gthis.GETMESHPATH != null && gthis.GETMESHPATH == true && gthis.config.meshinfo == true) meshlist = await gthis.Fb.getMeshList();
                            await gthis.getDeviceInfo(itemlist, meshlist, cfg);
                        }
                        time = process.hrtime(work);
                        gthis.log.debug('loopDevices ends after ' + time + ' s');
                    }
                    gthis.loop(cnt1, cnt2, int1, int2, cfg);
                } catch (error) {
                    gthis.log.error('loop: ' + JSON.stringify(error));
                }
            }, 1000);
        } catch (error) {
            this.log.error('loop: ' + JSON.stringify(error));
        }                
    }

    async stopAdapter(){
        try {
            //this.log.warn('Adapter stops');
            const adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            adapterObj.common.enabled = false;  // Adapter ausschalten
            await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
        } catch (error) {
            this.log.error('stopAdper: ' + JSON.stringify(error));            
        }
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

            //if interval <= 0 than set to 1
            if (this.config.intervalFamily <= 9) {
                adapterObj.native.intervalFamily = 10;
                adapterObjChanged = true;
                this.config.intervalFamily = 10;
                this.log.warn('interval is less than 10. Set to 10s.');
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
            
            const cron = cfg.iv * 60;
            const cronFamily = this.config.intervalFamily;
            
            const devInfo = {
                host: this.config.ipaddress,
                port: '49000',
                sslPort: null,
                uid: this.config.username,
                pwd: this.config.password
            };

            this.Fb = await fb.Fb.init(devInfo, this);
            if(this.Fb.services === null) {
                this.log.error('Can not get services! Adapter stops');
                this.stopAdapter();
            }

            //Check if services/actions are supported
            this.GETPATH = await this.Fb.chkService('X_AVM-DE_GetHostListPath', 'Hosts1', 'X_AVM-DE_GetHostListPath');
            this.GETMESHPATH = await this.Fb.chkService('X_AVM-DE_GetMeshListPath', 'Hosts1', 'X_AVM-DE_GetMeshListPath');
            this.GETBYMAC = await this.Fb.chkService('GetSpecificHostEntry', 'Hosts1', 'GetSpecificHostEntry');
            this.GETBYIP = await this.Fb.chkService('X_AVM-DE_GetSpecificHostEntryByIP', 'Hosts1', 'X_AVM-DE_GetSpecificHostEntryByIP');
            this.GETPORT = await this.Fb.chkService('GetSecurityPort', 'DeviceInfo1', 'GetSecurityPort');
            this.GETEXTIP = await this.Fb.chkService('GetInfo', 'WANPPPConnection1', 'GetInfo');
            if ( this.GETEXTIP == false) this.GETEXTIP = await this.Fb.chkService('GetInfo', 'WANIPConnection1', 'GetInfo');
            this.SETENABLE = await this.Fb.chkService('SetEnable', 'WLANConfiguration3', 'SetEnable');
            this.WLAN3INFO = await this.Fb.chkService('GetInfo', 'WLANConfiguration3', 'WLANConfiguration3-GetInfo');
            this.DEVINFO = await this.Fb.chkService('GetInfo', 'DeviceInfo1', 'DeviceInfo1-GetInfo');
            this.DISALLOWWANACCESSBYIP = await this.Fb.chkService('DisallowWANAccessByIP', 'X_AVM-DE_HostFilter', 'DisallowWANAccessByIP');
            this.GETWANACCESSBYIP = await this.Fb.chkService('GetWANAccessByIP', 'X_AVM-DE_HostFilter', 'GetWANAccessByIP');
            this.REBOOT = await this.Fb.chkService('Reboot', 'DeviceConfig1', 'Reboot');
            
            //const test = await Fb.soapAction(Fb, '/upnp/control/deviceconfig', 'urn:dslforum-org:service:DeviceConfig:1', 'X_AVM-DE_CreateUrlSID', null);

            //Create global objects
            await obj.createGlobalObjects(this, this.HTML+this.HTML_END, this.HTML_GUEST+this.HTML_END, this.enabled);
            await obj.createMemberObjects(this, cfg, this.HTML_HISTORY + this.HTML_END, this.enabled);

            //create Fb devices
            if (this.GETPATH != null && this.GETPATH == true && this.config.fbdevices == true){
                const items = await this.Fb.getDeviceList(this, cfg, this.Fb);
                if (items != null){
                    let res = await obj.createFbDeviceObjects(this, items, this.enabled);
                    if (res === true) this.log.info('createFbDeviceObjects finished successfully');
                    res = await obj.createMeshObjects(this, items, 0, this.enabled); //create channel 0 as default interface
                    if (res === true) this.log.info('createMeshObjects finished successfully');
                }else{
                    this.log.error('createFbDeviceObjects -> ' + "can't read devices from fritzbox! Adapter stops");
                    adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                    adapterObj.common.enabled = false;  // Adapter ausschalten
                    await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
                }
                await this.resyncFbObjects(items);
            }

            // states changes inside the adapters namespace are subscribed
            if (this.SETENABLE === true && this.WLAN3INFO === true) this.subscribeStates(`${this.namespace}` + '.guest.wlan');
            if (this.DISALLOWWANACCESSBYIP === true && this.GETWANACCESSBYIP === true) this.subscribeStates(`${this.namespace}` + '.fb-devices.*.disabled');  
            if (this.REBOOT === true) this.subscribeStates(`${this.namespace}` + '.reboot');  

            //get uuid for transaction
            //const sSid = await Fb.soapAction(Fb, '/upnp/control/deviceconfig', urn + 'DeviceConfig:1', 'X_GenerateUUID', null);
            //const uuid = sSid['NewUUID'].replace('uuid:', '');
            this.loop(10, 55, cronFamily, cron, cfg);
        } catch (error) {
            this.showError('onReady: ' + error);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            this.enabled = false;
            this.timeout && clearTimeout(this.timeout);
            this.timeout = null;
            this.Fb.exitRequest;
            this.log.info('cleaned everything up ...');
            callback && callback();
        } catch (e) {
            this.log.error('onUnload: ' + e);
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
                if (id == `${this.namespace}` + '.guest.wlan' && this.SETENABLE == true && state.ack === false && this.WLAN3INFO ===true){
                    this.log.info(`${id} changed: ${state.val} (ack = ${state.ack})`);
                    const val = state.val ? '1' : '0';
                    const guestwlan = await this.Fb.soapAction(this.Fb, '/upnp/control/wlanconfig3', this.urn + 'WLANConfiguration:3', 'SetEnable', [[1, 'NewEnable', val]]);
                    if (guestwlan['status'] == 200 || guestwlan['result'] == true) {
                        await this.Fb.getGuestWlan(id);
                        //if(state.val == wlanStatus) this.setState('guest.wlan', { val: wlanStatus, ack: true });
                    }else{
                        throw {name: `onStateChange ${id}`, message: 'Can not change state' + JSON.stringify(guestwlan)};
                    }
                }

                if (id.includes('disabled') && state.ack === false && this.DISALLOWWANACCESSBYIP === true && this.GETWANACCESSBYIP === true){
                    this.log.info(`${id} changed: ${state.val} (ack = ${state.ack})`);
                    const ipId = id.replace('.disabled', '') + '.ipaddress';
                    const ipaddress = await this.getStateAsync(ipId);
                    const val = state.val ? '1' : '0';
                    this.log.info('ip ' + JSON.stringify(ipaddress.val) + ' ' + val);
                    const DisallowWANAccess = await this.Fb.soapAction(this.Fb, '/upnp/control/x_hostfilter', this.urn + 'X_AVM-DE_HostFilter:1', 'DisallowWANAccessByIP', [[1, 'NewIPv4Address', ipaddress.val],[2, 'NewDisallow', val]]);
                    if (DisallowWANAccess['status'] == 200 || DisallowWANAccess['result'] == true) {
                        await this.Fb.getWanAccess(ipaddress, id);
                        //this.setState(id, { val: state.val, ack: true });
                    }else{
                        throw {name: `onStateChange ${id}`, message: 'Can not change state' + JSON.stringify(DisallowWANAccess)};
                    }
                }

                if (id == `${this.namespace}` + '.reboot' && this.REBOOT === true){
                    this.log.info(`${id} changed: ${state.val} (ack = ${state.ack})`);
                    if (state.val === true){
                        const reboot = await this.Fb.soapAction(this.Fb, '/upnp/control/deviceconfig', this.urn + 'DeviceConfig:1', 'Reboot', null);
                        if (reboot['status'] == 200 || reboot['result'] == true) {
                            this.setState(`${this.namespace}` + '.reboot', { val: false, ack: true });
                        }else{
                            this.setState(`${this.namespace}` + '.reboot', { val: false, ack: true });
                            throw('reboot failure! ' + JSON.stringify(reboot));
                        }
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
            this.log.error('onStateChange: ' + JSON.stringify(error));            
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
                const gthis = this;
                // eslint-disable-next-line no-inner-declarations
                function reply(result) {
                    gthis.sendTo (obj.from, obj.command, JSON.stringify(result), obj.callback);
                }

                switch (obj.command) {
                    case 'discovery':{
                        this.allDevices = [];
                        let onlyActive, reread;
                        if (typeof obj.message === 'object') {
                            onlyActive = obj.message.onlyActive;
                            reread = obj.message.reread;
                        }
                        if (!obj.callback) return false;
                        if (!reread && this.allDevices.length > 0 && this.allDevices.onlyActive === onlyActive) {
                            reply(this.allDevices);
                            return true;
                        }
                        this.allDevices.onlyActive = onlyActive;

                        const devInfo = {
                            host: this.config.ipaddress,
                            port: '49000',
                            sslPort: null,
                            uid: this.config.username,
                            pwd: this.config.password
                        };
                        const Fb = new fb.Fb(devInfo, this);

                        let items;
                        if (this.GETPATH == true){
                            items =  await Fb.getDeviceList(this, null, Fb);
                            if (items == null){
                                return;
                            }
                            for (let i = 0; i < items.length; i++) {
                                const active = items[i]['Active'];
                                if (!onlyActive || active) {
                                    this.allDevices.push ({
                                        name: items[i]['HostName'],
                                        ip: items[i]['IPAddress'],
                                        mac: items[i]['MACAddress'],
                                        active: active
                                    });
                                }
                            }
                        }
                        reply(this.allDevices);
                        return true;}
                    default:
                        this.log.warn('Unknown command: ' + obj.command);
                        break;
                }
                if (obj.callback) this.sendTo(obj.from, obj.command, obj.message, obj.callback);
                return true;    
            }
        } catch (e) {
            this.showError('onMessage: '+e.message);
        }
    }

    async getDeviceInfo(items, mesh, cfg){
        try {
            //analyse guests
            let guestCnt = 0;
            let activeCnt = 0;
            let inactiveCnt = 0;
            let blCnt = 0;
            let wlCnt = 0;
            let htmlRow = this.HTML_GUEST;
            let htmlBlRow = this.HTML_GUEST;
            let htmlFbDevices = this.HTML_FB;
            let jsonRow = '[';
            let jsonBlRow = '[';
            let jsonWlRow = '[';
            let jsonFbDevices = '[';
            let jsonFbDevActive = '[';
            let jsonFbDevInactive = '[';
            const enabledMeshInfo = this.config.meshinfo;

            if (!items) return false;
            await obj.createFbDeviceObjects(this, items, this.enabled);
            if (mesh) this.setState('fb-devices.mesh', { val: JSON.stringify(mesh), ack: true });

            for (let i = 0; i < items.length; i++) {
                if (this.enabled == false) break;
                let deviceType = '-';
                if (items[i]['X_AVM-DE_Guest'] == 1){
                    deviceType = 'guest';
                }
                if (items[i]['Active'] == 1){ // active devices
                    jsonFbDevActive += this.createJSONTableRow(activeCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress'], 'Active', items[i]['Active'], 'Type', deviceType]);
                    activeCnt += 1;
                }else{
                    jsonFbDevInactive += this.createJSONTableRow(inactiveCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress'], 'Active', items[i]['Active'], 'Type', deviceType]);
                    inactiveCnt += 1;
                }
                if (items[i]['X_AVM-DE_Guest'] == 1 && items[i]['Active'] == 1){ //active guests
                    htmlRow += this.createHTMLTableRow([items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']]); //guests table
                    jsonRow += this.createJSONTableRow(guestCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress']]);
                    this.log.debug('getDeviceInfo active guest: ' + items[i]['HostName'] + ' ' + items[i]['IPAddress'] + ' ' + items[i]['MACAddress']);
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
                    htmlBlRow += this.createHTMLTableRow([items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']]);
                    jsonBlRow += this.createJSONTableRow(blCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress']]);
                    blCnt += 1;
                } 
                if (foundwl == true ){
                    deviceType = 'whitelist';
                    jsonWlRow += this.createJSONTableRow(wlCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress']]);
                    wlCnt += 1;
                }
                htmlFbDevices += this.createHTMLTableRow([items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress'], items[i]['Active'], deviceType]);
                jsonFbDevices += this.createJSONTableRow(i, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress'], 'Active', items[i]['Active'], 'Type', deviceType]);
                
                let hostName = items[i]['HostName'];
                if (hostName.includes('.')){
                    hostName = hostName.replace('.', '-');
                }
                this.setState('fb-devices.' + hostName + '.macaddress', { val: items[i]['MACAddress'], ack: true });
                this.setState('fb-devices.' + hostName + '.ipaddress', { val: items[i]['IPAddress'], ack: true });
                this.setState('fb-devices.' + hostName + '.active', { val: items[i]['Active'], ack: true });
                this.setState('fb-devices.' + hostName + '.interfacetype', { val: items[i]['InterfaceType'], ack: true });
                this.setState('fb-devices.' + hostName + '.speed', { val: items[i]['X_AVM-DE_Speed'], ack: true });
                this.setState('fb-devices.' + hostName + '.guest', { val: items[i]['X_AVM-DE_Guest'], ack: true });
                this.setState('fb-devices.' + hostName + '.whitelist', { val: foundwl, ack: true });
                this.setState('fb-devices.' + hostName + '.blacklist', { val: ! (foundwl && items[i]['X_AVM-DE_Guest']), ack: true });
                for (let k=0; k<cfg.members.length; k++){
                    if (cfg.members[k].macaddress == items[i]['MACAddress']){
                        this.setState(cfg.members[k].familymember + '.speed', { val: items[i]['X_AVM-DE_Speed'], ack: true });
                        break;
                    }
                }

                //Get mesh info for device
                if (this.GETMESHPATH != null && this.GETMESHPATH == true && enabledMeshInfo == true){
                    if (mesh != null){
                        let meshdevice = mesh.find(el => el.device_mac_address === items[i]['MACAddress']);
                        if (meshdevice == null) {
                            meshdevice = mesh.find(el => el.device_name === items[i]['HostName']);
                        }
                        if (meshdevice != null) {
                            this.setState('fb-devices.' + hostName + '.meshstate', { val: true, ack: true });
                            for (let ni = 0; ni < meshdevice['node_interfaces'].length; ni++) {
                                const nInterface = meshdevice['node_interfaces'][ni];
                                let interfaceName = nInterface['name'];
                                if (interfaceName == '') interfaceName = nInterface['type'];
                                //this.log.info('createMeshObjects2 ' + JSON.stringify(items[i]));
                                obj.createMeshObjects(this, [items[i]], ni, this.enabled);
                                /*const hostname = items[i]['HostName'];
                                if (hostname.includes('.')){
                                    hostName = hostname.replace('.', '-');
                                }*/

                                this.setState('fb-devices.' + hostName + '.' + ni + '.name', { val: nInterface['name'], ack: true });
                                this.setState('fb-devices.' + hostName + '.' + ni + '.type', { val: nInterface['type'], ack: true });
                                //this.setState('fb-devices.' + hostName + '.' + ni + '.security', { val: nInterface['security'], ack: true });
                                
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
                                        this.setState('fb-devices.' + hostName + '.' + ni + '.link', { val: link, ack: true });
                                        this.setState('fb-devices.' + hostName + '.' + ni + '.rx_rcpi', { val: nodelinks['rx_rcpi'], ack: true });
                                        this.setState('fb-devices.' + hostName + '.' + ni + '.cur_data_rate_rx', { val: data_rate_rx, ack: true });
                                        this.setState('fb-devices.' + hostName + '.' + ni + '.cur_data_rate_tx', { val: data_rate_tx, ack: true });
                                    }
                                }
                            }
                        }else{
                            this.setState('fb-devices.' + hostName + '.meshstate', { val: false, ack: true });
                            this.setState('fb-devices.' + hostName + '.' + '0' + '.cur_data_rate_rx', { val: 0, ack: true });
                            this.setState('fb-devices.' + hostName + '.' + '0' + '.cur_data_rate_tx', { val: 0, ack: true });
                            this.setState('fb-devices.' + hostName + '.' + '0' + '.rx_rcpi', { val: 0, ack: true });
                        }
                    }
                }


            }
            jsonRow += ']';
            jsonBlRow += ']';
            jsonWlRow += ']';
            htmlRow += this.HTML_END;
            htmlBlRow += this.HTML_END;
            htmlFbDevices += this.HTML_END;
            jsonFbDevices += ']';
            jsonFbDevActive += ']';
            jsonFbDevInactive += ']';
            
            this.setState('fb-devices.count', { val: items.length, ack: true });
            this.setState('fb-devices.json', { val: jsonFbDevices, ack: true });
            this.setState('fb-devices.jsonActive', { val: jsonFbDevActive, ack: true });
            this.setState('fb-devices.jsonInactive', { val: jsonFbDevInactive, ack: true });
            this.setState('fb-devices.html', { val: htmlFbDevices, ack: true });
            this.setState('fb-devices.active', { val: activeCnt, ack: true });
            this.setState('fb-devices.inactive', { val: inactiveCnt, ack: true });

            this.setState('guest.listHtml', { val: htmlRow, ack: true });
            this.setState('guest.listJson', { val: jsonRow, ack: true });
            this.setState('guest.count', { val: guestCnt, ack: true });
            this.setState('guest.presence', { val: guestCnt == 0 ? false : true, ack: true });

            this.setState('activeDevices', { val: activeCnt, ack: true });

            this.setState('blacklist.count', { val: blCnt, ack: true });
            this.setState('blacklist.listHtml', { val: htmlBlRow, ack: true });
            this.setState('blacklist.listJson', { val: jsonBlRow, ack: true });
            
            this.setState('whitelist.json', { val: jsonWlRow, ack: true });
            this.setState('whitelist.count', { val: cfg.wl.length, ack: true });

            if (guestCnt > 0) {
                this.setState('guest', { val: true, ack: true });
            }else {
                this.setState('guest', { val: false, ack: true });
            }
            this.log.debug('getDeviceInfo activeCnt: '+ activeCnt);
            if (blCnt > 0) {
                this.setState('blacklist', { val: true, ack: true });
            }else {
                this.setState('blacklist', { val: false, ack: true });
            }
            this.log.debug('getDeviceInfo blCnt: '+ blCnt);
            return true;
        } catch (error) {
            this.log.error('getDeviceInfo: ' + error);
            return false;
        }
    }

    async getActive(index, cfg, memberRow, dnow, presence){
        try {
            //if (enabled === false) return null;
            const member = memberRow.familymember; 
            const mac = memberRow.macaddress; 
            const ip = memberRow.ipaddress; 
            if (memberRow.useip == undefined || ip == undefined){
                throw('Please edit configuration in admin view and save it! Some items (use ip, ip-address) are missing'); 
            }else{
                let hostEntry = null;
                if (memberRow.useip == false){
                    if (mac != ''){
                        hostEntry = await this.Fb.soapAction(this.Fb, '/upnp/control/hosts', this.urn + 'Hosts:1', 'GetSpecificHostEntry', [[1, 'NewMACAddress', memberRow.macaddress]], true);
                    }else{
                        throw('The configured mac-address for member ' + member + ' is empty. Please insert a valid mac-address!');
                    }
                }else{
                    if (this.GETBYIP == true && ip != ''){
                        hostEntry = await this.Fb.soapAction(this.Fb, '/upnp/control/hosts', this.urn + 'Hosts:1', 'X_AVM-DE_GetSpecificHostEntryByIP', [[1, 'NewIPAddress', memberRow.ipaddress]], true);
                    }else{
                        if (memberRow.ipaddress == '') {
                            throw('The configured ip-address for ' + member + ' is empty. Please insert a valid ip-address!');
                        }
                    }
                }
                if(this.enabled == false) {
                    return presence;
                } 
                if(hostEntry && hostEntry.result === false){
                    if (hostEntry[0].errorMsg.errorDescription == 'NoSuchEntryInArray'){
                        throw('mac or ipaddress from member ' + member + ' not found in fritzbox device list');
                    } else if (hostEntry[0].errorMsg.errorDescription == 'Invalid Args'){
                        throw('invalid arguments for member ' + member);
                    } else {
                        throw('member ' + member + ': ' + hostEntry.errorMsg.errorDescription);
                    }
                }
                if (hostEntry && hostEntry.result == true && hostEntry.resultData){
                    const newActive = hostEntry.resultData['NewActive'] == 1 ? true : false;
                    //let memberActive = false; 
                    let comming = null;
                    let going = null;
                    const curVal = await this.getStateAsync(member + '.presence'); //.then(function(curVal){ //actual member state
                    if (curVal && curVal.val != null){
                        //calculation of '.since'
                        const diff = Math.round((dnow - new Date(curVal.lc))/1000/60);
                        if (curVal.val == true){
                            this.setState(member + '.present.since', { val: diff, ack: true });
                            this.setState(member + '.absent.since', { val: 0, ack: true });
                        }
                        if (curVal.val == false){
                            this.setState(member + '.absent.since', { val: diff, ack: true });
                            this.setState(member + '.present.since', { val: 0, ack: true });
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
                            if (curVal.val == false){ //signal changing to true
                                this.log.info('newActive ' + member + ' ' + newActive);
                                this.setState(member, { val: true, ack: true });
                                this.setState(member + '.presence', { val: true, ack: true });
                                this.setState(member + '.comming', { val: dnow, ack: true });
                                comming = dnow;
                            }
                            if (curVal.val == null){
                                this.log.warn('Member value is null! Value set to true');
                                this.setState(member, { val: true, ack: true });
                                this.setState(member + '.presence', { val: true, ack: true });
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
                                this.log.info('newActive ' + member + ' ' + newActive);
                                this.setState(member, { val: false, ack: true });
                                this.setState(member + '.presence', { val: false, ack: true });
                                this.setState(member + '.going', { val: dnow, ack: true });
                                going = dnow;
                            }
                            if (curVal.val == null){
                                this.log.warn('Member value is null! Value set to false');
                                this.setState(member, { val: false, ack: true });
                                this.setState(member + '.presence', { val: false, ack: true });
                            }
                        }
                        this.setState(member, { val: newActive, ack: true });
                        this.setState(member + '.presence', { val: newActive, ack: true });
                        presence.val = newActive;
                        const comming1 = await this.getStateAsync(member + '.comming');
                        comming = comming1.val;
                        const going1 = await this.getStateAsync(member + '.going');
                        going = going1.val;
                        if (comming1.val == null) {
                            comming = new Date(curVal.lc);
                            this.setState(member + '.comming', { val: comming, ack: true });
                        }
                        if (going1.val == null) {
                            going = new Date(curVal.lc);
                            this.setState(member + '.going', { val: going, ack: true });
                        }
                        this.jsonTab += this.createJSONTableRow(index, ['Name', member, 'Active', newActive, 'Kommt', dateFormat(comming, cfg.dateFormat), 'Geht', dateFormat(going, cfg.dateFormat)]);
                        this.htmlTab += this.createHTMLTableRow([member, (newActive ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>'), dateFormat(comming, cfg.dateFormat), dateFormat(going, cfg.dateFormat)]);
                        //this.log.info('getActive ' + member + ' finished');
                        return presence;
                    }else{
                        throw('object ' + member + ' does not exist!');
                    }
                }
            }
        } catch(error){
            this.log.error('getActive: ' + JSON.stringify(error));
            return null;
        }
    }

    getHistoryTable(gthis, cfg, memb, start, end){
        return new Promise((resolve, reject) => {
            gthis.sendTo(cfg.history, 'getHistory', {
                id: `${gthis.namespace}` + '.' + memb,
                options:{
                    end:        end,
                    start:      start,
                    ignoreNull: true,
                    aggregate: 'onchange'
                }
            }, function (result1) {
                if (result1 == null) {
                    reject ('can not read history from ' + memb + ' ' + result1.error);
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
                            resolve(result);
                        }
                    });
                }
            });
        });
    }

    async checkPresence(cfg){
        try {
            const midnight = new Date(); //Date of day change 
            midnight.setHours(0,0,0);
            const dnow = new Date(); //Actual date and time for comparison

            // functions for family members
            this.jsonTab = '[';
            this.htmlTab = this.HTML;

            let count = 0;
            let length = cfg.members.length; //Correction if not all members enabled
            for (let k = 0; k < cfg.members.length; k++){
                if (cfg.members[k].enabled == false) length--;
            }
            let presence = {val: null, all: true, one: false, presentMembers: '', absentMembers: '', allAbsence: true, oneAbsence: false };
            for (let k = 0; k < cfg.members.length; k++) { //loop over family members
                if (this.enabled == false) break; //cancel if disabled over unload
                const memberRow = cfg.members[k]; //Row from family members table
                const member = memberRow.familymember; 
                if (memberRow.enabled == true && this.GETBYMAC == true){ //member enabled in configuration settings and service is supported
                    const curVal = await this.getActive(count, cfg, memberRow, dnow, presence);
                    const dPoint = await this.getObjectAsync(`${this.namespace}` + '.' + member);
                    count++;
                    presence = curVal;
                    if (curVal != null){
                        //get history data
                        let present = Math.round((dnow - midnight)/1000/60); //time from midnight to now = max. present time
                        let absent = 0;

                        const end = new Date().getTime();
                        const start = midnight.getTime();
                        let lastVal = null;
                        let lastValCheck = false;
                        //const gthis = this;
                        const memb = member;
                        if (cfg.history != ''){
                            if (dPoint.common.custom != undefined && dPoint.common.custom[cfg.history].enabled == true){
                                try {
                                    const result = await this.getHistoryTable(this, cfg, memb, start, end);
                                    if (!result) throw('Can not get history items of member ' + memb);
                                    //this.log.info('history: ' + JSON.stringify(result));
                                    let htmlHistory = this.HTML_HISTORY;
                                    let jsonHistory = '[';
                                    let bfirstFalse = false;
                                    let firstFalse = midnight;
                                    this.log.debug('history ' + memb + ' cntHistory: ' + result.result.length);
                                    let cnt = 0;
                                    
                                    let i = 0;
                                    for (let iv = 0; iv < result.result.length; iv++) {
                                        if (this.enabled == false) break;
                                        if (result.result[0].ts < result.result[result.result.length-1].ts){ //Workaround for history sorting behaviour
                                            i = iv;
                                        }else{
                                            i = result.result.length - iv - 1;
                                        }
                                        if (result.result[i].val != null ){
                                            const hdate = dateFormat(new Date(result.result[i].ts), cfg.dateformat);
                                            htmlHistory += this.createHTMLTableRow([(result.result[i].val ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>'), dateFormat(hdate, cfg.dateFormat)]);
                                            jsonHistory += this.createJSONTableRow(cnt, ['Active', result.result[i].val, 'Date', dateFormat(hdate, cfg.dateFormat)]);
                                            cnt += 1;
                                            const hTime = new Date(result.result[i].ts);
                                            //this.log.debug('history ' + memb + ' ' + result.result[i].val + ' time: ' + hTime);
                                            if (hTime >= midnight.getTime()){
                                                if (lastVal == null){
                                                    //if no lastVal exists
                                                    lastVal = curVal.val; 
                                                    lastValCheck = true;
                                                    this.log.debug(memb + ': No history item before this day is available');
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
                                                this.log.debug('history lastVal ' + memb + ' ' + result.result[i].val + ' time: ' + hTime);
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
                                    
                                    this.setState(memb + '.present.sum_day', { val: present, ack: true });
                                    this.setState(memb + '.absent.sum_day', { val: absent, ack: true });

                                    jsonHistory += ']';
                                    htmlHistory += this.HTML_END;
                                    this.setState(memb + '.history', { val: jsonHistory, ack: true });
                                    this.setState(memb + '.historyHtml', { val: htmlHistory, ack: true });

                                } catch (ex) {
                                    throw('checkPresence history: ' + ex.message);
                                }
                            }else{
                                this.log.info('History from ' + memb + ' not enabled');
                            }
                        }else{//history enabled
                            this.setState(memb + '.history', { val: 'disabled', ack: true });
                            this.setState(memb + '.historyHtml', { val: 'disabled', ack: true });
                            this.setState(memb + '.present.sum_day', { val: -1, ack: true });
                            this.setState(memb + '.absent.sum_day', { val: -1, ack: true });
                        }
                    }else{
                        this.log.warn('can not get active state from member ' + member);
                        break;
                    }
                    if (count == length) {
                        this.jsonTab += ']';
                        this.htmlTab += this.HTML_END;  

                        this.setState('json', { val: this.jsonTab, ack: true });
                        this.setState('html', { val: this.htmlTab, ack: true });
                    
                        this.setState('presenceAll', { val: presence.all, ack: true });
                        this.setState('absenceAll', { val: presence.allAbsence, ack: true });
                        this.setState('presence', { val: presence.one, ack: true });
                        this.setState('absence', { val: presence.oneAbsence, ack: true });
                        this.setState('absentMembers', { val: presence.absentMembers, ack: true });
                        this.setState('presentMembers', { val: presence.presentMembers, ack: true });
                        return true;
                    }
                }//enabled in configuration settings
            }// for end
        } catch (error) {
            this.log.error('getActive: ' + JSON.stringify(error));            
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