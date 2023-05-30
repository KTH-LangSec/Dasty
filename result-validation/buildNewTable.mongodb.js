/* global use, db */
// MongoDB Playground
// To disable this template go to Settings | MongoDB | Use Default Template For Playground.
// Make sure you are connected to enable completions and to be able to run a playground.
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.
// The result of the last command run in a playground is shown on the results panel.
// By default the first 20 documents will be returned with a cursor.
// Use 'console.log()' to print to the debug output.
// For more documentation on playgrounds please refer to
// https://www.mongodb.com/docs/mongodb-vscode/playgrounds/

const fs = require('fs')

const exploitablePackages = JSON.parse(
  fs.readFileSync('/app/the-tool/result-validation/exploitablePackages.json', 'utf8'));

//const packagesFile = '/app/the-tool/pipeline/package-data/lists/packages-of-interest.txt';
const packagesFile = '/app/the-tool/pipeline/package-data/list-gen/libraries-io-list.txt';
const topPackages = fs.readFileSync(packagesFile, 'utf-8').split('\n');
  

for (const package in exploitablePackages) {
  if (exploitablePackages[package].type !== 'TP')
    continue;

  console.log(`${package}: ${topPackages.indexOf(package)}`)
}
