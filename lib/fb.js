'use strict';

const xml2jsP = require('xml2js');
const https = require('https');
const axios = require('axios');
const crypto = require('crypto');
const qr = require('qr-image');

class exceptionFb extends Error {
    constructor(name, message) {
        super(message);
        this.name = name;
        this.toString = function() {
            return this.name + ': ' + this.message;
        };
    }
}

class exceptionSoapCommand extends Error {
    constructor(name, message) {
        super(message);
        this.name = name;
        this.toString = function() {
            return this.name + ': ' + this.message;
        };
    }
}

class exceptionFbSendWithRetry extends Error {
    constructor(message) {
        super(message);
        this.name = 'exceptionFbSendWithRetry';
        this.toString = function() {
            return this.name + ': ' + this.message;
        };
    }
}

class Fb {
    constructor(deviceInfo, ssl, adapter) {
        this._urn = 'urn:dslforum-org:service:';
        this._MAX_RETRY = 3;
        this.adapter = adapter;
        this.modelName = null;
        this.version = null;
        this._sslPort = null;
        this.host = deviceInfo.host;
        this.port = 49000;
        this.timeout = 6000;
        this._auth = {
            uid: deviceInfo.uid,
            pwd: deviceInfo.pwd,
            sn: null,
            auth: null,
            realm: 'F!Box SOAP-Auth',
            chCount : 0
        };
        this.agent = null;
        this.source = axios.CancelToken.source();
        this.ssl = ssl;
        this.serviceUrl = 'http://' + this.host + ':' + this.port + '/tr64desc.xml';
        this.services = null;
        this.currentRetry = 0;
        this.deviceList = null;
        this.meshList = null;
        this.accessRights = {'C': 'none', 'P': 'none', 'D': 'none', 'N': 'none', 'H': 'none', 'A': 'none', '-': 'readwrite'};
        this.accessType = null; //DSL, Ethernet, X_AVM-DE_Fiber, X_AVMDE_UMTS, X_AVM-DE_Cable, X_AVM-DE_LTE
        this.ssid = null;
        this.beaconType = null;
        this.connection = null; //1.WANPPPConnection.1, 
        //http://fritz.box:49000/tr64desc.xml
        this.suportedServices = [];
        this.GETPATH = false;
        this.GETMESHPATH = false;
        this.GETBYMAC = false;
        this.GETBYIP = false;
        this.GETPORT = false;
        this.GETEXTIP = false;
        this.GETEXTIPBYIP = false;
        this.GETACCESSTYPE = false;
        this.SETENABLE = false;
        this.WLAN3INFO = false;
        this.WLAN3GETSECKEY = false;
        this.DEVINFO = false;
        this.GETWANACCESSBYIP = false;
        this.DISALLOWWANACCESSBYIP = false;
        this.REBOOT = false;
        this.RECONNECT = false;
        this.USERRIGHTS = false;
        this.CONNECTION = false;
    }

    static init (deviceInfo, ssl, adapter) {
        return (async function () {
            try {                
                const x = new Fb(deviceInfo, ssl, adapter);
                await x._getSSLPort();
                if (x._sslPort && x.ssl) {
                    x.agent = new https.Agent({
                        rejectUnauthorized: false
                        //key: fs.readFileSync('/usr/local/share/ca-certificates/boxcert.crt'),
                        //cert: fs.readFileSync('/usr/local/share/ca-certificates/boxcert.crt'),
                        //requestCert: false,
                        //maxVersion: 'TLSv1.2',
                        //minVersion: 'TLSv1.2'
                    });
                }
                await x._getAccessRights();
                const res = await x._getServices();
                if (res === true) await x._checkServices();
                if (x.GETACCESSTYPE && x.GETACCESSTYPE === true) await x._getWANAccessType();
                if (x.CONNECTION && x.CONNECTION === true) await x._getDefaultConnection();
                return x;
            } catch (error) {
                throw new exceptionSoapCommand('Fb init', error);
            }
        }());
    }

