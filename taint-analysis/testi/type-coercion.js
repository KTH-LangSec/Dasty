const obj = {};

const inj = obj.prop + ', ';

console.log([1, 2, 3].join(inj));

const str = inj.toString();
console.log(!!str.__taint);

const val = inj.valueOf();
console.log(!!val.__taint);
// console.log(inj.valueOf());