'use strict';

const xml2jsP = require('xml2js');
const https = require('https');
const axios = require('axios');
const crypto = require('crypto');

let gthis = null;
const CancelToken = axios.CancelToken;
let cancel;
const urn = 'urn:dslforum-org:service:';

class Fb {
    constructor(deviceInfo, that) {
        this.that = that;
        gthis = that;
        this._sslPort = deviceInfo.sslPort;
        this.host = deviceInfo.host;
        this.port = deviceInfo.port;
        this._auth = {
            uid: deviceInfo.uid,
            pwd: deviceInfo.pwd,
            sn: null,
            auth: null,
            realm: 'F!Box SOAP-Auth',
            chCount : 0
        };
        this.serviceUrl = 'http://' + this.host + ':' + this.port + '/tr64desc.xml';
        this.services = null;
    }

    static init (deviceInfo, that) {
        return (async function () {
            const x = new Fb(deviceInfo, that);
            const res = await x._getServices();
            if (res === true) await x._getSSLPort();
            return x;
        }());
    }

    async _getServices(){
        try {
            const response = await axios({
                url: this.serviceUrl,
                method: 'get',
                timeout: 10000,
                responseType: 'json',
                responseEncoding: 'utf8',
                cancelToken: new CancelToken(function executor(c) {
                    cancel = c; // An executor function receives a cancel function as a parameter
                })
            });
            if (response && response.status == 200){
                this.services = await xml2jsP.parseStringPromise(response.data, {explicitArray: false});
                gthis.log.debug('services loaded successfully' + JSON.stringify(this.services));
                return true;
            }else{
                throw ('Can not read services! Status: ' + JSON.stringify(response));                
            }
        } catch (err) {
            gthis.log.error('getServices: ' + JSON.stringify(err));
            this.services = null;
            return false;
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

    async chkService(action, serviceId, dp){
        try {
            if(this.services === null) throw('can not get services!');
            const service = this._getService(this.services['root']['device'], serviceId);
            if (service) {
                const nurl = 'http://' + this.host + ':' + this.port + service.SCPDURL + '';
                const response = await axios({
                    url: nurl,
                    method: 'get',
                    timeout: 10000,
                    responseType: 'json',
                    responseEncoding: 'utf8',
                    cancelToken: new CancelToken(function executor(c) {
                        // An executor function receives a cancel function as a parameter
                        cancel = c;
                    })
                });

                if (response && response.status == 200){
                    const found = JSON.stringify(response.data).search(action);
                    if (found == -1){
                        throw('service ' + serviceId + '-' + action + ' is not supported! Feature is deactivated!');
                    }else{
                        gthis.log.info('service ' + serviceId + '-' + action + ' is supported');
                        gthis.setState('info.' + dp, { val: true, ack: true });
                        return true;
                    }
                }else{
                    throw ('service ' + serviceId + '-' + action + ' is not supported! Can not find action! Feature is deactivated! ' + JSON.stringify(response));                        
                }
            }else{
                throw ('service ' + serviceId + '-' + action + ' is not supported! Can not find service file! Feature is deactivated');                        
            }
        } catch (err) {
            gthis.setState('info.' + dp, { val: false, ack: true });
            gthis.log.warn('chkService: ' + JSON.stringify(err));
            return false;               
        }
    }

    async _getSSLPort() {
        try {
            const result = await this.soapAction(this, '/upnp/control/deviceinfo', 'urn:dslforum-org:service:DeviceInfo:1', 'GetSecurityPort', null);
            if (result && result.result == true){
                gthis.log.debug('ssl-port ' + JSON.stringify(result));
                const sslPort = parseInt(result.resultData['NewSecurityPort']);
                if (typeof sslPort === 'number' && isFinite(sslPort)) {
                    this._sslPort = sslPort;
                    return(sslPort);
                } else {
                    throw ('Can not read ssl port ' + JSON.stringify(result));                        
                }
            }else{
                throw ('Can not read ssl port ' + JSON.stringify(result));                        
            }
        }
        catch (err) {    
            gthis.log.error('getSSLPort: ' + JSON.stringify(err));
            this._sslPort = null;
            return null;
        }
    }

    async getDeviceList(){
        try {
            //get device list
            const hostPath = await this.soapAction(this, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetHostListPath', null);
            if (hostPath && hostPath.result == true){
                const url = 'http://' + this.host + ':' + this.port + hostPath.resultData['NewX_AVM-DE_HostListPath'];
                //gthis.log.info('Devicelist ' + url);
                const response = await axios({url: url,
                    method: 'get',
                    timeout: 10000,
                    responseType: 'json',
                    responseEncoding: 'utf8',
                    cancelToken: new CancelToken(function executor(c) {
                        // An executor function receives a cancel function as a parameter
                        cancel = c;
                    })
                });
                if (response.status == 200) {
                    //gthis.log.info('getDeviceList ' + JSON.stringify(response.data));
                    const deviceList = await xml2jsP.parseStringPromise(response.data, {explicitArray: false});
                    //gthis.log.info(JSON.stringify(deviceList));
                    gthis.log.debug('getDeviceList: ' + JSON.stringify(deviceList['List']['Item']));
                    gthis.setState('devices', { val: deviceList['List']['Item'].length, ack: true });
                    return deviceList['List']['Item'];
                }else{
                    throw ('Can not read hostlist path ' + JSON.stringify(hostPath));                        
                }                
            }else{
                throw ('Can not read hostlist path');                        
            }
        } catch (err) {
            gthis.log.error('getDeviceList: ' + JSON.stringify(err));
            return null;            
        }
    }

    async getMeshList(){
        try {
            //get device list
            const meshPath = await this.soapAction(this, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetMeshListPath', null);
            /*if (!meshPath) {
                gthis.log.info('getMeshList 2');
                meshPath = await this.soapAction(this, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetMeshListPath', null);
            }*/
            if (meshPath && meshPath.result == true){
                const url = 'http://' + this.host + ':' + this.port + meshPath.resultData['NewX_AVM-DE_MeshListPath'];
                //gthis.log.info('Mesh ' + url);
                const response = await axios({
                    url: url,
                    method: 'get',
                    timeout: 15000,
                    responseType: 'json',
                    responseEncoding: 'utf8',
                    cancelToken: new CancelToken(function executor(c) {
                        // An executor function receives a cancel function as a parameter
                        cancel = c;
                    })
                });
                if (response && response.status == 200 && response.data) {
                    //gthis.log.info('mesh' + JSON.stringify(response.data));
                    gthis.log.debug('getMeshList2: ' + JSON.stringify(response.data['nodes']));
                    return (response.data['nodes']);
                }else{
                    throw ('Can not read meshlist path ' + JSON.stringify(meshPath));                        
                }
            }else{
                throw ('Can not read meshlist path ' + JSON.stringify(meshPath));                        
            }
        } catch (err) {
            gthis.log.error('getMeshList: ' + JSON.stringify(err));
            return null;
        }
    }

    //Get external IP address
    async getExtIp(){
        try {
            let extIp = await this.soapAction(this, '/upnp/control/wanpppconn1', 'urn:dslforum-org:service:WANPPPConnection:1', 'GetInfo', null, true); //.then(function(extIp){
            if (extIp && extIp.result == true){
                gthis.log.debug('external IP1: ' + JSON.stringify(extIp));
                const extIpOld = await gthis.getStateAsync('info.extIp');
                if (extIpOld.val != extIp.resultData['NewExternalIPAddress'] ) gthis.setState('info.extIp', { val: extIp.resultData['NewExternalIPAddress'], ack: true });
                return extIp.resultData['NewExternalIPAddress']; 
            }else{
                extIp = await this.soapAction(this, '/upnp/control/wanipconnection1', 'urn:dslforum-org:service:WANIPConnection:1', 'GetInfo', null, true); //.then(function(extIp){
                if (extIp && extIp.result == true){
                    gthis.log.debug('external IP2: ' + JSON.stringify(extIp));
                    const extIpOld = await gthis.getStateAsync('info.extIp');
                    if (extIpOld.val != extIp.resultData['NewExternalIPAddress'] ) gthis.setState('info.extIp', { val: extIp.resultData['NewExternalIPAddress'], ack: true });
                    return extIp.resultData['NewExternalIPAddress'];
                }else{
                    throw('Can not read external ip address ' + JSON.stringify(extIp));                        
                }
            }
        } catch (err) {
            gthis.log.error('getExtIp: ' + JSON.stringify(err));
            return null;
        }
    }

    //Get status of guest wlan 
    async getGuestWlan(id){
        try {
            const guestwlan = await this.soapAction(this, '/upnp/control/wlanconfig3', urn + 'WLANConfiguration:3', 'GetInfo', null); //.then(function(guestwlan){
            if (guestwlan && guestwlan['status'] == 200 && guestwlan['result'] == true) {
                gthis.log.debug('getGuestWlan: ' + JSON.stringify(guestwlan));
                const wlanStatus = guestwlan['resultData']['NewEnable'] == 1 ? true : false;
                gthis.setState(id, { val: wlanStatus, ack: true });
                return wlanStatus;
            }else{
                throw ('Can not read status of guest wlan ' + JSON.stringify(guestwlan));                    
            }
        } catch (err) {
            gthis.log.error('getGuestWlan: ' + JSON.stringify(err));
            return null;        
        }
    }

    async getWanAccess(ipaddress, id){
        try {
            const wanAccess = await this.soapAction(this, '/upnp/control/x_hostfilter', urn + 'X_AVM-DE_HostFilter:1', 'GetWANAccessByIP', [[1, 'NewIPv4Address', ipaddress.val]]);
            if (wanAccess && wanAccess['status'] == 200 && wanAccess['result'] == true) {
                gthis.log.debug('getWanAccess: ' + JSON.stringify(wanAccess));
                const wanAccessStatus = wanAccess['resultData']['NewDisallow'] == 1 ? true : false;
                gthis.setState(id, { val: wanAccessStatus, ack: true });
                return wanAccessStatus;
            }else{
                throw ('Can not read wan access status ' + JSON.stringify(wanAccess));                        
            }
        } catch (err) {
            gthis.log.error('getWanAccess: ' + JSON.stringify(err));
            return false;
        }
    }

    //connection check
    async connectionCheck() {
        try {
            const info = await this.soapAction(this, '/upnp/control/deviceinfo', 'urn:dslforum-org:service:DeviceInfo:1', 'GetInfo', null); //.then(function(info){
            if (info && info.status == 200){
                gthis.setState('info.connection', { val: true, ack: true });
                gthis.setState('info.lastUpdate', { val: new Date(), ack: true });
                return true;
            }else{
                gthis.setState('info.connection', { val: false, ack: true });
                throw('can not connect to fritzbox!');
            }
        } catch (err) {
            gthis.log.warn('connectionCheck: ' + JSON.stringify(err));
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
        cancel();
    }

    // Soap query
    async soapAction(device, url, serviceType, action, vars, suppressMsg = false) {
        //return new Promise((resolve, reject) => {
        try {
            let res = {'status': null, 'data': null, 'result': false, 'resultData': null, 'errNo':0 ,'errorMsg': ''};
            let head = '';
            if (device._auth.uid) { // Content Level Authentication 
                if (device._auth.auth) {
                    head = '<s:Header>'+'<h:ClientAuth xmlns:h="http://soap-authentication.org/digest/2001/10/"' +
                        's:mustUnderstand="1">' +
                        '<Nonce>' + device._auth.sn + '</Nonce>' +
                        '<Auth>' + device._auth.auth + '</Auth>' +
                        '<UserID>' + device._auth.uid + '</UserID>' +
                        '<Realm>' + device._auth.realm + '</Realm>' +
                        '</h:ClientAuth>'+'</s:Header>';
                } else { // First Auth
                    head = ' <s:Header>'+'<h:InitChallenge xmlns:h="http://soap-authentication.org/digest/2001/10/"' +
                        's:mustUnderstand="1">' +
                        '<UserID>' + device._auth.uid + '</UserID>' +
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
            //gthis.log.info('action ' + action + ' -> body ' + JSON.stringify(body));
            let port = 0;
            let proto = '';
            let agentOptions = null;
            if (device._sslPort && device._auth.auth) {
                port = device._sslPort;
                proto = 'https://';
                agentOptions = new https.Agent({
                    rejectUnauthorized: false
                });
            } else {
                proto = 'http://';
                port = device.port;
            }
            const uri = proto + device.host + ':' + port + url + '';
            const that = this; //this speichern

            const response = await axios(uri,{
                method: 'post',
                data: body,
                timeout: 10000,
                proxy: false,
                responseType: 'text',
                httpsAgent: agentOptions,
                headers: {
                    'SoapAction': serviceType + '#' + action,
                    'Content-Type': 'text/xml;charset=UTF-8'
                },
                cancelToken: new CancelToken(function executor(c) {
                    // An executor function receives a cancel function as a parameter
                    cancel = c;
                })
            }); 
            
            if (response.status == 200) {
                const result = await xml2jsP.parseStringPromise(response.data, {explicitArray: false});
                const env = result['s:Envelope'];
                if (env['s:Header']) {
                    const header = env['s:Header'];
                    if (header['h:Challenge']) {
                        const ch = header['h:Challenge'];
                        if (device._auth.chCount > 2) {
                            throw('authentification failure! Wrong user or password');
                            //res = {'status': response.status, 'result': false, 'resultData': response.data, 'errNo':1 ,'errorMsg': 'authentification failure! Wrong user or password'};
                            //if (suppressMsg == false) gthis.log.error('soapAction ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
                            //return res;
                        } else {
                            device._auth.sn = ch.Nonce;
                            device._auth.realm = ch.Realm;
                            device._auth.auth = device._calcAuthDigest(device._auth.uid, device._auth.pwd, device._auth.realm, device._auth.sn);
                            device._auth.chCount++;
                            // Repeat request
                            const response = await that.soapAction(device, url, serviceType, action, vars);
                            return response;
                        }
                    } else if (header['h:NextChallenge']) {
                        const nx = header['h:NextChallenge'];
                        //device._auth.auth = nx.Nonce;
                        device._auth.sn = nx.Nonce;
                        device._auth.realm = nx.Realm;
                        device._auth.auth = device._calcAuthDigest(device._auth.uid, device._auth.pwd, device._auth.realm, device._auth.sn);
                        device._auth.chCount = 0;
                    }
                }
                if (env['s:Body']) {
                    const body = env['s:Body'];
                    if (body['u:' + action + 'Response']) {
                        res = {'status': response.status, 'result': true, 'resultData': body['u:' + action + 'Response'], 'errNo':0 ,'errorMsg': ''};
                        return res;
                    } else if (body['s:Fault']) {
                        throw(body['s:Fault']);
                        //res = {'status': response.status, 'result': false, 'resultData': body['s:Fault'], 'errNo':2 ,'errorMsg': JSON.stringify(body['s:Fault'])};
                        //if (suppressMsg == false) gthis.log.error('soapAction ' + device._auth.chCount + ' ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
                        //return res;
                    }
                }
            }else{ //response status different to 200
                throw('negative response ' + JSON.stringify(response.data));
                //res = {'status': response.status,'result': false, 'resultData': response.data, 'errNo':3 ,'errorMsg': response.data};
                //if (suppressMsg == false) gthis.log.error('soapAction ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
                //return res;
            }
        } catch (error) {
            let res = {'status': null, 'data': null, 'result': false, 'resultData': null, 'errNo':0 ,'errorMsg': ''};
            if (axios.isCancel(error)) {
                gthis.log.info('axios request canceled ' + error.message);
                res = {'status': null, 'data': null, 'result': false, 'resultData': null, 'errNo':7 ,'errorMsg': error.message};
            }
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                const errResult = await xml2jsP.parseStringPromise(error.response.data, {explicitArray: false});
                const errMsg = errResult['s:Envelope']['s:Body']['s:Fault']['detail']['UPnPError'];
                res = {'status': error.response.status, 'data': null, 'result': false, 'resultData': null, 'errNo':4 ,'errorMsg': errMsg};
                if (suppressMsg == false) gthis.log.error('soapAction xml2js' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + errMsg['errorCode'] + ' ' + errMsg['errorDescription']);
            } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                // http.ClientRequest in node.js
                
                res = {'status': error.code, 'data': null, 'result': false, 'resultData': null, 'errNo':5 ,'errorMsg': error.message};
                if (suppressMsg == false) gthis.log.error('soapAction ' + url + ' ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
            } else {
                // Something happened in setting up the request that triggered an Error
                //res = {'status': null, 'data': null, 'result': false, 'resultData': null, 'errNo':6 ,'errorMsg': error.message};
                if (suppressMsg == false) gthis.log.error('soapAction ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
            }
            //throw (error);
            return null;
        }
    }
}

exports.Fb = Fb;