const cp = require('child_process');

const obj = {};

const fn = obj.fn || false;

if (fn !== false && typeof fn !== "function") {
    throw new TypeError("Invalid type")
}

// console.log(typeof fn);

try {
    cp.exec(fn);
} catch (e) {

}

