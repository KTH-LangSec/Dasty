import sys
import subprocess
import os

NVM_NODE_EXEC = "/home/pmoosi/.nvm/versions/node/v18.12.1/bin/node"
TIMEOUT = 60 * 15 #


def get_flag_idx(flag):
    if flag in sys.argv:
        return sys.argv.index(flag)
    else:
        for idx, argv in enumerate(sys.argv):
            if flag + '=' in argv:
                return idx

    return -1


def get_program_idx(program):
    for idx, argv in enumerate(sys.argv):
        if program in argv:
            return idx

    return -1


def remove_flag(argv_string, program, flag, length=0):
    if program not in argv_string:
        return

    flag_idx = get_flag_idx(flag)

    while flag_idx >= 0:
        arg_len = length
        while arg_len >= 0:
            sys.argv.remove(sys.argv[flag_idx])
            arg_len -= 1
        flag_idx = get_flag_idx(flag)


def set_flag(argv_string, program, flags, value=None):
    if program not in argv_string:
        return

    program_idx = -1
    flag_idx = -1

    for idx, argv in enumerate(sys.argv):
        if program in argv:
            program_idx = idx

        if argv in flags:
            flag_idx = idx
            break

    if flag_idx >= 0:
        if value is not None:
            sys.argv[flag_idx + 1] = value
    else:
        sys.argv.insert(program_idx + 1, flags[0])
        if value is not None:
            sys.argv.insert(program_idx + 2, value)


def main():
    with open(os.path.dirname(os.path.realpath(__file__)) + '/args.txt', 'a+') as file:
        file.write(' '.join(sys.argv[1:]) + '\n')

    # Note that printing (stdout or stderr) can change and fuck up the behaviour of some tests (and testing frameworks)
    print('\n------------------', file=sys.stderr)
    print(' '.join(sys.argv), file=sys.stderr)
    print('------------------\n', file=sys.stderr, flush=True)

    # if it already has the instrumentation flags just execute it
    if '--jvm' in sys.argv:
        subprocess.run([os.environ['GRAAL_NODE_HOME']] + sys.argv[1:])
        sys.exit()

    # ToDo - support ava
    exclude = ['bin/xo', 'bin/ava', 'bin/karma', 'bin/tap']  # don't run when included in command
    exclude_npm = ['install', 'audit', 'init']  # don't run npm [...]
    include_run = ['test', 'unit', 'coverage', 'compile']  # only npm run these -> npm run [...]
    # exclude_instrument = ['bin/nyc']  # don't instrument if included in arg string
    exclude_instrument = ['bin/nyc', 'bin/tap']
    include_instrument = ['bin/mocha', 'bin/jest', '/test', 'test/', 'tests/', 'test.js', 'bin/zap', 'bin/grunt']  # only instrument if included in arg string

    # node flags and their expected args (defaults to 0)
    node_flags = {
        '--loader': 1,
        '--require': 1,
        '-r': 1
    }

    argv_string = ' '.join(sys.argv[1:])

    # check npm
    if ((len(sys.argv) > 1 and sys.argv[1].endswith('npm')
         and (sys.argv[2] in exclude_npm or (sys.argv[2] == 'run' and all(s not in sys.argv[-1] for s in include_run) and 'lint' not in sys.argv[2])))
            or any(s in argv_string for s in exclude)):
        sys.exit()

    # skip nyc for improved performance (needs to be tested further)
    for idx, argv in enumerate(sys.argv):
        if 'bin/nyc' in argv or 'bin/c8' in argv:
            if sys.argv[idx + 1] == 'check-coverage':
                return

            # ToDo remove flags properly (non zero length)
            while sys.argv[idx + 1].startswith('-'):
                sys.argv.remove(sys.argv[idx + 1])

            subprocess.run(sys.argv[idx + 1:])
            return

    # node_exec = ["/home/pmoosi/.nvm/versions/node/v19.5.0/bin/node"]
    node_exec = [NVM_NODE_EXEC]
    # instrument when testing framework or test directory or is simple node [file].js and not specifically excluded (exclude_instrument)
    instrument_args = []
    script_idx = 1
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

    # check where the script starts (i.e. skipping node flags) to find the spot to add the script wrapper
    script_idx = 1
    while len(sys.argv) > script_idx and sys.argv[script_idx].startswith('-'):
        if sys.argv[script_idx] in node_flags:
            arg_length = node_flags.get(sys.argv[script_idx])

            script_idx += 1

            if arg_length >= 0:
                script_idx += arg_length
            else:
                # we don't know how many exactly -> go on till next flag or start of some script
                while not sys.argv[script_idx].startswith('-') and not sys.argv[script_idx].endswith('.js') and not sys.argv[script_idx].endswith('.ts'):
                    script_idx += 1
        else:
            script_idx += 1

    mocha_bin = None
    if 'bin/mocha' in argv_string:
        mocha_bin = sys.argv[get_program_idx('bin/mocha')]
    elif 'bin/_mocha' in argv_string:
        mocha_bin = sys.argv[get_program_idx('bin/_mocha')]

    if mocha_bin is not None:
        # older mocha versions don't have the --exit flag and exit on default
        proc = subprocess.run([NVM_NODE_EXEC, mocha_bin, '--help'], capture_output=True, text=True)
        if '--exit' in str(proc.stdout):
            set_flag(argv_string, mocha_bin, ['--exit'])

        set_flag(argv_string, mocha_bin, ['-t', '--timeout', '--timeouts'], '20000')

        remove_flag(argv_string, mocha_bin, '--bail')
        remove_flag(argv_string, mocha_bin, '--no-exit')
        remove_flag(argv_string, mocha_bin, '--forbid-only')

    set_flag(argv_string, 'bin/jest', ['-w', '--maxWorkers'], '1')
    # set_flag(argv_string, 'bin/jest', ['--workerThreads=false'])
    set_flag(argv_string, 'bin/jest', ['--forceExit'])
    remove_flag(argv_string, 'bin/jest', '--coverage')
    remove_flag(argv_string, 'bin/jest', '--collectCoverageFrom')

    # tap flag
    set_flag(argv_string, 'bin/tap', ['-j'], '1')
    set_flag(argv_string, 'bin/tap', ['-t'], '180')
    remove_flag(argv_string, 'bin/tap', '--100')

    set_flag(argv_string, 'bin/ava', ['-c'], '1')
    set_flag(argv_string, 'bin/ava', ['--no-worker-threads'])
    set_flag(argv_string, 'bin/ava', ['--timeout'], '180s')

    set_flag(argv_string, 'bin/grunt', ['--force'])

    # remove_flag(argv_string, '', '--integration')

    # nyc flags
    # remove_flag(argv_string, 'bin/nyc', '--reporter=lcov')
    # set_flag(argv_string, 'bin/nyc', ['--check-coverage=false'])
    # set_flag(argv_string, 'bin/nyc', ['--instrument=false'])

    args = node_exec + sys.argv[1:script_idx] + instrument_args  # the graal node binary, args for instrumentation and nodejs flags

    if len(instrument_args) == 0:  # only add script-wrapper when not instrumented - when instrumented jalangi.js (of nodeprof) handles the execPath
        args += [os.path.dirname(os.path.realpath(__file__)) + '/script-wrapper.js']  # wrapper script that overwrites process.execPath (often used to spawn child processes)

    args += sys.argv[script_idx:]  # finally the actual script

    print(' '.join(args), file=sys.stderr, flush=True)

    # subprocess.run(args, timeout=TIMEOUT)
    subprocess.run(args)


if __name__ == '__main__':
    main()
