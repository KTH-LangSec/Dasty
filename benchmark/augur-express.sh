#!/bin/bash

# Change to the specified directory
cd "../../thesis/analysis.old/augur/ts/"

cmd="node ./runner/cli.js --projectDir ../../test-apps/express --projectName express --outputDir ../../out --printStack"

#runtime=$((time -p (timeout 5m $cmd)) |& grep real | awk '{print $2}')

time -p (timeout 5m $cmd)

# Output the runtime
#echo "Runtime Augur express: $runtime"
