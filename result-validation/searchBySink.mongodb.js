/* global use, db */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use('analysis_results_v3');

// Search for documents in the current collection.
var results = db.getCollection('results')
  .find(
    {
      // "runs.results.sink.functionName": "eval"
      // "runs.results.sink.functionName": "Function"
      // "runs.results.sink.functionName": "execSync"
      // "runs.results.sink.functionName": "spawnSync"
      // "runs.results.sink.functionName": "exec"
      //"runs.results.sink.functionName": "spawn"
      //"runs.results.codeFlow.name": "spawn"
      //"taints.codeFlow.name": "spawn"
      "package": "express"

      // "runs.results": {
      //   $elemMatch: {
      //     "sink.module": "node:internal/streams/readable",
      //     "sink.functionName": ""
      //   }
      // }


      // find inherits with argIndex 0
      // "runs.results": {
      //   $elemMatch: {
      //     "sink.functionName": "inherits",
      //     "sink.argIndex": 0
      //   }
      // }
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

results

// var fullResults = results.toArray();
// console.log(fullResults.length);
// fullResults