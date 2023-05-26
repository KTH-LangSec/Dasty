const url = require('url');
const path = require('path');
const cp = require('child_process');

const obj = {};

const parsedUrl = url.parse('https://' + obj.url);

const str = path.join(parsedUrl.toString(), '/abc');

const byte = obj.byte || '0x12';
const x = Buffer.from([byte]);

try {
    cp.exec(x);
} catch (e) {

}
