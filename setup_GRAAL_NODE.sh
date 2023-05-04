#!/bin/bash

GRAALVM1=$(ls ./nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/ | grep GRAALVM_ ) &&
GRAALVM2=$(ls ./nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/$GRAALVM1/ | grep graalvm- ) &&

# Set up an environment variable with the path to the Node.js binary
#echo "/app/nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/$GRAALVM1/$GRAALVM2/languages/nodejs/bin/node" 
export GRAALVM_NODE_PATH="$(realpath ./nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/$GRAALVM1/$GRAALVM2/languages/nodejs/bin/node)"