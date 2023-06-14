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

var results = db.getCollection('packageData')
  .find(
    {
      //"type": "Frontend" //"Not Instrumented" //"Pre Filtered"
      // "runs.results.sink.functionName": "Function"
      // "runs.results.sink.functionName": "execSync"
      // "runs.results.sink.functionName": "spawnSync"
      // "runs.results.sink.functionName": "exec"
      // "runs.results.sink.functionName": "spawn"
      "package": "node-fetch"
    },
    {
      /*
      * Projection
      * _id: 0, // exclude _id
      * fieldA: 1 // include field
      */
      //package: 1
    }
  )
  .sort({
    /*
    * fieldA: 1 // ascending
    * fieldB: -1 // descending
    */
  });

results.toArray()

// var fullResults = results.toArray();
// console.log(fullResults.length);
// fullResults