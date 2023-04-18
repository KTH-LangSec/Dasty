const cp = require('child_process');

const obj = {};
const args = [
    obj.flub,
    'hey'
];

const proc = cp.spawn('echo' + obj.cmd, args);

proc.on('exit', () => {
    console.log('proc exit');
});