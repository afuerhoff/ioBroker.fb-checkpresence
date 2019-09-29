'use strict';

const parseString = require('xml2js').parseString;
const request = require('request');
const crypto = require('crypto');
const URL =  require('url');
const async = require('async');
const fs = require('fs');
const axios = require("axios");
let gthis;

class Fb {
    constructor(deviceInfo, that) {
		this.that = that;
		gthis = that;
        this._sslPort = null;
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

    getDeviceList(url) {
        return new Promise((resolve, reject) => {
            request(url, (error, response, body) => {
                if (error) reject(error);
                if (!error && response.statusCode != 200) {
                    reject('Invalid status code <' + response.statusCode + '>');
                }
                parseString(body, {explicitArray: false}, function (err, result) {
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
				vars.forEach(function(item, index, array) {
					item[0]
					body += '<' + item[1] + '>';
					body += item[2];
					body += '</' + item[1] + '>';
				});
			}
			body = body + '</u:' + action + '>' +
				'</s:Body>' +
				'</s:Envelope>';
			let port = 0
			let proto = ''
			let agentOptions = null;

			if (device.sslPort) {
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
					parseString(body, {explicitArray: false}, function (err, result) {
						let challange = false;
						let res = {};
						const env = result['s:Envelope'];
						if (env['s:Header']) {
							const header = env['s:Header'];
							if (header['h:Challenge']) {
								const ch = header['h:Challenge'];
								challange = true;
								if (device._auth.chCount > 2) {
									reject('Credentials incorrect');
								} else {
									device._auth.sn = ch.Nonce;
									device._auth.realm = ch.Realm;
									device._auth.auth = device._calcAuthDigest(device._auth.uid,
										device._auth.pwd,
										device._auth.realm,
										device._auth.sn);
									device._auth.chCount++;
									// Repeat request.
									let resp = that.soapAction(device, url, serviceType, action, vars);
									resolve(resp);
								}
							} else if (header['h:NextChallenge']) {
								const nx = header['h:NextChallenge'];
								device._auth.auth = nx.Nonce;
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
								reject('Device responded with fault ' + fault);
								res = fault;
							}
						}
						resolve(res);
						//callback(error, res);
					});
				}
				if (!error && response.statusCode != 200) {
					reject(error);
				}           
				if (error) {
					reject('soapAction error: ' + error);
				}
			});
		});
	}
}

exports.Fb = Fb;