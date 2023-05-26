const cp = require('child_process');

function _spawn(cmd) {
    try {
        cp.exec(cmd);
    } catch (e) {

    }
}

function someFun() {}

const obj = {};

_spawn(obj.cmd);

someFun(obj.param);