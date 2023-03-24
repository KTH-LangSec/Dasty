const Mod = require('./mock-module');

// const mod = new Mod();

// const result = mod.undefinedPropRead();

Mod().then(() => {
    console.log('hey');
});


// const s = new Set(arrProxy);
// const s2 = new Set(Mod);

// Array.from(arrProxy);

// if (result?.__entryPoint) {
//     console.log(result.__entryPoint);
// }