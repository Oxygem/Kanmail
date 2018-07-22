function isReplyOrForward(subject) {
    const pattern = /^(Re|Fwd)/i;
    const match = subject.match(pattern);
    return match ? true : false;
}


function normalizeSubject(accountName, subject) {
    if (!subject) {
        return '';
    }

    const pattern = /((Re|Fwd)(\[[\d+]\])?:(\s)?)*(.*)/i;
    const match = subject.match(pattern);

    if (!match) {
        return false;
    }

    return `${accountName}-${match[5]}`;
}


function messageContainer(message) {
    return function(message) {
        var children = [];

        function getConversation(id) {
            var child = this.getSpecificChild(id);
            var flattened = [];
            if(child) flattened = child.flattenChildren();
            if(child.message) flattened.unshift(child.message);
            return flattened;
        }

        function flattenChildren() {
            var messages = [];

            this.children.forEach(function(child) {
                if (child.message) messages.push(child.message);
                var nextChildren = child.flattenChildren();
                if (nextChildren) {
                    nextChildren.forEach(function(nextChild) {
                        messages.push(nextChild);
                    });
                }
            });

            if (messages.length > 0) {
                return messages;
            }
        }

        function getSpecificChild(id) {
            var instance = this;
            if (instance.message && instance.message.accountMessageId == id) {
                return instance;
            }

            var specificChild = null;
            instance.children.forEach(function(child) {
                var found = child.getSpecificChild(id);
                if (found) {
                    specificChild = found;
                    return;
                }
            });

            return specificChild;
        }

        function threadParent() {
            if (!this.message) {
                return this;
            }

            var next = this.parent;
            if (!next) {
                return this;
            }

            var top = next;

            while (next) {
                next = next.parent;
                if (next) {
                    if (!next.message) {
                        return top;
                    }
                    top = next;
                }
            }
            return top;
        }

        function addChild(child) {
            if(child.parent) {
                child.parent.removeChild(child);
            }

            this.children.push(child);
            child.parent = this;
        }

        function removeChild(child) {
            this.children = this.children.filter(function (other) {
                return other !== child;
            });

            delete child.parent;
        }

        function hasDescendant(container) {
            if (this === container) {
                return true;
            }

            if (this.children.length < 1) {
                return false;
            }

            var descendantPresent = false;

            this.children.forEach(function(child) {
                if(child.hasDescendant(container)) {
                    descendantPresent = true;
                }
            });

            return descendantPresent;
        }

        return {
            message: message,
            children: children,
            flattenChildren: flattenChildren,
            getConversation: getConversation,
            getSpecificChild: getSpecificChild,
            threadParent: threadParent,
            addChild: addChild,
            removeChild: removeChild,
            hasDescendant: hasDescendant
        }
    }(message);
}


