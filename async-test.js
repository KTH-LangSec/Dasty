const fs = require('fs');
const mongo = require('mongodb');
const path = require('path');

const p = path.resolve('./taint-analysis/testi/module-wrapper/index.js');
console.log(!!require[p]);
const pipeline = require('./taint-analysis/testi/module-wrapper');

// let obj = {__proto__: null};
//
// console.log({} + 'hey');
// console.log(obj + ' hey ');

console.log(!!require.cache[p]);