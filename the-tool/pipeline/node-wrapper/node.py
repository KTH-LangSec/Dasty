import sys
import subprocess
import os


def main():
    print(sys.argv)
    with open(os.path.dirname(os.path.realpath(__file__)) + '/args.txt', 'a+') as file:
        file.write(' '.join(sys.argv[1:]) + '\n')
    # subprocess.run([os.environ['GRAAL_NODE_HOME'], '--engine.WarnInterpreterOnly=false'] + sys.argv[1:])
    subprocess.run(['/home/pmoosi/.nvm/versions/node/v19.5.0/bin/node'] + sys.argv[1:])


if __name__ == '__main__':
    main()
