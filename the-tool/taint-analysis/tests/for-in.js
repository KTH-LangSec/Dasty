const cp = require('child_process');

for (const prop in obj) {
    cp.exec('echo' + obj[prop]);
}

console.log(obj);