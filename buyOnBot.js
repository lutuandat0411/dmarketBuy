import nacl from 'tweetnacl';
import * as https from 'https';
import ReadLine from 'readline';
import fs from 'fs';
import axios from 'axios';
import fetch from "node-fetch";

let rawdata = fs.readFileSync('file.json');
let item = JSON.parse(rawdata);
const { itemName, offSeS, itemId } = item;

const options = {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  },
  formatter = new Intl.DateTimeFormat([], options);

const getDate = () => {
  //   console.log(formatter.format(new Date()));
  return formatter.format(new Date());
};

export function byteToHexString(uint8arr) {
  if (!uint8arr) {
    return '';
  }

  let hexStr = '';
  const radix = 16;
  const magicNumber = 0xff;
  for (let i = 0; i < uint8arr.length; i++) {
    let hex = (uint8arr[i] & magicNumber).toString(radix);
    hex = hex.length === 1 ? '0' + hex : hex;
    hexStr += hex;
  }

  return hexStr;
}

function hexStringToByte(str) {
  if (typeof str !== 'string') {
    throw new TypeError('Wrong data type passed to convertor. Hexadecimal string is expected');
  }
  const twoNum = 2;
  const radix = 16;
  const uInt8arr = new Uint8Array(str.length / twoNum);
  for (let i = 0, j = 0; i < str.length; i += twoNum, j++) {
    uInt8arr[j] = parseInt(str.substr(i, twoNum), radix);
  }
  return uInt8arr;
}

function hex2ascii(hexx) {
  const hex = hexx.toString();
  let str = '';
  for (let i = 0; i < hex.length && hex.substr(i, 2) !== '00'; i += 2)
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return str;
}

// insert your api keys
const publicKey = '773ab3f90a39efb38e93a5ecc10c236a99266fa643bc9398da4f2d63018864af';
const secretKey =
  'f5e44cad091c9b6f3d526cf21e53afea9b72a30c9e6c43b320481522dd09ad3a773ab3f90a39efb38e93a5ecc10c236a99266fa643bc9398da4f2d63018864af';

const host = ' ';
const readline = ReadLine.createInterface({
  input: process.stdin,
  output: process.stdout
});
let limitItemStack = 10;
let itemFound = {};
// let data;
export const encodeQuery = (obj) => {
  return Object.keys(obj)
    .filter(([key, value]) => typeof key !== 'undefined' || typeof value !== 'undefined')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent('' + obj[key])}`)
    .join('&');
};

const createQueryString = (data) => {
  return Object.keys(data).map(key => {
    let val = data[key]
    if (val !== null && typeof val === 'object') val = createQueryString(val)
    return `${key}=${encodeURIComponent(`${val}`.replace(/\s/g, '_'))}`
  }).join('&')
}


function getListItemByName(itemName) {
  const objectParams = {
    gameId: 'a8db',
    title: itemName,
    limit: limitItemStack,
    currency: 'USD',
    orderBy: 'createdAt',
    orderDir: 'desc',
    offset: 0,
    priceFrom: 0,
    priceTo: 0,
  };
  return axios({
    url: `https://api.dmarket.com/exchange/v1/market/items${encodeQuery(objectParams)}`,
    method: 'get',
    maxRedirects: 0,
  })
}

function sign(string) {
  const signatureBytes = nacl.sign(
    new TextEncoder('utf-8').encode(string),
    hexStringToByte(secretKey)
  );
  return byteToHexString(signatureBytes).substr(0, 128);
}

async function findSpecifyItem() {
  try {
    const response = await getListItemByName(itemName);
    console.log(response);
    // if(data.length > 0) {
    //   itemFound = data.find((item) => {
    //     return item.extra.floatValue && item.extra.floatValue.toString() === itemId;
    //   });
    //   if (itemFound && Object.keys(itemFound).length > 0) {
    //     console.log('Item found! Making offer to buy...');
    //     buyItem();
    //   } else {
    //     console.log('\x1b[36m%s\x1b[0m', getDate(), 'item not found');
    //   }
    // }
    // else {
    //   console.log('\x1b[36m%s\x1b[0m', getDate(), 'List is null');
    // }
  } catch (e) {
    console.log('Cannot find item: ', e);
  }
}

async function buyItem() {
  try {
    const method = 'PATCH';
    const apiUrlPath = '/exchange/v1/offers-buy';
    const offer = JSON.stringify({
      offers: [
        {
          offerId: itemFound.extra.offerId,
          price: {
            amount: itemFound.price.USD,
            currency: 'USD'
          },
          type: 'dmarket'
        }
      ]
    });
    const timestamp = Math.floor(new Date().getTime() / 1000);
    const stringToSign = method + apiUrlPath + offer + timestamp;
    const signature = sign(stringToSign);
    const requestOptions = {
      host: host,
      path: apiUrlPath,
      method: method,
      headers: {
        'X-Api-Key': publicKey,
        'X-Request-Sign': 'dmar ed25519 ' + signature,
        'X-Sign-Date': timestamp,
        'Content-Type': 'application/json'
      }
    };
    const result = await makeOfferAndBuy(requestOptions, offer);
    if (result) {
      const data = JSON.stringify({ itemName, offSeS, itemId, isBuySuccess: true });
      fs.writeFileSync('file.json', data);
    }
  } catch (e) {
    console.log('buyItem', e);
  }
}

function makeOfferAndBuy(requestOptions, offer) {
  return new Promise(function (resolve, reject) {
    const result = https.request(requestOptions, (response) => {
      console.log('statusCode:', response.statusCode);
      response.on('data', (responseBodyBytes) => {
        try {
          console.log('Buy success', hex2ascii(byteToHexString(responseBodyBytes)));
          itemFound = {};
        } catch (e) {
          console.log('makeOfferAndBuy trong promise', e);
          reject(e);
        }
        resolve(responseBodyBytes);
      });
    });

    result.on('error', (e) => {
      console.error('makeOfferAndBuy', e);
    });

    result.write(offer);
    result.end();
  });
}

function askToBuyItem() {
  setInterval(() => {
    findSpecifyItem();
  }, 0);
}

askToBuyItem();
