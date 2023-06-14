// Note that this won't be recorded if not force branch executed

const cp = require('child_process');

const obj = {};

if (obj.blub) {
    cp.execSync('echo', {});
}