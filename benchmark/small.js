const {exec} = require('child_process');

const obj = {}
const bin = obj.bin || 'echo default';
const cmd = bin + ' something';

exec(cmd);