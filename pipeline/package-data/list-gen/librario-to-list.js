const fs = require('fs');
const path = require('path');

const directoryPath = '/path/to/your/directory/';

const filenames = fs.readdirSync('.').filter((file) => file.startsWith('libraries-io') && file.endsWith('.json'));

let list = '';
let sum = 0;
for (const filename of filenames) {
    const pkgs = JSON.parse(fs.readFileSync(filename, {encoding: 'utf8'}));
    console.log(pkgs.filename + ' ' + pkgs.length);
    sum += pkgs.length;
    list += pkgs.map(p => p.name).join('\n') + '\n';
}

console.log(sum);
fs.writeFileSync('libraries-io-list.txt', list, {encoding: 'utf8'});