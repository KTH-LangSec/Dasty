import sys
import subprocess
import os


def main():
    #     with open(os.path.dirname(os.path.realpath(__file__)) + '/args.txt', 'a+') as file:
    #         file.write(' '.join(sys.argv[1:]) + '\n')

    print('\n------------------')
    print(sys.argv)
    print('------------------\n')

    include_run = ['test', 'unit']

    exclude_instrument = ['bin/nyc']
    include_instrument = ['bin/mocha', '/test', 'test/', 'test.js', 'bin/jest']

    argv_string = ' '.join(sys.argv[1:])

    if sys.argv[-1] == 'audit' \
            or (sys.argv[-2] == 'run' and all(s not in sys.argv[-1] for s in include_run)) \
            or 'lint' in argv_string:
        return

    node_args = []
    # instrument when testing framework or test directory or is simple node [file].js and not specifically excluded (exclude_instrument)
    if (any(s in argv_string for s in include_instrument)
        or (len(sys.argv) == 2 and '.js' in sys.argv[1])) \
            and all(s not in argv_string for s in exclude_instrument):
        # print("Attaching analysis to node process")
        with open(os.path.dirname(os.path.realpath(__file__)) + '/params.txt') as paramFile:
            lines = paramFile.readlines()

        node_args = list(filter(lambda s: s != '', ' '.join(lines).split(' ')))

        if 'mocha' in argv_string and '--bail' in sys.argv:
            bail_index = sys.argv.index('--bail')
            sys.argv[bail_index] = '--exit'

    args = [os.environ['GRAAL_NODE_HOME'], '--engine.WarnInterpreterOnly=false'] + node_args + sys.argv[1:]

    #     print(' '.join(args))
    #     print('--------------')

    subprocess.run(args)


if __name__ == '__main__':
    main()
