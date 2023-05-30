const fs = require('fs');

const sinkCalls = JSON.parse(
  fs.readFileSync('/app/the-tool/result-validation/newFBESinkCalls.json', 'utf8'));

const sinks = sinkCalls.reduce((result, item) => {
  const element = item._id;
  const key = element.module + '::' + element.functionName;
  if (!result[key]) {
    result[key] = [];
  }
  result[key].push(element.package);
  return result;
}, {});

console.log(JSON.stringify(sinks, null, 2));

