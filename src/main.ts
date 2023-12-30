/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { CookieJar } from 'tough-cookie';
import querystring from "querystring";
let adapter: ioBroker.Adapter;
let cookieJar = new CookieJar();
let token: null=null;
let timerId: NodeJS.Timeout | undefined;

const axiosInstance = axios.create({
    httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
    }),
    withCredentials: true
});

axiosInstance.interceptors.request.use((config: AxiosRequestConfig) => {
    return new Promise((resolve, reject) => {
        cookieJar.getCookies(config.url!, (err: any, cookies: any[]) => {
            if (err) {
                reject(err);
            }
            // @ts-ignore
            config.headers['Cookie'] = cookies.join('; ');
            // @ts-ignore
            resolve(config);
        });
    });
});

axiosInstance.interceptors.response.use((response: AxiosResponse) => {
    const setCookie = response.headers['set-cookie'];

    if (setCookie) {
        cookieJar.setCookieSync(setCookie[0], response.config.url!);
    }

    return response;
});


/**
 * Starts the adapter instance
 */
function startAdapter(options: Partial<utils.AdapterOptions> = {}): ioBroker.Adapter {
    // Create the adapter and define its methods
    return adapter = utils.adapter({
        // Default options
        ...options,
        // custom options
        name: "huawei-smartlogger-http",

        // The ready callback is called when databases are connected and adapter received configuration.
        // start here!
        ready: main, // Main method defined below for readability

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: (callback) => {
            try {
                if(timerId) clearTimeout(timerId);

                // Here you must clear all timeouts or intervals that may still be active
                // clearTimeout(timeout1);
                // clearTimeout(timeout2);
                // ...
                // clearInterval(interval1);

                callback();
            } catch (e) {
                callback();
            }
        },


        // If you need to accept messages in your adapter, uncomment the following block.
        // /**
        //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
        //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
        //  */
        message: async (obj) => {
            if (typeof obj === "object") {
                if (obj.command === "send") {
                    // e.g. send email or pushover or whatever
                    adapter.log.info("send command");
                    let token = await getXhrToken()
                    // Send response in callback if required
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, "Message received", obj.callback);
                }
            }
        },
    }
    );
}

async function main(): Promise<void> {

    // Reset the connection indicator during startup
    await adapter.setStateAsync("info.connection", false, true);

    await setStates(null)
    await PollValues();
}

/**
 * Polls values asynchronously.
 *
 * @returns {Promise} Resolves when the polling is complete.
 */
async function PollValues() {
    adapter.log.info("Pollvalues");
    const data = await getDataWithLogin();
    await setStates(data);
    if (adapter && adapter.config && adapter.config.interval > 0) {
        // Save result of setTimeout to the global variable timerId
        timerId = setTimeout(PollValues, adapter.config.interval * 1000);
    } else {
        console.log("NO INTERVAL")
    }
}

/**
 * Sets states based on the given data object.
 *
 * @param {object} data - The data object containing state values.
 * @return {undefined}
 */
async function setStates(data: any) {

    if (adapter && adapter.config && Array.isArray(adapter.config.items)) {
        for (const item of adapter.config.items) {

            const itemId = item.id.toString();

            if (data && data.hasOwnProperty(itemId)) {
                let value;
                if (item.type === 'number') {
                    value = parseFloat(data[itemId]) * Math.pow(10, item.multiplier);
                } else {
                    value = data[itemId];
                }
                await adapter.setStateAsync(item.name, { val: value, ack: true });
            } else {
                await adapter.setObjectNotExistsAsync(item.name, {
                    type: 'state',
                    common: {
                        name: item.name,
                        type: item.type,
                        role: 'value',
                        read: true,
                        write: true,
                        unit: item.unit,
                    },
                    native: {},
                });
            }

        }
    }
}

/**
 * Retrieves data by authenticating with login credentials.
 *
 * @returns {Promise<Object|null>} - The retrieved data if successful, or null if unsuccessful.
 */
async function getDataWithLogin() {
    let data= await getData()
    if (!data) {
        token=await getXhrToken()
        data = await getData()
        if(!data) return null
    }
    return data
}
/**
 * Gets the XHR token from the server.
 *
 * @returns {Promise<null>} A Promise that resolves to the XHR token or null if it couldn't be retrieved.
 */
async function getXhrToken(): Promise<null> {
    try {

        const url1 = 'https://' + adapter.config.adress + '/action/login';
        const payload = {
            langlist: 0,
            usrname: adapter.config.username,
            string: adapter.config.password
        };
        await axiosInstance.post(url1, querystring.stringify(payload), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const url2 = 'https://' + adapter.config.adress + '/js/csrf.jst';
        const response = await axiosInstance.get(url2);
        let regex = /token\[\"value\"\] = \"([0-9a-f]+)\";/;
        const match = response.data.match(regex);

        if (!match) {
            return null;
        }

        return match[1];

    } catch (error) {
        console.error(error);
        return null;
    }
}

/**
 * Retrieves data from a remote server.
 *
 * @returns A Promise that resolves to an object containing key-value pairs, or null if there was an error.
 */
async function getData(): Promise<{[key: string]: string} | null> {
    if (!token) {
        await adapter.setStateAsync("info.connection", false, true);
        return null;
    }

    const url = 'https://' + adapter.config.adress + '/get_smartLog_equip_info.asp?type=4&para1=' + adapter.config.para1 + '&para2=' + adapter.config.para2 + '&para3=';

    try {
        const response: AxiosResponse = await axiosInstance.get(url, {
            headers: {
                'x-csrf-token': token,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (response.status === 404) {
            return null;
        }

        const regex = /\|(\d+)~([^|]+)/g;
        let match = regex.exec(response.data);

        const d: {[key: string]: string} = {};

        while (match != null) {
            d[match[1]] = match[2];
            match = regex.exec(response.data);
        }
        await adapter.setStateAsync("info.connection", true, true);
        return d;
    } catch (error) {
        await adapter.setStateAsync("info.connection", false, true);
        console.error(error);
        return null;
    }
}


if (require.main !== module) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}