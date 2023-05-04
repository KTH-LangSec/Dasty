#!/bin/bash

apt-get update --fix-missing && \
apt-get install -y curl && \
apt-get install -y git && \
apt-get clean && \
rm -rf /var/lib/apt/lists/* &&

# Install Node.js 18.12.1
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash &&
nvm install 18.12.1 && nvm use 18.12.1 &&

# Setup mx
git clone https://github.com/graalvm/mx.git &&
export PATH="$(realpath ./mx/):${PATH}" && 

# Install Graal JDK
mx -y fetch-jdk --java-distribution labsjdk-ce-19 --to ./labsjdk-ce-19 &&
export JAVA_HOME="$(realpath ./labsjdk-ce-19/labsjdk-ce-19-jvmci-23.0-b04)" &&

# Install nodeprof.js
mkdir nodeprof-graalvm && \ 
cd nodeprof-graalvm && \
git clone https://github.com/pmoosi/nodeprof.js.git && \
cd nodeprof.js && \
mx sforceimports && \
mx build && \
cd ../.. &&

# Set environment variables for node and nodeprof
./setup_GRAAL_NODE.sh
