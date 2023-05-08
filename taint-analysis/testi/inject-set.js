const obj = {};

obj.script || (obj.script = 'console.log("hey")');

eval(obj.script);