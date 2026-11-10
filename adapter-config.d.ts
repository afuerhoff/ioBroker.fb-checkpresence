export {};

declare global {
    namespace ioBroker {
        interface FamilyMemberConfig {
            enabled: boolean;
            macaddress: string;
            group: string;
            familymember: string;
            devicename: string;
            ipaddress: string;
            usage: 'MAC' | 'IP' | 'Hostname';
            usefilter: boolean;
            comment: string;
            useip?: boolean;
            usename?: boolean;
        }

        interface AdapterConfig {
            familymembers: FamilyMemberConfig[];
            whitelist: (string | { white_macaddress: string })[];
            devicelist: string[];
            ipaddress: string;
            username: string;
            password: string;
            ssl: boolean;
            sslVerifyCertificate: boolean;
            interval: number;
            interval_seconds: boolean;
            intervalFamily: number;
            delay: number;
            newfilter: boolean;
            compatibility: boolean;
            history: string;
            dateformat: string;
            fbdevices: boolean;
            useDeviceList: boolean | 'true' | 'false';
            meshinfo: boolean;
            syncfbdevices: boolean;
            syncfbdevicesMaxDays: number;
            guestinfo: boolean;
            qrcode: boolean;
            qrcodecolor: string;
            extip: boolean;
            enableWl: boolean;
        }
    }
}
