// const cp = require('child_process');
const fs_1 = require("fs");
//
// const path = '';
//
const path = '';
try {
    // console.log(fs_1.statSync);
    const obj = {}
    const x = ((0, fs_1.statSync)(obj.blub + ''));
    // const x = Reflect.apply(fs_1.statSync, 0, [path]);
    // const x = fs_1.statSync(path);
    // console.log(x);
    // const x = fs.statSync.call(0, path);
    // console.log(x(path));
} catch (e) {
    // console.log(e);
}
// const testFile = '';
// const result = statPathSync(testFile);
//
// console.log(!!result);
//
// console.log(result);
//
// function statPathSync(path) {
//     var _a;
//     try {
//         return (0, fs_1.statSync)(path);
//     } catch (err) {
//         if (err !== undefined && err != null && ((_a = err) === null || _a === void 0 ? void 0 : _a.code) === 'ENOENT') {
//             return undefined; // catch the error if the directory dosnt exist, without throwing an error
//         }
//         throw err;
//     }
// }

// const obj = {};
//
// const exec = cp.exec;
// // console.log(exec);
//
// exec('echo' + obj.blub);