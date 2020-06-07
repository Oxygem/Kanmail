import _ from 'lodash';
import hash from 'object-hash';

import requestStore from 'stores/request.js';
import { BaseStore } from 'stores/base.jsx';

import {
    getNextThreadComponent,
    getPreviousThreadComponent,
    getNextColumnThreadComponent,
    getPreviousColumnThreadComponent,
} from 'util/threads.js';


function makeDefaults() {
    return {
        subject: null,
        messages: null,
        fetching: false,
        fetchingFailed: false,
        // Open thread handlers
        handleClickArchive: null,
        handleClickTrash: null,
        // Surrounding thread references (arrow controls)
        nextThread: null,
        previousThread: null,
        nextColumnThread: null,
        previousColumnThread: null,
    };
}


function makeFolderUidParts(thread) {
    return _.reduce(
        thread,
        (memo, message) => {
            const folderName = _.keys(message.folderUids)[0];
            const uid = message.folderUids[folderName];

            if (!memo[folderName]) {
                memo[folderName] = [];
            }

            memo[folderName].push({
                uid,
                message,
            });

            return memo;
        },
        {},
    )
}


class ThreadStore extends BaseStore {
    /*
        Global store of the current open thread (overlay).
    */

    static storeKey = 'threadStore';

    constructor() {
        super();

        this.isOpen = false;
        this.props = makeDefaults();
    }

    open(component, thread, onClose) {
        if (this.isOpen) {
            this.close();
        }

        const columnContainer = component.props.getColumnContainer();

        const nextComponent = getNextThreadComponent(component);
        if (nextComponent) {
            this.props.nextThread = nextComponent.props.thread;
        }
        const previousComponent = getPreviousThreadComponent(component);
        if (previousComponent) {
            this.props.previousThread = previousComponent.props.thread;
        }
        const nextColumnThreadComponent = getNextColumnThreadComponent(component);
        if (nextColumnThreadComponent) {
            this.props.nextColumnThread = nextColumnThreadComponent.props.thread;
        }
        const previousColumnThreadComponent = getPreviousColumnThreadComponent(component);
        if (previousColumnThreadComponent) {
            this.props.previousColumnThread = previousColumnThreadComponent.props.thread;
        }

        this.onClose = onClose;
        this.isOpen = true;

        // Set to empty thread (loading icon)
        this.props.messages = [];
        this.props.subject = thread[0].subject;
        this.props.handleClickArchive = component.handleClickArchive;
        this.props.handleClickTrash = component.handleClickTrash;
        this.triggerUpdate();

        // Flag the current column as open and assign so we can remove on close
        columnContainer.classList.add('open');
        this.columnContainer = columnContainer;

        // Now, actually load the thread!
        this.loadThread(thread);
    }

    loadThread(thread) {
        // Build a list of (UID, folder, part#) for each message in the thread
        const folderUidParts = makeFolderUidParts(thread);
        // Make a hash to use as the critical request nonce
        const criticalRequestNonce = hash(folderUidParts);

        const requests = [];
        const emailParts = {};

        _.each(folderUidParts, (uidParts, folderName) => {
            const accountName = uidParts[0].message.account_name;
            const uidList = [];

            // Create our ?uid=UID/PART&uid=... query args
            _.each(uidParts, message => (
                uidList.push(`${message.uid}`)
            ));

            // Make the request
            const request = requestStore.get(
                `Get email text from ${accountName}/${folderName}`,
                `/api/emails/${accountName}/${folderName}/text`,
                {uid: uidList},
                {criticalRequestNonce},
            ).then(data => {
                _.each(data.emails, (email, uid) => emailParts[uid] = email);
            });

            requests.push(request);
        });

        this.props.fetching = true;
        this.triggerUpdate();

        // Once all loaded, assign all the emails and trigger the update
        Promise.all(requests).then(() => {
            if (!this.props.fetching) {
                console.debug('Ignoring returned emails, thread already closed!');
                return;
            }

            const messagesWithBody = _.map(thread, message => {
                const folderName = _.keys(message.folderUids)[0];
                const uid = message.folderUids[folderName];

                return {
                    body: emailParts[uid],
                    ...message,
                };
            });

            // Sort in date-ascending order (only the last email is visible by default)
            this.props.messages = _.orderBy(messagesWithBody, message => {
                const date = new Date(message.date);
                return date;
            }, 'asc');
            this.props.fetching = false;

            this.triggerUpdate();
        }).catch(e => {
            if (e.criticalRequestNonceFailure) {
                return;
            }
            this.props.fetching = false;
            this.props.fetchingFailed = true;
            this.triggerUpdate();
        });
    }

    close() {
        if (!this.isOpen) {
            return;
        }

        this.props = makeDefaults();
        this.triggerUpdate();

        if (this.columnContainer) {
            this.columnContainer.classList.remove('open');
        }

        if (this.onClose) {
            this.onClose();
        }

        this.isOpen = false;
    }
}


const threadStore = new ThreadStore();
export default threadStore;
