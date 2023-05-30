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

// Select the database to use.
use('analysis_results_v3');

var collection = "results"; //"resultsForcedBranchExec"
var countDocs = db.getCollection(collection).count();
console.log("documents: " + countDocs)

var countPackages = db.getCollection(collection).aggregate([
  { $group: { _id:"$package", count:{ $sum: 1 }}},
  { $group: { _id: null, count: { $sum: 1 }}}
])

console.log("unique packages: " + countPackages.toArray()[0].count)

var countPackagesRuns = db.getCollection(collection).aggregate([
  { $match: { $expr: { $ne: [{ $size: "$runs" }, 0] } } },
  { $group: { _id: "$package", count:{ $sum: 1 }}},
  { $group: { _id: null, count: { $sum: 1 }}}
])

console.log("unique packages with success runs: " + countPackagesRuns.toArray()[0].count)

// search for dublicates
db.getCollection(collection).aggregate([
  { $group: { _id:"$package", count:{ $sum: 1 }}},
  { $match: { count: { $gt: 1 } } },
]).toArray()
