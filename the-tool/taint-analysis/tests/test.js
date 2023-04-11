const obj = {};

const arr = obj.arr || [];

arr.push('hey');

console.log(arr[0].__taint !== undefined);

// console.log(obj.timeout.__taint);
//
// eval(obj);