export function messageThreader() {
    return function() {
        let idTable = {};

        function thread(messages) {
            idTable = this.createIdTable(messages);
            const root = messageContainer();

            Object.keys(idTable).forEach(function(id) {
                const container = idTable[id];
                if (typeof(container.parent) === 'undefined') {
                    root.addChild(container);
                }
            });

            pruneEmpties(root);
            return root;
        }

        function pruneEmpties(parent) {
            for(let i = parent.children.length - 1; i >= 0; i--) {
                const container = parent.children[i];
                pruneEmpties(container);

                if (!container.message && container.children.length === 0) {
                    parent.removeChild(container);
                } else if (!container.message && container.children.length > 0) {
                    if (!parent.parent && container.children.length === 1) {
                        promoteChildren(parent, container)
                    } else if (!parent.parent && container.children.length > 1) {
                        // do nothing
                    } else {
                        promoteChildren(parent, container)
                    }
                }
            }
        }

        function promoteChildren(parent, container) {
            for(let i = container.children.length - 1; i >= 0; i--) {
                const child = container.children[i];
                parent.addChild(child);
            }

            parent.removeChild(container);
        }

        function createIdTable(messages) {
            idTable = {};

            messages.forEach(function(message) {
                const parentContainer = getContainer(message.accountMessageId);

                // We should never see the same accountMessageId twice
                if (parentContainer.message) {
                    throw new Error(`Account messageId seen twice!: ${message.accountMessageId}`);
                }

                parentContainer.message = message;

                let prev = null;
                let references = message.references || [];

                if (typeof(references) == 'string') {
                    references = [references]
                }

                references.forEach(function(reference) {
                    const container = getContainer(reference);
                    if (
                        prev && typeof(container.parent) === 'undefined'
                        && !container.hasDescendant(prev)
                    ) {
                        prev.addChild(container);
                    }

                    prev = container;
                });

                if (prev && !parentContainer.hasDescendant(prev)) {
                    prev.addChild(parentContainer);
                }
            });

            return idTable;
        }

        function getContainer(id) {
            if (typeof(idTable[id]) !== 'undefined') {
                return idTable[id];
            } else {
                return createContainer(id);
            }
        }

        function createContainer(id) {
            var container = messageContainer();
            idTable[id] = container;
            return container;
        }

        function groupBySubject(root) {
            var subjectTable = {};

            // First loop - for each top-level container populate the subject table
            root.children.forEach(function(container) {
                let c;

                // Get the message if present or first child
                if(container.message) {
                    c = container;
                } else {
                    c = container.children[0];
                }

                // Bail if no message
                if (!c || !c.message) {
                    return;
                }

                const subject = normalizeSubject(
                    c.message.account_name,
                    c.message.subject,
                );

                if (subject.length === 0) {
                    return;
                }

                const existing = subjectTable[subject];

                // If not in the table, stick it straight in
                if (!existing) {
                    subjectTable[subject] = c;

                // Otherwise, put in the table if the existing one is a reply
                // or forward and this one is not (prioritise first emails).
                } else if (
                    (typeof(existing.message) !== 'undefined') && (
                        (typeof(c.message) === 'undefined') ||
                        (isReplyOrForward(existing.message.subject)) &&
                        (!isReplyOrForward(c.message.subject))
                    )
                ) {
                    subjectTable[subject] = c;
                }
            });

            root.children.forEach(container => {
                let subject;
                let account;
                if (container.message) {
                    subject = container.message.subject;
                    account = container.message.account_name;
                } else {
                    subject = container.children[0].message.subject;
                    account = container.children[0].message.account_name;
                }
                subject = normalizeSubject(account, subject);

                const c = subjectTable[subject];

                if (!c || c === container) {
                    return;
                }

                // The matching container has no message nor does the working one
                if (
                    (typeof(c.message) === 'undefined') &&
                    (typeof(container.message) === 'undefined')
                ) {
                    container.children.forEach(function(ctr) {
                        c.addChild(ctr);
                    });
                    container.parent.removeChild(container);

                // The matching container has no message but the working does
                } else if (
                    (typeof(c.message) === 'undefined') &&
                    (typeof(container.message) !== 'undefined')
                ) {
                    c.addChild(container);

                // The matching container is not a reply but the working is
                } else if (
                    (!isReplyOrForward(c.message.subject)) &&
                    (isReplyOrForward(container.message.subject))
                ) {
                    c.addChild(container);

                // We have both a matching and working container, but no way to
                // pick between them, so create a new container and stick them
                // both underneath it.
                } else {
                    const newContainer = messageContainer();
                    newContainer.addChild(c);
                    newContainer.addChild(container);
                    subjectTable[subject] = newContainer;

                    // Now add the new container to the root
                    root.addChild(newContainer);
                }
            });
        }

        return {
            getContainer: getContainer,
            createContainer: createContainer,
            createIdTable: createIdTable,
            promoteChildren: promoteChildren,
            pruneEmpties: pruneEmpties,
            groupBySubject: groupBySubject,
            thread: thread,
            get idTable() { return idTable; }
        }
    }();
}
