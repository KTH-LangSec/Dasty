import sys
import subprocess
import os

NVM_NODE_EXEC = os.environ['NVM_DIR'] + '/versions/node/v18.12.1/bin/node'
TIMEOUT = 60 * 15  # in seconds

STATUS_FILE = os.path.dirname(os.path.realpath(__file__)) + '/status.csv'
EXEC_RESULT_FILE = os.path.dirname(os.path.realpath(__file__)) + '/exec-result.txt'


def get_flag_idx(flag, exact_match=True):
    if exact_match:
        if flag in sys.argv:
            return sys.argv.index(flag)
        else:
            for idx, argv in enumerate(sys.argv):
                if flag + '=' in argv:
                    return idx
    else:
        for idx, argv in enumerate(sys.argv):
            if flag in argv:
                return idx
    return -1


def get_program_idx(program):
    for idx, argv in enumerate(sys.argv):
        if program in argv:
            return idx

    return -1


def remove_flag(argv_string, program, flag, length=0, exact_match=True):
    if program not in argv_string:
        return

    flag_idx = get_flag_idx(flag, exact_match)

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


def get_arg_from_keyword(args, keyword, exclude=None):
    return next((arg for arg in args if keyword in arg and (exclude is None or exclude not in arg)), None)


def get_arg_idx_from_keyword(args, keyword):
    return next((idx for idx, arg in enumerate(args) if keyword in arg), -1)


def write_status(args, instrumented, timed_out):
    args_string = ' '.join(args[1:])

    exec_bin = None
    if '.bin/' in args_string:
        exec_bin = get_arg_from_keyword(args, '.bin/', '--nodeprof.ExcludeSource')

    if not instrumented:
        status = 'timeout' if timed_out else 'success'

        if exec_bin is None:
            script_wrapper_idx = get_arg_idx_from_keyword(args, '/script-wrapper.js')
            exec_bin = ' '.join(args[script_wrapper_idx + 1:]) if script_wrapper_idx > -1 else args_string
    else:
        if timed_out:
            status = 'timeout'
        elif os.path.exists(EXEC_RESULT_FILE):
            with open(EXEC_RESULT_FILE, 'r') as file:
                status = file.read()
        else:
            status = 'success'

        if exec_bin is None:
            # take the last --initParam to find the position of the executed script
            # this assumes that there is a --initParam that is the last parameter of the instrumentation (hackish but works for now)
            exec_idx = len(args) - 1 - args[::-1].index('--initParam') + 2 if '--initParam' in args else -1
            exec_bin = ' '.join(args[exec_idx:]) if exec_idx > -1 else args_string

    with open(STATUS_FILE, 'a') as file:
        file.write(f"{exec_bin};{status};{'instrumented' if instrumented else 'not-instrumented'}\n")


