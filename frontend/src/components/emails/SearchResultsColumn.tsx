import _ from "lodash";
import React from "react";

import { ALIAS_TO_ICON, SEARCH_EXTRA_FOLDERS } from "../../constants.ts";
import { subscribe } from "../../stores/base.tsx";
import { getColumnMetaStore, getColumnStore } from "../../stores/columns.ts";
import { Thread } from "../../stores/emails/base.ts";
import searchStore from "../../stores/search.js";
import settingsStore from "../../stores/settings.ts";
import { capitalizeFirstLetter } from "../../util/string.js";
import { EmailColumn } from "./EmailColumn.tsx";
import EmailColumnThread from "./EmailColumnThread.tsx";

interface ISearchResultsColumnProps {
  isSearching: boolean;

  getPreviousColumn: () => EmailColumn | undefined;
  getNextColumn: () => EmailColumn | undefined;
}

// Threads grouped by the folder they were pulled from - the folder is used as
// each thread's columnId so thread actions (restore/trash/move) target the
// right folder.
interface IThreadGroup {
  folderName: string;
  threads: Thread[];
}

/*
    Special column shown on the far right while searching, surfacing results
    from archive/trash - folders that usually aren't visible as columns.

    While search mode is active the (search) email store pushes threads to
    *every* registered column store, including archive/trash, so this column
    subscribes to those stores purely as a change signal and reads their
    threads directly. The subscription props themselves are ignored - both
    stores publish the same prop names (threads/hidden/open) and would clobber
    each other in the merged subscribe props.
*/
export class SearchResultsColumn extends React.Component<ISearchResultsColumnProps> {
  threadRefs: EmailColumnThread[] = [];

  // Extra folders not already visible as a regular column
  getResultFolderNames() {
    const currentColumns = settingsStore.getCurrentColumns();
    return _.filter(
      SEARCH_EXTRA_FOLDERS,
      (folderName) => !_.includes(currentColumns, folderName),
    );
  }

  getThreadGroups(folderNames: string[]): IThreadGroup[] {
    const currentColumns = settingsStore.getCurrentColumns();

    // Dedupe on message IDs rather than thread hash - the trash column store
    // holds rebuilt trash-only threads whose hash can differ from the full
    // thread in archive.
    const seenMessageIds = new Set<string>();
    const groups: IThreadGroup[] = [];

    _.each(folderNames, (folderName) => {
      const columnStore = getColumnStore(folderName);
      const threads: Thread[] = [];

      _.each(columnStore.props.threads, (thread) => {
        if (
          _.some(thread, (message) =>
            seenMessageIds.has(message.accountMessageId),
          )
        ) {
          return;
        }

        // Skip threads already visible in a regular column
        if (
          _.some(thread.allFolderNames, (threadFolderName) =>
            _.includes(currentColumns, threadFolderName),
          )
        ) {
          return;
        }

        // Skip threads being moved elsewhere
        if (columnStore.hasHiddenThread(thread)) {
          return;
        }

        _.each(thread, (message) =>
          seenMessageIds.add(message.accountMessageId),
        );
        threads.push(thread);
      });

      if (threads.length > 0) {
        groups.push({
          folderName,
          threads: _.orderBy(
            threads,
            (thread) => new Date(thread[0].date),
            "desc",
          ),
        });
      }
    });

    return groups;
  }

  renderEmailThreads(groups: IThreadGroup[]) {
    const threadRefs: EmailColumnThread[] = [];

    const getThread = (id) => {
      const thread = threadRefs[id];

      if (thread) {
        // Thread is wrapped by react-dnd, so get the underlying
        // EmailColumnThread instance!
        // @ts-ignore
        return thread.getDecoratedComponentInstance();
      }
    };

    // Thread refs are indexed across all groups so keyboard up/down flows
    // through the folder sub-headers.
    let threadIndex = 0;
    const elements: React.ReactElement[] = [];

    _.each(groups, ({ folderName, threads }) => {
      elements.push(
        <div className="folder-group-header" key={`group-${folderName}`}>
          <i className={`fa fa-${ALIAS_TO_ICON[folderName]}`}></i>
          {capitalizeFirstLetter(folderName)}
        </div>
      );

      _.each(threads, (thread) => {
        const i = threadIndex++;
        const getPreviousThread = () => getThread(i - 1);
        const getNextThread = () => getThread(i + 1);

        elements.push(
          <EmailColumnThread
            key={thread.hash}
            thread={thread}
            threadRef={i}
            column={this as any}
            columnId={folderName}
            columnIsHidden={false}
            getPreviousColumn={this.props.getPreviousColumn}
            getNextColumn={this.props.getNextColumn}
            getPreviousThread={getPreviousThread}
            getNextThread={getNextThread}
            ref={(ref) => ref && (threadRefs[i] = ref)}
          />
        );
      });
    });

    // Attach the refs to the column instance for keyboard controls
    this.threadRefs = threadRefs;

    return elements;
  }

  renderHeader(resultCount: number, isLoading: boolean) {
    return (
      <div className="header" data-tauri-drag-region>
        <h3 data-tauri-drag-region>
          Other search results
          {isLoading && <i className="loading fa fa-spinner fa-spin"></i>}

          <span className="meta">
            <div className="text">
              {resultCount.toLocaleString()} {resultCount === 1 ? "result" : "results"}
            </div>
          </span>
        </h3>
      </div>
    );
  }

  render() {
    this.threadRefs = [];

    if (!this.props.isSearching) {
      return null;
    }

    const folderNames = this.getResultFolderNames();
    if (folderNames.length === 0) {
      return null;
    }

    const groups = this.getThreadGroups(folderNames);
    const resultCount = _.sumBy(groups, ({ threads }) => threads.length);
    const isLoading = _.some(
      folderNames,
      (folderName) => getColumnMetaStore(folderName).props.isLoading,
    );

    if (resultCount === 0 && !isLoading) {
      return null;
    }

    return (
      <div className="column search-results">
        {this.renderHeader(resultCount, isLoading)}

        <div className="emails">
          {resultCount > 0 ? (
            this.renderEmailThreads(groups)
          ) : (
            <div className="loader">
              <i className="fa fa-spin fa-refresh"></i>
            </div>
          )}
        </div>
      </div>
    );
  }
}

// The column/meta stores here are subscribed as render triggers only - their
// props collide so threads/loading state are read directly in render.
const WrappedSearchResultsColumn = subscribe(
  [searchStore, ["isSearching"]],
  getColumnStore("archive"),
  getColumnStore("trash"),
  getColumnMetaStore("archive"),
  getColumnMetaStore("trash"),
)(SearchResultsColumn);

export default class SearchResultsColumnWrapper extends React.Component<
  Omit<ISearchResultsColumnProps, "isSearching">
> {
  wrappedColumn: any;

  getDecoratedComponentInstance(): SearchResultsColumn {
    return this.wrappedColumn?.wrappedComponent;
  }

  render() {
    return (
      <WrappedSearchResultsColumn
        {...this.props}
        // Make the original component accessible
        ref={(ref) => (this.wrappedColumn = ref)}
      />
    );
  }
}
