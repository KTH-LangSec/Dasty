const fs = require('fs');

const list2 = fs.readFileSync('libraries-io-list.txt', {encoding: 'utf8'}).split('\n');
const list1 = fs.readFileSync('../lists/packages-of-interest.txt', {encoding: 'utf8'}).split('\n');

let notExistsCounter = 0;
for (let i = 0; i < 2000; i++) {
    const pkg1 = list1[i];
    const i2 = list2.indexOf(pkg1);

    if (i2 >= 2000 || i2 === -1) {
        notExistsCounter++;
    }

    console.log(pkg1 + ': ' + i + ' - ' + (i2 > -1 ? i2 : 'x'));
}

console.log(notExistsCounter);