    async _getDefaultConnection(){
        try {
            let soapResult = {data: null};
            await this.soapAction('/upnp/control/layer3forwarding', 'urn:dslforum-org:service:' + 'Layer3Forwarding:1', 'GetDefaultConnectionService', null, soapResult);
            if (soapResult && soapResult.data){
                this.connection = soapResult.data['NewDefaultConnectionService'];
                soapResult.data = null;
                soapResult = null;
                return;
            }else{
                throw new exceptionSoapCommand('getDefaultConnection', 'Cannot get default connection from Fritzbox! ' + JSON.stringify(soapResult.data));
            }
        }
        catch (error) {    
            throw new exceptionFb('getDefaultConnection', error.name + ' ' + error.message);
        }
    }

    async _getAccessRights(){
        try {         
            let soapResult = {data: null};
            await this.soapAction('/upnp/control/lanconfigsecurity', 'urn:dslforum-org:service:' + 'LANConfigSecurity:1', 'X_AVM-DE_GetCurrentUser', null, soapResult);
            if (soapResult && soapResult.data){
                const result = await xml2jsP.parseStringPromise(soapResult.data['NewX_AVM-DE_CurrentUserRights'], {explicitArray: false});
                if (result && result.rights && result.rights.path){
                    for(let i=0; i< result.rights.path.length; i++){
                        switch (result.rights.path[i]) {
                            case 'BoxAdmin': this.accessRights.C = result.rights.access[i];
                                break;
                            case 'Phone': this.accessRights.P = result.rights.access[i];
                                break;
                            case 'Dial': this.accessRights.D = result.rights.access[i];
                                break;
                            case 'NAS': this.accessRights.N = result.rights.access[i];
                                break;
                            case 'HomeAuto': this.accessRights.H = result.rights.access[i];
                                break;
                            case 'App': this.accessRights.A = result.rights.access[i];
                                break;
                            default: this.accessRights.none = '-';
                        }
                    }
                    soapResult.data = null;
                    soapResult = null;
                    return '';
                }else{
                    soapResult.data = null;
                    soapResult = null;
                    throw new Error('Cannot parse soap result! ' );
                }
            }else{
                soapResult.data = null;
                soapResult = null;
                throw new exceptionSoapCommand('getAccessRights', 'Cannot get access rights from Fritzbox!');
            }
        } catch (error) {
            if (error.message.includes('authentification failure')) this.adapter.log.warn('please check the user or password!');
            return error.message;
        }
    }

    async _getServices(){
        try {
            this.source = axios.CancelToken.source();
            const response = await axios({
                url: this.serviceUrl,
                method: 'get',
                timeout: this.timeout,
                responseType: 'json',
                responseEncoding: 'utf8',
                cancelToken: this.source.token,
            });
            this.source = null;
            if (response && response.status == 200){
                this.services = await xml2jsP.parseStringPromise(response.data, {explicitArray: false});
                this.modelName = this.services.root.device.modelName;
                if (this.services.root.systemVersion != null){
                    this.version = this.services.root.systemVersion.Display;
                }else{
                    this.version = 'not defined';
                }
                return true;
            }else{
                throw Error('Can not read services! Status: ' + JSON.stringify(response));                
            }
        } catch (error) {
            //this.errorHandler(this.adapter, error, 'getServices: ');
            this.services = null;
            //return false;
            throw new exceptionFb('getServices', error.name + ' ' + error.message);
            //throw 'getServices: ' + ' ' + error;
        }
    }

    _getService(device, serviceId){
        const device1 = device;
        const dlength = device1.length;
        if (device1 && device1.length == undefined){
            const length = device1['serviceList']['service'].length;
            for (let s=0; s < length; s++){
                const service = device1['serviceList']['service'][s];
                if(service.serviceId.includes(serviceId)){
                    return service;
                } 
            }
            if (device1.deviceList && device1.deviceList.device) {
                return this._getService(device1.deviceList.device, serviceId);
            }
        }else{
            for (let d=0; d < dlength; d++){
                const length = device1[d]['serviceList']['service'].length;
                const dev = device1[d]['serviceList']['service'];
                for (let s=0; s < length; s++){
                    const service = dev[s];
                    if(service.serviceId.includes(serviceId)){
                        return service;
                    } 
                }
                if (device1[d].deviceList && device1[d].deviceList.device) {
                    return this._getService(device1[d]['deviceList']['device'], serviceId);
                }
            }
        }
        return null;
    }

