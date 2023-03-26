// DO NOT INSTRUMENT

// overwrites process.execPath and executes the actual script

const path = require('path');
const mod = require('module');

// path to node binary wrapper
process.execPath = __dirname + '/node';
process.argv[0] = __dirname + '/node';

// remove this script from the args
let scriptIndex = process.argv.findIndex(a => a === __filename);
process.argv.splice(scriptIndex, 1);

// resolve the path for the actual script
process.argv[scriptIndex] = path.resolve(process.argv[scriptIndex]);

// console.log(process.argv);

// console.log(process.argv);
// console.log(process.execPath, process.argv);

// execute the script
mod.runMain();

// require(process.argv[scriptIndex]);