import sys
import subprocess
import os


def main():
    #     with open(os.path.dirname(os.path.realpath(__file__)) + '/args.txt', 'a+') as file:
    #         file.write(' '.join(sys.argv[1:]) + '\n')

    # Note that printing (stdout or stderr) can change and fuck up the behaviour of some tests (and testing frameworks)
    # print('\n------------------', file=sys.stderr)
    # print(' '.join(sys.argv), file=sys.stderr)
    # print('------------------\n', file=sys.stderr, flush=True)

    # if it already has the instrumentation flags just execute it
    if '--jvm' in sys.argv:
        subprocess.run([os.environ['GRAAL_NODE_HOME']] + sys.argv[1:])
        sys.exit()

    exclude_npm = ['install', 'audit', 'init']  # don't run npm [...]
    include_run = ['test', 'unit', 'coverage']  # only npm run these -> npm run [...]
    # exclude_instrument = ['bin/nyc']  # don't instrument if included in arg string
    exclude_instrument = ['bin/nyc']
    include_instrument = ['bin/mocha', '/test', 'test/', 'test.js', 'bin/jest']  # only instrument if included in arg string

    # node flags and their expected args (defaults to 0)
    node_flags = {
        '--loader': 1
    }

    argv_string = ' '.join(sys.argv[1:])

    # check npm
    if len(sys.argv) > 1 and sys.argv[1].endswith('npm') and (sys.argv[2] in exclude_npm or (sys.argv[2] == 'run' and all(s not in sys.argv[-1] for s in include_run)) or 'lint' in argv_string):
        sys.exit()

    node_exec = ["/home/pmoosi/.nvm/versions/node/v19.5.0/bin/node"]
    # instrument when testing framework or test directory or is simple node [file].js and not specifically excluded (exclude_instrument)
    instrument_args = []
    if (any(s in argv_string for s in include_instrument)
        or (len(sys.argv) == 2 and sys.argv[1].endswith('.js'))) \
            and all(s not in argv_string for s in exclude_instrument):

        node_exec = [os.environ['GRAAL_NODE_HOME'], '--engine.WarnInterpreterOnly=false']

        # print("Attaching analysis to node process")
        with open(os.path.dirname(os.path.realpath(__file__)) + '/params.txt') as paramFile:
            lines = paramFile.readlines()

        instrument_args = list(filter(lambda s: s != '', ' '.join(lines).split(' ')))

        if 'mocha' in argv_string:
            if '--bail' in sys.argv:
                sys.argv.remove('--bail')
            if '--exit' not in sys.argv:
                sys.argv.append('--exit')

    # check where the script start (i.e. skipping node flags)
    script_idx = 1
    while sys.argv[script_idx].startswith('-'):
        script_idx += 1 + (node_flags.get(sys.argv[script_idx]) if sys.argv[script_idx] in node_flags else 0)

    args = (node_exec  # the graal node binary
            + sys.argv[1:script_idx] + instrument_args  # args for instrumentation and nodejs flags
            + [os.path.dirname(os.path.realpath(__file__)) + '/script-wrapper.js']  # wrapper script that overwrites process.execPath (often used to spawn child processes)
            + sys.argv[script_idx:])  # the actual script

    # print(' '.join(args), file=sys.stderr, flush=True)
    subprocess.run(args)


if __name__ == '__main__':
    main()