    async _checkServices(){
        try {
            this.GETPATH = await this._chkService('X_AVM-DE_GetHostListPath', 'Hosts1', 'X_AVM-DE_GetHostListPath', ['C','A','P']);
            this.GETMESHPATH = await this._chkService('X_AVM-DE_GetMeshListPath', 'Hosts1', 'X_AVM-DE_GetMeshListPath', ['C','A','P']);
            this.GETBYMAC = await this._chkService('GetSpecificHostEntry', 'Hosts1', 'GetSpecificHostEntry',  ['-']);
            this.GETBYIP = await this._chkService('X_AVM-DE_GetSpecificHostEntryByIP', 'Hosts1', 'X_AVM-DE_GetSpecificHostEntryByIP', ['C','A','P']);
            this.GETPORT = await this._chkService('GetSecurityPort', 'DeviceInfo1', 'GetSecurityPort', ['-']);
            this.GETACCESSTYPE = await this._chkService('GetCommonLinkProperties', 'WANCommonInterfaceConfig1', 'GetCommonLinkProperties', ['C']);
            this.GETEXTIP = await this._chkService('GetInfo', 'WANPPPConnection1', 'GetInfo', ['C']);
            this.GETEXTIPBYIP = await this._chkService('GetInfo', 'WANIPConnection1', 'GetInfo', ['C']);
            this.SETENABLE = await this._chkService('SetEnable', 'WLANConfiguration3', 'SetEnable', ['A']);
            this.WLAN3INFO = await this._chkService('GetInfo', 'WLANConfiguration3', 'WLANConfiguration3-GetInfo', ['C','A','P']);
            this.WLAN3GETSECKEY = await this._chkService('GetSecurityKeys', 'WLANConfiguration3', 'WLANConfiguration3-GetSecurityKeys', ['A']);
            this.DEVINFO = await this._chkService('GetInfo', 'DeviceInfo1', 'DeviceInfo1-GetInfo', ['C']);
            this.DISALLOWWANACCESSBYIP = await this._chkService('DisallowWANAccessByIP', 'X_AVM-DE_HostFilter', 'DisallowWANAccessByIP', ['C','A']);
            this.GETWANACCESSBYIP = await this._chkService('GetWANAccessByIP', 'X_AVM-DE_HostFilter', 'GetWANAccessByIP', ['C','A']);
            this.REBOOT = await this._chkService('Reboot', 'DeviceConfig1', 'Reboot', ['C']);
            this.RECONNECT = await this._chkService('ForceTermination', 'WANPPPConnection1', 'ForceTermination', ['C']);
            this.USERRIGHTS = await this._chkService('X_AVM-DE_GetCurrentUser', 'LANConfigSecurity1', 'X_AVM-DE_GetCurrentUser', ['C','A','P','N','H']);            
            this.CONNECTION = await this._chkService('GetDefaultConnectionService', 'Layer3Forwarding1', 'GetDefaultConnectionService', ['C']);            
        } catch (error) {
            //this.errorHandler(this.adapter, error, 'checkServices: ');
            //throw 'checkServices:' + ' ' + error;
            throw new exceptionFb('checkServices', error.name + ' ' + error.message);
        }
    }

