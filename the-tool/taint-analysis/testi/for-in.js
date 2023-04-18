const cp = require('child_process');

const obj = {};

// for (let i = 0; i < 2; i++) {
// for (const prop in obj) {
//     if (Object.hasOwn(obj, prop)) {
//         console.log('nope');
//     }
//
//     const cmd = 'echo' + obj[prop];
//     cp.exec(cmd);
// }
// }

function copy(obj) {
    const copy = {};
    for (const key in obj) {
        console.log(key);
        copy[key] = obj[key];
    }
    return copy;
}

const c = copy(obj);

console.log(obj);
console.log(c);

