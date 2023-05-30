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

// Select the database to use.
use('analysis_results_v3');

var collection = "results"; //"resultsForcedBranchExec"
var sinks = db.getCollection(collection).aggregate([
  { $unwind: "$runs" },
  { $unwind: "$runs.results" },
  { $match: { "runs.results.sink.type": "functionCallArg" } },
  {
    $group: {
      _id: {
        module: "$runs.results.sink.module",
        functionName: "$runs.results.sink.functionName"
      },
      uniquePackages: { $addToSet: "$package" },
      uniqueSinkLocations: {
        $addToSet: {
          code: "$runs.results.sink.code",
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
      uniquePackages: 1, 
      uniqueSinkLocations: 1
    }
  },
  { $sort: { 
    countUniquePackages: -1,
    countUniqueSinks: -1
  } }
])

var sinksArray = sinks.toArray()
console.log("rows: " + sinksArray.length)
console.log(" ")
// sinksArray

// read validated results
const exploitableCases = JSON.parse(
  fs.readFileSync('/app/the-tool/result-validation/exploitableCases.json', 'utf8'))

//create LATEX table rows
for (const sink of sinksArray) {
  let sinkName = ''
  if (sink._id.module !== '<builtin>') {
    const prefix = 'node:';
    if (sink._id.module.startsWith(prefix)) {
      sinkName = sink._id.module.substring(prefix.length)
    } else {
      sinkName = sink._id.module;
    }

    sinkName += '::'
  }

  if (sink._id.functionName != '') {
    sinkName += `${sink._id.functionName}()`;
  } else {
    // try to find a name sintacticlly from the code field
    const funcNames = new Set();
    for (const location of sink.uniqueSinkLocations) {
      const match = location.code.match(/([^.]+)\(/);
      if (match && match.length >= 2) {
        funcNames.add(`${match[1]}`);
      } else {
        funcNames.add('???');
      }
    }
    if (funcNames.size > 0) {
      sinkName += Array.from(funcNames).join(', ')
    } else {
      sinkName += '???'
    }
  }
  
  sinkName = sinkName.replaceAll('_', '\\_');
  const countDetectedSinks = sink.countUniqueSinks;
  const countDetectedPackages = sink.countUniquePackages;

  let countExploitableSinks = '???';
  let countExploitablePackages = '???';
  const verifiedData = exploitableCases[`${sink._id.module}::${sink._id.functionName}`];
  if (verifiedData) {
    countExploitableSinks = verifiedData.sinks;
    countExploitablePackages = verifiedData.packages;
  }

  console.log(`${sinkName} & \\multicolumn{1}{c|}{${countDetectedPackages}} & ${countDetectedSinks} & \\multicolumn{1}{c|}{${countExploitablePackages}} & ${countExploitableSinks} \\\\ \\hline`)
}
