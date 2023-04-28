const cp = require('child_process');

function execWrapper(opt) {
    try {
        cp.exec('echo ' + opt)
    } catch (e) {
        console.log('something went wrong' + e.toString());
    }
}

const obj = {};

const hasOpt = obj.opt !== false;

let opt = '';
if (hasOpt) {
    opt = obj.opt;
}

execWrapper(opt);
