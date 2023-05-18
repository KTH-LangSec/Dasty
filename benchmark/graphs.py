import matplotlib.pyplot as plt
import numpy as np


def tool_exec(pkg, y):
    colors = ['#3D9255', '#F45050', '#FFC107', '#512DA8']
    width = 0.65

    y1 = [0, 0, y[1], y[2]]
    y2 = [y[0], y[1], y[2] - y[1], y[3] - y[2]]

    plt.title('Tools vs. Execution Time - ' + pkg)
    plt.xlabel('Tools')
    plt.ylabel('Execution Time (in seconds)')
    x = ['V8 Node.js', 'Graal Node.js', 'NodeProf', 'Analysis']

    plt.bar(x, y1, color='#C3C3C3', width=width)
    top_bar = plt.bar(x, y2, bottom=y1, color=colors, width=width)

    top = max(y) * 1.1  # add some space at the top for labels
    plt.ylim(top=top)
    height_diff = top * 0.01

    for bar_idx, bar in enumerate(top_bar):
        plt.text(bar.get_x() + bar.get_width() / 2, y[bar_idx] + height_diff, str(y[bar_idx]) + 's', ha='center', va='bottom')

    plt.show()


def comp(x_labels, the_tool, augur, bar_labels):
    # x = ['small.js', 'gm', 'fs-extra', 'express']
    x = np.arange(len(x_labels))
    width = 0.25

    bars = []
    ax = plt.subplot(111)
    bars.append(ax.bar(x, the_tool, width=width, color='#512DA8'))
    bars.append(ax.bar(x + width, augur, width=width, color='#F45050'))

    ax.legend(bars, ('TODO: the-tool', 'augur'))

    plt.xlabel('Packages')
    plt.ylabel('Execution Time (in seconds)')

    ax.set_xticks(x + width / 2)
    ax.set_xticklabels(x_labels)

    top = max(max(the_tool), max(augur)) * 1.4
    plt.ylim(top=top)

    height_diff = top * 0.01

    for b_idx, b in enumerate(bars):
        for bar_idx, bar in enumerate(b):
            plt.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + height_diff, bar_labels[b_idx][bar_idx], ha='center', va='bottom')

    plt.show()


def main():
    tool_exec(
        'small',
        [0.09, 1.82, 2.3, 2.35]
    )

    tool_exec(
        'express',
        [2.39, 23.2, 43.65, 165.29]
    )

    tool_exec(
        'gm',
        [8.09, 14.36, 16.47, 19.28]
    )

    tool_exec(
        'gm',
        [0.45, 3.26, 4.36, 5.37]
    )

    tool_exec(
        'fs-extra',
        [5.91, 11.89, 16.33, 25.1]
    )

    comp(
        ['small.js', 'gm'],
        the_tool=[2.32, 5.37],
        augur=[3.42, 23.21],
        bar_labels=[
            ['2.35s', '5.37s'],
            ['3.42s', '23.21s']
        ]
    )

    comp(
        ['fs-extra', 'express'],
        the_tool=[25.1, 165.29],
        augur=[300, 300],
        bar_labels=[
            ['25.1s', '165.29s'],
            ['300s (timeout)', '300s (timeout)']
        ]
    )

    # augur
    # small.js - success
    # gm - success -
    # express - timeout - 1 test case
    # fs-extra - timeout - 37 - 34 timed out


if __name__ == '__main__':
    main()
