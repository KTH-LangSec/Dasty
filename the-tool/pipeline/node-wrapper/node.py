import sys
import subprocess
import os


def main():
    print(sys.argv)
    #     with open(os.path.dirname(os.path.realpath(__file__)) + '/args.txt', 'a+') as file:
    #         file.write(' '.join(sys.argv[1:]) + '\n')

    argv_string = ' '.join(sys.argv[1:])
    node_args = ''
    if 'bin/mocha' in argv_string:
        with open(os.path.dirname(os.path.realpath(__file__)) + '/params.txt') as paramFile:
            lines = paramFile.readlines()

        node_args = ' '.join(lines)

    subprocess.run(os.environ['GRAAL_NODE_HOME'] + ' --engine.WarnInterpreterOnly=false ' + node_args + ' ' + argv_string)


if __name__ == '__main__':
    main()
