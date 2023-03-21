const util = require('node:util');
const exec = util.promisify(require('child_process').exec);
const cp = require('child_process');

const mockModule = require('./module-wrapper/mock-module');
const {spawn} = require("child_process");

// console.log(mockModule.__entryPoint, typeof mockModule);

// mockModule();
// // mockModule();
// mockModule().undefinedPropRead();

function execIt(cmd) {
    return new Promise(resolve => {
        cp.exec(cmd, () => resolve());
    });
}

const obj = {};

cp.exec(obj.blub);
//
// const proc = spawn('python3.8');
// proc.stdin.write('hey');

// const x = 'echo' + obj.blub;
//
// console.log('before');
// execIt(x).then(() => console.log('script done'));

