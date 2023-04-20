const obj = {undef: undefined};
const nonPropObj = Object.create(null);

const inj = obj.prop;
const undef = obj.undef;
const undefNonProp = nonPropObj.prop;

console.log('injected', !!inj?.__taint);
console.log('undef', !!undef?.__taint);
console.log('undefNonProp', !!undefNonProp?.__taint);