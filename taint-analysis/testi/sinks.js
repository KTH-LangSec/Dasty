const cp = require('child_process');

const obj = {};

const cmd = 'echo' + obj.echo;
console.log(cmd.__val);
// cp.spawn(cmd);

// eval('' + obj.eval);
//
const funBody = obj.fun || 'return a + b';
const fun = Function('a', 'b', funBody);
console.log(fun(10, 20));