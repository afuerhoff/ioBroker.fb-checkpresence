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
        this.FORBIDDEN_CHARS = /[\][.*,;'"`<>\\?\s]+/g;

        this.errorCntMax = 10;

        this.allDevices = [];
        this.adapterStates = [];
        this.jsonTab;
        this.htmlTab;
        this.enabled = true;
        this.errorCnt = 0;
        this.Fb = null;
        this.timeout = null;
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

    async setStateIfNotEqual(id, options){
        const ind = this.adapterStates.findIndex(x => x.id == id);
        if (ind &&  this.adapterStates[ind].state.val != options.val){
            this.setState(id, options);
            this.adapterStates[ind].state.val = options.val;  
        }
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
                                    hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
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
                        //if (gthis.Fb.DEVINFO == true) {
                        await gthis.Fb.connectionCheck(); //Sets the connection led
                        //}
                        cnt1 = 0;
                        const itemlist = await gthis.Fb.getDeviceList();
                        const hosts = await gthis.getAllFbObjectsNew(itemlist);
                        await gthis.checkPresence(cfg, hosts);
                        time = process.hrtime(work);
                        gthis.log.debug('loopFamily ends after ' + time + ' s');
                    }
                    if (cnt2 == int2){
                        //gthis.log.debug('loopDevices starts');
                        if (gthis.Fb.DEVINFO == true) {
                            await gthis.Fb.connectionCheck(); //Sets the connection led
                        }
                        cnt2 = 0;
                        await gthis.Fb.getExtIp();
                        await gthis.Fb.getGuestWlan('guest.wlan');
                        if (gthis.Fb.GETPATH != null && gthis.Fb.GETPATH == true && gthis.config.fbdevices == true){
                            let meshlist = null;
                            //const itemlist = await gthis.Fb.getDeviceList();
                            if (gthis.Fb.GETMESHPATH != null && gthis.Fb.GETMESHPATH == true && gthis.config.meshinfo == true) meshlist = await gthis.Fb.getMeshList();
                            if (gthis.Fb.deviceList && meshlist) {
                                const hosts = await gthis.getAllFbObjectsNew(gthis.Fb.deviceList);
                                await gthis.getWlBlInfo(gthis.Fb.deviceList, hosts, cfg);
                                await gthis.getDeviceInfo(hosts);
                                await gthis.getMeshInfo(hosts, meshlist);
                            }
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

    async getAllFbObjects(items){
        try {
            const hosts = [];
            // Get all fb-device objects of this adapter
            const devices = await this.getDevicesAsync();
            for (const id in devices) {
                if (devices[id] != undefined && devices[id].common != undefined){
                    const dName = devices[id].common.name;
                    const shortNameOrg = dName.replace('fb-devices.', '');
                    const shortName = shortNameOrg.replace(this.FORBIDDEN_CHARS, '-');
                    if (dName.includes('fb-devices.')){
                        const host = items.filter(x => x.HostName === shortNameOrg);
                        const activeHost = host.filter(x => x.Active === '1');
                        if (host){
                            if (host.length == 0){
                                const device = {
                                    status: 'old',
                                    dp: 'fb-devices.' + shortName,
                                    hn: shortName,
                                    hnOrg: shortNameOrg,
                                    mac: await this.getStateAsync('fb-devices.' + shortName + '.macaddress').val,
                                    ip: await this.getStateAsync('fb-devices.' + shortName + '.ipaddress').val,
                                    active: 0,
                                    data: null,
                                    interfaceType: '',
                                    speed: 0,
                                    guest: 0
                                };
                                hosts.push(device);                                
                            }
                            if (host.length == 1){
                                let hostName = host[0]['HostName'];
                                if (hostName.includes('.')){
                                    hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                                }
                                const device = {
                                    status: 'unchanged',
                                    dp: 'fb-devices.' + hostName,
                                    hn: hostName,
                                    hnOrg: host[0]['HostName'],
                                    mac: host[0]['MACAddress'],
                                    ip: host[0]['IPAddress'],
                                    active: host[0]['Active'],
                                    data: host[0],
                                    interfaceType: host[0]['InterfaceType'],
                                    speed: host[0]['X_AVM-DE_Speed'],
                                    guest: host[0]['X_AVM-DE_Guest']
                                };
                                hosts.push(device);
                            }
                            if (host.length > 1){
                                if (activeHost.length > 0){
                                    let hostName = activeHost[0]['HostName'];
                                    if (hostName.includes('.')){
                                        hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                                    }
                                    const device = {
                                        status: 'unchanged',
                                        dp: 'fb-devices.' + hostName,
                                        hn: hostName,
                                        hnOrg: activeHost[0]['HostName'],
                                        mac: activeHost[0]['MACAddress'],
                                        ip: activeHost[0]['IPAddress'],
                                        active: activeHost[0]['Active'],
                                        data: activeHost[0],
                                        interfaceType: activeHost[0]['InterfaceType'],
                                        speed: activeHost[0]['X_AVM-DE_Speed'],
                                        guest: activeHost[0]['X_AVM-DE_Guest']
                                    };
                                    hosts.push(device);
                                }else{
                                    let hostName = host[0]['HostName'];
                                    if (hostName.includes('.')){
                                        hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                                    }
                                    const device = {
                                        status: 'unchanged',
                                        dp: 'fb-devices.' + hostName,
                                        hn: hostName,
                                        hnOrg: host[0]['HostName'],
                                        mac: host[0]['MACAddress'],
                                        ip: host[0]['IPAddress'],
                                        active: host[0]['Active'],
                                        data: host[0],
                                        interfaceType: host[0]['InterfaceType'],
                                        speed: host[0]['X_AVM-DE_Speed'],
                                        guest: host[0]['X_AVM-DE_Guest']
                                    };
                                    hosts.push(device);
                                }
                            }
                        }else{
                            const device = {
                                status: 'old',
                                dp: 'fb-devices.' + shortName,
                                hn: shortName,
                                hnOrg: shortNameOrg,
                                mac: await this.getStateAsync('fb-devices.' + shortName + '.macaddress').val,
                                ip: await this.getStateAsync('fb-devices.' + shortName + '.ipaddress').val,
                                active: 0,
                                data: null,
                                interfaceType: '',
                                speed: 0,
                                guest: 0
                            };
                            hosts.push(device);
                        }
                    }
                }
            }
            for(let i=0;i<items.length;i++){
                let hostName = items[i]['HostName'];
                if (hostName.includes('.')){
                    hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                }
                const host = devices.filter(x => x._id.replace(`${this.namespace}` + '.fb-devices.','') === hostName);
                if (!host || host.length == 0){
                    const device = {
                        status: 'new',
                        dp: 'fb-devices.' + hostName,
                        hn: hostName,
                        hnOrg: items[i]['HostName'],
                        mac: items[i]['MACAddress'],
                        ip: items[i]['IPAddress'],
                        active: items[i]['Active'],
                        data: items[i],
                        interfaceType: items[i]['InterfaceT,ype'],
                        speed: items[i]['X_AVM-DE_Speed'],
                        guest: items[i]['X_AVM-DE_Guest']
                    };
                    hosts.push(device);
                }
            }
            return hosts;
        } catch (error) {
            this.log.error('refreshFbObjects ' + JSON.stringify(error));
            return null;
        }
    }

    async getAllFbObjectsNew(items){
        try {
            const hosts = [];
            // Get all fb-device objects of this adapter
            const devices = await this.getDevicesAsync();
            const fbDevices = devices.filter(x => x._id.includes(`${this.namespace}` + '.fb-devices.'));

            for(let i=0;i<items.length;i++){
                let hostName = items[i]['HostName'];
                if (hostName.includes('.')) hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                const host = fbDevices.filter(x => x._id.replace(`${this.namespace}` + '.fb-devices.','') === hostName);
                const item = items.filter(x => x.HostName == items[i].HostName);
                const itemActive = items.filter(x => x.HostName == items[i].HostName && x.Active == '1');
                if (!host || host.length == 0){ //new devices
                    const device = {
                        status: 'new',
                        dp: 'fb-devices.' + hostName,
                        hn: hostName,
                        hnOrg: items[i]['HostName'],
                        mac: items[i]['MACAddress'],
                        ip: items[i]['IPAddress'],
                        active: items[i]['Active'] == 1 ? true : false,
                        data: items[i],
                        interfaceType: items[i]['InterfaceType'],
                        speed: items[i]['X_AVM-DE_Speed'],
                        guest: items[i]['X_AVM-DE_Guest']
                    };
                    hosts.push(device);
                }
                if (!item || item.length == 1){
                    const device = {
                        status: 'unchanged',
                        dp: 'fb-devices.' + hostName,
                        hn: hostName,
                        hnOrg: items[i]['HostName'],
                        mac: items[i]['MACAddress'],
                        ip: items[i]['IPAddress'],
                        active: items[i]['Active'] == 1 ? true : false,
                        data: items[i],
                        interfaceType: items[i]['InterfaceType'],
                        speed: items[i]['X_AVM-DE_Speed'],
                        guest: items[i]['X_AVM-DE_Guest']
                    };
                    hosts.push(device);
                }
                if (!item || item.length > 1){
                    let mac = '';
                    let ip = '';
                    let active = false;
                    for (let it = 0; it < item.length; it++){
                        mac += mac == '' ? item[it].MACAddress : ', ' + item[it].MACAddress;
                        ip += ip == '' ? item[it].IPAddress : ', ' + item[it].IPAddress;
                    }
                    if (itemActive && itemActive.length > 0) active = true;
                    const device = {
                        status: 'unchanged',
                        dp: 'fb-devices.' + hostName,
                        hn: hostName,
                        hnOrg: items[i]['HostName'],
                        mac: mac,
                        ip: ip,
                        active: active,
                        data: active == true ? itemActive[0] : items[i],
                        interfaceType: active == true ? itemActive[0]['InterfaceType'] : items[i]['InterfaceType'],
                        speed: active == true ? itemActive[0]['X_AVM-DE_Speed'] : items[i]['X_AVM-DE_Speed'],
                        guest: active == true ? itemActive[0]['X_AVM-DE_Guest'] : items[i]['X_AVM-DE_Guest']
                    };
                    const temp = hosts.filter(x => x.hn == hostName);
                    if (temp.length == 0) hosts.push(device);
                }
            }

            for (const id in fbDevices) {
                if (devices[id] != undefined && devices[id].common != undefined){
                    const dName = devices[id].common.name;
                    const shortName = dName.replace('fb-devices.', '');
                    const shortNameOrg = devices[id].common.desc;
                    //shortNameOrg = shortNameOrg.replace('-', '.');
                    const host = items.filter(x => x.HostName === shortName);
                    if (host && host.length == 0){
                        const host = items.filter(x => x.HostName === shortNameOrg);
                        if (host && host.length == 0){
                            const device = {
                                status: 'old',
                                dp: 'fb-devices.' + shortName,
                                hn: shortName,
                                hnOrg: shortNameOrg,
                                mac: await this.getStateAsync('fb-devices.' + shortName + '.macaddress').val,
                                ip: await this.getStateAsync('fb-devices.' + shortName + '.ipaddress').val,
                                active: 0,
                                data: null,
                                interfaceType: '',
                                speed: 0,
                                guest: 0
                            };
                            hosts.push(device);       
                        }                         
                    }
                }
            }
            const newObjs = hosts.filter(host => host.status == 'new');
            if (newObjs) await obj.createFbDeviceObjects(this, newObjs, this.enabled);

            return hosts;
        } catch (error) {
            this.log.error('getAllFbObjectsNew ' + JSON.stringify(error));
            return null;
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
                if (this.config.familymembers[i].usename == undefined) {
                    adapterObj.native.familymembers[i].usename = false;
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

            //Create global objects
            await obj.createGlobalObjects(this, this.adapterStates, this.HTML+this.HTML_END, this.HTML_GUEST+this.HTML_END, this.enabled);
            await obj.createMemberObjects(this, this.adapterStates, cfg, this.HTML_HISTORY + this.HTML_END, this.enabled);

            //create Fb devices
            if (this.Fb.GETPATH != null && this.Fb.GETPATH == true && this.config.fbdevices == true){
                const items = await this.Fb.getDeviceList(this, cfg, this.Fb);
                if (items != null){
                    const hosts = await this.getAllFbObjectsNew(items);
                    const res = await obj.createFbDeviceObjects(this, hosts, this.enabled);
                    if (res === true) this.log.info('createFbDeviceObjects finished successfully');
                    //await obj.createMeshObjects(this, items, 0, this.enabled);
                }else{
                    this.log.error('createFbDeviceObjects -> ' + "can't read devices from fritzbox! Adapter stops");
                    adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                    adapterObj.common.enabled = false;  // Adapter ausschalten
                    await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
                }
                await this.resyncFbObjects(items);
            }

            // states changes inside the adapters namespace are subscribed
            if (this.Fb.SETENABLE === true && this.Fb.WLAN3INFO === true) this.subscribeStates(`${this.namespace}` + '.guest.wlan');
            if (this.Fb.DISALLOWWANACCESSBYIP === true && this.Fb.GETWANACCESSBYIP === true) this.subscribeStates(`${this.namespace}` + '.fb-devices.*.disabled');  
            if (this.Fb.REBOOT === true) this.subscribeStates(`${this.namespace}` + '.reboot');  

            this.loop(9, 55, cronFamily, cron, cfg); //values must be less than cronfamily or cron
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
                if (id == `${this.namespace}` + '.guest.wlan' && this.Fb.SETENABLE == true && state.ack === false && this.Fb.WLAN3INFO ===true){
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

                if (id.includes('disabled') && state.ack === false && this.Fb.DISALLOWWANACCESSBYIP === true && this.Fb.GETWANACCESSBYIP === true){
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

                if (id == `${this.namespace}` + '.reboot' && this.Fb.REBOOT === true){
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
                        if (this.Fb.GETPATH == true){
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

    async getMeshInfo(hosts, mesh){
        try {
            const enabledMeshInfo = this.config.meshinfo;
            const ch = await this.getChannelsOfAsync(); //get all channels

            if (mesh) this.setState('fb-devices.mesh', { val: JSON.stringify(mesh), ack: true });
            for (let i = 0; i < hosts.length; i++) {
                let hostName = hosts[i]['hn'];
                if (hostName.includes('.')){
                    hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                }
                const hostCh = ch.filter(ch => ch._id.includes('.' + hostName + '.'));
                //Get mesh info for device
                if (this.Fb.GETMESHPATH != null && this.Fb.GETMESHPATH == true && enabledMeshInfo == true){
                    if (mesh != null){
                        let meshdevice = mesh.find(el => el.device_mac_address === hosts[i]['mac']);
                        if (meshdevice == null) {
                            meshdevice = mesh.find(el => el.device_name === hosts[i]['hnOrg']);
                        }
                        if (meshdevice != null) {
                            this.setState('fb-devices.' + hostName + '.meshstate', { val: true, ack: true });
                            
                            //delete old interfaces
                            for (const c in hostCh) {
                                let found = false;
                                for (let ni = 0; ni < meshdevice['node_interfaces'].length; ni++) {
                                    const nInterface = meshdevice['node_interfaces'][ni];
                                    const ifType = nInterface['type'];
                                    const ifName = nInterface['name'];
                                    const ifNewName = ifName == '' ? ifType : ifName;
                                    if (hostCh[c]._id.includes('.' + hostName + '.' + ifNewName)){
                                        found = true;
                                        break;
                                    }
                                }
                                if (found == false){ //old interfaces
                                    this.log.debug('Interface not found: ' + hostCh[c]._id);
                                    if (Number.isInteger(parseInt(hostCh[c]._id.replace(`${this.namespace}.fb-devices.` + hostName + '.', '')))){
                                        const states = await this.getStatesAsync(hostCh[c]._id + '.*');
                                        if (states){
                                            for (const idS in states) {
                                                await this.delObjectAsync(idS);
                                                await this.delStateAsync(idS);
                                            }
                                        }
                                        await this.delObjectAsync(hostCh[c]._id);
                                    }else{
                                        this.setState('fb-devices.' + hostName + '.meshstate', { val: false, ack: true });
                                        this.setState(hostCh[c]._id + '.cur_data_rate_rx', { val: 0, ack: true });
                                        this.setState(hostCh[c]._id + '.cur_data_rate_tx', { val: 0, ack: true });
                                        this.setState(hostCh[c]._id + '.rx_rcpi', { val: 0, ack: true });
                                        this.setState(hostCh[c]._id + '.link', { val: '', ack: true });
                                    }
                                }
                            }
                            for (let ni = 0; ni < meshdevice['node_interfaces'].length; ni++) { 
                                const nInterface = meshdevice['node_interfaces'][ni];
                                const ifType = nInterface['type'];
                                const ifName = nInterface['name'];
                                const ifNewName = ifName == '' ? ifType : ifName;
                                let found = false;
                                for (const c in hostCh) {
                                    if (hostCh[c]._id.includes('.' + hostName + '.' + ifNewName)){
                                        found = true;
                                        break;
                                    }
                                }
                                if (found == false){ //new interfaces
                                    this.log.info('New interface found: ' + hostName + '.' + ifNewName);
                                    obj.createMeshObject(this, hostName, ifNewName, this.enabled);
                                }
                            }

                            for (let ni = 0; ni < meshdevice['node_interfaces'].length; ni++) {
                                const nInterface = meshdevice['node_interfaces'][ni];
                                let interfaceName = nInterface['name'];
                                let ifType = nInterface['type'];
                                const ifName = nInterface['name'];
                                const ifNewName = ifName == '' ? ifType : ifName;
                                if (interfaceName == '') interfaceName = ifType;

                                this.setState('fb-devices.' + hostName + '.' + ifNewName + '.name', { val: ifName, ack: true });
                                
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
                                                const intf = node1.node_interfaces.find(el => el.uid === nodelinks['node_interface_1_uid']);
                                                ifType += ' ' + intf['name'];
                                            }
                                            if (nodelinks['node_2_uid'] != meshdevice['uid']){ //Down connection
                                                const node1 = mesh.find(el => el.uid === nodelinks['node_2_uid']);
                                                if (link != '') link += ',';
                                                link += node1['device_name'];
                                            }
                                            data_rate_rx = Math.round(nodelinks['cur_data_rate_rx'] / 1000);
                                            data_rate_tx = Math.round(nodelinks['cur_data_rate_tx'] / 1000);
                                        }
                                        this.setState('fb-devices.' + hostName + '.' + ifNewName + '.link', { val: link, ack: true });
                                        this.setState('fb-devices.' + hostName + '.' + ifNewName + '.rx_rcpi', { val: nodelinks['rx_rcpi'], ack: true });
                                        this.setState('fb-devices.' + hostName + '.' + ifNewName + '.cur_data_rate_rx', { val: data_rate_rx, ack: true });
                                        this.setState('fb-devices.' + hostName + '.' + ifNewName + '.cur_data_rate_tx', { val: data_rate_tx, ack: true });
                                    }
                                }else{
                                    //Interface without links
                                    this.setState('fb-devices.' + hostName + '.' + ifNewName + '.link', { val: '', ack: true });
                                    this.setState('fb-devices.' + hostName + '.' + ifNewName + '.rx_rcpi', { val: 0, ack: true });
                                    this.setState('fb-devices.' + hostName + '.' + ifNewName + '.cur_data_rate_rx', { val: 0, ack: true });
                                    this.setState('fb-devices.' + hostName + '.' + ifNewName + '.cur_data_rate_tx', { val: 0, ack: true });
                                }
                                this.setState('fb-devices.' + hostName + '.' + ifNewName + '.type', { val: ifType, ack: true });
                            }
                        }else{
                            for (const c in hostCh) {
                                this.log.debug('Host not in mesh list: ' + hostCh[c]._id);
                                if (Number.isInteger(parseInt(hostCh[c]._id.replace(`${this.namespace}.fb-devices.` + hostName + '.', '')))){
                                    const states = await this.getStatesAsync(hostCh[c]._id + '.*');
                                    if (states){                                
                                        for (const idS in states) {
                                            await this.delObjectAsync(idS);
                                            await this.delStateAsync(idS);
                                        }
                                    }
                                    await this.delObjectAsync(hostCh[c]._id);
                                }else{
                                    this.setState('fb-devices.' + hostName + '.meshstate', { val: false, ack: true });
                                    this.setState(hostCh[c]._id + '.cur_data_rate_rx', { val: 0, ack: true });
                                    this.setState(hostCh[c]._id + '.cur_data_rate_tx', { val: 0, ack: true });
                                    this.setState(hostCh[c]._id + '.rx_rcpi', { val: 0, ack: true });
                                    this.setState(hostCh[c]._id + '.link', { val: '', ack: true });
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log.error('getMeshInfo: ' + error);
            return false;
        }
    }

    async getWlBlInfo(items, hosts, cfg){
        try {
            let wlCnt = 0;
            let blCnt = 0;
            let jsonWlRow = '[';
            let jsonBlRow = '[';
            let htmlBlRow = this.HTML_GUEST;

            for (let i = 0; i < items.length; i++) {
                if (this.enabled == false) break;
                //let deviceType = '-';
                const wl = cfg.wl.filter(x => x.white_macaddress == items[i]['MACAddress']);
                const wlFound = wl.length > 0 ? true : false;
                if (wlFound == false && items[i] != null){ //&& items[i]['X_AVM-DE_Guest'] == 0//&& items[i]['Active'] == 1
                    //deviceType = 'blacklist';
                    htmlBlRow += this.createHTMLTableRow([items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']]);
                    jsonBlRow += this.createJSONTableRow(blCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress']]);
                    blCnt += 1;
                } 
                if (wlFound == true ){
                    //deviceType = 'whitelist';
                    jsonWlRow += this.createJSONTableRow(wlCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress']]);
                    wlCnt += 1;
                }
                
                /*const device = hosts.filter(function(x, index, arr){ //find fb-device
                    const y = x.mac;
                    let result = false;
                    if (y) result = y.includes(items[i]['MACAddress']);  
                    return result;
                });*/
                const host = hosts.filter(x => x.hnOrg == items[i]['HostName']); //find fb-device
                if (host && host.length > 0) {
                    const macs = host[0].mac.split(', ');
                    let count = 0;
                    for (let m = 0; m < macs.length; m++){
                        const wldevice = cfg.wl.filter(x => x.white_macaddress == macs[m]);
                        if (wldevice && wldevice.length > 0) count++; 
                    }
                    let hostName = items[i]['HostName'];
                    hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                    if (count == macs.length){
                        this.setState('fb-devices.' + hostName + '.whitelist', { val: true, ack: true });
                        this.setState('fb-devices.' + hostName + '.blacklist', { val: !wlFound, ack: true });               
                    }else{
                        this.setState('fb-devices.' + hostName + '.whitelist', { val: false, ack: true });
                        this.setState('fb-devices.' + hostName + '.blacklist', { val: wlFound, ack: true });               
                    }
                }
            }                
            jsonWlRow += ']';
            jsonBlRow += ']';
            htmlBlRow += this.HTML_END;
            this.setState('blacklist.count', { val: blCnt, ack: true });
            this.setState('blacklist.listHtml', { val: htmlBlRow, ack: true });
            this.setState('blacklist.listJson', { val: jsonBlRow, ack: true });
            
            this.setState('whitelist.json', { val: jsonWlRow, ack: true });
            this.setState('whitelist.count', { val: cfg.wl.length, ack: true });
            if (blCnt > 0) {
                this.setState('blacklist', { val: true, ack: true });
            }else {
                this.setState('blacklist', { val: false, ack: true });
            }
            this.log.debug('getWlBlInfo blCnt: '+ blCnt);
            return true;
        } catch (error) {
            this.log.error('getWlBlInfo: ' + error);
            return false;            
        }
    }

    async getDeviceInfo(hosts){
        try {
            //analyse guests
            let guestCnt = 0;
            let activeCnt = 0;
            let inactiveCnt = 0;
            let htmlRow = this.HTML_GUEST;
            let htmlFbDevices = this.HTML_FB;
            let jsonRow = '[';
            let jsonFbDevices = '[';
            let jsonFbDevActive = '[';
            let jsonFbDevInactive = '[';

            if (!hosts) return false;
            
            //const items = hosts.filter(host => host.status == 'unchanged' || host.status == 'new');
            for (let i = 0; i < hosts.length; i++) {
                if (this.enabled == false) break;
                let deviceType = '-';
                if (hosts[i]['data'] != null && hosts[i]['data']['X_AVM-DE_Guest'] == 1){
                    deviceType = 'guest';
                }
                if (hosts[i]['active'] == 1){ // active devices
                    jsonFbDevActive += this.createJSONTableRow(activeCnt, ['Hostname', hosts[i]['hn'], 'IP-Address', hosts[i]['ip'], 'MAC-Address', hosts[i]['mac'], 'Active', hosts[i]['active'], 'Type', deviceType]);
                    activeCnt += 1;
                }else{
                    jsonFbDevInactive += this.createJSONTableRow(inactiveCnt, ['Hostname', hosts[i]['hn'], 'IP-Address', hosts[i]['ip'], 'MAC-Address', hosts[i]['mac'], 'Active', hosts[i]['active'], 'Type', deviceType]);
                    inactiveCnt += 1;
                }
                if (hosts[i]['data'] != null && hosts[i]['data']['X_AVM-DE_Guest'] == 1 && hosts[i]['active'] == 1){ //active guests
                    htmlRow += this.createHTMLTableRow([hosts[i]['hn'], hosts[i]['ip'], hosts[i]['mac']]); //guests table
                    jsonRow += this.createJSONTableRow(guestCnt, ['Hostname', hosts[i]['hn'], 'IP-Address', hosts[i]['ip'], 'MAC-Address', hosts[i]['mac']]);
                    this.log.debug('getDeviceInfo active guest: ' + hosts[i]['hn'] + ' ' + hosts[i]['ip'] + ' ' + hosts[i]['mac']);
                    guestCnt += 1;
                }
                htmlFbDevices += this.createHTMLTableRow([hosts[i]['hn'], hosts[i]['ip'], hosts[i]['mac'], hosts[i]['active'], deviceType]);
                jsonFbDevices += this.createJSONTableRow(i, ['Hostname', hosts[i]['hn'], 'IP-Address', hosts[i]['ip'], 'MAC-Address', hosts[i]['mac'], 'Active', hosts[i]['active'], 'Type', deviceType]);
                
                let hostName = hosts[i]['hn'];
                hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                this.setState('fb-devices.' + hostName + '.macaddress', { val: hosts[i]['mac'], ack: true });
                this.setState('fb-devices.' + hostName + '.ipaddress', { val: hosts[i]['ip'], ack: true });
                this.setState('fb-devices.' + hostName + '.active', { val: hosts[i]['active'], ack: true });
                this.setState('fb-devices.' + hostName + '.interfacetype', { val: hosts[i]['interfaceType'], ack: true });
                this.setState('fb-devices.' + hostName + '.speed', { val: hosts[i]['speed'], ack: true });
                this.setState('fb-devices.' + hostName + '.guest', { val: hosts[i]['guest'], ack: true });

            }
            jsonRow += ']';
            htmlRow += this.HTML_END;
            htmlFbDevices += this.HTML_END;
            jsonFbDevices += ']';
            jsonFbDevActive += ']';
            jsonFbDevInactive += ']';
            
            //this.setState('fb-devices.count', { val: items.length, ack: true });
            this.setState('fb-devices.json', { val: jsonFbDevices, ack: true });
            this.setState('fb-devices.jsonActive', { val: jsonFbDevActive, ack: true });
            this.setState('fb-devices.jsonInactive', { val: jsonFbDevInactive, ack: true });
            this.setState('fb-devices.html', { val: htmlFbDevices, ack: true });
            //this.setState('fb-devices.active', { val: activeCnt, ack: true });
            //this.setState('fb-devices.inactive', { val: inactiveCnt, ack: true });

            this.setState('guest.listHtml', { val: htmlRow, ack: true });
            this.setState('guest.listJson', { val: jsonRow, ack: true });
            this.setState('guest.count', { val: guestCnt, ack: true });
            this.setStateIfNotEqual('guest.presence', { val: guestCnt == 0 ? false : true, ack: true });
            //this.setState('guest.presence', { val: guestCnt == 0 ? false : true, ack: true });

            //this.setState('activeDevices', { val: activeCnt, ack: true });


            if (guestCnt > 0) {
                this.setState('guest', { val: true, ack: true });
            }else {
                this.setState('guest', { val: false, ack: true });
            }
            this.log.debug('getDeviceInfo activeCnt: '+ activeCnt);
            return true;
        } catch (error) {
            this.log.error('getDeviceInfo: ' + error);
            return false;
        }
    }

    async getActiveNew(index, memberRow, hosts){
        try {
            const member = memberRow.familymember; 
            const mac = memberRow.macaddress; 
            const ip = memberRow.ipaddress;
            let active = false;
            if (memberRow.useip == undefined || ip == undefined){
                throw('Please edit configuration in admin view and save it! Some items (use ip, ip-address) are missing'); 
            }else{
                let hostEntry = null;
                if (memberRow.useip == false && memberRow.usename == false){
                    if (mac != ''){
                        hostEntry = await this.Fb.soapAction(this.Fb, '/upnp/control/hosts', this.urn + 'Hosts:1', 'GetSpecificHostEntry', [[1, 'NewMACAddress', memberRow.macaddress]], true);
                        if(hostEntry && hostEntry.result === true) active = hostEntry.resultData['NewActive'] == 1 ? true : false;
                    }else{
                        throw('The configured mac-address for member ' + member + ' is empty. Please insert a valid mac-address!');
                    }
                }else{
                    if (memberRow.useip == true && memberRow.usename == false){
                        if (this.Fb.GETBYIP == true && ip != ''){
                            hostEntry = await this.Fb.soapAction(this.Fb, '/upnp/control/hosts', this.urn + 'Hosts:1', 'X_AVM-DE_GetSpecificHostEntryByIP', [[1, 'NewIPAddress', memberRow.ipaddress]], true);
                            if(hostEntry && hostEntry.result === true) active = hostEntry.resultData['NewActive'] == 1 ? true : false;
                        }else{
                            if (memberRow.ipaddress == '') {
                                throw('The configured ip-address for ' + member + ' is empty. Please insert a valid ip-address!');
                            }
                        }
                    }else{ //use name
                        const host = hosts.filter(x => x.hn == member && x.active == 1);
                        if (host && host.length > 0){
                            active = true;
                        }else{
                            active = false;
                        }
                    }
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
                return active;
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

    async calcMemberAttributes(member, index, newActive, dnow, presence, cfg){
        try {
            const midnight = new Date(); //Date of day change 
            midnight.setHours(0,0,0);
            
            //let memberActive = false; 
            let comming = null;
            let going = null;

            const dPoint = await this.getObjectAsync(`${this.namespace}` + '.' + member);
            const curVal = await this.getStateAsync(member + '.presence');
            if (curVal && curVal.val == null) curVal.val = false; 
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
                    presence.presentCount += 1;
                    if (presence.presentMembers == '') {
                        presence.presentMembers += member;
                    }else{
                        presence.presentMembers += ', ' + member;
                    }
                    if (curVal.val == false){ //signal changing to true
                        this.log.info('newActive ' + member + ' ' + newActive);
                        this.setState(member, { val: true, ack: true });
                        //this.setState(member + '.presence', { val: true, ack: true });
                        this.setStateIfNotEqual(member + '.presence', { val: true, ack: true });
                        this.setState(member + '.comming', { val: dnow, ack: true });
                        comming = dnow;
                    }
                    if (curVal.val == null){
                        this.log.warn('Member value is null! Value set to true');
                        this.setState(member, { val: true, ack: true });
                        //this.setState(member + '.presence', { val: true, ack: true });
                        this.setStateIfNotEqual(member + '.presence', { val: true, ack: true });
                    }
                }else{ //member = false
                    presence.all = false;
                    presence.oneAbsence = true;
                    presence.absentCount += 1;
                    if (presence.absentMembers == '') {
                        presence.absentMembers += member;
                    }else{
                        presence.absentMembers += ', ' + member;
                    }
                    if (curVal.val == true){ //signal changing to false
                        this.log.info('newActive ' + member + ' ' + newActive);
                        this.setState(member, { val: false, ack: true });
                        //this.setState(member + '.presence', { val: false, ack: true });
                        this.setStateIfNotEqual(member + '.presence', { val: false, ack: true });
                        this.setState(member + '.going', { val: dnow, ack: true });
                        going = dnow;
                    }
                    if (curVal.val == null){
                        this.log.warn('Member value is null! Value set to false');
                        this.setState(member, { val: false, ack: true });
                        //this.setState(member + '.presence', { val: false, ack: true });
                        this.setStateIfNotEqual(member + '.presence', { val: false, ack: true });
                    }
                }
                //this.setState(member, { val: newActive, ack: true });
                //this.setState(member + '.presence', { val: newActive, ack: true });
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
                //return presence;
            }else{
                throw('object ' + member + ' does not exist!');
            }

            if (presence != null){
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
                                            lastVal = presence.val; 
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
                            throw(ex.message);
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
                //break;
            }
            return presence;
        } catch (error) {
            this.log.error('calcMember ' + error);
        }
    }

    getMemberSpeed(cfg, memberRow, hosts){
        let speed = 0;
        if (memberRow.usename){
            const items = hosts.filter(x => x.hn == memberRow.familymember);
            const itemsActive = items.filter(x => x.active == '1');
            if (items && items.length == 0) speed = 0;
            if (items && items.length == 1) speed = items[0].speed;
            if (items && items.length > 1 && itemsActive && itemsActive.length > 0) speed = itemsActive[0].speed;
        }else{
            if (memberRow.useip){
                const items = hosts.filter(x => x.ip == memberRow.ipaddress);
                const itemsActive = items.filter(x => x.active == '1');
                if (items && items.length == 0) speed = 0;
                if (items && items.length == 1) speed = items[0].speed;
                if (items && items.length > 1 && itemsActive && itemsActive.length > 0) speed = itemsActive[0].speed;
            }else{
                const items = hosts.filter(x => x.mac == memberRow.macaddress);
                const itemsActive = items.filter(x => x.active == '1');
                if (items && items.length == 0) speed = 0;
                if (items && items.length == 1) speed = items[0].speed;
                if (items && items.length > 1 && itemsActive && itemsActive.length > 0) speed = itemsActive[0].speed;
            }
        }
        this.setState(memberRow.familymember + '.speed', { val: speed, ack: true });
    }

    async checkPresence(cfg, hosts){
        try {
            const dnow = new Date(); //Actual date and time for comparison
            this.jsonTab = '[';
            this.htmlTab = this.HTML;
            const presence = {val: null, all: true, one: false, presentMembers: '', absentMembers: '', allAbsence: true, oneAbsence: false,  presentCount: 0, absentCount: 0};

            const membersFiltered = cfg.members.filter(x => x.enabled == true);
            for (let k = 0; k < membersFiltered.length; k++) { //loop over enabled family members
                if (this.enabled == false) break; //cancel if disabled over unload
                const memberRow = membersFiltered[k]; //Row from family members table
                const member = memberRow.familymember; 
                if (this.Fb.GETBYMAC == true){ //member enabled in configuration settings and service is supported
                    const newActive = await this.getActiveNew(k, memberRow, hosts);
                    if (newActive != null) await this.calcMemberAttributes(member, k, newActive, dnow, presence, cfg);
                    if (newActive != null) this.getMemberSpeed(cfg, memberRow, hosts, );
                }
            }
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
            this.setState('presentCount', { val: presence.presentCount, ack: true });
            this.setState('absentCount', { val: presence.absentCount, ack: true });
            return true;
        } catch (error) {
            this.log.error('checkPresence: ' + JSON.stringify(error));            
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