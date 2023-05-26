const fs = require('fs');

const list1 = fs.readFileSync('../lists/packages-of-interest.txt', {encoding: 'utf8'}).split('\n');
const list2 = fs.readFileSync('../lists/with-results.txt', {encoding: 'utf8'}).split('\n');

// const list2 = fs.readFileSync('libraries-io-list.txt', {encoding: 'utf8'}).split('\n');

const res = [];
for (let i = 0; i < 5000; i++) {
    if (list2.includes(list1[i])) {
        res.push(list1[i]);
    }
}

fs.writeFileSync('../lists/with-results-5000.txt', res.join('\n'), {encoding: 'utf8'});

// let notExistsCounter = 0;
// for (let i = 0; i < list1.length; i++) {
//     const pkg1 = list1[i];
//     const i2 = list2.indexOf(pkg1);
//
//     if (!i2 || i2 === -1) {
//         notExistsCounter++;
//     }
//
//     console.log(pkg1 + ': ' + i + ' - ' + (i2 > -1 ? i2 : 'x'));
// }
//
// console.log(notExistsCounter);