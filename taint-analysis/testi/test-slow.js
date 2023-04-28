const cp = require('child_process');

const obj = {};

setTimeout(() => {
    cp.exec('echo' + obj.blub);
}, 5000);
