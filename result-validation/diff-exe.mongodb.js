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

var sinksNormalExe = db.getCollection("results").aggregate([
  { $unwind: "$runs" },
  { $unwind: "$runs.results" },
  { $match: { "runs.results.sink.type": "functionCallArg" } },
  {
    $group: {
      _id: {
        module: "$runs.results.sink.module",
        functionName: "$runs.results.sink.functionName",
        argIndex: "$runs.results.sink.argIndex",
        package: "$package",
        location: "$runs.results.sink.location"
      }
    }
  },
  { 
    $sort: {
      "_id.location.artifact": 1,
      "_id.location.region.start.line": 1,
      "_id.location.region.start.column": 1
      // "_id.module": 1,
      // "_id.functionName": 1,
      // "_id.argIndex": 1
    } 
  }
])

var sinksFBEExe = db.getCollection("resultsForcedBranchExec").aggregate([
  { $unwind: "$runs" },
  { $unwind: "$runs.results" },
  { $match: { "runs.results.sink.type": "functionCallArg" } },
  {
    $group: {
      _id: {
        module: "$runs.results.sink.module",
        functionName: "$runs.results.sink.functionName",
        argIndex: "$runs.results.sink.argIndex",
        package: "$package",
        location: "$runs.results.sink.location"
      }
    }
  },
  { 
    $sort: {
      "_id.location.artifact": 1,
      "_id.location.region.start.line": 1,
      "_id.location.region.start.column": 1
      // "_id.module": 1,
      // "_id.functionName": 1,
      // "_id.argIndex": 1
    } 
  }
])

const sinksNormalExeArray = sinksNormalExe.toArray()
console.log('[NormalExe] unique sink calls: ' + sinksNormalExeArray.length)

const sinksFBEExeArray = sinksFBEExe.toArray()
console.log('[FBEExe] unique sink calls: ' + sinksFBEExeArray.length)

function deepEqual(obj1, obj2) {
  if (obj1 === obj2) {
    return true;
  }

  if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (let key of keys1) {
    if (!obj2.hasOwnProperty(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}

const newFBEExeSinkCalls = []
const newFBEExePackages = new Set();
for (const sinkFBE of sinksFBEExeArray) {
  if (sinksNormalExeArray.some(element => deepEqual(element, sinkFBE)))
    continue;

  newFBEExeSinkCalls.push(sinkFBE);
  newFBEExePackages.add(sinkFBE._id.package)
}

console.log('[FBEExe] new sins calls: ' + newFBEExeSinkCalls.length)
console.log('in packages: ' + newFBEExePackages.size)
newFBEExeSinkCalls