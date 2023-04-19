const x = require('util');

const obj = {};

const t = [];

for (let i = 0; i < 2; i++) {
    t[i] = obj.blub;
}

console.log(t[0].__taint.source.iid);
console.log(t[1].__taint.source.iid);

// const obj = {};
//
// // const arr = obj.arr || [];
//
// const filtered = ['a', 'b'].filter(elem => obj[elem]);
// console.log(filtered);

// const env = process.env;
// //
// // // const fallback = 'fallback';
// //
// // const x = env.npm_config_arch;
// // const arch = x || process.arch;
// //
// const platform = env.npm_config_platform || process.platform;
// //
// // const platformId = [`${platform}`];
// //
// // if (arch === 'arm') {
// //     const fallback = process.versions.electron ? '7' : '6';
// //     platformId.push(`armv${env.npm_config_arm_version || process.config.variables.arm_version || fallback}`);
// // } else if (arch === 'arm64') {
// //     platformId.push(`arm64v${env.npm_config_arm_version || '8'}`);
// // } else {
// //     platformId.push(arch);
// // }
// //
// // const platformAndArch = platformId.join('-');
// //
// // const [plat, ar] = platformAndArch.split('-');
//
// const f = false;
//
// const libc = process.env.npm_config_libc ||
//     /* istanbul ignore next */
//     (f ? 'hui' : '');
//
// console.log(libc.__val, libc.__type);
// const libcId = platform !== 'linux' || libc !== '' ? 'yes' : libc;
// console.log(libc.__val, libc.__type);
//
// console.log(libcId);