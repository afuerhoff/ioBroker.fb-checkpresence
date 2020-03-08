'use strict';

const parseString = require('xml2js').parseString;
const https = require('https');
const axios = require('axios');
const crypto = require('crypto');

let gthis = null;

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
    }

    async chkService(url, service){
        try {
            const nurl = 'http://' + this.host + ':' + this.port + url + '';
            const response = await axios({
                url: nurl,
                method: 'get',
                timeout: 2000,
                responseType: 'json',
                responseEncoding: 'utf8'
            });

            //gthis.log.info('chkService ' + JSON.stringify(response.status));
            if (response.status == 200){
                const found = JSON.stringify(response.data).search(service);
                if (found == -1){
                    gthis.log.info('service ' + service + ' is not supported');
                    gthis.setState('info.' + service, { val: false, ack: true });
                    return false;
                }else{
                    gthis.log.info('service ' + service + ' is supported');
                    gthis.setState('info.' + service, { val: true, ack: true });
                    return true;
                }
            }else{
                gthis.log.error('chkService ' + service + ' ' + response.status);
                return false;               
            }
        } catch (err) {
            gthis.log.error('chkService ' + service + ' ' + err);
            return false;               
        }
    }

    getSSLPort() {
        return new Promise((resolve, reject) => {
            async  () => {
                try {
                    const result = await gthis.soapAction(this, '/upnp/control/deviceinfo', 'urn:dslforum-org:service:DeviceInfo:1', 'GetSecurityPort', null);
                    gthis.log.debug('ssl ' + JSON.stringify(result));
                    const sslPort = parseInt(result.NewSecurityPort);
                    if (typeof sslPort === 'number' && isFinite(sslPort)) {
                        this._sslPort = sslPort;
                        resolve(sslPort);
                    } else {
                        reject('Got bad port from Device. Port:${result.NewSecurityPort}');
                    }
                }
                catch (error ) {    
                    reject(error);
                }
            };
        });
    }

    async getDeviceList(url) {
        try {
            const response = await axios({
                url: url,
                method: 'get',
                timeout: 2000,
                responseType: 'json',
                responseEncoding: 'utf8'
            });
            if (response.status == 200) {
                //gthis.log.info('getDeviceList ' + response.data);
                return await this.xml2js(response.data);
            }else{
                gthis.log.error('Fb.getDeviceList ' + response.data);
                return null;
            }
        } catch (error) {
            gthis.log.error('Fb.getDeviceList ' + error);
            return null;
        }
    }

    xml2js(response){
        return new Promise((resolve, reject) => {
            parseString(response, {explicitArray: false}, function (err, result) {
                //gthis.log.info(JSON.stringify('xml2js ' + err + ' ' + result));
                if (err) reject ('xml2js ' + err);
                resolve(result);
            });            
        });  
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

    // Soap query
    async soapAction(device, url, serviceType, action, vars) {
        try {
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
                vars.forEach(function(item) { //, index, array
                    body += '<' + item[1] + '>';
                    body += item[2];
                    body += '</' + item[1] + '>';
                });
            }
            body = body + '</u:' + action + '>'+'</s:Body>'+'</s:Envelope>';
            let port = 0;
            let proto = '';
            let agentOptions = null;
            if (device._sslPort && device._auth.auth) {
                port = device._sslPort;
                proto = 'https://';
                agentOptions = new https.Agent({
                    keepAlive: true,
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
                httpsAgent: agentOptions,
                headers: {
                    'SoapAction': serviceType + '#' + action,
                    'Content-Type': 'text/xml;charset=UTF-8'
                }
            });

            if (response.status == 200) {
                gthis.log.debug('response: ' + device._auth.chCount + ' ' + JSON.stringify(response.data));
                const result = await this.xml2js(response.data);
                //gthis.log.info(JSON.stringify(result));
                let res = {};
                const env = result['s:Envelope'];
                if (env['s:Header']) {
                    const header = env['s:Header'];
                    if (header['h:Challenge']) {
                        const ch = header['h:Challenge'];
                        gthis.log.debug('chCount ' + device._auth.chCount);
                        if (device._auth.chCount > 2) {
                            gthis.log.error('soapAction authentification failure');
                            return false;
                        } else {
                            device._auth.sn = ch.Nonce;
                            device._auth.realm = ch.Realm;
                            device._auth.auth = device._calcAuthDigest(device._auth.uid, device._auth.pwd, device._auth.realm, device._auth.sn);
                            device._auth.chCount++;
                            // Repeat request
                            const resp = await that.soapAction(device, url, serviceType, action, vars);
                            return resp;
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
                        const responseVars = body['u:' + action + 'Response'];
                        res = responseVars;
                    } else if (body['s:Fault']) {
                        const fault = body['s:Fault'];
                        res = fault;
                        if (device._auth.chCount > 1){
                            gthis.log.debug('soapAction_' + device._auth.chCount + ' ' + JSON.stringify(fault));
                            return false;
                        } 
                    }
                }
                return res;
            }else{
                gthis.log.error('soapAction_' + device._auth.chCount + ' ' + JSON.stringify(response));
                return false;
            }
        } catch (error) {
            gthis.log.error('soapAction_' + device._auth.chCount + ' ' + JSON.stringify(error));
            return false;            
        }
    }
}

exports.Fb = Fb;