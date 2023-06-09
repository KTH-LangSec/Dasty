const fs = require('fs');

const oldPkgs = fs.readFileSync('../lists/packages-of-interest.txt', {encoding: 'utf8'}).split('\n').slice(0, 5000);

let newPkgs = fs.readFileSync('./libraries-io-list.txt', {encoding: 'utf8'}).split('\n');
newPkgs = newPkgs.filter(p => !oldPkgs.includes(p));

const amount = Math.ceil(newPkgs.length / 5);
for (let i = 0; i < 5; i++) {
    fs.writeFileSync('./libraries-io-list-' + (i + 1) + '.txt', newPkgs.slice(amount * i, amount * (i + 1)).join('\n'), {encoding: 'utf8'});
}