## Installation

This repository provides instructions on how to set up a development environment for running Node.js programs with NodeProf and GraalVM.

### Prerequisites
- build-essential
- python3

### Step by Step
#### Install nvm
```
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash`
```

#### Install Node.js 18.12.1
```
nvm install 18.12.1
```

#### Setup mx
```
git clone https://github.com/graalvm/mx.git
export PATH=/path/to/mx/:$PATH
```

#### Install Graal JDK
```
mx fetch-jdk --java-distribution labsjdk-ce-19
export JAVA_HOME=/path/to/labsjdk-ce-19-jvmci-23.0-b04
```

#### Install nodeprof.js
```
mkdir nodeprof-graalvm && cd nodeprof-graalvm
git clone https://github.com/pmoosi/nodeprof.js.git
mx sforceimports
mx build
```

#### Set environment variables for node and nodeprof
```
export GRAAL_NODE_HOME=/path/to/nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/GRAALVM_6B34DA359F_JAVA19/graalvm-6b34da359f-java19-23.0.0-dev/languages/nodejs/bin/node
export NODEPROF_HOME=/path/to/nodeprof-graalvm/nodeprof.js/
```

#### Clone this repository
```
git clone https://github.com/pmoosi/the-tool.git
```

## Usage

To be continues ...