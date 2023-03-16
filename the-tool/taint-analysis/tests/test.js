const util = require('node:util');
const exec = util.promisify(require('child_process').exec);
const cp = require('child_process');

const mockModule = require('./module-wrapper/mock-module');

// console.log(mockModule.__entryPoint, typeof mockModule);

// mockModule();
// // mockModule();
// mockModule().undefinedPropRead();

const obj = {};
const x = 'echo' + obj.blub;

cp.exec(x);