def run_process(args):
    timed_out = False

    # clean up the previous status
    if os.path.exists(EXEC_RESULT_FILE):
        os.remove(EXEC_RESULT_FILE)

    try:
        subprocess.run(args, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        timed_out = True

    write_status(args, instrumented='--jvm' in args, timed_out=timed_out)


def main():
    # with open(os.path.dirname(os.path.realpath(__file__)) + '/args.txt', 'a+') as file:
    #     file.write(' '.join(sys.argv[1:]) + '\n')

    # Note that printing (stdout or stderr) can change and fuck up the behaviour of some tests (and testing frameworks)
    print('\n------------------', file=sys.stderr)
    print(' '.join(sys.argv), file=sys.stderr)
    print('------------------\n', file=sys.stderr, flush=True)

    # ToDo - support ava
    # 'bin/tap ',
    exclude = ['bin/xo', 'bin/ava', 'bin/karma', 'npm run test:instrument', 'bin/ng']  # don't run when included in command
    exclude_npm = ['install', 'audit', 'init']  # don't run npm [...]
    include_run = ['test', 'unit', 'coverage', 'compile']  # only npm run these -> npm run [...]
    # exclude_instrument = ['bin/nyc']  # don't instrument if included in arg string
    exclude_instrument = ['bin/nyc', 'bin/tap', '.bin/grunt --force build', '.bin/grunt build']
    include_instrument = ['bin/mocha', 'bin/_mocha', 'bin/jest', '/test', 'test/', 'tests/', 'test.js', 'bin/zap', 'bin/grunt', 'bin/taper']  # only instrument if included in arg string

    # node flags and their expected args (defaults to 0)
    node_flags = {
        '--loader': 1,
        '--require': 1,
        '-r': 1
    }

    argv_string = ' '.join(sys.argv[1:])

    # sometimes a for in injection ends up as parameter
    remove_flag(argv_string, '', '=TAINTED', length=0, exact_match=False)
    remove_flag(argv_string, '', '--__forInTaint', length=1, exact_match=False)
    remove_flag(argv_string, '', '--use_strict', exact_match=True)

    # if it already has the instrumentation flags just execute it
    if '--jvm' in sys.argv:
        # subprocess.run([os.environ['GRAAL_NODE']] + sys.argv[1:])
        run_process([os.environ['GRAAL_NODE']] + sys.argv[1:])
        sys.exit()

    # check npm
    if ((len(sys.argv) > 1 and sys.argv[1].endswith('npm')
         and (sys.argv[2] in exclude_npm or (sys.argv[2] == 'run' and all(s not in sys.argv[-1] for s in include_run) and 'lint' not in sys.argv[2])))
            or any(s in argv_string for s in exclude)):
        if os.path.exists(STATUS_FILE):
            with open(STATUS_FILE, 'a') as file:
                file.write(f"{sys.argv[1:]};skipped")
        sys.exit()

    # skip nyc for improved performance (needs to be tested further)
    for idx, argv in enumerate(sys.argv):
        if 'bin/nyc' in argv or 'bin/c8' in argv:
            if sys.argv[idx + 1] == 'check-coverage':
                return

            # ToDo remove flags properly (non zero length)
            while sys.argv[idx + 1].startswith('-'):
                sys.argv.remove(sys.argv[idx + 1])

            run_process(sys.argv[idx + 1:])
            return

    node_exec = [NVM_NODE_EXEC]

    # instrument when testing framework or test directory or is simple node [file].js and not specifically excluded (exclude_instrument)
    instrument_args = []
    if (any(s in argv_string for s in include_instrument)
        or (len(sys.argv) == 2 and sys.argv[1].endswith('.js'))) \
            and all(s not in argv_string for s in exclude_instrument):

        node_exec = [os.environ['GRAAL_NODE'], '--engine.WarnInterpreterOnly=false']

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
        if '--jobs' in str(proc.stdout):
            set_flag(argv_string, mocha_bin, ['-j', '--jobs'], '1')

        set_flag(argv_string, mocha_bin, ['-t', '--timeout', '--timeouts'], '2000')

        remove_flag(argv_string, mocha_bin, '--bail')
        remove_flag(argv_string, mocha_bin, '--no-exit')
        remove_flag(argv_string, mocha_bin, '--forbid-only')

    # set_flag(argv_string, 'bin/jest', ['-w', '--maxWorkers'], '1')
    # set_flag(argv_string, 'bin/jest', ['--workerThreads=false'])
    set_flag(argv_string, 'bin/jest', ['-i', '--runInBand'])
    set_flag(argv_string, 'bin/jest', ['--forceExit'])
    set_flag(argv_string, 'bin/jest', ['--testTimeout'], '10000')
    remove_flag(argv_string, 'bin/jest', '-w', 1)
    remove_flag(argv_string, 'bin/jest', '--maxWorkers', 1)
    remove_flag(argv_string, 'bin/jest', '--coverage')
    remove_flag(argv_string, 'bin/jest', '--collectCoverageFrom')

    # tap flag
    if 'bin/tap' in argv_string:
        tap_bin = sys.argv[get_program_idx('bin/tap')]

        proc = subprocess.run([NVM_NODE_EXEC, tap_bin, '--help'], capture_output=True, text=True)
        if '--jobs' in str(proc.stdout):
            set_flag(argv_string, 'bin/tap', ['-j'], '1')

        set_flag(argv_string, 'bin/tap', ['-t'], '180')
        remove_flag(argv_string, 'bin/tap', '--100')
        remove_flag(argv_string, 'bin/tap', '--coverage')
        remove_flag(argv_string, 'bin/tap', '--jobs-auto')

    set_flag(argv_string, 'bin/ava', ['-c'], '1')
    set_flag(argv_string, 'bin/ava', ['--no-worker-threads'])
    set_flag(argv_string, 'bin/ava', ['--timeout'], '180s')

    if 'bin/grunt' in argv_string:
        set_flag(argv_string, 'bin/grunt', ['--force'])
        grunt_bin = sys.argv[get_program_idx('bin/grunt')]

        proc = subprocess.run([NVM_NODE_EXEC, grunt_bin, '--help'], capture_output=True, text=True)

        # try to identify the actual test tasks and skip tasks such as linting
        if 'test  ' in proc.stdout:
            set_flag(argv_string, 'bin/grunt', ['test'])
        if 'jest  ' in proc.stdout:
            set_flag(argv_string, 'bin/grunt', ['jest'])
        if 'mochaTest  ' in proc.stdout:
            set_flag(argv_string, 'bin/grunt', ['mochaTest'])

    # nyc flags
    # remove_flag(argv_string, 'bin/nyc', '--reporter=lcov')
    # set_flag(argv_string, 'bin/nyc', ['--check-coverage=false'])
    # set_flag(argv_string, 'bin/nyc', ['--instrument=false'])

    args = node_exec + sys.argv[1:script_idx] + instrument_args  # the graal node binary, args for instrumentation and nodejs flags

    if len(instrument_args) == 0:  # only add script-wrapper when not instrumented - when instrumented jalangi.js (of nodeprof) handles the execPath
        args += [os.path.dirname(os.path.realpath(__file__)) + '/script-wrapper.js']  # wrapper script that overwrites process.execPath (often used to spawn child processes)

    args += sys.argv[script_idx:]  # finally the actual script

    print(' '.join(args), file=sys.stderr, flush=True)

    run_process(args)


if __name__ == '__main__':
    main()