    async _chkService(action, serviceId, dp, neededAccessRights){
        try {
            if(this.services === null) throw Error('can not get services!');
            const service = this._getService(this.services['root']['device'], serviceId);
            if (service) {
                const nurl = 'http://' + this.host + ':' + this.port + service.SCPDURL + '';
                this.source = axios.CancelToken.source();
                const response = await axios({
                    url: nurl,
                    method: 'get',
                    timeout: this.timeout,
                    responseType: 'json',
                    responseEncoding: 'utf8',
                    cancelToken: this.source.token,
                });
                this.source = null;
                if (response && response.status == 200){
                    const found = JSON.stringify(response.data).search(action);
                    if (found == -1){
                        this.suportedServices.push({id: dp, name: serviceId + '-' + action, enabled: false});
                        return false;
                        //throw Error('service ' + serviceId + '-' + action + ' is not supported! Feature is deactivated!');
                    }else{
                        let supported = false;
                        for(let i = 0; i < neededAccessRights.length; i++){                            
                            const right = this.accessRights[neededAccessRights[i]];
                            if (right != 'none') {
                                supported = true;
                                break;
                            }
                        }
                        this.suportedServices.push({id: dp, name: serviceId + '-' + action, enabled: supported});
                        if (supported === true){
                            
                            //this.adapter.log.info('service ' + serviceId + '-' + action + ' is supported');
                            //this.adapter.setState('info.' + dp, { val: true, ack: true });
                        }else{

                            //throw Error('service ' + serviceId + '-' + action + ' is supported but access right not ok! Feature is deactivated!');
                        }
                        return supported;
                    }
                }else{
                    this.adapter.log.info('service ' + serviceId + '-' + action + ' is not supported! Can not find action! Feature is deactivated! ');
                    return false;
                    //throw Error('service ' + serviceId + '-' + action + ' is not supported! Can not find action! Feature is deactivated! ' + JSON.stringify(response));                        
                }
            }else{
                this.adapter.log.info('service ' + serviceId + '-' + action + ' is not supported! Can not find service file! Feature is deactivated');
                //throw Error('service ' + serviceId + '-' + action + ' is not supported! Can not find service file! Feature is deactivated');
                return false;                        
            }
        } catch (error) {
            throw new exceptionFb('checkService', error.name + ' ' + error.message);
        }
    }

    async _getSSLPort(){
        try {
            let soapResult = {data: null};
            await this.soapAction('/upnp/control/deviceinfo', 'urn:dslforum-org:service:' + 'DeviceInfo:1', 'GetSecurityPort', null, soapResult);
            if (soapResult && soapResult.data){
                //this.adapter.log.debug('ssl-port ' + soapResult.data['NewSecurityPort']);
                const sslPort = parseInt(soapResult.data['NewSecurityPort']);
                if (typeof sslPort === 'number' && isFinite(sslPort)) {
                    this._sslPort = sslPort;
                    soapResult.data = null;
                    soapResult = null;
                    return(sslPort);
                } else {
                    throw new Error('Cannot get ssl port! Wrong type. ' + JSON.stringify(soapResult.data));
                }
            }else{
                throw new exceptionSoapCommand('GetSecurityPort', 'Cannot get ssl port from Fritzbox! ' + JSON.stringify(soapResult.data));
            }
        }
        catch (error) {    
            //this.errorHandler(this.adapter, error, 'getSSLPort: ');
            this._sslPort = null;
            if(error.message.includes('timeout')){
                this.adapter.log.warn('The user could have been blocked from the fritzbox due to authentification problems! Please stop the adapter and reboot the fritzbox. Then start and try again.');
                throw new exceptionFb('getSSLPort', error.name + ' ' + error.message);
            }else{
                throw new exceptionFb('getSSLPort', error.name + ' ' + error.message);
            }
        }
    }

    async _sendWithRetry(url, timeout, start, message) {
        this.currentRetry = start;

        try {
            this.source = axios.CancelToken.source();
            const response = await axios({
                url: url,
                method: 'get',
                timeout: timeout,
                responseType: 'text',
                responseEncoding: 'utf8',
                httpsAgent: this.agent,
                cancelToken: this.source.token,
            });
            this.source = null;
            return response;
        } catch (error) {
            if (error.message && error.message == 'Request canceled!') return false;
            if (this.currentRetry < this._MAX_RETRY) {
                this.currentRetry++;
                //this.adapter.log.debug(message + ': Retrying ' + this.currentRetry);
                return await this._sendWithRetry(url, timeout, this.currentRetry, message);
            } else {
                this.currentRetry = 0;
                throw new exceptionFbSendWithRetry(error);
            }   
        }
    }

