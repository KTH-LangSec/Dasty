#!/bin/bash

# Change to the specified directory
cd "../../thesis/analysis.old/augur/ts/"

cmd="node ./runner/cli.js --projectDir ../../test-apps/gm --projectName gm --outputDir ../../out --printStack "

# Execute 'npm test' and measure the runtime
runtime=$((time -p $cmd >/dev/null) |& grep real | awk '{print $2}')

# Output the runtime
echo "Runtime Augur gm: $runtime"
