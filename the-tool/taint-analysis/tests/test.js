const util = require('node:util');
const exec = util.promisify(require('child_process').exec);
const cp = require('child_process');

const mockModule = require('./module-wrapper/mock-module');
const {spawn} = require("child_process");

const obj = {};

try {
    cp.exec(obj.blub);
} catch (e) {
    console.log(e);
}

