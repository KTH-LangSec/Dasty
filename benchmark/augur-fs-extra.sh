#!/bin/bash

# Change to the specified directory
cd "../../thesis/analysis.old/augur/ts/"

cmd="node ./runner/cli.js --projectDir /home/pmoosi/Documents/KTH/2023-ss/the-tool//pipeline/packages/fs-extra --projectName fs-extra --outputDir ../../out --printStack"

time -p (timeout 5m $cmd)
