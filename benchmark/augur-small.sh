#!/bin/bash

# Change to the specified directory
cd "../../thesis/analysis.old/augur/ts/"

cmd="node ./runner/cli.js --projectDir /home/pmoosi/Documents/KTH/2023-ss/the-tool/benchmark --projectName small --outputDir ../../out --printStack"

runtime=$((time -p  (timeout 5m $cmd >/dev/null)) |& grep real | awk '{print $2}')

# Output the runtime
echo "Runtime Augur gm: $runtime"
