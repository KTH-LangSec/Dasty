const {exec} = require('child_process');
// const obj = {
//     method: function() { return this; }
// };

// const unbound = (0, eval)('console.log("hey");');/
// exec("echo 'hey'");
// console.log(typeof reg);
const obj = {};
const cmd = obj.cmd || 'hey';
// exec('echo ' + cmd);
console.log((0, exec)('echo ' + cmd));
// new Flub().exec('hey');


// console.log((0, exec)(' '));
// console.log(typeof x);
// console.log(typeof exec.call(null, 'echo "hey"'));
// console.log(x);

// console.log(unbound);

// console.log(obj.method() === global);     // true
// console.log(unbound === global); // false