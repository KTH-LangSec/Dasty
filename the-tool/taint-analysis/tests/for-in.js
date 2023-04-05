const cp = require('child_process');

const obj = {};

for (let i = 0; i < 2; i++) {
    for (const prop in obj) {
        if (Object.hasOwn(obj, prop)) {
            console.log('nope');
        }

        cp.exec('echo' + obj[prop]);
    }
}