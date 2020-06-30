import _ from 'lodash';


function getThreadComponent(sourceComponent, propName) {
    let component;

    while (sourceComponent) {
        const nextComponent = sourceComponent.props[propName]();

        if (!nextComponent || !nextComponent.isBusy()) {
            component = nextComponent;
            break;
        }

        sourceComponent = nextComponent;
    }

    return component;
}

export const getNextThreadComponent = (thread) => getThreadComponent(thread, 'getNextThread');
export const getPreviousThreadComponent = (thread) => getThreadComponent(thread, 'getPreviousThread');


function collectVisibleThreadComponents(threadRefs) {
    return _.reduce(
        threadRefs,
        (memo, value) => {
            if (value) {
                const component = value.getDecoratedComponentInstance();
                if (!component.isBusy()) {
                    memo.push(component);
                }
            }
            return memo;
        },
        [],
    );
}

function getColumnThreadComponent(sourceComponent, propName) {
    const targetColumn = sourceComponent.props[propName]();

    if (targetColumn) {
        const sourceColumn = sourceComponent.props.column;

        const visibleTargetThreads = collectVisibleThreadComponents(targetColumn.threadRefs);
        const visibleSourceThreads = collectVisibleThreadComponents(sourceColumn.threadRefs);

        let wantedSourceThreadRef = visibleSourceThreads.indexOf(sourceComponent);

        if (wantedSourceThreadRef >= 0) {
            if (wantedSourceThreadRef > visibleTargetThreads.length - 1) {
                wantedSourceThreadRef = visibleTargetThreads.length - 1;
            }
            return visibleTargetThreads[wantedSourceThreadRef];
        }
    }
}

export const getNextColumnThreadComponent = (thread) => getColumnThreadComponent(thread, 'getNextColumn');
export const getPreviousColumnThreadComponent = (thread) => getColumnThreadComponent(thread, 'getPreviousColumn');
