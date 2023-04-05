const obj = {};

console.log(obj.timeout.__taint);

eval(obj);