    async getDeviceList(){
        try {
            //get device list
            let soapResult = {data: null};
            await this.soapAction('/upnp/control/hosts', 'urn:dslforum-org:service:' + 'Hosts:1', 'X_AVM-DE_GetHostListPath', null, soapResult);
            if (soapResult && soapResult.data){
                let url = null;
                if (this._sslPort && this.ssl){
                    url = 'https://' + this.host + ':' + this._sslPort + soapResult.data['NewX_AVM-DE_HostListPath'];
                }else{
                    url = 'http://' + this.host + ':' + this.port + soapResult.data['NewX_AVM-DE_HostListPath'];
                }
                //let response = await this._sendWithRetry(url, 10000, 3, 'getDeviceList');
                this.source = axios.CancelToken.source();
                let response = await axios({
                    url: url,
                    method: 'get',
                    timeout: this.timeout + 4000,
                    responseType: 'text',
                    responseEncoding: 'utf8',
                    httpsAgent: this.agent,
                    cancelToken: this.source.token,
                });
                this.source = null;
                url = null;
                soapResult.data = null;
                soapResult = null;
                let data = response.data;
                if (response && response.status == 200 && data) {
                    let deviceList = await xml2jsP.parseStringPromise(data, {explicitArray: false});
                    data = null;
                    response.status = null;
                    response.data = null;
                    response = null;
                    if (deviceList) {
                        this.deviceList = deviceList['List']['Item'];
                        deviceList = null;
                        return true;
                    }else{
                        throw new Error('Cannot parse response.data ' + JSON.stringify(response.data));
                    }
                }else{
                    if (response === false) {
                        response.status = null;
                        response.data = null;
                        response = null;
                        return false;
                    }
                    throw new exceptionFb('exceptionHostlist', 'Cannot get hostlist');
                }                
            }else{
                throw new exceptionSoapCommand('X_AVM-DE_GetHostListPath', 'Cannot get hostlist path from Fritzbox!');
            }
        } catch (error) {
            //this.errorHandler(this.adapter, error, 'getDeviceList: ');
            throw new exceptionSoapCommand('getDeviceList',error);
            //return null;            
        }
    }

    async getMeshList(){
        try {
            let soapResult = {data: null};
            await this.soapAction('/upnp/control/hosts', 'urn:dslforum-org:service:' + 'Hosts:1', 'X_AVM-DE_GetMeshListPath', null, soapResult);
            if (soapResult && soapResult.data){
                let url = null;
                if (this._sslPort && this.ssl){
                    url = 'https://' + this.host + ':' + this._sslPort + soapResult.data['NewX_AVM-DE_MeshListPath'];
                }else{
                    url = 'http://' + this.host + ':' + this.port + soapResult.data['NewX_AVM-DE_MeshListPath'];
                }
                soapResult.data = null;
                soapResult = null;
                let response = null;
                //response = await this._sendWithRetry(url, 2000, 3, 'getMeshList');
                this.source = axios.CancelToken.source();
                response = await axios({
                    url: url,
                    method: 'get',
                    timeout: this.timeout + 8000,
                    responseType: 'text',
                    responseEncoding: 'utf8',
                    httpsAgent: this.agent,
                    cancelToken: this.source.token,
                });
                this.source = null;
                if (response != null && response.status == 200 && response.data) {
                    this.meshList = response.data['nodes'];
                    response.status = null;
                    response.data = null;
                    response = null;
                    return true;
                }else{
                    if (response === false) {
                        response.status = null;
                        response.data = null;
                        response = null;
                        return false;
                    }
                    throw new Error('Cannot get mesh list');
                }
            }else{
                soapResult.data = null;
                soapResult = null;
                throw new exceptionSoapCommand('X_AVM-DE_GetMeshListPath', 'Cannot get mesh list path');
            }
        } catch (error) {
            //if (error.message && error.message == 'Request canceled!') return null;
            //this.errorHandler(this.adapter, error, 'getMeshList: ');
            throw new exceptionSoapCommand('getMeshList', error);
            //return null;
        }
    }


