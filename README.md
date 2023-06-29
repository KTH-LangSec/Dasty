## Installation

This repository provides instructions on how to set up a development environment for running Node.js programs with
NodeProf and GraalVM.

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

#### 1. Setup mx

```
git clone https://github.com/graalvm/mx.git
export PATH=/path/to/mx/:$PATH
```

#### 2. Install Graal JDK

```
mx fetch-jdk --java-distribution labsjdk-ce-19
export JAVA_HOME=/path/to/labsjdk-ce-19-jvmci-23.0-b04
```

#### 3. Set up nodeprof.js

```
cd nodeprof-graalvm/nodeprof.js
mx sforceimports
mx build
```

#### 4. Set environment variables for node and nodeprof.js

```
export GRAAL_NODE=/path/to/nodeprof-graalvm/graal/sdk/mxbuild/linux-amd64/GRAALVM_6B34DA359F_JAVA19/graalvm-6b34da359f-java19-23.0.0-dev/languages/nodejs/bin/node
export NODEPROF_HOME=/path/to/nodeprof-graalvm/nodeprof.js/
```

Note that the id in `GRAAL_NODE` (i.e. `GRAALVM_[id]_JAVA19/graalvm-[id]-java19-23.0.0-dev`) might differ on your
machine.

#### 5. Setup 'the-tool'

```
git clone https://github.com/pmoosi/the-tool.git
npm install
export THE_TOOL_HOME=/path/to/the-tool/
```

#### 6. Install MongoDB on your system. You can follow the installation guide for your specific operating system [here](https://www.mongodb.com/docs/manual/installation/#mongodb-installation-tutorials).

#### 7. Configure `pipeline/db/conn.js`

## Usage

Run the pipeline from the `pipeline` directory:

```
node index.js [flags] <pkgName>
node index.js --fromFile [flags] /path/to/packages-list
```

Analyze specific package:

```
node index.js express
```

Run analysis for a list of packages and skip already analyzed ones (stored in
pipeline/package-data/already-analyzed.txt):

```
node index.js --fromFile --skipDone /path/to/packages-list
```

Ignore previous pre-analysis result and force full analysis

```
node index.js --force express
```

Export all sarif data of the last analysis for a specific package:

```
node index.js --sarif --out /path/to/sarif.sarif express
```

Export all sarif data of the last analysis for all analyzed packages:

```
node index.js --sarif --outDir /path/to/sarif-dir/
```

### All flags:

General

* `--fromFile`                 : Analyze a list of packages from a file (provide a file instead of a pkgName)
* `--skipTo <package_name>`    : Skip to the specified package.
* `--skipToLast`               : Skip to the last analyzed package.
* `--skipDone`                 : Skip all already analyzed packages

Analysis

* `--forceBranchExec`          : Enable force branch execution.
* `--onlyForceBranchExec`      : Only do force branch execution runs. Requires a previous unintrusive run.
* `--execFile <file_path>`     : Specify a file instead of a package to run.
* `--noForIn`                  : Disable `for..in` injection run.
* `--onlyPre`                  : Only run the pre-analysis phase.
* `--force`                    : Force analysis (ignore previous pre-analysis results)
* `--maxRuns <n>`       : Set the maximum number of 'normal' runs. If n > 1 then for every additional exception throwing

**Sarif export**

* `--sarif`                    : Output results in SARIF format.
* `--out <output_file_path>`   : Specifies the path and file name for the output file.
* `--outDir <output_dir_path>` : Specifies the directory for the output file.
* `--exportRuns <n>`  : Export the last <n> runs (only works for flows and exceptions not for all taints and branchings)
  injections from the previous runs are skipped (default: 1).

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

## A note on instrumentation filters for XXXX

As you know there is filtering based on the executed programs in `pipeline/node-wrapper/node.py`.

There are also additional filters on packages names `pipeline/index.js`. Specifically `DONT_ANALYSE` specifies keywords
that if contained in the package name are not analyzed. You might want to change these (or remove them completely).

