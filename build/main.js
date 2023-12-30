"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_axios = __toESM(require("axios"));
var import_tough_cookie = require("tough-cookie");
var import_querystring = __toESM(require("querystring"));
let adapter;
let cookieJar = new import_tough_cookie.CookieJar();
let token = null;
let timerId;
const axiosInstance = import_axios.default.create({
  httpsAgent: new (require("https")).Agent({
    rejectUnauthorized: false
  }),
  withCredentials: true
});
axiosInstance.interceptors.request.use((config) => {
  return new Promise((resolve, reject) => {
    cookieJar.getCookies(config.url, (err, cookies) => {
      if (err) {
        reject(err);
      }
      config.headers["Cookie"] = cookies.join("; ");
      resolve(config);
    });
  });
});
axiosInstance.interceptors.response.use((response) => {
  const setCookie = response.headers["set-cookie"];
  if (setCookie) {
    cookieJar.setCookieSync(setCookie[0], response.config.url);
  }
  return response;
});
function startAdapter(options = {}) {
  return adapter = utils.adapter(
    {
      ...options,
      name: "huawei-smartlogger-http",
      ready: main,
      unload: (callback) => {
        try {
          if (timerId)
            clearTimeout(timerId);
          callback();
        } catch (e) {
          callback();
        }
      },
      message: async (obj) => {
        if (typeof obj === "object") {
          if (obj.command === "send") {
            adapter.log.info("send command");
            let token2 = await getXhrToken();
            if (obj.callback)
              adapter.sendTo(obj.from, obj.command, "Message received", obj.callback);
          }
        }
      }
    }
  );
}
async function main() {
  await adapter.setStateAsync("info.connection", false, true);
  await setStates(null);
  await PollValues();
}
async function PollValues() {
  adapter.log.info("Pollvalues");
  const data = await getDataWithLogin();
  await setStates(data);
  if (adapter && adapter.config && adapter.config.interval > 0) {
    timerId = setTimeout(PollValues, adapter.config.interval * 1e3);
  } else {
    console.log("NO INTERVAL");
  }
}
async function setStates(data) {
  if (adapter && adapter.config && Array.isArray(adapter.config.items)) {
    for (const item of adapter.config.items) {
      const itemId = item.id.toString();
      if (data && data.hasOwnProperty(itemId)) {
        let value;
        if (item.type === "number") {
          value = parseFloat(data[itemId]) * Math.pow(10, item.multiplier);
        } else {
          value = data[itemId];
        }
        await adapter.setStateAsync(item.name, { val: value, ack: true });
      } else {
        await adapter.setObjectNotExistsAsync(item.name, {
          type: "state",
          common: {
            name: item.name,
            type: item.type,
            role: "value",
            read: true,
            write: true,
            unit: item.unit
          },
          native: {}
        });
      }
    }
  }
}
async function getDataWithLogin() {
  let data = await getData();
  if (!data) {
    token = await getXhrToken();
    data = await getData();
    if (!data)
      return null;
  }
  return data;
}
async function getXhrToken() {
  try {
    const url1 = "https://" + adapter.config.adress + "/action/login";
    const payload = {
      langlist: 0,
      usrname: adapter.config.username,
      string: adapter.config.password
    };
    await axiosInstance.post(url1, import_querystring.default.stringify(payload), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    const url2 = "https://" + adapter.config.adress + "/js/csrf.jst";
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
async function getData() {
  if (!token) {
    await adapter.setStateAsync("info.connection", false, true);
    return null;
  }
  const url = "https://" + adapter.config.adress + "/get_smartLog_equip_info.asp?type=4&para1=" + adapter.config.para1 + "&para2=" + adapter.config.para2 + "&para3=";
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        "x-csrf-token": token,
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    if (response.status === 404) {
      return null;
    }
    const regex = /\|(\d+)~([^|]+)/g;
    let match = regex.exec(response.data);
    const d = {};
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
  module.exports = startAdapter;
} else {
  startAdapter();
}
//# sourceMappingURL=main.js.map