    async _getWANAccessType(){
        try {
            const soapResult = {data: null};
            await this.soapAction('/upnp/control/wancommonifconfig1', 'urn:dslforum-org:service:' + 'WANCommonInterfaceConfig:1', 'GetCommonLinkProperties', null, soapResult);
            if (soapResult && soapResult.data){
                this.accessType = soapResult.data['NewWANAccessType'];
            }else{
                throw new exceptionSoapCommand('GetCommonLinkProperties', 'Cannot get wan access type from Fritzbox!');               
            }            
        } catch (error) {
            throw new exceptionFb('getWANAccessType', error.name + ' ' + error.message);
        }        
    }

    //Get external IP address
    async getExtIp(){
        try {
            let soapResult = {data: null};
            if(this.GETEXTIP && this.GETEXTIP == true){
                if (this.connection == '1.WANPPPConnection.1'){
                    await this.soapAction('/upnp/control/wanpppconn1', 'urn:dslforum-org:service:' + 'WANPPPConnection:1', 'GetInfo', null, soapResult);
                }else{
                    await this.soapAction('/upnp/control/wanipconnection1', 'urn:dslforum-org:service:' + 'WANIPConnection:1', 'GetInfo', null, soapResult);
                }
                if (soapResult && soapResult.data){
                    const ip = soapResult.data['NewExternalIPAddress'];
                    soapResult.data = null;
                    soapResult = null;
                    return ip; 
                }else{
                    const mesg = soapResult.data == null ? '' : soapResult.data; 
                    throw new exceptionSoapCommand('GetInfo WANConnection', 'Cannot get external ip address ' + JSON.stringify(mesg));                        
                }
            }
        } catch (error) {
            this.adapter.log.warn('getExtIp: ', error.name + ' ' + error.message);
            return '';
        }
    }

    //Get status of guest wlan 
    async getGuestWlan(){
        try {
            let soapResult = {data: null};
            if (this.WLAN3INFO && this.WLAN3INFO == true){
                await this.soapAction('/upnp/control/wlanconfig3', 'urn:dslforum-org:service:' + 'WLANConfiguration:3', 'GetInfo', null, soapResult);
                if (soapResult && soapResult.data){
                    const wlanStatus = soapResult.data['NewEnable'] == 1 ? true : false;
                    this.ssid = soapResult.data['NewSSID'];
                    this.beaconType = soapResult.data['NewBeaconType'];
                    soapResult.data = null;
                    soapResult = null;
                    return wlanStatus;
                }else{
                    throw new exceptionSoapCommand('GetInfo WLANConfiguration', 'Cannot get status of guest wlan ' + JSON.stringify(soapResult.data));                 
                }
            }
        } catch (error) {
            //throw new exceptionFb('getGuestWlan', error.name + ' ' + error.message);
            this.adapter.log.warn('getGuestWlan ' + error.name + ' ' + error.message);
            return;
            //throw new Error(error);
        }
    }

