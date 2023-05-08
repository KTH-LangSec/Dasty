const obj = {};

const x = () => console.log('hey');

obj.script || (obj.script = []);
obj.script.push(x);

for (let i = 0; i < obj.script.length; i++) {
    obj.script[i].call();
}