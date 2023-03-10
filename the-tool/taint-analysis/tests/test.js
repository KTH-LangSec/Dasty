const util = require('node:util');
const exec = util.promisify(require('child_process').exec);
const cp = require('child_process');

const mockModule = require('./module-wrapper/mock-module');

// console.log(mockModule.__entryPoint, typeof mockModule);

mockModule();
// mockModule();
mockModule().undefinedPropRead();

// const proxyFun = new Proxy(class Cl {
// }, {});

// proxyFun = new Proxy(() => {}, {});
//
// proxyFun(1, 2, 3);

