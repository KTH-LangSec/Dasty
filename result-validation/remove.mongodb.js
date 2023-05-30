/* global use, db */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use('analysis_results_v3');

db.getCollection('results')
  .remove({_id: ObjectId("645a3864a6a12ee1752cc1a8")})



