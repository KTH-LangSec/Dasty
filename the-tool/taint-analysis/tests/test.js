const obj = {};

// const arr = obj.arr || [];

const filtered = ['a', 'b'].filter(elem => obj[elem]);
console.log(filtered);

// arr.push('hey');
//
// console.log(arr[0].__taint !== undefined);

// console.log(obj.timeout.__taint);
//
// eval(obj);