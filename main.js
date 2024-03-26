'use strict';
/*
 * Created with @iobroker/create-adapter vunknown
 */

// The adapter-core module gives you access to the core ioBroker functions
const utils = require('@iobroker/adapter-core');

// load your modules here, e.g.:
//const dateFormat = require('dateformat');

// own libraries
const fb = require('./lib/fb');
const obj = require('./lib/objects');
const dateFormat = require('./lib/dateformat/dateformat');

class Warn extends Error {
    constructor(message) {
        super(message);
        this.name = 'Warning';
        this.toString = function() {
            return this.name + ': ' + this.message;
        };
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
        
        this.FORBIDDEN_CHARS = /[\][.*,;'"`<>\\?\s]+/g;

        this.errorCntMax = 10;

        this.allDevices = [];
        this.adapterStates = [];
        this.memberStates = [];
        this.historyAlive = {val:'false'}; //false;
        this.hosts = null;
        this.jsonTab;
        this.htmlTab;
        this.enabled = true;
        this.errorCnt = 0;
        this.Fb = null;
        this.tout = null;
        this.suppressMesg = false;
        this.suppressMesgEmptyHostname = false;
        this.suppressArr = [];
        this.triggerActive = false;
    }

    errorHandler(error, title){
        //if(adapter === null) adapter = this;
        if (typeof error === 'string') {
            if (error.name === undefined || error.message === undefined){
                this.log.warn(title + ' ' + error); // + ' ' + JSON.stringify(error));
            }else{
                this.log.warn(title + ' ' + error.name + ': ' + error.message);
            }
        }
        else if (typeof error === 'object')
        {
            if (error instanceof TypeError) {
                if (error.name === undefined || error.message === undefined){
                    this.log.warn(title); // + ' ' + JSON.stringify(error));
                }else{
                    this.log.warn(title + ' ' + error.name + ': ' + error.message);
                }
            }else if (error instanceof Error){
                if (error.message == 'NoSuchEntryInArray' && this.suppressMesg == false){
                    this.log.warn(title + ' ' + error.name + ': ' + error.message + ' -> please check entry (mac, ip, hostname) in configuration! It is not listed in the Fritzbox device list');
                    this.suppressMesg = true;
                }
                if (error.message.includes('EHOSTUNREACH')){
                    this.log.warn(title + ' ' + error.name + ': ' + error.message + ' -> please check fritzbox connection! Ip-address in configuration correct?');
                }
                if (error.message != 'NoSuchEntryInArray' && !error.message.includes('EHOSTUNREACH')){
                    if (error.name === undefined || error.message === undefined){
                        this.log.warn(title); // + ' ' + JSON.stringify(error));
                    }else{
                        this.log.warn(title + ' ' + error.name + ': ' + error.message);
                    }
                }
            }else{
                this.log.warn(title + ' ' + error.name + ': ' + error.message);
            }
        }
    }

    _sleep(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    createHTMLTableRow(dataArray) {
        return '<tr>' + dataArray.map(data => '<td>' + data + '</td>').join('') + '</tr>';
    }
    
    getAdapterState(id){
        try {
            const ind = this.adapterStates.findIndex(x => x.id == id);
            if (ind != -1){
                return true;
            }else{
                return false;
            }
        } catch (error) {
            this.errorHandler(error, 'getAdapterState: '); 
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
                                hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
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
            this.errorHandler(error, 'resyncFbObjects: '); 
        }
    }

    async checkDevices(){
        try {
            if (this.config.fbdevices === true || this.config.guestinfo === true){
                await this.Fb.getDeviceList();
                if (this.Fb.deviceList) {
                    if(this.config.fbdevices === true) this.setDeviceStates();
                    await this.getAllFbObjects();
                    if (this.hosts) {
                        //this.log.warn('devicelist2: ' + JSON.stringify(this.hosts));
                        if (this.config.enableWl == true) await this.getWlBlInfo();
                        await this.getDeviceInfo();
                        if (this.Fb.GETMESHPATH != null && this.Fb.GETMESHPATH == true && this.config.meshinfo == true) await this.Fb.getMeshList();
                        if (this.Fb.meshList && this.config.meshinfo == true) await this.getMeshInfo();
                    }
                }
            }
            this.Fb.deviceList = null;
        } catch (error) {
            this.errorHandler(error, 'checkDevices: '); 
        }
    }

    async connCheck(){
        try {
            if (await this.Fb.connectionCheck()){
                await this.setStateChangedAsync('info.connection', { val: true, ack: true });
            }else{
                await this.setStateChangedAsync('info.connection', { val: false, ack: true });
            }
            await this.setStateChangedAsync('info.lastUpdate', { val: (new Date()).toString(), ack: true });
        } catch (error) {
            this.errorHandler(error, 'connCheck: '); 
        }
    }

    async loop(cnt1, cnt2, int1, int2) {
        while(this.enabled === true){
            this.tout = setTimeout(() => {
                this.log.error('cycle error! Adapter restarted');
                this.startAdapter();
            }, 300000);
            let time = null;
            let work = null;
            try {
                await this._sleep(1000);
                cnt1++;
                cnt2++;
                work = process.hrtime();
                cnt1 < cnt2 && cnt1 >= int1 ? await this.connCheck() : cnt2 >= int2 ? await this.connCheck() : null;  
                if (cnt1 >= int1){
                    cnt1 = 0;
                    await this.checkPresence(false);
                    time = process.hrtime(work);
                    this.log.debug('loop family ends after ' + time + ' s');
                }
                if (cnt2 >= int2){
                    cnt2 = 0;
                    if (this.config.extip === true){
                        await this.setStateChangedAsync('info.extIp', { val: await this.Fb.getExtIp(), ack: true });
                    }
                    if (this.config.guestinfo === true){
                        await this.setStateChangedAsync('guest.wlan', { val: await this.Fb.getGuestWlan(), ack: true });
                    }
                    if (this.config.qrcode === true){
                        await this.setStateChangedAsync('guest.wlanQR', { val: await this.Fb.getGuestQR(), ack: true });
                    }
                    if (this.Fb.GETPATH != null && this.Fb.GETPATH == true){
                        this.checkDevices();
                    }
                    time = process.hrtime(work);
                    this.log.debug('loop main ends after ' + time + ' s');
                }
            } catch (error) {
                this.errorHandler(error, 'loop: '); 
            } finally {
                clearTimeout(this.tout);
                this.tout = null;
            }
        }            
    }

    async setDeviceStates() {
        try {
            const deviceList = this.Fb.deviceList;
            if(this.config.compatibility == true) await this.setStateChangedAsync('devices', { val: deviceList.length, ack: true });
            await this.setStateChangedAsync('fb-devices.count', { val: deviceList.length, ack: true });
            let inActiveHosts = deviceList.filter(host => host.Active == '0');
            await this.setStateChangedAsync('fb-devices.inactive', { val: inActiveHosts.length, ack: true });
            inActiveHosts = null;
            let activeHosts = deviceList.filter(host => host.Active == '1');
            await this.setStateChangedAsync('fb-devices.active', { val: activeHosts.length, ack: true });
            if(this.config.compatibility == true) await this.setStateChangedAsync('activeDevices', { val: activeHosts.length, ack: true });
            activeHosts = null;
        } catch (error) {
            this.errorHandler(error, 'setDeviceStates: '); 
        }
    }
    
    async getAllFbObjects(){
        try {
            const items = this.Fb.deviceList;
            if (items === null || items === false) return null;
            // Get all fb-device objects of this adapter
            let hosts = [];
            let devices = await this.getDevicesAsync();
            let fbDevices = devices.filter(x => x._id.includes(`${this.namespace}` + '.fb-devices.'));
            for(let i=0;i<items.length;i++){
                let hostName = items[i]['HostName'];
                hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                if (hostName === null || hostName == ''){
                    if (this.suppressMesgEmptyHostname === false) {
                        this.log.warn('getAllFbObjects: Hostname of fritzbox device ' + items[i]['MACAddress'] + ' is empty!');
                        this.log.warn('getAllFbObjects: To delete this device in the fritzbox please add the device manually in the fritzbox with a hostname and the shown mac-address. After a reboot you can hopefully delete the device.');
                        this.suppressMesgEmptyHostname = true;
                    }
                    continue;
                }
                const host = fbDevices.filter(x => x._id.replace(`${this.namespace}` + '.fb-devices.','') === hostName);
                let item = items.filter(x => x.HostName == items[i].HostName);
                let itemActive = items.filter(x => x.HostName == items[i].HostName && x.Active == '1');
                if (!host || host.length == 0){ //new devices
                    if (!item || item.length == 1){
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
                            speed: parseInt(items[i]['X_AVM-DE_Speed']),
                            guest: items[i]['X_AVM-DE_Guest'] == 0 ? false : true
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
                            speed: active == true ? parseInt(itemActive[0]['X_AVM-DE_Speed']) : parseInt(items[i]['X_AVM-DE_Speed']),
                            guest: active == true ? itemActive[0]['X_AVM-DE_Guest'] == 0 ? false : true : items[i]['X_AVM-DE_Guest'] == 0 ? false : true
                        };
                        const temp = hosts.filter(x => x.hn == hostName);
                        if (temp.length == 0) hosts.push(device);
                    }
                }else{
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
                            speed: parseInt(items[i]['X_AVM-DE_Speed']),
                            guest: items[i]['X_AVM-DE_Guest'] == 0 ? false : true
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
                            speed: active == true ? parseInt(itemActive[0]['X_AVM-DE_Speed']) : parseInt(items[i]['X_AVM-DE_Speed']),
                            guest: active == true ? itemActive[0]['X_AVM-DE_Guest'] == 0 ? false : true : items[i]['X_AVM-DE_Guest'] == 0 ? false : true
                        };
                        const temp = hosts.filter(x => x.hn == hostName);
                        if (temp.length == 0) hosts.push(device);
                    }
                }
                item = null;
                itemActive = null;
            }

            for (const id in fbDevices) {
                if (fbDevices[id] != undefined && fbDevices[id].common != undefined){
                    const dName = fbDevices[id].common.name;
                    const shortName = dName.replace('fb-devices.', '');
                    const shortNameOrg = fbDevices[id].common.desc;
                    //shortNameOrg = shortNameOrg.replace('-', '.');
                    let host = items.filter(x => x.HostName === shortName);
                    if (host && host.length == 0){
                        let host = items.filter(x => x.HostName === shortNameOrg);
                        if (host && host.length == 0){
                            const device = {
                                status: 'old',
                                dp: 'fb-devices.' + shortName,
                                hn: shortName,
                                hnOrg: shortNameOrg,
                                mac: '', //await this.getStateAsync('fb-devices.' + shortName + '.macaddress').val,
                                ip: '', //await this.getStateAsync('fb-devices.' + shortName + '.ipaddress').val,
                                active: false,
                                data: null,
                                interfaceType: '',
                                speed: 0,
                                guest: false
                            };
                            hosts.push(device);       
                        }
                        host = null;                        
                    }
                    host = null;
                }
            }
            let newObjs = hosts.filter(host => host.status == 'new');
            if (newObjs) await obj.createFbDeviceObjects(this, this.adapterStates, newObjs, this.enabled);
            devices = null;
            newObjs = null;
            fbDevices = null;
            this.hosts = hosts;
            hosts = null;
            return true;
        } catch (error) {
            this.errorHandler(error, 'getAllFbObjects: '); 
            return null;
        } 
    }

    async stopAdapter(){
        try {
            const adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            adapterObj.common.enabled = false;  // Adapter ausschalten
            await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
        } catch (error) {
            this.errorHandler(error, 'stopAdapter: '); 
        }
    }

    async startAdapter(){
        try {
            const adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            adapterObj.common.enabled = true;  // Adapter ausschalten
            await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
        } catch (error) {
            this.errorHandler(error, 'startAdapter: '); 
        }
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        try {
            // Initialize your adapter here
            const membersFiltered = this.config.familymembers.filter(x => x.enabled == true);
            const familyGroups = this.removeDuplicates(membersFiltered);

            this.Fb = await fb.Fb.init({
                host: this.config.ipaddress,
                uid: this.config.username,
                pwd: this.config.password
            }, this.config.ssl, this);

            if(this.Fb.services === null) {
                this.log.error('Can not get services! Adapter stops');
                this.stopAdapter();
            }
            //Logging of adapter start
            this.log.info('start ' + `${this.namespace}` + ': ' + this.Fb.modelName + ' version: ' + this.Fb.version + ' ip-address: "' + this.config.ipaddress + '" - interval devices: ' + this.config.interval + ' s' + ' - interval members: ' + this.config.intervalFamily + ' s');
            this.config.username === '' || this.config.username === null ? this.log.warn('please insert a user for full functionality') : this.log.debug('configuration user: <' + this.config.username + '>');
            this.log.debug('configuration history: <' + this.config.history + '>');
            this.log.debug('configuration dateformat: <' + this.config.dateformat + '>');
            this.log.debug('configuration familymembers count: ' + membersFiltered.length);
            this.log.debug('configuration familymembers: ' + JSON.stringify(this.config.familymembers));
            this.log.debug('configuration fb-devices ' + this.config.fbdevices);
            this.log.debug('configuration mesh info: ' + this.config.meshinfo);            
            this.log.debug('configuration whitelist: ' + this.config.enableWl);            
            this.log.debug('configuration compatibility: ' + this.config.compatibility);            
            this.log.debug('configuration ssl: ' + this.config.ssl);            
            this.log.debug('configuration qr code: ' + this.config.qrcode);            
            this.log.debug('configuration guest info: ' + this.config.guestinfo); 
            this.log.debug('configuration external ip address: ' + this.config.extip);           
            this.log.debug('configuration filter delay: ' + this.config.delay);            

            const mesg = this.Fb.connection == null ? '-' : this.Fb.connection;
            this.log.info('configuration default connection: ' + mesg);            

            this.Fb.suportedServices.forEach(element => {
                element.enabled ? this.log.info(element.name + ' is supported') : this.log.warn(element.name + ' is not supported! Feature is deactivated!');
            });

            //Configuration changes if needed
            let adapterObj = (await this.getForeignObjectAsync(`system.adapter.${this.namespace}`));
            let adapterObjChanged = false; //for changes
            
            if (this.config.interval_seconds === false) { //Workaround: Switch interval to seconds
                this.log.warn('Interval changed to seconds!');
                adapterObj.native.interval_seconds = true;
                adapterObj.native.interval = adapterObj.native.interval * 60;
                adapterObjChanged = true;
            }
            //if interval <= 0 than set to 1
            if (this.config.interval <= 0) {
                adapterObj.native.interval = 60;
                adapterObjChanged = true;
                this.config.interval = 60;
                this.log.warn('interval is less than 1. Set to 60 s');
            }

            //if interval <= 9 than set to 10
            if (this.config.intervalFamily <= 9) {
                adapterObj.native.intervalFamily = 10;
                adapterObjChanged = true;
                this.config.intervalFamily = 10;
                this.log.warn('interval is less than 10. Set to 10s.');
            }

            //create new configuration items -> workaround for older versions
            for(let i=0;i<this.config.familymembers.length;i++){
                if (this.config.familymembers[i].usefilter == undefined) {
                    this.log.warn(this.config.familymembers[i].familymember + ' usefilter is undefined! Changed to false');
                    adapterObj.native.familymembers[i].usefilter = false;
                    adapterObjChanged = true;
                }
                if (this.config.familymembers[i].group == undefined) {
                    this.log.warn(this.config.familymembers[i].familymember + ' group is undefined! Changed to ""');
                    adapterObj.native.familymembers[i].group = '';
                    adapterObjChanged = true;
                }
                if (this.config.familymembers[i].devicename == undefined) {
                    this.log.warn(this.config.familymembers[i].familymember + ' devicename is undefined! Changed to ""');
                    adapterObj.native.familymembers[i].devicename = '';
                    adapterObjChanged = true;
                }
                if (this.config.familymembers[i].usage == undefined) {
                    if (this.config.familymembers[i].useip == true) adapterObj.native.familymembers[i].usage = 'IP';
                    if (this.config.familymembers[i].usename == true) adapterObj.native.familymembers[i].usage = 'Hostname';
                    if (this.config.familymembers[i].usename == false && this.config.familymembers[i].useip == false) adapterObj.native.familymembers[i].usage = 'MAC';
                    if (adapterObj.native.familymembers[i].usage == undefined) adapterObj.native.familymembers[i].usage = 'MAC';
                    this.log.warn(this.config.familymembers[i].familymember + ' usage is undefined! Changed to ' + adapterObj.native.familymembers[i].usage);
                    adapterObjChanged = true;
                }
            }

            //suppress messages from family members after one occurence
            for(let i=0;i<this.config.familymembers.length;i++){
                if (this.config.familymembers[i].enabled === true){
                    this.suppressArr[i] = {name: this.config.familymembers[i].familymember, suppress: false, hostname: this.config.familymembers[i].devicename, mac: this.config.familymembers[i].macaddress, ip: this.config.familymembers[i].ipaddress};
                }
            }

            if (adapterObjChanged === true){ //Save changes
                this.log.info('some familymember attributes were changed! Please check the configuration');
                this.log.info('Adapter restarts');
                await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
            }

            const intDev = this.config.interval;
            const intFamily = this.config.intervalFamily;
            
            if(this.config.compatibility === true) {
                this.log.warn('In a future version some states are not more existent. Please disable the compatibility mode in the adapter settings by unchecking the box.');
                this.log.warn('With this change in the adapter settings the new folder familyMembers will be created');
                this.log.warn('Then you should manually delete the old family member data points!');
            }

            //Create global objects
            await obj.createGlobalObjects(this, this.adapterStates, this.HTML+this.HTML_END, this.HTML_GUEST+this.HTML_END, this.enabled);

            this.Fb.suportedServices.forEach(async element => {
                await this.setStateAsync('info.' + element.id, { val: element.enabled, ack: true });
            });
            await this.setStateAsync('reboot', { val: false, ack: true });
            await this.setStateAsync('reconnect', { val: false, ack: true });

            if (this.config.extip === false){
                //await this.setStateChangedAsync('info.extIp', { val: '', ack: true });
            }

            //If history is enbled, check if history adapter is running. 
            if (this.config.history != ''){
                this.historyAlive = await this.getForeignStateAsync('system.adapter.' + this.config.history + '.alive');
                if (this.historyAlive.val === false){
                    for (let to = 0; to < 6; to++){
                        this.log.warn('history adapter is not alive! Waiting 10s');
                        await this._sleep(10000);
                        this.historyAlive = await this.getForeignStateAsync('system.adapter.' + this.config.history + '.alive');
                        if (this.historyAlive.val === true) break;
                    }
                    if (this.historyAlive.val === false) this.stopAdapter();
                }
            } 

            await obj.createMemberObjects(this, membersFiltered, familyGroups, this.adapterStates, this.memberStates, this.config, this.HTML_HISTORY + this.HTML_END, this.enabled, this.historyAlive.val);

            //create Fb devices
            if (this.Fb.GETPATH != null && this.Fb.GETPATH == true && this.config.fbdevices == true){
                await this.Fb.getDeviceList();
                if (this.Fb.deviceList != null){
                    await this.getAllFbObjects();
                    //this.log.warn('devicelist2: ' + JSON.stringify(this.hosts));
                    const res = await obj.createFbDeviceObjects(this, this.adapterStates, this.hosts, this.enabled);
                    if (res === true) this.log.info('createFbDeviceObjects finished successfully');
                }else{
                    this.log.error('createFbDeviceObjects -> ' + "can't read devices from fritzbox! Adapter stops");
                    adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                    adapterObj.common.enabled = false;  // Adapter ausschalten
                    await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
                }
                await this.resyncFbObjects(this.Fb.deviceList);
            }

            // states changes inside the adapters namespace are subscribed
            if (this.Fb.SETENABLE === true && this.Fb.WLAN3INFO === true && this.config.guestinfo === true) this.subscribeStates(`${this.namespace}` + '.guest.wlan');
            if (this.Fb.DISALLOWWANACCESSBYIP === true && this.Fb.GETWANACCESSBYIP === true) this.subscribeStates(`${this.namespace}` + '.fb-devices.*.disabled');  
            if (this.Fb.REBOOT === true) this.subscribeStates(`${this.namespace}` + '.reboot');  
            if (this.Fb.RECONNECT === true) this.subscribeStates(`${this.namespace}` + '.reconnect');  
            this.log.info('states successfully subscribed');

            this.loop(intFamily-1, intDev-3, intFamily, intDev); //values must be less than intFamily or intDev
            this.log.info('loop successfully started');
        } catch (error) {
            this.errorHandler(error, 'onReady: ');
            this.stopAdapter();
        }
    }


    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    async onUnload(callback) {
        try {
            this.enabled = false;
            if (this.Fb != null) this.Fb.exitRequest();
            this.tout && clearTimeout(this.tout);
            this.setState('info.connection', { val: false, ack: true });
            this.log.info('cleaned everything up ...');
            callback && callback();
            //setTimeout(callback, 1000);
        } catch (e) {
            this.log.error('onUnload: ' + e.name + ' ' + e.message);
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
                if (id == `${this.namespace}` + '.guest.wlan' && this.Fb.SETENABLE == true && state.ack === false && this.Fb.WLAN3INFO ===true && this.config.guestinfo === true){
                    this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                    const val = state.val ? '1' : '0';
                    const soapResult = await this.Fb.soapAction('/upnp/control/wlanconfig3', 'urn:dslforum-org:service:' + 'WLANConfiguration:3', 'SetEnable', [[1, 'NewEnable', val]]);
                    //if (guestwlan['status'] == 200 || guestwlan['result'] == true) {
                    if (soapResult) {
                        await this.Fb.getGuestWlan(id, this.config.qrcode);
                        //if(state.val == wlanStatus) this.setState('guest.wlan', { val: wlanStatus, ack: true });
                    }else{
                        throw {name: `onStateChange ${id}`, message: 'Can not change state' + JSON.stringify(soapResult)};
                    }
                }

                if (id.includes('disabled') && state.ack === false && this.Fb.DISALLOWWANACCESSBYIP === true && this.Fb.GETWANACCESSBYIP === true){
                    this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                    const ipId = id.replace('.disabled', '') + '.ipaddress';
                    const ipaddress = await this.getStateAsync(ipId);
                    const val = state.val ? '1' : '0';
                    this.log.info('ip ' + JSON.stringify(ipaddress.val) + ' ' + val);
                    const soapResult = await this.Fb.soapAction('/upnp/control/x_hostfilter', 'urn:dslforum-org:service:' + 'X_AVM-DE_HostFilter:1', 'DisallowWANAccessByIP', [[1, 'NewIPv4Address', ipaddress.val],[2, 'NewDisallow', val]]);
                    if (soapResult) {
                        const wanaccess = await this.Fb.getWanAccess(ipaddress);
                        if (wanaccess !== null) this.setState(id, { val: wanaccess, ack: true });
                    }else{
                        throw {name: `onStateChange ${id}`, message: 'Can not change state' + JSON.stringify(soapResult)};
                    }
                }

                if (id == `${this.namespace}` + '.reboot' && this.Fb.REBOOT === true){
                    this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                    if (state.val === true){
                        const soapResult = await this.Fb.soapAction('/upnp/control/deviceconfig', 'urn:dslforum-org:service:' + 'DeviceConfig:1', 'Reboot', null);
                        //if (reboot['status'] == 200 || reboot['result'] == true) {
                        if (soapResult) {
                            this.setState(`${this.namespace}` + '.reboot', { val: false, ack: true });
                        }else{
                            this.setState(`${this.namespace}` + '.reboot', { val: false, ack: true });
                            throw Error('reboot failure! ' + JSON.stringify(soapResult));
                        }
                    }
                }

                if (id == `${this.namespace}` + '.reconnect' && this.Fb.RECONNECT === true){
                    this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                    if (state.val === true){
                        let soapResult = null;
                        if(this.Fb.RECONNECT && this.Fb.RECONNECT == true && this.Fb.connection == '1.WANPPPConnection.1'){
                            soapResult = await this.Fb.soapAction('/upnp/control/wanpppconn1', 'urn:dslforum-org:service:' + 'WANPPPConnection:1', 'ForceTermination', null);
                        }else{
                            soapResult = await this.Fb.soapAction('/upnp/control/wanipconnection1', 'urn:dslforum-org:service:' + 'WANIPConnection:1', 'ForceTermination', null);
                        }
                        if (soapResult) {
                            this.setState(`${this.namespace}` + '.reconnect', { val: false, ack: true });
                        }else{
                            this.setState(`${this.namespace}` + '.reconnect', { val: false, ack: true });
                            throw('reconnect failure! ' + JSON.stringify(soapResult));
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
            if (error.message == 'DisconnectInProgress'){
                this.setState(`${this.namespace}` + '.reconnect', { val: false, ack: true });
                this.log.info('Fritzbox reconnect in progress');            
                await this._sleep(5000);
            }else{
                this.log.error('onStateChange: ' + error.name + ' ' + error.message);            
            }
        }
    }

    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.message" property to be set to true in io-package.json
     * @param {ioBroker.Message} obj
     */
    async onMessage(obj) {
        try {
            //this.log.debug(`[MSSG] Received: ${JSON.stringify(obj)}`);
            if (!obj) return;
            if (typeof obj === 'object' && obj.message) {
                const gthis = this;
                // eslint-disable-next-line no-inner-declarations
                function reply(result) {
                    gthis.sendTo (obj.from, obj.command, JSON.stringify(result), obj.callback);
                }

                switch (obj.command) {
                    case 'triggerPresence':{
                        gthis.log.info('triggerPresence');
                        if (this.triggerActive === false){
                            this.triggerActive = true;
                            await this.checkPresence(true);
                            await this._sleep(10000);
                            this.triggerActive = false;
                            reply(true);
                        }else{
                            reply(false);
                        }
                        return true;
                    }
                    case 'getDevices':{
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

                        if (this.Fb.GETPATH && this.Fb.GETPATH == true){
                            await this.Fb.getDeviceList();
                            if (this.Fb.deviceList == null){
                                reply(this.allDevices);
                                return;
                            }
                            for (let i = 0; i < this.Fb.deviceList.length; i++) {
                                const active = this.Fb.deviceList[i]['Active'];
                                if (!onlyActive || active) {
                                    this.allDevices.push ({
                                        name: this.Fb.deviceList[i]['HostName'],
                                        ip: this.Fb.deviceList[i]['IPAddress'],
                                        mac: this.Fb.deviceList[i]['MACAddress'],
                                        active: active
                                    });
                                }
                            }
                        }
                        reply(this.allDevices);
                        return true;}
                    default:
                        //this.log.warn('Unknown command: ' + obj.command);
                        break;
                }
                if (obj.callback) this.sendTo(obj.from, obj.command, obj.message, obj.callback);
                return true;    
            }
        } catch (error) {
            this.log.error('onMessage: ' + error.message);
        }
    }

    async getMeshInfo(){
        try {
            const hosts = this.hosts;
            const mesh = this.Fb.meshList;
            if (!hosts) return false;
            if (!mesh) return false;

            const enabledMeshInfo = this.config.meshinfo;
            const ch = await this.getChannelsOfAsync(); //get all channels
            
            if (mesh) await this.setStateChangedAsync('fb-devices.mesh', { val: JSON.stringify(mesh), ack: true });
            for (let i = 0; i < hosts.length; i++) {
                const hostName = hosts[i]['hn'];
                //hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                const hostCh = ch.filter(ch => ch._id.includes('.' + hostName + '.'));
                //Get mesh info for device
                if (this.Fb.GETMESHPATH != null && this.Fb.GETMESHPATH == true && enabledMeshInfo == true){
                    if (mesh != null){
                        let meshdevice = mesh.find(el => el.device_mac_address === hosts[i]['mac']);
                        if (meshdevice == null) {
                            meshdevice = mesh.find(el => el.device_name === hosts[i]['hnOrg']);
                        }
                        if (meshdevice != null) { //host in the meshlist
                            await this.setStateChangedAsync('fb-devices.' + hostName + '.meshstate', { val: true, ack: true });
                            
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
                                        await this.setStateChangedAsync('fb-devices.' + hostName + '.meshstate', { val: false, ack: true });
                                        await this.setStateChangedAsync(hostCh[c]._id + '.cur_data_rate_rx', { val: 0, ack: true });
                                        await this.setStateChangedAsync(hostCh[c]._id + '.cur_data_rate_tx', { val: 0, ack: true });
                                        await this.setStateChangedAsync(hostCh[c]._id + '.rx_rcpi', { val: 0, ack: true });
                                        await this.setStateChangedAsync(hostCh[c]._id + '.link', { val: '', ack: true });
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
                                    //if (hostCh[c]._id.includes('.' + hostName + '.' + ifNewName)){
                                    if (hostCh[c]._id == `${this.namespace}.fb-devices.` + hostName + '.' + ifNewName){
                                        found = true;
                                        break;
                                    }
                                }
                                if (found == false){ //new interfaces
                                    this.log.info('New interface found: ' + hostName + '.' + ifNewName);
                                    await obj.createMeshObject(this, hostName, ifNewName, this.enabled);
                                }
                            }

                            for (let ni = 0; ni < meshdevice['node_interfaces'].length; ni++) {
                                const nInterface = meshdevice['node_interfaces'][ni];
                                let interfaceName = nInterface['name'];
                                let ifType = nInterface['type'];
                                const ifName = nInterface['name'];
                                const ifNewName = ifName == '' ? ifType : ifName;
                                if (interfaceName == '') interfaceName = ifType;

                                await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.name', { val: ifName, ack: true });
                                
                                if (nInterface['node_links'].length > 0){ //filter empty interfaces
                                    let link = '';
                                    let data_rate_rx = 0;
                                    let data_rate_tx = 0;

                                    for (let nl = 0; nl < nInterface['node_links'].length; nl++) {
                                        const nodelinks = nInterface['node_links'][nl]; 
                                        if ( nodelinks['state'] == 'CONNECTED'){
                                            if (nodelinks['node_1_uid'] != meshdevice['uid']){ //Top connection
                                                const node1 = mesh.find(el => el.uid === nodelinks['node_1_uid']);
                                                link = (link == '') ? link += node1['device_name'] : link += ',' + node1['device_name'];
                                                const intf = node1.node_interfaces.find(el => el.uid === nodelinks['node_interface_1_uid']);
                                                ifType += ' ' + intf['name'];
                                            }
                                            if (nodelinks['node_2_uid'] != meshdevice['uid']){ //Down connection
                                                const node1 = mesh.find(el => el.uid === nodelinks['node_2_uid']);
                                                link = (link == '') ? link += node1['device_name'] : link += ',' + node1['device_name'];
                                            }
                                            data_rate_rx = Math.round(nodelinks['cur_data_rate_rx'] / 1000);
                                            data_rate_tx = Math.round(nodelinks['cur_data_rate_tx'] / 1000);
                                        }
                                        await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.rx_rcpi', { val: Math.round(nodelinks['rx_rcpi']), ack: true });
                                        await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.cur_data_rate_rx', { val: data_rate_rx, ack: true });
                                        await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.cur_data_rate_tx', { val: data_rate_tx, ack: true });
                                    }
                                    await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.link', { val: link, ack: true });
                                }else{
                                    //Interface without links
                                    await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.link', { val: '', ack: true });
                                    await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.rx_rcpi', { val: 0, ack: true });
                                    await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.cur_data_rate_rx', { val: 0, ack: true });
                                    await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.cur_data_rate_tx', { val: 0, ack: true });
                                }
                                await this.setStateChangedAsync('fb-devices.' + hostName + '.' + ifNewName + '.type', { val: ifType, ack: true });
                            }
                        }else{ //host not in meshlist
                            for (const c in hostCh) {
                                this.log.debug('Host not in mesh list: ' + hostCh[c]._id);
                                //delete channel with number
                                if (Number.isInteger(parseInt(hostCh[c]._id.replace(`${this.namespace}.fb-devices.` + hostName + '.', '')))){
                                    const states = await this.getStatesAsync(hostCh[c]._id + '.*');
                                    if (states){                                
                                        for (const idS in states) {
                                            await this.delObjectAsync(idS);
                                            await this.delStateAsync(idS);
                                        }
                                    }
                                    await this.delObjectAsync(hostCh[c]._id);
                                }else{ //old channel 
                                    await this.setStateChangedAsync('fb-devices.' + hostName + '.meshstate', { val: false, ack: true });
                                    await this.setStateChangedAsync(hostCh[c]._id + '.cur_data_rate_rx', { val: 0, ack: true });
                                    await this.setStateChangedAsync(hostCh[c]._id + '.cur_data_rate_tx', { val: 0, ack: true });
                                    await this.setStateChangedAsync(hostCh[c]._id + '.rx_rcpi', { val: 0, ack: true });
                                    await this.setStateChangedAsync(hostCh[c]._id + '.link', { val: '', ack: true });
                                }
                            }
                        }
                        meshdevice = null;
                    }
                }
            }
        } catch (error) {
            this.log.error('getMeshInfo: ' + error.message);
            return false;
        }
    }

    async getWlBlInfo(){
        try {
            const hosts = this.hosts;
            const items = this.Fb.deviceList;
            //let wlCnt = 0;
            let blCnt = 0;
            const jsonWlRow = [];
            let htmlWlRow = this.HTML_GUEST;
            const jsonBlRow = [];
            let htmlBlRow = this.HTML_GUEST;

            for (let i = 0; i < items.length; i++) {
                if (this.enabled == false) break;
                //let deviceType = '-';
                const wl = this.config.whitelist.filter(x => x.white_macaddress == items[i]['MACAddress']);
                const wlFound = wl.length > 0 ? true : false;
                if (wlFound == false && items[i] != null){ //blacklist
                    //deviceType = 'blacklist';
                    if (items[i]['X_AVM-DE_Guest'] == false){
                        htmlBlRow += this.createHTMLTableRow([items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']]);
                        //jsonBlRow += this.createJSONTableRow(blCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress']]);
                        jsonBlRow.push ({'Hostname': items[i]['HostName'], 'IP-Address': items[i]['IPAddress'], 'MAC-Address': items[i]['MACAddress']});                        
                        blCnt += 1;
                    }
                } 
                if (wlFound == true ){
                    //deviceType = 'whitelist';
                    htmlWlRow += this.createHTMLTableRow([items[i]['HostName'], items[i]['IPAddress'], items[i]['MACAddress']]);
                    //jsonWlRow += this.createJSONTableRow(wlCnt, ['Hostname', items[i]['HostName'], 'IP-Address', items[i]['IPAddress'], 'MAC-Address', items[i]['MACAddress']]);
                    jsonWlRow.push ({'Hostname': items[i]['HostName'], 'IP-Address': items[i]['IPAddress'], 'MAC-Address': items[i]['MACAddress']});                        
                    //wlCnt += 1;
                }
                
                const host = hosts.filter(x => x.hnOrg == items[i]['HostName']); //find fb-device
                if (host && host.length > 0) {
                    const macs = host[0].mac.split(', ');
                    let count = 0;
                    for (let m = 0; m < macs.length; m++){
                        const wldevice = this.config.whitelist.filter(x => x.white_macaddress == macs[m]);
                        if (wldevice && wldevice.length > 0) count++; 
                    }
                    let hostName = items[i]['HostName'];
                    hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                    
                    if (count == macs.length){
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.whitelist', { val: true, ack: true });
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.blacklist', { val: false, ack: true });               
                    }else{
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.whitelist', { val: false, ack: true });
                        if (host[0]['guest'] == false){
                            await this.setStateChangedAsync('fb-devices.' + hostName + '.blacklist', { val: true, ack: true });
                        }               
                    }
                }
            }                
            //jsonWlRow += ']';
            //jsonBlRow += ']';
            htmlBlRow += this.HTML_END;
            htmlWlRow += this.HTML_END;
            await this.setStateChangedAsync('blacklist.count', { val: blCnt, ack: true });
            await this.setStateChangedAsync('blacklist.listHtml', { val: htmlBlRow, ack: true });
            await this.setStateChangedAsync('blacklist.listJson', { val: JSON.stringify(jsonBlRow), ack: true });
            
            await this.setStateChangedAsync('whitelist.json', { val: JSON.stringify(jsonWlRow), ack: true });
            await this.setStateChangedAsync('whitelist.html', { val: htmlWlRow, ack: true });
            await this.setStateChangedAsync('whitelist.count', { val: this.config.whitelist.length, ack: true });
            if (blCnt > 0) {
                if(this.config.compatibility == true) await this.setStateChangedAsync('blacklist', { val: true, ack: true });
                await this.setStateChangedAsync('blacklist.presence', { val: true, ack: true });
            }else {
                if(this.config.compatibility == true) await this.setStateChangedAsync('blacklist', { val: false, ack: true });
                await this.setStateChangedAsync('blacklist.presence', { val: false, ack: true });
            }
            this.log.debug('getWlBlInfo blCnt: '+ blCnt);
            //jsonWlRow = null;
            //jsonBlRow = null;
            htmlBlRow = null;
            htmlWlRow = null;
            return true;
        } catch (error) {
            this.errorHandler(error, 'getWlBlInfo');
            return false;            
        }
    }

    async getDeviceInfo(){
        try {
            const hosts = this.hosts;
            //analyse guests
            let guestCnt = 0;
            let guests = '';
            let activeCnt = 0;
            //let activeVpnCnt = 0;
            //let inactiveCnt = 0;
            let htmlRow = this.HTML_GUEST;
            let htmlFbDevices = this.HTML_FB;
            const jsonRow = [];
            const jsonFbDevices = [];
            const jsonFbDevActive = [];
            const jsonFbDevInactive = [];
            const jsonFbDevActiveVPN = [];
            let disabled = false;
            let vpn = false;

            if (!hosts) return false;
            
            //const items = hosts.filter(host => host.status == 'unchanged' || host.status == 'new');
            for (let i = 0; i < hosts.length; i++) {
                if (this.enabled == false) break;
                let deviceType = '-';
                if (hosts[i]['data'] != null){
                    if (hosts[i]['data']['X_AVM-DE_Guest'] == 1 && hosts[i]['active'] == 1){ //active guests
                        htmlRow += this.createHTMLTableRow([hosts[i]['hn'], hosts[i]['ip'], hosts[i]['mac']]); //guests table
                        jsonRow.push ({'Hostname': hosts[i]['hn'], 'IP-Address': hosts[i]['ip'], 'MAC-Address': hosts[i]['mac'], 'disabled': disabled});
                        guests += guests == '' ? hosts[i]['hn'] : ', ' + hosts[i]['hn'];
                        this.log.debug('getDeviceInfo active guest: ' + hosts[i]['hn'] + ' ' + hosts[i]['ip'] + ' ' + hosts[i]['mac']);
                        guestCnt += 1;
                    }    
                    vpn = hosts[i]['data']['X_AVM-DE_VPN'] === true ? true : false;
                    disabled = hosts[i]['data']['X_AVM-DE_Disallow'] === 1 ? true : false;
                    if (hosts[i]['data']['X_AVM-DE_Guest'] == 1){
                        deviceType = 'guest';
                    }
                }else{
                    disabled = null;
                    vpn = null;
                }
                if (hosts[i]['active'] == 1){ // active devices
                    jsonFbDevActive.push ({'Hostname': hosts[i]['hn'], 'IP-Address': hosts[i]['ip'], 'MAC-Address': hosts[i]['mac'], 'Active': hosts[i]['active'], 'Type': deviceType, 'Disabled': disabled});
                    activeCnt += 1;
                }else{
                    jsonFbDevInactive.push ({'Hostname': hosts[i]['hn'], 'IP-Address': hosts[i]['ip'], 'MAC-Address': hosts[i]['mac'], 'Active': hosts[i]['active'], 'Type': deviceType, 'Disabled': disabled});
                }
                
                if (vpn === true){ // active vpn devices
                    jsonFbDevActiveVPN.push ({'Hostname': hosts[i]['hn'], 'IP-Address': hosts[i]['ip'], 'MAC-Address': hosts[i]['mac'], 'VPN': vpn, 'Type': deviceType});
                }
                htmlFbDevices += this.createHTMLTableRow([hosts[i]['hn'], hosts[i]['ip'], hosts[i]['mac'], hosts[i]['active'], deviceType]);
                jsonFbDevices.push ({'Hostname': hosts[i]['hn'], 'IP-Address': hosts[i]['ip'], 'MAC-Address': hosts[i]['mac'], 'Active': hosts[i]['active'], 'Type': deviceType, 'Disabled': disabled});
                
                const hostName = hosts[i]['hn'];
                //if (hostName.includes('MyFRITZ!App')) this.log.info('hostname: ' + hostName + ' ' + hosts[i].active);
                //hostName = hostName.replace(this.FORBIDDEN_CHARS, '-');
                const mac = hosts[i]['mac'] != undefined ? hosts[i]['mac'] : '';
                const ip = hosts[i]['ip'] != undefined ? hosts[i]['ip'] : '';

                if (this.config.fbdevices === true && this.enabled == true){
                    if (hostName != '') {
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.macaddress', { val: mac, ack: true });
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.ipaddress', { val: ip, ack: true });
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.active', { val: hosts[i]['active'], ack: true });
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.interfacetype', { val: hosts[i]['interfaceType'], ack: true });
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.speed', { val: parseInt(hosts[i]['speed']), ack: true });
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.guest', { val: hosts[i]['guest'], ack: true });
                        await this.setStateChangedAsync('fb-devices.' + hostName + '.vpn', { val: vpn, ack: true });
                        if (hosts[i]['data'] != null) await this.setStateChangedAsync('fb-devices.' + hostName + '.disabled', { val: hosts[i]['data']['X_AVM-DE_Disallow'] == 0 ? false : true, ack: true });
                    }else{
                        this.log.debug('getDeviceInfo: hostname is empty -> mac: ' + mac);
                    }
                }
            }
            htmlRow += this.HTML_END;
            htmlFbDevices += this.HTML_END;

            if (this.config.fbdevices === true && this.enabled == true){
                await this.setStateChangedAsync('fb-devices.json', { val: JSON.stringify(jsonFbDevices), ack: true });
                await this.setStateChangedAsync('fb-devices.jsonActive', { val: JSON.stringify(jsonFbDevActive), ack: true });
                await this.setStateChangedAsync('fb-devices.jsonInactive', { val: JSON.stringify(jsonFbDevInactive), ack: true });
                await this.setStateChangedAsync('fb-devices.html', { val: htmlFbDevices, ack: true });
                await this.setStateChangedAsync('fb-devices.jsonActiveVPN', { val: JSON.stringify(jsonFbDevActiveVPN), ack: true });
            }
            if (this.config.guestinfo === true && this.enabled == true) {
                await this.setStateChangedAsync('guest.listHtml', { val: htmlRow, ack: true });
                await this.setStateChangedAsync('guest.listJson', { val: JSON.stringify(jsonRow), ack: true });
                await this.setStateChangedAsync('guest.presentGuests', { val: guests, ack: true });
                await this.setStateChangedAsync('guest.count', { val: guestCnt, ack: true });
                const val = guestCnt > 0 ? true : false;
                await this.setStateChangedAsync('guest.presence', { val: val, ack: true });
                if(this.config.compatibility == true) await this.setStateChangedAsync('guest', { val: val, ack: true });
            }
            this.log.debug('getDeviceInfo activeCnt: '+ activeCnt);
            return true;
        } catch (error) {
            this.errorHandler(error, 'getDeviceInfo');
            return false;
        }
    }

    async getActive(memberRow){
        const member = memberRow.familymember; 
        try {
            const hosts = this.hosts;      
            //const memberPath = memberRow.group == '' ? member : 'familyMembers.' + memberRow.group + '.' + member; 
            const mac = memberRow.macaddress;
            const ip = memberRow.ipaddress;
            const deviceName = memberRow.devicename;
            let active = false;
            let host = null;
            let mesg = this.suppressArr.filter(function(x){
                if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                    return x;
                }
            });
            if(this.Fb.GETPATH === true){
                if (hosts === null) return null;
                switch (memberRow.usage) {
                    case 'MAC':
                        if (mac != ''){
                            //host = hosts.filter(x => x.mac == mac);
                            host = hosts.filter(x => x.mac.includes(mac) === true);
                            if (host && host.length > 0){
                                active = host[0].active;
                                //this.log.info('getActive ' + host[0].hn + ' ' + host[0].mac + ' ' + host[0].active);
                            }else{
                                if (mesg[0].suppress === false){
                                    mesg = this.suppressArr.filter(function(x){
                                        if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ipaddress === memberRow.ip && x.hostname === memberRow.devicename){
                                            x.suppress = true;
                                            return x;
                                        }
                                    });
                                    throw new Warn('The configured mac-address for member ' + member + ' was not found in the fritzbox. Please insert a valid mac-address!');
                                }
                            }
                        }else{
                            if (mesg[0].suppress === false){
                                mesg = this.suppressArr.filter(function(x){
                                    if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                                        x.suppress = true;
                                        return x;
                                    }
                                });
                                throw new Warn('The configured mac-address for member ' + member + ' is empty. Please insert a valid mac-address!');
                            }
                        }
                        break;
                    case 'IP':
                        if (ip != ''){
                            //host = hosts.filter(x => x.ip == ip);
                            host = hosts.filter(x => x.ip.includes(ip) === true);
                            if (host && host.length > 0){
                                active = host[0].active; 
                                //this.log.info('getActive ' + host[0].hn + ' ' + host[0].ip + ' ' + host[0].active);
                            }else{
                                if (mesg[0].suppress === false){
                                    mesg = this.suppressArr.filter(function(x){
                                        if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                                            x.suppress = true;
                                            return x;
                                        }
                                    });
                                    throw new Warn('The configured mac-address for member ' + member + ' was not found in the fritzbox. Please insert a valid mac-address!');
                                }
                            }
                        }else{
                            if (mesg[0].suppress === false){
                                mesg = this.suppressArr.filter(function(x){
                                    if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                                        x.suppress = true;
                                        return x;
                                    }
                                });
                                throw new Warn('The configured ip-address for ' + member + ' is empty. Please insert a valid ip-address!');
                            }
                        }
                        break;
                    case 'Hostname':
                        if (deviceName != ''){
                            host = hosts.filter(x => x.hn == deviceName);
                            if (host && host.length > 0){
                                active = host[0].active; 
                                //this.log.info('getActive ' + host[0].hn + ' ' + host[0].mac + ' ' + host[0].active);
                            }else{
                                if (mesg[0].suppress === false){
                                    mesg = this.suppressArr.filter(function(x){
                                        if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                                            x.suppress = true;
                                            return x;
                                        }
                                    });
                                    throw Error('The configured hostname for member ' + member + ' was not found in the fritzbox. Please insert a valid hostname!');
                                }
                            }
                        }else{
                            if (mesg[0].suppress === false){
                                mesg = this.suppressArr.filter(function(x){
                                    if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                                        x.suppress = true;
                                        return x;
                                    }
                                });
                                throw Error('The configured hostname for ' + member + ' is empty. Please insert a valid hostname!');
                            }
                        }
                        break;            
                    default:
                        break;
                }
            }else{
                switch (memberRow.usage) {
                    case 'MAC':
                        if (mac != ''){
                            const soapResult = await this.Fb.soapAction('/upnp/control/hosts', 'urn:dslforum-org:service:' + 'Hosts:1', 'GetSpecificHostEntry', [[1, 'NewMACAddress', memberRow.macaddress]]);
                            if(soapResult) {
                                active = soapResult['NewActive'] == 1 ? true : false;
                            }
                        }else{
                            if (mesg[0].suppress === false){
                                mesg = this.suppressArr.filter(function(x){
                                    if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                                        x.suppress = true;
                                        return x;
                                    }
                                });
                                throw Warn('The configured mac-address for member ' + member + ' is empty. Please insert a valid mac-address!');
                            }
                        }
                        break;
                    case 'IP':
                        if (this.Fb.GETBYIP == true && ip != ''){
                            const soapResult = await this.Fb.soapAction('/upnp/control/hosts', 'urn:dslforum-org:service:' + 'Hosts:1', 'X_AVM-DE_GetSpecificHostEntryByIP', [[1, 'NewIPAddress', memberRow.ipaddress]]);
                            if(soapResult) active = soapResult['NewActive'] == 1 ? true : false;
                        }else{
                            if (memberRow.ipaddress == '') {
                                if (mesg[0].suppress === false){
                                    mesg = this.suppressArr.filter(function(x){
                                        if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                                            x.suppress = true;
                                            return x;
                                        }
                                    });
                                    throw Error('The configured ip-address for ' + member + ' is empty. Please insert a valid ip-address!');
                                }
                            }
                        }
                        break;
                    case 'Hostname':
                        if (mesg[0].suppress === false){
                            mesg = this.suppressArr.filter(function(x){
                                if (x.name ===  memberRow.familymember && x.mac === memberRow.macaddress && x.ip === memberRow.ipaddress && x.hostname === memberRow.devicename){
                                    x.suppress = true;
                                    return x;
                                }
                            });
                            throw Error('The feature hostname is not supported for ' + member + '!');
                        }
                        break;
                    default:
                        break;
                }
            }
            return active;
        } catch(error){
            if (error.name.includes('NoSuchEntryInArray')){
                this.errorHandler('Cannot find device in fritzbox', 'getActive ' + member + ': ');
            }else{
                this.errorHandler(error, 'getActive' + member + ': ');
            }
            return false;
        }
    }

    getHistoryTable(gthis, memb, memberPath, start, end){
        const cfg = this.config.history;
        return new Promise((resolve, reject) => {
            gthis.sendTo(cfg, 'getHistory', {
                id: `${gthis.namespace}` + '.' + memberPath,
                options:{
                    end:        end,
                    start:      start,
                    ignoreNull: true,
                    aggregate: 'onchange'
                }
            }, function (result1) {
                if (result1 == null) {
                    reject (Error('can not read history from ' + memb + ' ' + result1.error));
                }else{
                    const cntActualDay = result1.result.length;
                    gthis.log.debug('history cntActualDay: ' + cntActualDay);
                    gthis.sendTo(cfg, 'getHistory', {
                        id: `${gthis.namespace}` + '.' + memberPath,
                        options: {
                            end:        end,
                            count:      cntActualDay+1,
                            ignoreNull: true,
                            aggregate: 'onchange'
                        }
                    }, function (result) {
                        if (result == null) {
                            reject (Error('can not read history from ' + memb + ' ' + result.error));
                        }else{
                            resolve(result);
                        }
                    });
                }
            });
        });
    }

    async getHistoryData(member, start, end, limit) {
        return await this.sendToAsync('history.0', 'getHistory', {
            id: member,
            options: {
                end: end,
                start: start,
                returnNewestEntries: true,
                limit: limit,
                ignoreNull: true,
                aggregate: 'none'
            }
        });
    }
    
    sendToAsync(adapterNamespace, cmd, options) {
        return new Promise((resolve, reject) => {
            this.sendTo(adapterNamespace, cmd, options, (result) => {
                if (result.error) {
                    reject(null);
                } else {
                    resolve(result);
                }
            });
        });
    }
    

    async calcMemberAttributesNew(memberRow, index, newActive, dnow, presence){
        const member = memberRow.familymember; //name of member
        let memberPath = '';
        let historyPath = '';
        let dPoint = null;
        if (this.config.compatibility === true){
            memberPath = memberRow.group == '' ? member : 'familyMembers.' + memberRow.group + '.' + member;
            historyPath = memberRow.group == '' ? member : 'familyMembers.' + memberRow.group + '.' + member + '.presence';
            if (memberRow.group == ''){
                dPoint = await this.getObjectAsync(`${this.namespace}` + '.' + memberPath);
            }else{
                dPoint = await this.getObjectAsync(`${this.namespace}` + '.' + memberPath + '.presence');
            }
        } else {
            memberPath = memberRow.group == '' ? 'familyMembers.' + member : 'familyMembers.' + memberRow.group + '.' + member; 
            dPoint = await this.getObjectAsync(`${this.namespace}` + '.' + memberPath + '.presence');
            historyPath = memberRow.group == '' ? 'familyMembers.' + member + '.presence' : 'familyMembers.' + memberRow.group + '.' + member + '.presence';
        }
        await this.setStateChangedAsync(memberPath + '.presence', { val: newActive, ack: true });
        if ( memberRow.group== '' && this.config.compatibility === true) await this.setStateChangedAsync(memberPath, { val: newActive, ack: true });
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
        }else{
            presence.all = false;
            presence.oneAbsence = true;
            presence.absentCount += 1;
            if (presence.absentMembers == '') {
                presence.absentMembers += member;
            }else{
                presence.absentMembers += ', ' + member;
            }
        }
        presence.val = newActive;

        //History is alive and enabled
        if (this.config.history != '' && this.historyAlive.val === true){
            if (dPoint.common.custom != undefined && dPoint.common.custom[this.config.history].enabled == true){
                const memberID = `${this.namespace}` + '.' + historyPath;
                const filterTime = 1000 * this.config.delay; //in seconds
                const days = 21;
                //this.log.info('ID ' + memberID);
                //Startzeit für den aktuellen Tag festlegen
                const midnight = new Date();
                midnight.setHours(0, 0, 0, 0);
                const midnightTime = midnight.getTime(); //current date midnight
            
                //Startdate 21 Tage in die Vergangenheit legen -> Parameter days
                //Randbedingung: 21 Tage kein Statuswechsel
                const startDate = new Date(midnight); 
                startDate.setDate(startDate.getDate() - days);
                
                const currentTime = dnow.getTime(); //current date current time
                //const dtDay = Math.round((currentTime - midnightTime)); //in ms
                
                let pr = 0;
                let ab = 0;
                let htmlHistory = this.HTML_HISTORY;
                const jsonHistory = [];

                //history data of the current day
                //let histData = await getHistoryData(member, midnightTime, currentTime, 5000);
            
                /*if (!histData) {
                    log('history of family member is null', 'info');
                }*/
                
                //const limit = histData.result.length*24*60*60*1000/(currentTime-midnightTime)*days+500;
                //log('Limit: ' + limit, 'info');
                const currentVal = await this.getStateAsync(memberID);
                const histData = await this.getHistoryData(memberID, startDate.getTime(), currentTime, 5000);
                if (!histData) {
                    this.log.warn('history of family member is empty: ' + memberID, 'info');
                    //await this.setStateChangedAsync(memberPath + '.presence', { val: !valPresence, ack: true });
                    //await this._sleep(1000);
                    //await this.setStateChangedAsync(memberPath + '.presence', { val: valPresence, ack: true });
                }else{
                    const cntHistData = histData.result.length;
                    this.log.warn(memberID + ' cnt History:' + cntHistData);
                    let lastWert = null;
                    
                    //calculation of presence and absence since
                    let t1 = currentTime;
                    let v1 = currentVal;
                    const historyArr = [];
                    const historyArrFiltered = [];
                    
                    //Filtering short spikes
                    for (let ih = cntHistData-1; ih > -1; ih--) {
                        const t2 = new Date(histData.result[ih].ts).getTime();
                        const v2 = histData.result[ih].val;
                        const dt2 = Math.round(t1 - t2);
                        if (dt2 > filterTime || v2 === true) {
                            if (lastWert === null) lastWert = v2;
                            historyArr.unshift(histData.result[ih]);
                        }
                        t1 = t2;
                    }

                    //Filtering double values
                    v1 = null;
                    for (let ih = 0; ih < historyArr.length; ih++) {
                        const v2 = historyArr[ih].val;
                        if (v1 !== v2) {
                            historyArrFiltered.unshift(historyArr[ih]);
                            v1 = v2;
                        } 
                    }

                    lastWert = historyArrFiltered[0].val;
                    this.log.warn('last Wert ' + new Date( historyArrFiltered[0].ts) + ' ' +  lastWert);
                    await this.setStateChangedAsync(memberPath + '.presenceFiltered', { val: lastWert, ack: true });

                    //calculation of absence and presence this day
                    t1 = currentTime;
                    for(let ih = 0; ih < historyArrFiltered.length; ih++){
                        const t2 = new Date(historyArrFiltered[ih].ts).getTime();
                        this.log.warn('Date: ' + new Date(t2));
                        htmlHistory += this.createHTMLTableRow([(historyArrFiltered[ih].val ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>'), dateFormat(t2, this.config.dateformat)]);
                        jsonHistory.push ({'Active': historyArrFiltered[ih].val, 'Date': dateFormat(new Date(historyArrFiltered[ih].ts), this.config.dateformat)});                        

                        const wert = historyArrFiltered[ih].val;
                        const dt = Math.round(t1 - t2);
                        lastWert = wert;
                        if (t2 < midnightTime) break;
                        if (wert === true){
                            pr = pr + dt;
                            this.log.warn(ih + ' pr: ' + Math.round(pr/60/1000));
                        }
                        if (wert === false){
                            ab = ab + dt;
                            this.log.warn(ih + 'ab: ' + Math.round(ab/60/1000));
                        }
                        t1 = t2;
                    }
                    const dt =  Math.round(t1 - midnightTime);
                    const dtSum =  Math.round(currentTime - midnightTime);
                    lastWert === true ? pr = pr + dt : ab = ab + dt;
                    this.log.warn('pr: ' + Math.round(pr/60/1000));
                    this.log.warn('ab: ' + Math.round(ab/60/1000));
                    this.log.warn('day sum: ' + Math.round(dtSum/60/1000));
            
                    //calculation of comming and going and since
                    t1 = currentTime;
                    let flagBreak = false;
                    lastWert = currentVal.val;
                    let comming = null;
                    let going = null;

                    //const jsonHistory = [];
                    const valChanged = false;
                    for(let ih = 0; ih < historyArrFiltered.length; ih++){
                        //this.log.warn('val: ' + historyArr[ih].val + ' ' + new Date(historyArr[ih].ts));
                        //jsonHistory.push ({'Active': historyArr[ih].val, 'Date': dateFormat(hTimhistoryArr[ih].ts, this.config.dateformat)});                        
                        const t2 = new Date(historyArrFiltered[ih].ts).getTime();
                        const wert = historyArrFiltered[ih].val;
                        this.log.warn('Filtered: ' + new Date(t2) + ' ' + wert);
                        const dt = Math.round(currentTime - t2);
                        if (wert === true && comming === null) {
                            comming = t2;
                            await this.setStateChangedAsync(memberPath + '.comming', { val: new Date(comming).toString(), ack: true });
                            if (flagBreak === false){
                                await this.setStateChangedAsync(memberPath + '.present.since', { val: Math.round(dt/60/1000), ack: true });
                                await this.setStateChangedAsync(memberPath + '.absent.since', { val: Math.round(0/60/1000), ack: true });        
                                flagBreak = true;
                            }
                            this.log.warn('comming: ' + new Date(comming), 'info');
                        }
                        if (wert === false && going === null) {
                            going = t2;
                            await this.setStateChangedAsync(memberPath + '.going', { val: new Date(going).toString(), ack: true });
                            if (flagBreak === false){
                                await this.setStateChangedAsync(memberPath + '.absent.since', { val: Math.round(dt/60/1000), ack: true });        
                                await this.setStateChangedAsync(memberPath + '.present.since', { val: Math.round(0/60/1000), ack: true });
                                flagBreak = true;
                            }   
                            this.log.warn('going: ' + new Date(going), 'info');
                        }
                        t1 = t2;
                    }
                    if (!valChanged) {
                        if(lastWert){
                            comming = new Date(historyArrFiltered[0].ts).getTime();
                            going = new Date(historyArrFiltered[0].ts).getTime();
                        }else{
                            comming = new Date(historyArrFiltered[0].ts).getTime();
                            going = new Date(historyArrFiltered[0].ts).getTime();
                        }
                    }
                    await this.setStateChangedAsync(memberPath + '.present.sum_day', { val: Math.round(pr/60/1000), ack: true });
                    await this.setStateChangedAsync(memberPath + '.absent.sum_day', { val: Math.round(ab/60/1000), ack: true });
                    htmlHistory += this.HTML_END;
                    await this.setStateChangedAsync(memberPath + '.history', { val: JSON.stringify(jsonHistory), ack: true });
                    await this.setStateChangedAsync(memberPath + '.historyHtml', { val: htmlHistory, ack: true });

                    this.jsonTab.push ({'Name': member, 'Active': newActive, 'Kommt': dateFormat(comming, this.config.dateformat), 'Geht': dateFormat(going, this.config.dateformat)});                        
                    this.htmlTab += this.createHTMLTableRow([member, (newActive ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>'), dateFormat(comming, this.config.dateformat), dateFormat(going, this.config.dateformat)]);
                }
            }
        }
    }

    async calcMemberAttributes(memberRow, index, newActive, dnow, presence){
        try {
            const member = memberRow.familymember;
            let memberPath = '';
            let historyPath = '';
            let dPoint = null;
            if (this.config.compatibility === true){
                memberPath = memberRow.group == '' ? member : 'familyMembers.' + memberRow.group + '.' + member;
                historyPath = memberRow.group == '' ? member : 'familyMembers.' + memberRow.group + '.' + member + '.presence';
                if (memberRow.group == ''){
                    dPoint = await this.getObjectAsync(`${this.namespace}` + '.' + memberPath);
                }else{
                    dPoint = await this.getObjectAsync(`${this.namespace}` + '.' + memberPath + '.presence');
                }
            } else {
                memberPath = memberRow.group == '' ? 'familyMembers.' + member : 'familyMembers.' + memberRow.group + '.' + member; 
                dPoint = await this.getObjectAsync(`${this.namespace}` + '.' + memberPath + '.presence');
                historyPath = memberRow.group == '' ? 'familyMembers.' + member + '.presence' : 'familyMembers.' + memberRow.group + '.' + member + '.presence';
            }

            const midnight = new Date(); //Date of day change 
            midnight.setHours(0,0,0);
            
            //let memberActive = false; 
            let comming = null;
            let going = null;
            const curVal = await this.getStateAsync(memberPath + '.presence');
            if (curVal && curVal.val == null) curVal.val = false; 
            if (curVal && curVal.val != null){
                //calculation of '.since'
                const diff = Math.round((dnow - new Date(curVal.lc))/1000/60);
                if (curVal.val == true){
                    await this.setStateChangedAsync(memberPath + '.present.since', { val: diff, ack: true });
                    await this.setStateChangedAsync(memberPath + '.absent.since', { val: 0, ack: true });
                }
                if (curVal.val == false){
                    await this.setStateChangedAsync(memberPath + '.absent.since', { val: diff, ack: true });
                    await this.setStateChangedAsync(memberPath + '.present.since', { val: 0, ack: true });
                }
                //analyse member presence
                
                await this.setStateChangedAsync(memberPath + '.presence', { val: newActive, ack: true });
                //this.setStateIfNotEqual(memberPath + '.presence', { val: newActive, ack: true });
                if ( memberRow.group== '' && this.config.compatibility === true) await this.setStateChangedAsync(memberPath, { val: newActive, ack: true });
                //if ( memberRow.group== '' && this.config.compatibility === true) this.setStateIfNotEqual(memberPath, { val: newActive, ack: true });

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
                        await this.setStateChangedAsync(memberPath + '.comming', { val: dnow.toString(), ack: true });
                        comming = dnow;
                    }
                    if (curVal.val == null){
                        this.log.warn('Member value is null! Value set to true');
                        if (memberPath.group == '' && this.config.compatibility === true) await this.setStateChangedAsync(memberPath, { val: true, ack: true });
                        await this.setStateChangedAsync(memberPath + '.presence', { val: true, ack: true });
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
                        await this.setStateChangedAsync(memberPath + '.going', { val: dnow.toString(), ack: true });
                        going = dnow;
                    }
                    if (curVal.val == null){
                        this.log.warn('Member value is null! Value set to false');
                        if (memberPath.group == '' && this.config.compatibility === true) await this.setStateChangedAsync(memberPath, { val: false, ack: true });
                        await this.setStateChangedAsync(memberPath + '.presence', { val: false, ack: true });
                    }
                }
                presence.val = newActive;
                const comming1 = await this.getStateAsync(memberPath + '.comming');
                comming = comming !== null ? comming.toString() : comming1.val;
                const going1 = await this.getStateAsync(memberPath + '.going');
                going = going !== null ? going.toString() : going1.val;
                if (comming1.val == null) {
                    comming = new Date(curVal.lc);
                    await this.setStateChangedAsync(memberPath + '.comming', { val: comming.toString(), ack: true });
                }
                if (going1.val == null) {
                    going = new Date(curVal.lc);
                    await this.setStateChangedAsync(memberPath + '.going', { val: going.toString(), ack: true });
                }
                this.jsonTab.push ({'Name': member, 'Active': newActive, 'Kommt': dateFormat(comming, this.config.dateformat), 'Geht': dateFormat(going, this.config.dateformat)});                        
                //this.jsonTab += this.createJSONTableRow(index, ['Name', member, 'Active', newActive, 'Kommt', dateFormat(comming, this.config.dateformat), 'Geht', dateFormat(going, this.config.dateformat)]);
                this.htmlTab += this.createHTMLTableRow([member, (newActive ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>'), dateFormat(comming, this.config.dateformat), dateFormat(going, this.config.dateformat)]);
            }else{
                throw Error('object ' + member + ' does not exist!');
            }

            if (presence != null){
                //get history data
                let present = Math.round((dnow - midnight)/1000/60); //time from midnight to now = max. present time
                let absent = 0;

                const end = new Date().getTime();
                const start = midnight.getTime();
                let lastVal = null;
                let lastValCheck = false;
                const memb = member;
                if (this.config.history != '' && this.historyAlive.val === true){
                    if (dPoint.common.custom != undefined && dPoint.common.custom[this.config.history].enabled == true){
                        try {
                            const result = await this.getHistoryTable(this, memb, historyPath, start, end);
                            if (!result) throw Error('Can not get history items of member ' + memb);
                            let htmlHistory = this.HTML_HISTORY;
                            const jsonHistory = [];
                            let bfirstFalse = false;
                            let firstFalse = midnight;
                            this.log.debug('history ' + memb + ' cntHistory: ' + result.result.length);
                            //let cnt = 0;
                            
                            let i = 0;
                            for (let iv = 0; iv < result.result.length; iv++) {
                                if (this.enabled == false) break;
                                if (result.result[0].ts < result.result[result.result.length-1].ts){ //Workaround for history sorting behaviour
                                    i = iv;
                                }else{
                                    i = result.result.length - iv - 1;
                                }
                                if (result.result[i].val != null ){
                                    //const hdate = dateFormat(new Date(result.result[i].ts), this.config.dateformat);
                                    const hTime = new Date(result.result[i].ts);
                                    htmlHistory += this.createHTMLTableRow([(result.result[i].val ? '<div class="mdui-green-bg mdui-state mdui-card">anwesend</div>' : '<div class="mdui-red-bg mdui-state mdui-card">abwesend</div>'), dateFormat(hTime, this.config.dateformat)]);
                                    //jsonHistory += this.createJSONTableRow(cnt, ['Active', result.result[i].val, 'Date', dateFormat(hTime, this.config.dateformat)]);
                                    jsonHistory.push ({'Active': result.result[i].val, 'Date': dateFormat(hTime, this.config.dateformat)});                        
                                    //cnt += 1;
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
                                        //this.log.debug('history lastVal ' + memb + ' ' + result.result[i].val + ' time: ' + hTime);
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
                            
                            await this.setStateChangedAsync(memberPath + '.present.sum_day', { val: present, ack: true });
                            await this.setStateChangedAsync(memberPath + '.absent.sum_day', { val: absent, ack: true });

                            htmlHistory += this.HTML_END;
                            await this.setStateChangedAsync(memberPath + '.history', { val: JSON.stringify(jsonHistory), ack: true });
                            await this.setStateChangedAsync(memberPath + '.historyHtml', { val: htmlHistory, ack: true });

                        } catch (err) {
                            throw Error(err);
                        }
                    }else{
                        this.log.info('History from ' + memb + ' not enabled');
                    }
                }else{//history enabled
                    await this.setStateChangedAsync(memberPath + '.history', { val: 'disabled', ack: true });
                    await this.setStateChangedAsync(memberPath + '.historyHtml', { val: 'disabled', ack: true });
                    await this.setStateChangedAsync(memberPath + '.present.sum_day', { val: -1, ack: true });
                    await this.setStateChangedAsync(memberPath + '.absent.sum_day', { val: -1, ack: true });
                }
            }else{
                this.log.warn('can not get active state from member ' + member);
            }
            return presence;
        } catch (error) {
            this.errorHandler(error, 'calcMemberAttributes: ');
        }
    }
     
    async getMemberPropertiesFromFBDevices(memberRow) {
        try {
            const hosts = this.hosts;
            if (!hosts) return null;
      
            const { familymember, group, usage, devicename, ipaddress, macaddress } = memberRow;
            const memberPath = this.config.compatibility
                ? (group === '' ? familymember : `familyMembers.${group}.${familymember}`)
                : (group === '' ? `familyMembers.${familymember}` : `familyMembers.${group}.${familymember}`);
      
            const items = hosts.filter(item => {
                switch (usage) {
                    case 'Hostname':
                        return item.hn === devicename;
                    case 'IP':
                        return item.ip === ipaddress;
                    default:
                        return item.mac === macaddress;
                }
            });
            
            //speed property
            const speed = items.length > 0
                ? (items.find(item => item.active === '1') || items[0]).speed
                : 0;
      
            await this.setStateChangedAsync(`${memberPath}.speed`, { val: parseInt(speed), ack: true });

            //link property
            const link = await this.findStateInStructure(`${this.namespace}.fb-devices.${devicename}`, 'link');
            await this.setStateChangedAsync(`${memberPath}.link`, { val: link, ack: true });

        } catch (error) {
            this.errorHandler(error, 'getMemberPropertiesFromFBDevices: ');
        }
    }
    
    // Funktion zum Suchen des Zustands in der Objektstruktur
    async findStateInStructure(startObjekt, gesuchterZustandsname) {
        try {
            const device = startObjekt.replace('.familyMembers', '');
            const pattern = device + '.*';
            // Durchlaufe alle States im System, die zum Adapter gehören
            const states = await this.getStatesAsync(pattern);
            for (const id in states) {
                if (Object.prototype.hasOwnProperty.call(states, id)) {
                    const stateObj = states[id];
                    if (id.includes(gesuchterZustandsname) && stateObj.val){
                        return stateObj.val;
                    }
                }
            }
            return '';
        } catch (error) {
            this.errorHandler(error, 'findStateInStructure: ');
        }
    }

    async checkPresence(trigger){
        try {
            const dnow = new Date(); //Actual date and time for comparison
            if(this.Fb.GETPATH === true){ //use of device list for presence if supported
                await this.Fb.getDeviceList();
                await this.getAllFbObjects();
            }

            let membersFiltered = this.config.familymembers.filter(x => x.enabled == true); //only enabled members
            const memberValues = []; //array for temporary values -> for filtering
            const filteringNeeded = [];
            //get presence from all members
            for (let m = 0; m < membersFiltered.length; m++) {
                const group = membersFiltered[m].group;
                const memberRow = membersFiltered[m]; //Row from family members table
                const member = memberRow.familymember;
                let memberPath = '';
                if (this.config.compatibility === true){
                    memberPath = group == '' ? '' : 'familyMembers.' + group + '.'; 
                } else {
                    memberPath = group == '' ? 'familyMembers.' : 'familyMembers.' + group + '.'; 
                }
                const activeOld = this.getAdapterState(memberPath + member + '.presence');
                const activeNew = await this.getActive(memberRow);
                if (activeNew === false && activeOld != activeNew && memberRow.usefilter === true){
                    filteringNeeded.push({oldVal: activeOld, newVal: activeNew, member: member, memberPath: memberPath, memberRow: memberRow, group: group});
                }
                memberValues.push({oldVal: activeOld, newVal: activeNew, member: member, memberPath: memberPath, memberRow: memberRow, group: group});
            }
            if (filteringNeeded.length > 0){
                await this._sleep(this.config.delay * 1000);
                if(this.Fb.GETPATH === true){
                    await this.Fb.getDeviceList();
                    await this.getAllFbObjects();
                }
                for (let f = 0; f < filteringNeeded.length; f++) { //loop over family members which are false
                    if (this.enabled == false) break; //cancel if disabled over unload
                    const memberRow = filteringNeeded[f].memberRow; //Row from family members table
                    const activeNew = await this.getActive(memberRow);
                    const ind = memberValues.findIndex(x => x.member == memberRow.familymember && JSON.stringify(x.memberRow) == JSON.stringify(memberRow));
                    if(activeNew === false) memberValues[ind].newVal = activeNew;
                }
            }
            
            let familyGroups = this.removeDuplicates(membersFiltered); //family groups without duplicates
            for (let g = 0; g < familyGroups.length; g++) {
                if (this.enabled == false) break; //cancel if disabled over unload
                const group = familyGroups[g];
                const groupMembers = memberValues.filter(x => x.group == group);
                let memberPath = '';
                if (this.config.compatibility === true){
                    memberPath = group == '' ? '' : 'familyMembers.' + group + '.'; 
                } else {
                    memberPath = group == '' ? 'familyMembers.' : 'familyMembers.' + group + '.'; 
                }

                this.jsonTab = [];
                this.htmlTab = this.HTML;
                const presence = {val: null, all: true, one: false, presentMembers: '', absentMembers: '', allAbsence: true, oneAbsence: false,  presentCount: 0, absentCount: 0};
                for (let k = 0; k < groupMembers.length; k++) { //loop over enabled family members
                    if (this.enabled == false) break; //cancel if disabled over unload
                    const memberRow = groupMembers[k].memberRow; //Row from family members table
                    if (this.Fb.GETBYMAC == true){ //member enabled in configuration settings and service is supported
                        const newActive = groupMembers[k].newVal;
                        if (trigger === true) this.log.info('triggerPresence: State ' + memberRow.familymember + ' ' + newActive);
                        if (newActive != null && !this.config.newfilter) await this.calcMemberAttributes(memberRow, k, newActive, dnow, presence);
                        if (newActive != null && this.config.newfilter) await this.calcMemberAttributesNew(memberRow, k, newActive, dnow, presence);
                        if (newActive != null) this.getMemberPropertiesFromFBDevices(memberRow);
                    }
                }
                if (this.enabled == false) break; //cancel if disabled over unload

                //group states
                this.htmlTab += this.HTML_END;
                await this.setStateChangedAsync(memberPath + 'json', { val: JSON.stringify(this.jsonTab), ack: true });
                await this.setStateChangedAsync(memberPath + 'html', { val: this.htmlTab, ack: true });
                await this.setStateChangedAsync(memberPath + 'presenceAll', { val: presence.all, ack: true });
                await this.setStateChangedAsync(memberPath + 'absenceAll', { val: presence.allAbsence, ack: true });
                await this.setStateChangedAsync(memberPath + 'presence', { val: presence.one, ack: true });
                await this.setStateChangedAsync(memberPath + 'absence', { val: presence.oneAbsence, ack: true });
                await this.setStateChangedAsync(memberPath + 'absentMembers', { val: presence.absentMembers, ack: true });
                await this.setStateChangedAsync(memberPath + 'presentMembers', { val: presence.presentMembers, ack: true });
                await this.setStateChangedAsync(memberPath + 'presentCount', { val: presence.presentCount, ack: true });
                await this.setStateChangedAsync(memberPath + 'absentCount', { val: presence.absentCount, ack: true });
            }

            membersFiltered = null;
            familyGroups = null;
            return true;
        } catch (error) {
            this.errorHandler(error, 'checkPresence: '); 
        }
    }

    removeDuplicates(array) {
        const a = [];
        array.map(x => {
            if (!a.includes(x.group)) {
                a.push(x.group);
            }});
        return a;
    }  
}

//process.on('SIGINT', function() {
//console.log('process_on');
//});

//process.on('uncaughtException', function(err) {
//console.log('process_on: ' + err.toString());
//});

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new FbCheckpresence(options);
} else {
    // otherwise start the instance directly
    new FbCheckpresence();
}