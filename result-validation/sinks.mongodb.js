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

const packagesFile = '/app/the-tool/pipeline/package-data/lists/packages-of-interest.txt';
const topPackages = fs.readFileSync(packagesFile, 'utf-8')
  .split('\n')
  .slice(0, 4999)


// Select the database to use.
use('analysis_results_v3');

var collection = "resultsUnintrusiveRerun" //"results" // "resultsForcedBranchExec"
//var collection = "resultsForcedBranchExec"

const data = db.getCollection(collection);
//  .find({ package: { $in: topPackages } });

var countDocs = data.count();
console.log("documents: " + countDocs)

var countPackages = data.aggregate([
  { $match: { package: { $in: topPackages } } },
  { $group: { _id:"$package", count:{ $sum: 1 }}},
  { $group: { _id: null, count: { $sum: 1 }}}
])

console.log("unique packages: " + countPackages.toArray()[0].count)

var countPackagesRuns = data.aggregate([
  { $match: { package: { $in: topPackages } } },
  { $match: { $expr: { $ne: [{ $size: "$runs" }, 0] } } },
  { $group: { _id: "$package", count:{ $sum: 1 }}},
  { $group: { _id: null, count: { $sum: 1 }}}
])

console.log("unique packages with success runs: " + countPackagesRuns.toArray()[0].count)

// search all types of sinks
// data.aggregate([
//   { $match: { package: { $in: topPackages } } },
//   { $unwind: "$runs" },
//   { $unwind: "$runs.results" },
//   { $group: { _id: "$runs.results.sink.type", count: { $sum: 1 } } }
// //  { $group: { _id: null, uniqueSinkCount: { $sum: 1 } } }
// ])

var exploitablePackages = data.aggregate([
  { $match: { package: { $in: topPackages } } },
  { $unwind: "$runs" },
  { $unwind: "$runs.results" },
  { $match: { "runs.results.sink.type": "functionCallArg" } },
  {
    $group: {
      _id: "$package"
      // ,
      // uniqueSinks: { $addToSet: {
      //   module: "$runs.results.sink.module",
      //   functionName: "$runs.results.sink.functionName"
      // } }
    }
  }
  // ,
  // {
  //   $project: {
  //     _id: 1,
  //     count: { $size: "$uniqueSinks" }
  //   }
  // },
  // { $sort: { count: -1 } }
]);

exploitablePackagesArray = exploitablePackages.toArray();
console.log('potencial exploitable packages: ' + exploitablePackagesArray.length);
//exploitablePackagesArray


var sinks = data.aggregate([
  { $match: { package: { $in: topPackages } } },
  { $unwind: "$runs" },
  { $unwind: "$runs.results" },
  { $match: { "runs.results.sink.type": "functionCallArg" } },
  {
    $group: {
      _id: {
        module: "$runs.results.sink.module",
        functionName: "$runs.results.sink.functionName"
        //,argIndex:"$runs.results.sink.argIndex"
      },
      uniquePackages: { $addToSet: "$package" },
      uniqueSinkLocations: {
        $addToSet: {
          module: "$runs.results.sink.module",
          functionName: "$runs.results.sink.functionName",
          argIndex: "$runs.results.sink.argIndex",
          location: "$runs.results.sink.location"
        }
      }
    }
  }
  ,
  {
    $project: {
      _id: 1,
      countUniquePackages: { $size: "$uniquePackages" },
      countUniqueSinks: { $size: "$uniqueSinkLocations"},
      uniquePackages: 1
      //, uniqueSinkLocations: 1
    }
  },
  { $sort: { countUniquePackages: -1 } }
])

var sinksArray = sinks.toArray()
console.log("unique sinks: " + sinksArray.length)
sinksArray
