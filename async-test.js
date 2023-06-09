// Object.prototype.blub = 'hey';
// Object.preventExtensions(Object.prototype);
// Object.freeze(Object.prototype);
Object.seal(Object.prototype);

const obj = {};

obj['__proto__'].blub = 42;

console.log(obj.blub);

