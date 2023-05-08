const obj = {};

obj.script || (obj.script = []);
obj.script.push('ho');

console.log(0 < obj.script.length);