    //Get status of guest wlan 
    async getGuestQR(){
        try {
            let soapResult2 = {data: null};
            if (this.WLAN3GETSECKEY && this.WLAN3GETSECKEY === true){
                await this.soapAction('/upnp/control/wlanconfig3', 'urn:dslforum-org:service:' + 'WLANConfiguration:3', 'GetSecurityKeys', null, soapResult2);
                if (soapResult2 && soapResult2.data){
                    let password = soapResult2.data['NewKeyPassphrase'];
                    password = password.replace(/[\\";:,]/g, '\\$&');
                    const SSID = this.ssid.replace(/[\\";:,]/g, '\\$&');
                    let WPA = null; //this.beaconType == '11i' ? 'WPA2' : this.beaconType;
                    switch (this.beaconType) {
                        case 'None':
                            WPA = 'nopass';
                            break;
                        case 'Basic':
                            WPA = 'WEP';
                            break;
                        case 'WPA':
                            WPA = 'WPA';
                            break;
                        case '11i':
                            WPA = 'WPA';                            
                            break;
                        case 'WPAand11i':
                            WPA = 'WPA';                            
                            break;
                        case 'WPA3':
                            WPA = 'WPA';                            
                            break;
                        case '11iandWPA3':
                            WPA = 'WPA';                            
                            break;
                        case 'OWE':
                            WPA = 'WPA';                            
                            break;
                        case 'OWETrans':
                            WPA = 'WPA';                            
                            break;
                        default:
                            WPA = 'nopass';
                            break;
                    }
                    const qrcode = 'WIFI:T:' + WPA + ';P:' + password + ';S:' + SSID + ';;';
                    let svg = qr.imageSync(qrcode, { type: 'svg' });
                    svg = svg.replace('<path ', '<path fill="' + this.adapter.config.qrcodecolor + '" ');
                    //svg.pipe(require('fs').createWriteStream('/tmp/qr.png', svg));
                    //this.adapter.writeFileAsync('vis.0','/main/qr.png', svg);
                    soapResult2.data = null;
                    soapResult2 = null;
                    return svg;
                }else{
                    soapResult2.data = null;
                    soapResult2 = null;
                    throw new exceptionSoapCommand('getGuestQR', 'Cannot get datamatrix code of guest wlan ' + JSON.stringify(soapResult2.data));                 
                }
            }
        } catch (error) {
            this.adapter.log.warn('getGuestQR ' + error.name + ' ' + error.message);
            return;
        }
    }

    async getWanAccess(ipaddress){
        try {
            const soapResult = {data: null};
            await this.soapAction('/upnp/control/x_hostfilter', 'urn:dslforum-org:service:' + 'X_AVM-DE_HostFilter:1', 'GetWANAccessByIP', [[1, 'NewIPv4Address', ipaddress.val]], soapResult);
            if (soapResult && soapResult.data){
                const wanAccessStatus = soapResult.data['NewDisallow'] == 1 ? true : false;
                return wanAccessStatus;
            }else{
                throw new exceptionSoapCommand('getWanAccess', 'Cannot get wan access status ' + JSON.stringify(soapResult.data));                        
            }
        } catch (error) {
            this.adapter.log.warn('getWanAccess: ' + error.name + ' ' + error.message);
            return null;
            //throw new exceptionFb('getWanAccess', error.name + ' ' + error.message);
        }
    }

    //connection check
    async connectionCheck() {
        try {
            const soapResult = {data: null};
            await this.soapAction('/upnp/control/hosts', 'urn:dslforum-org:service:' + 'Hosts:1', 'GetHostNumberOfEntries', null, soapResult);
            if (soapResult && soapResult.data){
                return true;
            }else{
                return false;
                //throw new exceptionSoapCommand('cannot connect to fritzbox!');
            }
        } catch (error) {
            //this.errorHandler(this.adapter, error, 'connectionCheck: ');
            return false;
        }
    }

    // Login
    _calcAuthDigest(uid, pwd, realm, sn) {
        let MD5 = crypto.createHash('md5');
        MD5.update(uid + ':' + realm + ':' + pwd);
        const secret = MD5.digest('hex');
        MD5 = crypto.createHash('md5');
        MD5.update(secret + ':' + sn);
        return MD5.digest('hex');
    }

    exitRequest(){
        this.source && this.source.cancel(
            'request canceled!'
        );        
    }

    // Soap query
    async soapAction(url, serviceType, action, vars, soapResult) {
        const service = serviceType.replace(this._urn, '');
        try {
            let head = '';
            if (this._auth.uid) { // Content Level Authentication 
                if (this._auth.auth) {
                    head = '<s:Header>'+'<h:ClientAuth xmlns:h="http://soap-authentication.org/digest/2001/10/"' +
                        's:mustUnderstand="1">' +
                        '<Nonce>' + this._auth.sn + '</Nonce>' +
                        '<Auth>' + this._auth.auth + '</Auth>' +
                        '<UserID>' + this._auth.uid + '</UserID>' +
                        '<Realm>' + this._auth.realm + '</Realm>' +
                        '</h:ClientAuth>'+'</s:Header>';
                } else { // First Auth
                    head = ' <s:Header>'+'<h:InitChallenge xmlns:h="http://soap-authentication.org/digest/2001/10/"' +
                        's:mustUnderstand="1">' +
                        '<UserID>' + this._auth.uid + '</UserID>' +
                        '</h:InitChallenge>'+'</s:Header>';
                }
            }
            let body = '<?xml version="1.0" encoding="utf-8"?>' +
                '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' + head + '<s:Body>' + '<u:' + action + ' xmlns:u="' + serviceType + '">';
            //insert parameters 
            if (vars != null){
                vars.forEach(function(item) {
                    body += '<' + item[1] + '>';
                    body += item[2];
                    body += '</' + item[1] + '>';
                });
            }
            body = body + '</u:' + action + '>'+'</s:Body>'+'</s:Envelope>';
            let port = 0;
            let proto = '';
            if (this._sslPort && this._auth.auth && this.ssl) {
                port = this._sslPort;
                proto = 'https://';
            } else {
                proto = 'http://';
                port = this.port;
            }
            const uri = proto + this.host + ':' + port + url + '';
            
            this.source = axios.CancelToken.source();
            let response = await axios(uri,{
                method: 'post',
                data: body,
                timeout: this.timeout,
                proxy: false,
                responseType: 'text',
                httpsAgent: this.agent,
                headers: {
                    'SoapAction': serviceType + '#' + action,
                    'Content-Type': 'text/xml;charset=UTF-8'
                },
                cancelToken: this.source.token,
            });
            this.source = null;
            //agent = null;
            if (response.status == 200) {
                let result = await xml2jsP.parseStringPromise(response.data, {explicitArray: false});
                const env = result['s:Envelope'];
                result = null;
                if (env['s:Header']) {
                    const header = env['s:Header'];
                    if (header['h:Challenge']) {
                        const ch = header['h:Challenge'];
                        if (this._auth.chCount >= 2) {
                            this._auth.chCount = 0;
                            this._auth.auth = null;
                            response.data = null;
                            throw new exceptionSoapCommand('authentification failure', 'Wrong user or password');
                        } else {
                            this._auth.sn = ch.Nonce;
                            this._auth.realm = ch.Realm;
                            this._auth.auth = this._calcAuthDigest(this._auth.uid, this._auth.pwd, this._auth.realm, this._auth.sn);
                            this._auth.chCount++;
                            // Repeat request
                            response.data = null;
                            await this.soapAction(url, serviceType, action, vars, soapResult);
                            return; //response2;
                        }
                    } else if (header['h:NextChallenge']) {
                        const nx = header['h:NextChallenge'];
                        //this._auth.auth = nx.Nonce;
                        this._auth.sn = nx.Nonce;
                        this._auth.realm = nx.Realm;
                        this._auth.auth = this._calcAuthDigest(this._auth.uid, this._auth.pwd, this._auth.realm, this._auth.sn);
                        this._auth.chCount = 0;
                    }
                }
                if (env['s:Body']) {
                    const body = env['s:Body'];
                    if (body['u:' + action + 'Response']) {
                        soapResult.data = body['u:' + action + 'Response'];
                        response = null;
                        return;
                    } else if (body['s:Fault']) {
                        response.data = null;
                        throw new exceptionSoapCommand('Fault', body['s:Fault']);
                    }
                }
            }else{ //response status different to 200
                const mes = JSON.stringify(response.data);
                response.data = null;
                throw new exceptionSoapCommand('negative response', mes);
            }
        } catch (error) {
            if (axios.isCancel(error)) {
                throw new exceptionSoapCommand(service + ' ' + action, error.message);
            }
            if (error.response) {
                // The request was made and the server responded with a status code that falls out of the range of 2xx
                const errResult = await xml2jsP.parseStringPromise(error.response.data, {explicitArray: false});
                const errMsg = errResult['s:Envelope']['s:Body']['s:Fault']['detail']['UPnPError'];
                throw new exceptionSoapCommand(service + ' ' + action, errMsg.errorDescription);
            } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js                
                throw new exceptionSoapCommand(service + ' ' + action, error.message);
            } else {
                if (error.message && error.message == 'Request canceled!') {
                    throw new exceptionSoapCommand(service + ' ' + action, error.message);
                }
                // Something happened in setting up the request that triggered an Error
                throw new exceptionSoapCommand(service + ' ' + action, error.name + ' ' + error.message);
            }
        }
    }
}

exports.Fb = Fb;