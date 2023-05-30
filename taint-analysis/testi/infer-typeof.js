// const a = 'a';
//
// if (a === 'a') {
//
// }
//
// if (a !== 'b') {
//
// }
//
// const isNotB = a !== 'b';
//
// if (isNotB) {
//
// }

const cp = require('child_process');

const obj = {};

const fn = obj.fn;

const tpe = typeof fn !== "number";
console.log(fn.__type);

if (tpe) {
    throw new TypeError("Invalid type " + tpe)
}

try {
    cp.exec(tpe.toString());
} catch (e) {

}

