const obj = {};

const tainted = {x: obj.prop};

eval(tainted);
console.log('tainted', tainted);
eval(tainted);