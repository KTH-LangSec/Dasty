const request = require('request');
const JSONStream = require('JSONStream');
const fs = require('fs');
const path = require('path');

const dependedUpon = {};
const devDependedUpon = {};

let i = 0;

request('https://skimdb.npmjs.com/registry/_all_docs?include_docs=true')
    .pipe(JSONStream.parse('rows.*.doc'))
    .on('data', function (doc) {
        console.log(i++);
        // project against outdated or broken package.json
        if (!doc?.versions || !doc['dist-tags']?.latest) return;

        const latest = doc['dist-tags'].latest;
        const dependencies = doc.versions[latest]?.dependencies ? Object.keys(doc.versions[latest].dependencies) : [];
        const devDependencies = doc.versions[latest]?.devDependencies ? Object.keys(doc.versions[latest].devDependencies) : [];

        dependencies.forEach((p) => {
            if (dependedUpon[p]) {
                dependedUpon[p]++;
            } else {
                dependedUpon[p] = 1;
            }
        });

        devDependencies.forEach((p) => {
            if (devDependedUpon[p]) {
                devDependedUpon[p]++;
            } else {
                devDependedUpon[p] = 1;
            }
        });
    })
    .on('end', function () {
        fs.writeFileSync(path.resolve('list-dep.json'), JSON.stringify(dependedUpon), {encoding: 'utf8'});
        fs.writeFileSync(path.resolve('list-dev-dep.json'), JSON.stringify(devDependedUpon), {encoding: 'utf8'});
    })