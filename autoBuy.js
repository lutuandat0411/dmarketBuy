import nacl from 'tweetnacl';
import * as https from 'https';
import ReadLine from 'readline';
import fs from 'fs';

let rawdata = fs.readFileSync('file.json');
let item = JSON.parse(rawdata);
const { itemName, offSeS, itemId, isBuySuccess, maxPrice } = item;

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
const publicKey = '093a0fbc0c4b137080c4ed41af6b0f6b3ac6fe4098f6382ae059030fe01aa245';
const secretKey =
  '80d7c7c9f6c7bcad071041e012a897ab8c1ac9831f0e7ee47219549a25191e7b093a0fbc0c4b137080c4ed41af6b0f6b3ac6fe4098f6382ae059030fe01aa245';

const host = 'api.dmarket.com';
const readline = ReadLine.createInterface({
  input: process.stdin,
  output: process.stdout
});
let limitItemStack = 999;
let itemFound = {};
// let data;
export const encodeQuery = (obj) => {
  return Object.keys(obj)
    .filter(([key, value]) => typeof key !== 'undefined' || typeof value !== 'undefined')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent('' + obj[key])}`)
    .join('&');
};

function getListItemByName(itemName) {
  const objectParams = {
    Title: itemName,
    Limit: limitItemStack
  };
  const timestamp = Math.floor(new Date().getTime() / 1000);
  const stringToSign =
    'GET' + `/exchange/v1/offers-by-title` + JSON.stringify(objectParams) + timestamp;
  const signature = sign(stringToSign);
  const requestOptions = {
    host: host,
    path: `/exchange/v1/offers-by-title?${encodeQuery(objectParams)}`,
    method: 'GET',
    headers: {
      'X-Api-Key': publicKey,
      'X-Request-Sign': 'dmar ed25519 ' + signature,
      'X-Sign-Date': timestamp,
      'Content-Type': 'application/json'
    }
  };
  // 'X-RateLimit-Limit-Second': 6,
  // 'X-RateLimit-Remaining-Second': 5,
  // 'RateLimit-Remaining': 5,
  // 'RateLimit-Limit': 6,
  // 'RateLimit-Reset': 1

  // you can use a more high-level wrapper for requests instead of native https.request
  // check https://github.com/axios/axios as an example
  return new Promise(function (resolve, reject) {
    const request = https.request(requestOptions, (response) => {
      let body = [];
      response.on('data', function (chunk) {
        body.push(chunk);
      });
      // resolve on end
      response.on('end', function () {
        try {
          body = JSON.parse(Buffer.concat(body).toString());
        } catch (e) {
          reject('getListItemByName', e);
        }
        resolve(body);
      });
    });
    request.end();
  });
}

function sign(string) {
  const signatureBytes = nacl.sign(
    new TextEncoder('utf-8').encode(string),
    hexStringToByte(secretKey)
  );
  return byteToHexString(signatureBytes).substr(0, 128);
}

function makeOfferAndBuy(requestOptions, offer) {
  return new Promise(function (resolve, reject) {
    const result = https.request(requestOptions, (response) => {
      console.log('statusCode:', response.statusCode);
      response.on('data', (responseBodyBytes) => {
        try {
          console.log(hex2ascii(byteToHexString(responseBodyBytes)));
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

let isRunFindSpecifyItem = true;
async function findSpecifyItem() {
  isRunFindSpecifyItem = false;
  try {
    const result = await getListItemByName(itemName);
    limitItemStack = result.total.offers;
    if(result.objects.length > 0) {
      itemFound = result.objects.find((item) => {
        return item.extra.floatValue && item.extra.floatValue.toString() === itemId;
      });
      if (itemFound === undefined) {
        itemFound = {};
      } 
      if (Object.keys(itemFound).length > 0) {
        console.log('Item found! Making offer to buy...');
        buyItem();
      } else {
        console.log('\x1b[36m%s\x1b[0m', getDate(), 'item not found');
      }
    }
    else {
      console.log('\x1b[36m%s\x1b[0m', getDate(), 'List is null');
    }
  } catch (e) {
    console.log('findSpecifyItem', e);
  } finally {
    isRunFindSpecifyItem = true;
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
          type: 'p2p'
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
    if (Number(itemFound.price.USD) > Number(maxPrice)) {
      console.log('Item is overpaid:', Number(itemFound.price.USD));
    }else {
      const result = await makeOfferAndBuy(requestOptions, offer);
      if (result) {
        const data = JSON.stringify({ itemName, offSeS, itemId, isBuySuccess: true });
        fs.writeFileSync('file.json', data);
      }
    }
  } catch (e) {
    console.log('buyItem', e);
  }
}

function askToBuyItem() {
  try {
    setInterval(() => {
      const obj = { itemName, offSeS, itemId, isBuySuccess, maxPrice };
      if (isBuySuccess) {
        console.log('buy success');
      } else {
        if (isRunFindSpecifyItem) {
          try {
            findSpecifyItem();
          } catch (error) {
            console.log('trong try catch', error);
          }
        }
      }
    }, 1000);
  } catch (error) {
    console.log('askToBuyItem', error);
  }
}

askToBuyItem();
