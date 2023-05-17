import matplotlib.pyplot as plt


def tool_exec(pkg, y1, y2):
    colors = ['#3D9255', '#F45050', '#FFC107', '#512DA8']

    # plot bars in stack manner
    plt.title('Tools vs. Execution Time - ' + pkg)
    plt.xlabel('Tools')
    plt.ylabel('Execution Time (in seconds)')
    x = ['V8 Node.js', 'Graal Node.js', 'NodeProf', 'Analysis']
    plt.bar(x, y1, color='#C3C3C3')
    plt.bar(x, y2, bottom=y1, color=colors)
    plt.show()


def main():
    tool_exec(
        'express',
        [0, 0, 23.2, 43.65],
        [2.39, 23.2, 43.65 - 23.2, 165.29 - 53.65]
    )

    tool_exec(
        'gm',
        [0, 0, 14.36, 16.47],
        [8.09, 14.36, 16.47 - 14.36, 19.28 - 16.47]
    )

    tool_exec(
        'gm',
        [0, 0, 3.26, 4.36],
        [0.45, 3.26, 4.36 - 3.26, 5.37 - 4.36]
    )

    tool_exec(
        'fs-extra',
        [0, 0, 11.89, 16.33],
        [5.91, 11.89, 16.33 - 11.89, 25.1 - 16.33]
    )


if __name__ == '__main__':
    main()
