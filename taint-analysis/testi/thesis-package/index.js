const {execSync} = require('child_process');

function run(options) {
    const opts = options || {};

    const bin = opts.bin || './default.exe';
    const newProcess = opts.newProcess;

    const cmd = bin + ' --flag';

    if (newProcess) {
        execSync(cmd);
    }
    // ...
}

module.exports = {run};