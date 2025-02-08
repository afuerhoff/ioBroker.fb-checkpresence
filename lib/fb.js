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
        this.toString = function () {
            return `${this.name}: ${this.message}`;
        };
    }
}

class exceptionSoapCommand extends Error {
    constructor(name, message) {
        super(message);
        this.name = name;
        this.toString = function () {
            return `${this.name}: ${this.message}`;
        };
    }
}

class exceptionFbSendWithRetry extends Error {
    constructor(message) {
        super(message);
        this.name = 'exceptionFbSendWithRetry';
        this.toString = function () {
            return `${this.name}: ${this.message}`;
        };
    }
}

/**
 * A class to use the fritzbox api
 *
 */
class Fb {
    /**
     * @param {{ host: any; uid: any; pwd: any; }} deviceInfo - configuration items
     * @param {any} ssl - configuration item
     * @param {any} adapter - adapter object
     */
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
            chCount: 0,
        };
        this.agent = null; //new https.Agent({ defaultPort: 43213, keepAlive: true, rejectUnauthorized: false });
        this.controller = null;
        this.source = null;
        try {
            this.controller = new AbortController();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            this.controller = null;
            this.source = axios.CancelToken.source();
        }
        this.ssl = ssl;
        this.serviceUrl = `http://${this.host}:${this.port}/tr64desc.xml`;
        this.services = null;
        this.currentRetry = 0;
        this.deviceList = null;
        this.meshList = null;
        this.accessRights = { C: 'none', P: 'none', D: 'none', N: 'none', H: 'none', A: 'none', '-': 'readwrite' };
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

    /**
     * init function for Fb class
     *
     * @param deviceInfo - configuration parameters for fritzbox authentification
     * @param ssl - ssl configuration parameter
     * @param adapter - adapter object
     */
    static init(deviceInfo, ssl, adapter) {
        return (async function () {
            try {
                const x = new Fb(deviceInfo, ssl, adapter);
                await x._getSSLPort();
                if (x._sslPort && x.ssl) {
                    x.agent = new https.Agent({
                        rejectUnauthorized: false,
                    });
                }
                await x._getAccessRights();
                const res = await x._getServices();
                if (res === true) {
                    await x._checkServices();
                }
                if (x.GETACCESSTYPE && x.GETACCESSTYPE === true) {
                    await x._getWANAccessType();
                }
                if (x.CONNECTION && x.CONNECTION === true) {
                    await x._getDefaultConnection();
                }
                return x;
            } catch (error) {
                throw new exceptionSoapCommand('Fb init', error);
            }
        })();
    }

    /**
     * fritzbox action GetDefaultConnectionService
     */
    async _getDefaultConnection() {
        try {
            const soapResult = await this.soapAction(
                '/upnp/control/layer3forwarding',
                'urn:dslforum-org:service:' + 'Layer3Forwarding:1',
                'GetDefaultConnectionService',
                null,
            );
            if (soapResult) {
                this.connection = soapResult['NewDefaultConnectionService'];
                return;
            }
            throw new exceptionSoapCommand(
                'getDefaultConnection',
                `Cannot get default connection from Fritzbox! ${JSON.stringify(soapResult)}`,
            );
        } catch (error) {
            throw new exceptionFb('getDefaultConnection', error);
        }
    }

    /**
     * fritzbox action X_AVM-DE_GetCurrentUser to get access rights
     */
    async _getAccessRights() {
        try {
            const soapResult = await this.soapAction(
                '/upnp/control/lanconfigsecurity',
                'urn:dslforum-org:service:' + 'LANConfigSecurity:1',
                'X_AVM-DE_GetCurrentUser',
                null,
            );
            if (soapResult) {
                const result = await xml2jsP.parseStringPromise(soapResult['NewX_AVM-DE_CurrentUserRights'], {
                    explicitArray: false,
                });
                if (result && result.rights && result.rights.path) {
                    for (let i = 0; i < result.rights.path.length; i++) {
                        switch (result.rights.path[i]) {
                            case 'BoxAdmin':
                                this.accessRights.C = result.rights.access[i];
                                break;
                            case 'Phone':
                                this.accessRights.P = result.rights.access[i];
                                break;
                            case 'Dial':
                                this.accessRights.D = result.rights.access[i];
                                break;
                            case 'NAS':
                                this.accessRights.N = result.rights.access[i];
                                break;
                            case 'HomeAuto':
                                this.accessRights.H = result.rights.access[i];
                                break;
                            case 'App':
                                this.accessRights.A = result.rights.access[i];
                                break;
                            default:
                                this.accessRights.none = '-';
                        }
                    }
                    return '';
                }
                throw new Error('Cannot parse soap result! ');
            } else {
                throw new exceptionSoapCommand('getAccessRights', 'Cannot get access rights from Fritzbox!');
            }
        } catch (error) {
            if (error.message.includes('authentification failure')) {
                throw new exceptionSoapCommand('_getAccessRights', 'please check the user or password!'); //this.adapter.log.warn('please check the user or password!');
            } else {
                throw new exceptionSoapCommand('_getAccessRights', error);
            }
        }
    }

    /**
     * fritzbox action to get supported services
     */
    async _getServices() {
        try {
            const para =
                this.controller === null
                    ? {
                          url: this.serviceUrl,
                          method: 'get',
                          timeout: this.timeout,
                          responseType: 'json',
                          responseEncoding: 'utf8',
                          cancelToken: this.source.token,
                      }
                    : {
                          url: this.serviceUrl,
                          method: 'get',
                          timeout: this.timeout,
                          responseType: 'json',
                          responseEncoding: 'utf8',
                          signal: this.controller.signal,
                      };
            const response = await axios(para);
            if (response && response.status == 200) {
                this.services = await xml2jsP.parseStringPromise(response.data, { explicitArray: false });
                this.modelName = this.services.root.device.modelName;
                if (this.services.root.systemVersion != null) {
                    this.version = this.services.root.systemVersion.Display;
                } else {
                    this.version = 'not defined';
                }
                return true;
            }
            throw Error(`Can not read services! Status: ${JSON.stringify(response)}`);
        } catch (error) {
            this.services = null;
            throw new exceptionFb('getServices', error);
        }
    }

    /**
     * fritzbox action to get services
     *
     * @param device - device
     * @param serviceId - service id
     */
    _getService(device, serviceId) {
        const device1 = device;
        const dlength = device1.length;
        if (device1 && device1.length == undefined) {
            const length = device1['serviceList']['service'].length;
            for (let s = 0; s < length; s++) {
                const service = device1['serviceList']['service'][s];
                if (service.serviceId.includes(serviceId)) {
                    return service;
                }
            }
            if (device1.deviceList && device1.deviceList.device) {
                return this._getService(device1.deviceList.device, serviceId);
            }
        } else {
            for (let d = 0; d < dlength; d++) {
                const length = device1[d]['serviceList']['service'].length;
                const dev = device1[d]['serviceList']['service'];
                for (let s = 0; s < length; s++) {
                    const service = dev[s];
                    if (service.serviceId.includes(serviceId)) {
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

    /**
     * check service if it is supported by fritzbox
     */
    async _checkServices() {
        try {
            this.GETPATH = await this._chkService('X_AVM-DE_GetHostListPath', 'Hosts1', 'X_AVM-DE_GetHostListPath', [
                'C',
                'A',
                'P',
            ]);
            this.GETMESHPATH = await this._chkService(
                'X_AVM-DE_GetMeshListPath',
                'Hosts1',
                'X_AVM-DE_GetMeshListPath',
                ['C', 'A', 'P'],
            );
            this.GETBYMAC = await this._chkService('GetSpecificHostEntry', 'Hosts1', 'GetSpecificHostEntry', ['-']);
            this.GETBYIP = await this._chkService(
                'X_AVM-DE_GetSpecificHostEntryByIP',
                'Hosts1',
                'X_AVM-DE_GetSpecificHostEntryByIP',
                ['C', 'A', 'P'],
            );
            this.GETPORT = await this._chkService('GetSecurityPort', 'DeviceInfo1', 'GetSecurityPort', ['-']);
            this.GETACCESSTYPE = await this._chkService(
                'GetCommonLinkProperties',
                'WANCommonInterfaceConfig1',
                'GetCommonLinkProperties',
                ['C'],
            );
            this.GETEXTIP = await this._chkService('GetInfo', 'WANPPPConnection1', 'GetInfo', ['C']);
            this.GETEXTIPBYIP = await this._chkService('GetInfo', 'WANIPConnection1', 'GetInfo', ['C']);
            this.SETENABLE = await this._chkService('SetEnable', 'WLANConfiguration3', 'SetEnable', ['A']);
            this.WLAN3INFO = await this._chkService('GetInfo', 'WLANConfiguration3', 'WLANConfiguration3-GetInfo', [
                'C',
                'A',
                'P',
            ]);
            this.WLAN3GETSECKEY = await this._chkService(
                'GetSecurityKeys',
                'WLANConfiguration3',
                'WLANConfiguration3-GetSecurityKeys',
                ['A'],
            );
            this.DEVINFO = await this._chkService('GetInfo', 'DeviceInfo1', 'DeviceInfo1-GetInfo', ['C']);
            this.DISALLOWWANACCESSBYIP = await this._chkService(
                'DisallowWANAccessByIP',
                'X_AVM-DE_HostFilter',
                'DisallowWANAccessByIP',
                ['C', 'A'],
            );
            this.GETWANACCESSBYIP = await this._chkService(
                'GetWANAccessByIP',
                'X_AVM-DE_HostFilter',
                'GetWANAccessByIP',
                ['C', 'A'],
            );
            this.REBOOT = await this._chkService('Reboot', 'DeviceConfig1', 'Reboot', ['C']);
            this.RECONNECT = await this._chkService('ForceTermination', 'WANPPPConnection1', 'ForceTermination', ['C']);
            this.USERRIGHTS = await this._chkService(
                'X_AVM-DE_GetCurrentUser',
                'LANConfigSecurity1',
                'X_AVM-DE_GetCurrentUser',
                ['C', 'A', 'P', 'N', 'H'],
            );
            this.CONNECTION = await this._chkService(
                'GetDefaultConnectionService',
                'Layer3Forwarding1',
                'GetDefaultConnectionService',
                ['C'],
            );
        } catch (error) {
            throw new exceptionFb('checkServices', error);
        }
    }

    /**
     *
     * @param action - action name
     * @param serviceId - service id
     * @param dp - data point
     * @param neededAccessRights - needed access rights for correct function
     */
    async _chkService(action, serviceId, dp, neededAccessRights) {
        try {
            if (this.services === null) {
                throw Error('can not get services!');
            }
            const service = this._getService(this.services['root']['device'], serviceId);
            if (service) {
                const nurl = `http://${this.host}:${this.port}${service.SCPDURL}`;
                const para =
                    this.controller === null
                        ? {
                              url: nurl,
                              method: 'get',
                              timeout: this.timeout,
                              responseType: 'json',
                              responseEncoding: 'utf8',
                              cancelToken: this.source.token,
                          }
                        : {
                              url: nurl,
                              method: 'get',
                              timeout: this.timeout,
                              responseType: 'json',
                              responseEncoding: 'utf8',
                              signal: this.controller.signal,
                          };
                const response = await axios(para);
                if (response && response.status == 200) {
                    const found = JSON.stringify(response.data).search(action);
                    if (found == -1) {
                        this.suportedServices.push({ id: dp, name: `${serviceId}-${action}`, enabled: false });
                        return false;
                    }
                    let supported = false;
                    for (let i = 0; i < neededAccessRights.length; i++) {
                        const right = this.accessRights[neededAccessRights[i]];
                        if (right != 'none') {
                            supported = true;
                            break;
                        }
                    }
                    this.suportedServices.push({ id: dp, name: `${serviceId}-${action}`, enabled: supported });
                    return supported;
                }
                this.adapter.log.info(
                    `service ${serviceId}-${action} is not supported! Can not find action! Feature is deactivated! `,
                );
                return false;
            }
            this.adapter.log.info(
                `service ${serviceId}-${action} is not supported! Can not find service file! Feature is deactivated`,
            );
            return false;
        } catch (error) {
            throw new exceptionFb('checkService', `${error.name} ${error.message}`);
        }
    }

    /**
     * read ssl port from fritzbox
     */
    async _getSSLPort() {
        try {
            const soapResult = await this.soapAction(
                '/upnp/control/deviceinfo',
                'urn:dslforum-org:service:' + 'DeviceInfo:1',
                'GetSecurityPort',
                null,
            );
            if (soapResult) {
                const sslPort = parseInt(soapResult['NewSecurityPort']);
                if (typeof sslPort === 'number' && isFinite(sslPort)) {
                    this._sslPort = sslPort;
                    return sslPort;
                }
                throw new Error(`Cannot get ssl port! Wrong type. ${JSON.stringify(soapResult)}`);
            } else {
                throw new exceptionSoapCommand(
                    'GetSecurityPort',
                    `Cannot get ssl port from Fritzbox! ${JSON.stringify(soapResult)}`,
                );
            }
        } catch (error) {
            this._sslPort = null;
            if (error.message.includes('timeout')) {
                this.adapter.log.warn(
                    'The user could have been blocked from the fritzbox due to authentification problems! Please stop the adapter and reboot the fritzbox. Then start and try again.',
                );
                throw new exceptionFb('getSSLPort', error);
            } else {
                throw new exceptionFb('getSSLPort', error);
            }
        }
    }

    /**
     *
     * @param url - soap url
     * @param timeout - timeout
     * @param start - retry counter
     * @param message - message
     */
    async _sendWithRetry(url, timeout, start, message) {
        this.currentRetry = start;

        try {
            const para =
                this.controller === null
                    ? {
                          url: url,
                          method: 'get',
                          timeout: this.timeout,
                          responseType: 'text',
                          responseEncoding: 'utf8',
                          httpsAgent: this.agent,
                          cancelToken: this.source.token,
                      }
                    : {
                          url: url,
                          method: 'get',
                          timeout: this.timeout,
                          responseType: 'text',
                          responseEncoding: 'utf8',
                          httpsAgent: this.agent,
                          signal: this.controller.signal,
                      };
            const response = await axios(para);
            return response;
        } catch (error) {
            if (error.message && error.message == 'Request canceled!') {
                return false;
            }
            if (this.currentRetry < this._MAX_RETRY) {
                this.currentRetry++;
                return await this._sendWithRetry(url, timeout, this.currentRetry, message);
            }
            this.currentRetry = 0;
            throw new exceptionFbSendWithRetry(error);
        }
    }

    /**
     * read fritzbox device list with action X_AVM-DE_GetHostListPath
     */
    async getDeviceList() {
        try {
            const soapResult = await this.soapAction(
                '/upnp/control/hosts',
                'urn:dslforum-org:service:' + 'Hosts:1',
                'X_AVM-DE_GetHostListPath',
                null,
            );
            if (soapResult) {
                let url = null;
                if (this._sslPort && this.ssl) {
                    url = `https://${this.host}:${this._sslPort}${soapResult['NewX_AVM-DE_HostListPath']}`;
                } else {
                    url = `http://${this.host}:${this.port}${soapResult['NewX_AVM-DE_HostListPath']}`;
                }
                const para =
                    this.controller === null
                        ? {
                              url: url,
                              method: 'get',
                              timeout: this.timeout + 4000,
                              responseType: 'text',
                              responseEncoding: 'utf8',
                              httpsAgent: this.agent,
                              cancelToken: this.source.token,
                          }
                        : {
                              url: url,
                              method: 'get',
                              timeout: this.timeout + 4000,
                              responseType: 'text',
                              responseEncoding: 'utf8',
                              httpsAgent: this.agent,
                              signal: this.controller.signal,
                          };
                const response = await axios(para);
                if (response && response.status == 200 && response.data) {
                    let deviceList = await xml2jsP.parseStringPromise(response.data, { explicitArray: false });
                    //this.adapter.log.warn('devicelist: ' + JSON.stringify(deviceList));
                    if (deviceList) {
                        this.deviceList = deviceList['List']['Item'];
                        deviceList = null;
                        return true;
                    }
                    throw new Error(`Cannot parse response.data ${JSON.stringify(response.data)}`);
                } else {
                    if (response === false) {
                        return false;
                    }
                    throw new exceptionFb('exceptionHostlist', 'Cannot get hostlist');
                }
            } else {
                throw new exceptionSoapCommand('X_AVM-DE_GetHostListPath', 'Cannot get hostlist path from Fritzbox!');
            }
        } catch (error) {
            if (error.name == 'CanceledError') {
                throw new exceptionSoapCommand('getDeviceList', error.message);
            } else {
                throw new exceptionSoapCommand('getDeviceList', `${error.name} ${error.message}`);
            }
        }
    }

    /**
     * read fritzbox mesh list with action X_AVM-DE_GetMeshListPath
     */
    async getMeshList() {
        try {
            const soapResult = await this.soapAction(
                '/upnp/control/hosts',
                'urn:dslforum-org:service:' + 'Hosts:1',
                'X_AVM-DE_GetMeshListPath',
                null,
            );
            if (soapResult) {
                let url = null;
                if (this._sslPort && this.ssl) {
                    url = `https://${this.host}:${this._sslPort}${soapResult['NewX_AVM-DE_MeshListPath']}`;
                } else {
                    url = `http://${this.host}:${this.port}${soapResult['NewX_AVM-DE_MeshListPath']}`;
                }
                const para =
                    this.controller === null
                        ? {
                              url: url,
                              method: 'get',
                              timeout: this.timeout + 8000,
                              responseType: 'json',
                              responseEncoding: 'utf8',
                              httpsAgent: this.agent,
                              cancelToken: this.source.token,
                          }
                        : {
                              url: url,
                              method: 'get',
                              timeout: this.timeout + 8000,
                              responseType: 'json',
                              responseEncoding: 'utf8',
                              httpsAgent: this.agent,
                              signal: this.controller.signal,
                          };
                const response = await axios(para);
                if (response != null && response.status == 200 && response.data) {
                    this.meshList = response.data['nodes'];
                    return true;
                }
                if (response === false) {
                    return false;
                }
                throw new Error('Cannot get mesh list');
            } else {
                throw new exceptionSoapCommand('X_AVM-DE_GetMeshListPath', 'Cannot get mesh list path');
            }
        } catch (error) {
            if (error.name == 'CanceledError') {
                throw new exceptionSoapCommand('getMeshList', error.message);
            } else {
                throw new exceptionSoapCommand('getMeshList', `${error.name} ${error.message}`);
            }
        }
    }

    /**
     * read fritzbox wan access type with action GetCommonLinkProperties
     */
    async _getWANAccessType() {
        try {
            const soapResult = await this.soapAction(
                '/upnp/control/wancommonifconfig1',
                'urn:dslforum-org:service:' + 'WANCommonInterfaceConfig:1',
                'GetCommonLinkProperties',
                null,
            );
            if (soapResult) {
                this.accessType = soapResult['NewWANAccessType'];
            } else {
                throw new exceptionSoapCommand('GetCommonLinkProperties', 'Cannot get wan access type from Fritzbox!');
            }
        } catch (error) {
            throw new exceptionFb('getWANAccessType', `${error.name} ${error.message}`);
        }
    }

    //Get external IP address
    /**
     * read external ip from fritzbox
     */
    async getExtIp() {
        try {
            let soapResult = null;
            if (this.GETEXTIP && this.GETEXTIP == true) {
                if (this.connection == '1.WANPPPConnection.1') {
                    soapResult = await this.soapAction(
                        '/upnp/control/wanpppconn1',
                        'urn:dslforum-org:service:' + 'WANPPPConnection:1',
                        'GetInfo',
                        null,
                    );
                } else {
                    soapResult = await this.soapAction(
                        '/upnp/control/wanipconnection1',
                        'urn:dslforum-org:service:' + 'WANIPConnection:1',
                        'GetInfo',
                        null,
                    );
                }
                if (soapResult) {
                    return soapResult['NewExternalIPAddress'];
                }
                const mesg = soapResult == null ? '' : soapResult;
                throw new exceptionSoapCommand(
                    'GetInfo WANConnection',
                    `Cannot get external ip address ${JSON.stringify(mesg)}`,
                );
            }
        } catch (error) {
            this.adapter.log.warn(`getExtIp: ${error.name} ${error.message}`);
            return '';
        }
    }

    //Get external IPv6 address
    /**
     * read external ipv6 from fritzbox
     */
    async getExtIpv6() {
        try {
            let soapResult = null;
            if (this.GETEXTIP && this.GETEXTIP == true) {
                if (this.connection == '1.WANPPPConnection.1') {
                    soapResult = await this.soapAction(
                        '/igdupnp/control/WANPPPConn1',
                        'urn:schemas-upnp-org:service:' + 'WANPPPConnection:1',
                        'X_AVM_DE_GetExternalIPv6Address',
                        null,
                    );
                } else {
                    soapResult = await this.soapAction(
                        '/igdupnp/control/WANIPConn1',
                        'urn:schemas-upnp-org:service:' + 'WANIPConnection:1',
                        'X_AVM_DE_GetExternalIPv6Address',
                        null,
                    );
                }
                if (soapResult) {
                    return soapResult['NewExternalIPv6Address'];
                }
                const mesg = soapResult == null ? '' : soapResult;
                throw new exceptionSoapCommand(
                    'GetInfo WANConnection',
                    `Cannot get external ipv6 address ${JSON.stringify(mesg)}`,
                );
            }
        } catch (error) {
            this.adapter.log.warn(`getExtIpv6: ${error.name} ${error.message}`);
            return '';
        }
    }

    //Get status of guest wlan
    /**
     * read guest wlan info
     */
    async getGuestWlan() {
        try {
            if (this.WLAN3INFO && this.WLAN3INFO == true) {
                const soapResult = await this.soapAction(
                    '/upnp/control/wlanconfig3',
                    'urn:dslforum-org:service:' + 'WLANConfiguration:3',
                    'GetInfo',
                    null,
                );
                if (soapResult) {
                    const wlanStatus = soapResult['NewEnable'] == 1 ? true : false;
                    this.ssid = soapResult['NewSSID'];
                    this.beaconType = soapResult['NewBeaconType'];
                    return wlanStatus;
                }
                throw new exceptionSoapCommand(
                    'GetInfo WLANConfiguration',
                    `Cannot get status of guest wlan ${JSON.stringify(soapResult)}`,
                );
            }
        } catch (error) {
            //throw new exceptionFb('getGuestWlan', error.name + ' ' + error.message);
            this.adapter.log.warn(`getGuestWlan ${error.name} ${error.message}`);
            return;
        }
    }

    //Get status of guest wlan
    /**
     * convert guest wlan info into qr-code
     */
    async getGuestQR() {
        try {
            if (this.WLAN3GETSECKEY && this.WLAN3GETSECKEY === true) {
                const soapResult = await this.soapAction(
                    '/upnp/control/wlanconfig3',
                    'urn:dslforum-org:service:' + 'WLANConfiguration:3',
                    'GetSecurityKeys',
                    null,
                );
                if (soapResult) {
                    let password = soapResult['NewKeyPassphrase'];
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
                    const qrcode = `WIFI:T:${WPA};P:${password};S:${SSID};;`;
                    let svg = qr.imageSync(qrcode, { type: 'svg' });
                    svg = svg.replace('<path ', `<path fill="${this.adapter.config.qrcodecolor}" `);
                    //svg.pipe(require('fs').createWriteStream('/tmp/qr.png', svg));
                    //this.adapter.writeFileAsync('vis.0','/main/qr.png', svg);
                    return svg;
                }
                throw new exceptionSoapCommand(
                    'getGuestQR',
                    `Cannot get datamatrix code of guest wlan ${JSON.stringify(soapResult)}`,
                );
            }
        } catch (error) {
            this.adapter.log.warn(`getGuestQR ${error.name} ${error.message}`);
            return;
        }
    }

    /**
     * read status of wan access for the given device
     *
     * @param ipaddress - ip address of the given device
     */
    async getWanAccess(ipaddress) {
        try {
            const soapResult = await this.soapAction(
                '/upnp/control/x_hostfilter',
                'urn:dslforum-org:service:X_AVM-DE_HostFilter:1',
                'GetWANAccessByIP',
                [[1, 'NewIPv4Address', ipaddress.val]],
            );

            if (soapResult?.NewDisallow !== undefined) {
                return soapResult.NewDisallow;
            }

            // Exception werfen, falls kein valider SOAP-Resultatwert vorhanden ist
            throw new exceptionSoapCommand(
                'getWanAccess',
                `Cannot get WAN access status: ${JSON.stringify(soapResult)}`,
            );
        } catch (error) {
            this.adapter.log.warn(`getWanAccess: ${error.name} ${error.message}`);
            return null; // Kein weiterer Throw; Rückgabe von null bei Fehlern
        }
    }

    /**
     * check connection to fritzbox
     *
     */
    async connectionCheck() {
        try {
            const soapResult = await this.soapAction(
                '/upnp/control/hosts',
                'urn:dslforum-org:service:' + 'Hosts:1',
                'GetHostNumberOfEntries',
                null,
            );
            return !!soapResult; // Wenn soapResult nicht null oder undefiniert ist, wird true zurückgegeben, ansonsten false.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            return false;
        }
    }

    // Login
    /**
     * calculate hash for authentification
     *
     * @param uid - user id
     * @param pwd - password
     * @param realm - realm
     * @param sn - sn
     */
    _calcAuthDigest(uid, pwd, realm, sn) {
        const secret = crypto.createHash('md5').update(`${uid}:${realm}:${pwd}`).digest('hex');
        return crypto.createHash('md5').update(`${secret}:${sn}`).digest('hex');
    }

    /**
     * exit axios request function
     *
     */
    exitRequest() {
        if (this.controller !== null) {
            this.controller.abort();
        }
        if (this.source !== null) {
            this.source.cancel('Operation canceled!');
        }
    }

    // Soap query
    /**
     * soap action function
     *
     * @param url - soap url
     * @param serviceType - fritzbox api service type
     * @param action - fritzbox api action
     * @param vars - fritzbox api parameters for action
     */
    async soapAction(url, serviceType, action, vars) {
        const service = serviceType.replace(this._urn, '');
        try {
            let head = '';
            if (this._auth.uid) {
                // Content Level Authentication
                if (this._auth.auth) {
                    head =
                        `<s:Header>` +
                        `<h:ClientAuth xmlns:h="http://soap-authentication.org/digest/2001/10/"` +
                        `s:mustUnderstand="1">` +
                        `<Nonce>${this._auth.sn}</Nonce>` +
                        `<Auth>${this._auth.auth}</Auth>` +
                        `<UserID>${this._auth.uid}</UserID>` +
                        `<Realm>${this._auth.realm}</Realm>` +
                        `</h:ClientAuth>` +
                        `</s:Header>`;
                } else {
                    // First Auth
                    head =
                        ` <s:Header>` +
                        `<h:InitChallenge xmlns:h="http://soap-authentication.org/digest/2001/10/"` +
                        `s:mustUnderstand="1">` +
                        `<UserID>${this._auth.uid}</UserID>` +
                        `</h:InitChallenge>` +
                        `</s:Header>`;
                }
            }
            let body =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">${
                    head
                }<s:Body>` +
                `<u:${action} xmlns:u="${serviceType}">`;
            //insert parameters
            if (vars != null) {
                vars.forEach(function (item) {
                    body += `<${item[1]}>`;
                    body += item[2];
                    body += `</${item[1]}>`;
                });
            }
            body = `${body}</u:${action}>` + `</s:Body>` + `</s:Envelope>`;
            let port = 0;
            let proto = '';
            if (this._sslPort && this._auth.auth && this.ssl) {
                port = this._sslPort;
                proto = 'https://';
            } else {
                proto = 'http://';
                port = this.port;
            }
            const uri = `${proto + this.host}:${port}${url}`;
            const para =
                this.controller === null
                    ? {
                          method: 'post',
                          data: body,
                          timeout: this.timeout,
                          proxy: false,
                          responseType: 'text',
                          httpsAgent: this.agent,
                          headers: {
                              SoapAction: `${serviceType}#${action}`,
                              'Content-Type': 'text/xml;charset=UTF-8',
                          },
                          cancelToken: this.source.token,
                      }
                    : {
                          method: 'post',
                          data: body,
                          timeout: this.timeout,
                          proxy: false,
                          responseType: 'text',
                          httpsAgent: this.agent,
                          headers: {
                              SoapAction: `${serviceType}#${action}`,
                              'Content-Type': 'text/xml;charset=UTF-8',
                          },
                          signal: this.controller.signal,
                      };
            const response = await axios(uri, para);
            if (response.status == 200) {
                let result = await xml2jsP.parseStringPromise(response.data, { explicitArray: false });
                const env = result['s:Envelope'];
                result = null;
                if (env['s:Header']) {
                    const header = env['s:Header'];
                    if (header['h:Challenge']) {
                        const ch = header['h:Challenge'];
                        if (this._auth.chCount >= 2) {
                            this._auth.chCount = 0;
                            this._auth.auth = null;
                            //response.data = null;
                            throw new exceptionSoapCommand('authentification failure', 'Wrong user or password');
                        } else {
                            this._auth.sn = ch.Nonce;
                            this._auth.realm = ch.Realm;
                            this._auth.auth = this._calcAuthDigest(
                                this._auth.uid,
                                this._auth.pwd,
                                this._auth.realm,
                                this._auth.sn,
                            );
                            this._auth.chCount++;
                            // Repeat request
                            //response.data = null;
                            return await this.soapAction(url, serviceType, action, vars);
                            //return; //response2;
                        }
                    } else if (header['h:NextChallenge']) {
                        const nx = header['h:NextChallenge'];
                        //this._auth.auth = nx.Nonce;
                        this._auth.sn = nx.Nonce;
                        this._auth.realm = nx.Realm;
                        this._auth.auth = this._calcAuthDigest(
                            this._auth.uid,
                            this._auth.pwd,
                            this._auth.realm,
                            this._auth.sn,
                        );
                        this._auth.chCount = 0;
                    }
                }
                if (env['s:Body']) {
                    const body = env['s:Body'];
                    if (body[`u:${action}Response`]) {
                        //soapResult.data = body['u:' + action + 'Response'];
                        //response = null;
                        return body[`u:${action}Response`];
                    } else if (body['s:Fault']) {
                        //response.data = null;
                        throw new exceptionSoapCommand('Fault', body['s:Fault']);
                    }
                }
            } else {
                //response status different to 200
                const mes = JSON.stringify(response.data);
                //response.data = null;
                throw new exceptionSoapCommand('negative response', mes);
            }
        } catch (error) {
            if (error.name === 'CanceledError') {
                throw new exceptionSoapCommand(`${service} ${action}`, error.message);
            }
            if (error.name === 'AxiosError') {
                if (error.response) {
                    if (error.response.data) {
                        const errResult = await xml2jsP.parseStringPromise(error.response.data, {
                            explicitArray: false,
                        });
                        if (errResult['s:Envelope']) {
                            if (errResult['s:Envelope']['s:Body']) {
                                if (errResult['s:Envelope']['s:Body']['s:Fault']) {
                                    if (errResult['s:Envelope']['s:Body']['s:Fault']['detail']) {
                                        if (errResult['s:Envelope']['s:Body']['s:Fault']['detail']['UPnPError']) {
                                            const errMsg =
                                                errResult['s:Envelope']['s:Body']['s:Fault']['detail']['UPnPError']
                                                    .errorDescription;
                                            throw new exceptionSoapCommand(
                                                `${service} ${action}: ${error.response.statusText} -> ${errMsg}`,
                                                error,
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        throw new exceptionSoapCommand(`${service} ${action}: ${error.response.statusText}`, error);
                    } else {
                        throw new exceptionSoapCommand(`${service} ${action}: ${error.response.statusText}`, error);
                    }
                } else {
                    throw new exceptionSoapCommand(`${service} ${action}`, error);
                }
            }
            if (error.response) {
                // The request was made and the server responded with a status code that falls out of the range of 2xx
                const errResult = await xml2jsP.parseStringPromise(error.response.data, { explicitArray: false });
                const errMsg = errResult['s:Envelope']['s:Body']['s:Fault']['detail']['UPnPError'];
                throw new exceptionSoapCommand(`${service} ${action}`, errMsg.errorDescription);
            } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js
                throw new exceptionSoapCommand(`${service} ${action}`, error.message);
            } else {
                if (error.message && error.message == 'Request canceled!') {
                    throw new exceptionSoapCommand(`${service} ${action}`, error.message);
                }
                // Something happened in setting up the request that triggered an Error
                throw new exceptionSoapCommand(`${service} ${action}`, `${error.name} ${error.message}`);
            }
        }
    }
}

exports.Fb = Fb;
