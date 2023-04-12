const utils = require('util');
const exec = utils.promisify(require('child_process').exec);

const obj = {};

const x = 5;
if (obj.additionalArgs === 'something') {
    console.log('oh no');
}

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
