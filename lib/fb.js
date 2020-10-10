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
            if (response.status == 200){
                this.services = await xml2jsP.parseStringPromise(response.data, {explicitArray: false});
                gthis.log.debug('services loaded successfully' + JSON.stringify(this.services));
                return true;
            }else{
                throw {name: 'getServices', message: 'Can not read services! Status: ' + response.status};                
            }
        } catch (err) {
            gthis.log.error('getServices: ' + err.name + ': ' + err.message);
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

    async chkService(action, serviceId){
        try {
            if(this.services === null) return false;
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

                if (response.status == 200){
                    const found = JSON.stringify(response.data).search(action);
                    if (found == -1){
                        gthis.log.info('service ' + serviceId + '-' + action + ' is not supported');
                        gthis.setState('info.' + serviceId + '-' + action, { val: false, ack: true });
                        return false;
                    }else{
                        gthis.log.info('service ' + serviceId + '-' + action + ' is supported');
                        gthis.setState('info.' + serviceId + '-' + action, { val: true, ack: true });
                        return true;
                    }
                }else{
                    throw {name: 'chkService', message: 'Can not find action ' + serviceId + '-' + action + ' ' + response.status};                        
                }
            }else{
                throw {name: 'chkService', message: 'Can not find service file ' + serviceId};                        
            }
        } catch (err) {
            gthis.log.error('chkService: ' + err.name + ': ' + err.message);
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
                    throw {name: 'getSSLPort', message: 'Can not read ssl port ' + result.status};                        
                }
            }else{
                throw {name: 'getSSLPort', message: 'Can not read ssl port ' + result.status};                        
            }
        }
        catch (err) {    
            gthis.log.error('getSSLPort: ' + err.name + ': ' + err.message);
            this._sslPort = null;
            return null;
        }
    }

    async getDeviceList(){
        try {
            //get device list
            const hostPath = await this.soapAction(this, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetHostListPath', null);
            if (hostPath.result != false){
                const url = 'http://' + this.host + ':' + this.port + hostPath.resultData['NewX_AVM-DE_HostListPath'];
                const response = await axios({url: url,
                    method: 'get',
                    timeout: 10000,
                    responseType: 'json',
                    responseEncoding: 'utf8',
                    cancelToken: new CancelToken(function executor(c) {
                        //gthis.log.info('cancel axios request: ' + body);
                        // An executor function receives a cancel function as a parameter
                        cancel = c;
                    })
                });
                if (response.status == 200) {
                    //gthis.log.info('getDeviceList ' + JSON.stringify(response.data));
                    const deviceList = await xml2jsP.parseStringPromise(response.data, {explicitArray: false});
                    gthis.log.debug('getDeviceList: ' + JSON.stringify(deviceList['List']['Item']));
                    gthis.setState('devices', { val: deviceList['List']['Item'].length, ack: true });
                    return deviceList['List']['Item'];
                }else{
                    throw {name: 'getDeviceList', message: 'Can not read hostlist path ' + hostPath.status};                        
                }                
            }else{
                throw {name: 'getDeviceList', message: 'Can not read hostlist path ' + hostPath.status};                        
            }
        } catch (err) {
            gthis.log.error('getDeviceList: ' + err.name + ': ' + err.message + ' ' + JSON.stringify(err));
            return null;            
        }
    }

    async getMeshList(){
        try {
            //get device list
            const meshPath = await this.soapAction(this, '/upnp/control/hosts', urn + 'Hosts:1', 'X_AVM-DE_GetMeshListPath', null);
            if (meshPath.result != false){
                const url = 'http://' + this.host + ':' + this.port + meshPath.resultData['NewX_AVM-DE_MeshListPath'];
                const response = await axios({
                    url: url,
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
                    gthis.log.debug('getMeshList2: ' + JSON.stringify(response.data['nodes']));
                    return (response.data['nodes']);
                }else{
                    throw {name: 'getMeshList', message: 'Can not read meshlist path ' + meshPath.data};                        
                }
            }else{
                throw {name: 'getMeshList', message: 'Can not read meshlist path ' + meshPath.status};                        
            }
        } catch (err) {
            gthis.log.error('getMeshList: ' + err.name + ': ' + err.message);
            return null;
        }
    }

    //Get external IP address
    async getExtIp(){
        try {
            let extIp = await this.soapAction(this, '/upnp/control/wanpppconn1', 'urn:dslforum-org:service:WANPPPConnection:1', 'GetInfo', null, true); //.then(function(extIp){
            if (extIp && extIp.result != false){
                gthis.log.debug('external IP1: ' + JSON.stringify(extIp));
                const extIpOld = gthis.getStateAsync('info.extIp');
                if (extIpOld.val != extIp.resultData['NewExternalIPAddress'] ) gthis.setState('info.extIp', { val: extIp.resultData['NewExternalIPAddress'], ack: true });
                return extIp.resultData['NewExternalIPAddress']; 
            }else{
                extIp = await this.soapAction(this, '/upnp/control/wanipconnection1', 'urn:dslforum-org:service:WANIPConnection:1', 'GetInfo', null, true); //.then(function(extIp){
                if (extIp != 'undefined' && extIp.result != false){
                    gthis.log.debug('external IP2: ' + JSON.stringify(extIp));
                    const extIpOld = gthis.getStateAsync('info.extIp');
                    if (extIpOld.val != extIp.resultData['NewExternalIPAddress'] ) gthis.setState('info.extIp', { val: extIp.resultData['NewExternalIPAddress'], ack: true });
                    return extIp.resultData['NewExternalIPAddress'];
                }else{
                    throw {name: 'getExtIp', message: 'Can not read external ip address ' + extIp.status};                        
                }
                /*}).catch(function(err){
                    throw err;
                });*/
            }
            /*}).catch(function(err){
                throw err;
            });*/
        } catch (err) {
            gthis.log.error('getExtIp: ' + err.name + ': ' + err.message);
            return null;
        }
    }

    async getGuestWlan(){
        try {
            //Get status of guest wlan 
            const guestwlan = await this.soapAction(this, '/upnp/control/wlanconfig3', urn + 'WLANConfiguration:3', 'GetInfo', null); //.then(function(guestwlan){
            if (guestwlan['status'] == 200 || guestwlan['result'] == true) {
                const wlan = guestwlan['resultData']['NewEnable'] == 1 ? true : false;
                gthis.log.debug('guest wlan: ' + wlan);
                gthis.getState('guest.wlan', function (err, state) {
                    if(!err && state){
                        if(state.val != wlan) gthis.setState('guest.wlan', { val: wlan, ack: true });
                        return true;
                    }else{
                        throw {name: 'getGuestWlan', message: 'Can not read status of guest wlan ' + guestwlan.status};                        
                    }
                });
            }else{
                throw {name: 'getGuestWlan', message: 'Can not read status of guest wlan ' + guestwlan.status};                        
            }
            /*}).catch(function(err){
                throw err;
            });*/
        } catch (err) {
            gthis.log.error('getGuestWlan: ' + err.name + ': ' + err.message);
            return false;        
        }
    }

    async getWanAccess(ipaddress){
        try {
            const disabled = await this.soapAction(this, '/upnp/control/x_hostfilter', urn + 'X_AVM-DE_HostFilter:1', 'GetWANAccessByIP', [[1, 'NewIPv4Address', ipaddress.val]]);
            if (disabled['status'] != 200 || disabled['result'] == false) {
                throw {name: 'getWanAccess', message: 'Can not read wan access status ' + disabled.status};                        
            }else{
                gthis.log.info(JSON.stringify(disabled));
                return true;
            }
        } catch (err) {
            gthis.log.error('getWanAccess: ' + err.name + ': ' + err.message);
            return false;
        }
    }

    async connectionCheck() {
        //connection check
        try {
            const info = await this.soapAction(this, '/upnp/control/deviceinfo', 'urn:dslforum-org:service:DeviceInfo:1', 'GetInfo', null); //.then(function(info){
            if (info.status == 200){
                gthis.setState('info.connection', { val: true, ack: true });
                gthis.setState('info.lastUpdate', { val: new Date(), ack: true });
            }else{
                gthis.setState('info.connection', { val: false, ack: true });
            }
            return info;
            /*}).catch(function(err){
                throw err;
            });*/
        } catch (err) {
            gthis.log.error('connectionCheck: ' + err.name + ': ' + err.message);
            return false;            
        }
    }

    /*xml2js(response){
        return new Promise((resolve, reject) => {
            parseString(response, {explicitArray: false}, function (err, result) {
                //gthis.log.info(JSON.stringify('xml2js ' + err + ' ' + result));
                if (err) reject ('xml2js ' + err);
                resolve(result);
            });            
        });  
    }*/

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
                    //gthis.log.info('cancel axios request: ' + body);
                    // An executor function receives a cancel function as a parameter
                    cancel = c;
                })
            }); //.then(function (response) {
            
            if (response.status == 200) {
                //gthis.log.debug('response: ' + device._auth.chCount + ' ' + JSON.stringify(response.data));
                const result = await xml2jsP.parseStringPromise(response.data, {explicitArray: false}); //.then(function (result) {
                //that.xml2js(response.data).then(function (result) {
                //gthis.log.info('result: ' + device._auth.chCount + ' ' + JSON.stringify(result));
                const env = result['s:Envelope'];
                if (env['s:Header']) {
                    const header = env['s:Header'];
                    if (header['h:Challenge']) {
                        const ch = header['h:Challenge'];
                        if (device._auth.chCount > 2) {
                            res = {'status': response.status, 'result': false, 'resultData': response.data, 'errNo':1 ,'errorMsg': 'authentification failure! Wrong user or password'};
                            if (suppressMsg == false) gthis.log.error('soapAction ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
                            return res;
                            //reject(res);
                        } else {
                            device._auth.sn = ch.Nonce;
                            device._auth.realm = ch.Realm;
                            device._auth.auth = device._calcAuthDigest(device._auth.uid, device._auth.pwd, device._auth.realm, device._auth.sn);
                            device._auth.chCount++;
                            // Repeat request
                            const response = await that.soapAction(device, url, serviceType, action, vars); //.then(function(response){
                            /*    resolve(response);
                            }).catch(function(error){
                                gthis.log.error('soapAction ' + JSON.stringify(error));
                                //reject(error);
                            });*/
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
                        //resolve(res);
                    } else if (body['s:Fault']) {
                        res = {'status': response.status, 'result': false, 'resultData': body['s:Fault'], 'errNo':2 ,'errorMsg': JSON.stringify(body['s:Fault'])};
                        if (suppressMsg == false) gthis.log.error('soapAction ' + device._auth.chCount + ' ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
                        //reject(res);
                        return res;
                    }
                }
                /*}).catch(function (error) {
                    gthis.log.error('soapAction xml2js ' + JSON.stringify(error));
                    reject(error);
                });*/
            }else{ //response status different to 200
                res = {'status': response.status,'result': false, 'resultData': response.data, 'errNo':3 ,'errorMsg': response.data};
                if (suppressMsg == false) gthis.log.error('soapAction ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
                return res;
                //reject(res);
            }

            /*}).catch(function (error) {
            });*/
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
                //that.xml2js(error.response.data).then(function(errResult){
                const errMsg = errResult['s:Envelope']['s:Body']['s:Fault']['detail']['UPnPError'];
                res = {'status': error.response.status, 'data': null, 'result': false, 'resultData': null, 'errNo':4 ,'errorMsg': errMsg};
                if (suppressMsg == false) gthis.log.error('soapAction xml2js' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + errMsg['errorCode'] + ' ' + errMsg['errorDescription']);
                /*}).catch(function(){
                    gthis.log.error('soapAction xml2js2 ' + url + ' ' + action + ' ' + error);
                });*/
            } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                // http.ClientRequest in node.js
                //const z = Object.getOwnPropertyNames(error);
                //gthis.log.error('soapAction r' + ' ' + z);
                res = {'status': error.code, 'data': null, 'result': false, 'resultData': null, 'errNo':5 ,'errorMsg': error.message};
                if (suppressMsg == false) gthis.log.error('soapAction ' + url + ' ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
                //gthis.log.error('soapAction r' + ' ' + error.code);
                //gthis.log.error('soapAction r' + ' ' + error.message);
                //gthis.log.error('soapAction r' + ' ' + error.request.toString);
            } else {
                // Something happened in setting up the request that triggered an Error
                //const z = Object.getOwnPropertyNames(error);
                //gthis.log.error(z);
                res = {'status': null, 'data': null, 'result': false, 'resultData': null, 'errNo':6 ,'errorMsg': error.message};
                if (suppressMsg == false) gthis.log.error('soapAction ' + action + ' status=' + res.status + ' errNo=' + res.errNo + ' ' + res.errorMsg);
            }
            return res;
            //reject(res);            
        }
        //});
    }
}

exports.Fb = Fb;