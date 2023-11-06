# Dasty: Dynamic Taint Analysis Tool for Prototype Pollution Gadgets Detection

Dasty is a performant dynamic taint analysis tool for the detection of prototype pollution gadgets in Node.js
applications. It is a prototype implementation of the approach described in
my [Master's thesis](https://urn.kb.se/resolve?urn=urn:nbn:se:kth:diva-337039).
The implementation is based on instrumentation
with [NodeProf by Sun et al](https://github.com/Haiyang-Sun/nodeprof.js).

## Overview

Dasty reports flows from pollutable prototype properties to potentially dangerous function calls. Concretely, Dasty
defines as sources every object property access (dot or brackets notation) that accesses `Object.prototype`. Sinks
are defined as all Node.js API calls except the functions of the `assert` module. A recorded flow contains the code
locations of the source, the sink and the code flow, i.e. all operations it was propagated through.

The flows are stored in a MongoDB database and can be exported as [Sarif](https://sarifweb.azurewebsites.net/) files for
convenient analysis.

Dasty can be run on specific file or leverage the test suits of an application as a basis for the analysis. In addition,
it provides a pipeline to automatically install and analyze npm packages.

### Analysis Phases

A complete analysis consists of three phases:

1. A pre-analysis that determines if the analyzed packages is intended to be used on the server by looking for Node.js
   API calls. Only if this is the case the analysis is continued. This filtering can be skipped if not needed by
   specifying the `--noPre` flag.
2. The *unintrusive* taint analysis runs the provided application once. It aims to record all gadgets that do not rely
   on control flow alteration.
3. Finally, the *forced branch execution* taint analysis selectively conducts multiple runs in which the control flow
   of the program is altered based on polluted prototype properties. Through forced branch execution Dasty is able to
   detect flows that rely on multiple polluted properties.

For an in depth description of the concepts and the implementation see thesis report.

## Installation

Dasty utilizes NodeProf which is built on top of the Truffle Instrumentation Framework and the GraalVM. If you encounter
any problems during the installation process please refer to their documentation.

### Prerequisites

- build-essential
- python3

### Install Node

The current implementation requires Node 18.12.1 installed via nvm and the `NVM_DIR` environment variable to be set. If
you want to use another installation, you need to adapt the path to the node executable
in [`node.py`](pipeline/node-wrapper/node.py), [`node`](pipeline/node-wrapper/node) and [`npm`](pipeline/node-wrapper/npm).
However, we do not recommend to use a version other than 18.12.1.

#### 1. Install nvm

```bash
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash`
```

#### 2. Install Node.js 18.12.1

```bash
nvm install 18.12.1
```

### Install NodeProf

#### 1. Setup mx

```bash
git clone https://github.com/graalvm/mx.git
export PATH=/path/to/mx/:$PATH
```

#### 2. Install the GraalVM JDK

```bash
mx fetch-jdk --java-distribution labsjdk-ce-19
export JAVA_HOME=/path/to/labsjdk-ce-19-jvmci-23.0-b04
```

#### 3. Install NodeProf

```bash
mkdir nodeprof-graalvm && cd nodeprof-graalvm
git clone https://github.com/pmoosi/nodeprof.js.git
mx sforceimports
mx build
```

#### 4. Set environment variables

```bash
export GRAAL_NODE=/path/to/nodeprof-graalvm/graal/sdk/latest_graalvm_home/bin/node
export NODEPROF_HOME=/path/to/nodeprof-graalvm/nodeprof.js/
```

### Install Dasty

#### 1. Setup

```bash
git clone https://github.com/pmoosi/Dasty.git
cd /path/to/dasty
npm install
```

#### 2. Install MongoDB on your system. You can follow the installation guide [here](https://www.mongodb.com/docs/manual/installation/#mongodb-installation-tutorials).

#### 3. Configure [`pipeline/db/conn.js`](`pipeline/db/conn.js`)

## Usage

To analyze a package run the [`index.js`](pipeline/index.js) file in the `pipeline` directory.

### General usage

#### Running analysis

```bash
node index.js [flags] <pkgName>
node index.js --fromFile [flags] /path/to/packages-list
```

The results are stored in MongoDB.

#### Exporting results

```bash
node index.js --sarif [flags] [pkgName]
```

Depending on the flags an export can create up to four files per package/application:

1. `<name>.sarif` contains the found flows
2. `<name>-exceptions.sarif` contains potential pollutions that might have caused an exception/crash.
3. `<name>-all-taints` contains all sources and code flows independent of them reaching a sink or not. These are only
   recorded in the *unintrusive* run.
4. `<name>-branched-on` contains all sources that flowed into a conditional.

### Example usage

Analyze specific package:

```bash
node index.js express
```

Analyze a list of packages and skip already analyzed ones
(stored in pipeline/package-data/already-analyzed.txt):

```bash
node index.js --fromFile --skipDone /path/to/packages-list
```

Ignore previous pre-analysis result and force full analysis

```bash
node index.js --force express
```

Analyze a specific file:

```bash
node index.js --execFile /path/to/file.js <name>
```

Export all sarif data of the last analysis for a specific package:

```bash
node index.js --sarif --allTaints --out /path/to/sarif.sarif express
```

Export all sarif data of the last analysis for all analyzed packages:

```bash
node index.js --sarif --allTaints --outDir /path/to/sarif-dir/
```

### All flags:

#### General

| Flag                      | Description                                                                                  |
|---------------------------|----------------------------------------------------------------------------------------------|
| `--fromFile`              | Use a list of packages from a file containing a list of package names separated by new line. |                                                                                        
| `--skipTo <package_name>` | Skip to the specified package in the provided list.                                          |
| `--skipToLast`            | Skip to the last analyzed package.                                                           |
| `--skipDone`              | Skip all already analyzed packages                                                           |

#### Analysis

| Flag                                   | Description                                                                                                                      |
|----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| `--forceBranchExec`                    | Enable force branch execution.                                                                                                   |
| `--onlyForceBranchExec`                | Only do force branch execution runs. Requires at least one previous unintrusive run.                                             |
| `--execFile <file_path>`               | Specify a file instead of a package to run.                                                                                      |
| `--noForIn`                            | Disable `for..in` injection run.                                                                                                 |
| `--onlyPre`                            | Only run the pre-analysis phase.                                                                                                 |
| `--noPre`                              | Skip the pre-analysis phase.                                                                                                     |
| `--force`                              | Force analysis (ignore previous pre-analysis results)                                                                            |
| `--collPrefix <prefix>`                | Specify a prefix for the MongoDB collection containing the results for the run                                                   |
| `--forceBranchExecCollPrefix <prefix>` | Specify where the forced branch exec information should be obtained. Use only if it deviates from the current collection prefix. |
| `--processNr <n>`                      | Specify a unique number to run multiple analyses in parallel                                                                     |
| `--forceProcess`                       | Forces the process to run                                                                                                        |
| `--forceSetup`                         | Force the setup phase of a package. Usually the setup is skipped when the package is already present.                            |

#### Sarif export

| Flag                         | Description                                                                                                                                                   |
|------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--sarif`                    | Output results in SARIF format.                                                                                                                               |
| `--out <output_file_path>`   | Specifies the path and file name for the output file.                                                                                                         |
| `--outDir <output_dir_path>` | Specifies the directory for the output file.                                                                                                                  |
| `--allTaints`                | Export all injected taints in addition to the flows (in a separate file).                                                                                     |
| `--exportRuns <n>`           | Export the last <n> runs (only works for flows and exceptions not for all taints and branchings) injections from the previous runs are skipped (default : 1). |

### Package Data Files

Information about analyzed packages are located in `pipeline/package-data`:

* `already-analyzed.txt`: Contains all already analyzed packages (is used for `--skipDone`)
* `last-analyzed.txt`: Contains the name of the last analyzed package (is used for `--skipToLast`)
* `nodejs-packages.txt`: Contains all package names that passed the pre-analysis
* `frontend-packages.txt`: Contains all package names that failed the pre-analysis
* `err-packages.txt`: Contains all package names that crashed during the pre-analysis (with an uncaught exception).
  Note, that if a node API call was encountered it is still added to `nodejs-packages.txt`
* `non-instrumented-packages.txt`: Contains all package names that ran but were never instrumented
* `filtered-packages`: Contains package names that were filtered out due to their name

If a package is either in `nodejs-packages.txt`, `frontend-packages.txt`, `err-packages.txt`
or `non-instrumented-packages.txt` the pre-analysis is skipped (if `--force` is not set).

## Why is the application/package not being analyzed?

If you encounter problems running the analysis you might want to try changing the pipeline filters which are in place to
avoid unnecessary instrumentation and analysis runs. If the analyzed package matches any of the filters it won't be
analyzed. The filters are defined in two locations:

1. `DONT_ANALYSE` in [`pipeline/index.js`](pipeline/index.js) specifies package names that are not analyzed at all (i.e. known uninteresting
   packages)
2. [`node.py`](pipeline/node-wrapper/node.py) defines different allow- and blocklists specifying which processes are being run and instrumented

If the package is filtered out by the pre-analysis phase, you can try to skip it with the `--noPre` flag.
