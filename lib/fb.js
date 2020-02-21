'use strict';

const parseString = require('xml2js').parseString;
const request = require('request');
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

    chkService(url, service){
        return new Promise((resolve, reject) => {
            const nurl = 'http://' + this.host + ':' + this.port + url;
            request(nurl, async (error, response, body) => {
                if (!error && response.statusCode != 200) {
                    reject('Invalid status code <' + response.statusCode + '>');
                }
                if (error != null){
                    reject('chkService -> fritzbox connection failed: ' + error);
                }else{
                    gthis.log.debug('chkService ' + body);
                    parseString(body, {explicitArray: false}, function (err, result) {
                        if (err != null) reject(err);
                        const found = JSON.stringify(result).search(service);
                        if (found == -1){
                            gthis.log.info('service ' + service + ' is not supported');
                            gthis.setState('info.' + service, { val: false, ack: true });
                            resolve(false);
                        }else{
                            gthis.log.info('service ' + service + ' is supported');
                            gthis.setState('info.' + service, { val: true, ack: true });
                            resolve(true);
                        }
                    });
                } 
            });
        });
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

    getDeviceList(url) {
        return new Promise((resolve, reject) => {
            request(url, (error, response, body) => {
                if (error) {
                    gthis.log.debug('error ' + error);
                    reject(error);
                }
                //gthis.log.debug('response ' + response);
                if (!error && response.statusCode != 200) {
                    reject('Invalid status code <' + response.statusCode + '>');
                }
                gthis.log.debug('body ' + body);
                parseString(body, {explicitArray: false}, function (err, result) {
                    //if (err) reject (err);
                    resolve(result);
                });
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
    soapAction(device, url, serviceType, action, vars) {
        return new Promise((resolve, reject) => {
            let head = '';
            if (device._auth.uid) { // Content Level Authentication 
                if (device._auth.auth) {
                    head = '<s:Header>' +
                        '<h:ClientAuth xmlns:h="http://soap-authentication.org/digest/2001/10/"' +
                        's:mustUnderstand="1">' +
                        '<Nonce>' + device._auth.sn + '</Nonce>' +
                        '<Auth>' + device._auth.auth + '</Auth>' +
                        '<UserID>' + device._auth.uid + '</UserID>' +
                        '<Realm>' + device._auth.realm + '</Realm>' +
                        '</h:ClientAuth>' +
                        '</s:Header>';
                } else { // First Auth
                    head = ' <s:Header>' +
                        '<h:InitChallenge xmlns:h="http://soap-authentication.org/digest/2001/10/"' +
                        's:mustUnderstand="1">' +
                        '<UserID>' + device._auth.uid + '</UserID>' +
                        '</h:InitChallenge>' +
                        '</s:Header>';
                }
            }

            let body = '<?xml version="1.0" encoding="utf-8"?>' +
                '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" >' + head + '<s:Body>' + '<u:' + action + ' xmlns:u="' + serviceType + '">';
            //insert parameters 
            if (vars != null){
                vars.forEach(function(item) { //, index, array
                    //item[0];
                    body += '<' + item[1] + '>';
                    body += item[2];
                    body += '</' + item[1] + '>';
                });
            }
            body = body + '</u:' + action + '>' +
                '</s:Body>' +
                '</s:Envelope>';
            let port = 0;
            let proto = '';
            let agentOptions = null;

            if (device._sslPort && device._auth.auth) {
                port = device._sslPort;
                proto = 'https://';
                agentOptions = {
                    rejectUnauthorized: false
                }; // Allow selfsignd Certs
            } else {
                proto = 'http://';
                port = device.port;
            }
            const uri = proto + device.host + ':' + port + url;
            const that = this; //this speichern
            gthis.log.debug('request url ' + uri + ' body: ' + body);
            request({
                method: 'POST', 
                uri: uri, 
                agentOptions: agentOptions,
                headers: {
                    'SoapAction': serviceType + '#' + action,
                    'Content-Type': 'text/xml',
                    'charset': 'utf-8'
                },
                body: body
            }, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    gthis.log.debug('response: ' + device._auth.chCount + ' ' + JSON.stringify(response));
                    //gthis.log.debug('body: ' + device._auth.chCount + ' ' + body);
                    parseString(body, {explicitArray: false}, async function (err, result) {
                        try {
                            let res = {};
                            const env = result['s:Envelope'];
                            if (env['s:Header']) {
                                const header = env['s:Header'];
                                if (header['h:Challenge']) {
                                    const ch = header['h:Challenge'];
                                    //gthis.log.debug('chCount ' + device._auth.chCount);
                                    if (device._auth.chCount > 2) {
                                        reject('authentification failure');
                                    } else {
                                        device._auth.sn = ch.Nonce;
                                        device._auth.realm = ch.Realm;
                                        device._auth.auth = device._calcAuthDigest(device._auth.uid,
                                            device._auth.pwd,
                                            device._auth.realm,
                                            device._auth.sn);
                                        device._auth.chCount++;
                                        // Repeat request.
                                        const resp = await that.soapAction(device, url, serviceType, action, vars);
                                        //gthis.log.debug('soap1 ' + device._auth.chCount + ' ' + JSON.stringify(resp));
                                        resolve(resp);
                                        //gthis.log.debug('soap2 ' + device._auth.chCount + ' ' + JSON.stringify(resp));
                                    }
                                } else if (header['h:NextChallenge']) {
                                    const nx = header['h:NextChallenge'];
                                    //device._auth.auth = nx.Nonce;
                                    device._auth.sn = nx.Nonce;
                                    device._auth.realm = nx.Realm;
                                    device._auth.auth = device._calcAuthDigest(device._auth.uid,
                                        device._auth.pwd,
                                        device._auth.realm,
                                        device._auth.sn);
                                    device._auth.chCount = 0;
                                }
                            }
                            if (env['s:Body']) {
                                const body = env['s:Body'];
                                //gthis.log.debug('soap3a ' + device._auth.chCount + ' ' + JSON.stringify(body));
                                if (body['u:' + action + 'Response']) {
                                    const responseVars = body['u:' + action + 'Response'];
                                    res = responseVars;
                                    //gthis.log.debug('soap3b ' + device._auth.chCount + ' ' + JSON.stringify(res));
                                } else if (body['s:Fault']) {
                                    const fault = body['s:Fault'];
                                    res = fault;
                                    if (device._auth.chCount > 1){
                                        gthis.log.debug('Fault ' + device._auth.chCount + ' ' + JSON.stringify(fault));
                                        reject('Device responded with fault: ' + fault);
                                    } 
                                }
                            }
                            //gthis.log.debug('soap3d ' + device._auth.chCount + ' ' + JSON.stringify(res));
                            resolve(res);
                        } catch (error) {
                            gthis.log.error('soapAction: ' + action + ' -> ' + error);
                        }
                    });
                }
                if (!error && response.statusCode != 200) {
                    //gthis.log.error('soapAction ' + action + ' -> ' + JSON.stringify(response));
                    reject('soapAction ' + action + ' -> ' + JSON.stringify(response));
                }           
                if (error) {
                    //gthis.log.error('error: ' + error);
                    reject('soapAction ' + action + ' -> ' + error);
                }
            });
        });
    }
}

exports.Fb = Fb;