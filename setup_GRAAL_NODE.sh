#!/bin/bash

GRAALVM1=$(ls ./nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/ | grep GRAALVM_ ) && \
GRAALVM2=$(ls ./nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/$GRAALVM1/ | grep graalvm- ) && \
export GRAAL_NODE="$(realpath ./nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/$GRAALVM1/$GRAALVM2/languages/nodejs/bin/node)"

#echo "/app/nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/$GRAALVM1/$GRAALVM2/languages/nodejs/bin/node" 
