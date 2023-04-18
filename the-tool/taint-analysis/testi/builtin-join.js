const cp = require('child_process');

const obj = {};
const arr = [
    'echo',
    obj.flub,
];

cp.exec(arr.join());

const taintedArr = obj.taintedArr;
taintedArr.push('echo');
taintedArr.push(obj.flub);

cp.exec(taintedArr.join());

