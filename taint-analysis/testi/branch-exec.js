const utils = require('util');
const cp = require('child_process');
// const exec = utils.promisify(require('child_process').exec);

const obj = {};

// const x = 5;
// if (obj.additionalArgs === 'something') {
//     console.log('oh no');
// }

// const x = obj.additionalArgs || 'flub';

// for (let i = 0; i < 100; i++) {
//     if (x !== 'flub') {
//         if (obj.blub) {
//             console.log('exec');
//             cp.exec('echo' + obj.blub);
//         }
//     }
// }

if (!obj.blub) {
    console.log('hey');
} else {
    console.log('oh no');
}

// if (obj.blub) {
//     console.log('ho');
// }

// if (x === 'flub') {
//     console.log('yes');
// } else if (x === 'blub') {
//     console.log('oh no');
// } else if (x === 'drub') {
//     console.log('oh no no');
// }
//
// if (x === 'hub') {
//     console.log('hub');
// }

// async function processArgs(args) {
//
//     let cmd = "echo 'Test: '"
//
//     function processArgs(baseCommand, { additionalArgs }) {
//         if (additionalArgs !== undefined) {
//             return baseCommand + " " + additionalArgs.map(a => `'${a}'`).join(" ");
//         }
//         return baseCommand;
//     }
//
//     cmd = processArgs(cmd, obj);
//     cmd += ";";
//
//     await exec(cmd);
// }
//
// processArgs(obj).then();
