const obj = {};

obj.script || (obj.script = []);
obj.script.push('ho');

for (let i = 0; i < obj.script.length; i++) {
    console.log(obj.script[i]);
}