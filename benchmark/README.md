| Package             | Result                   |
|---------------------|--------------------------|
| better-queue        | Timeout                  |
| coffee              | Crash/Multiple Processes |
| csv-write-stream    | Timeout                  |
| download-git-repo   | Timeout                  |
| newman              | Crash/Timeout            |
| ejs                 | Crash/Timeout            |
| bunyan-format       | Multiple Processes       |
| esformatter         | Timeout                  |
| exec                | Multiple Files/Processes |
| fluent-ffmpeg       | No flows                 |
| forever-monitor     | Success                  |
| gm                  | Success                  |
| hbsfy               | Crash                    |
| nodemailer          | Timeout                  |
| play-sound          | Success                  |
| primus              | Crash                    |
| python-shell        | Timeout                  |
| require-from-string | Flow not found           |
| sonarqube-scanner   | Crash                    |
| window-size         | Flow not found           |
| winreg              | Crash                    |

**Timeout** - 8 min

**Multiple Processes** - The test spawns processes with the actual test. Augur does not instrument/analyze them

**Multiple Processes** - The program crashed due to Augur implementation problems (mostly with test framework setups and
task runners) - I don't wont to spend any time to fix it ;).

**Flow** - The analysis terminated but the flow was not found
