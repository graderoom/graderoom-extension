import {getPresentOrLocked, getHistoryOrLocked} from './scraper.js';

let version = null;
const ports = new Set();
// Every syncing tab sees the shared scrape's progress; a closed port is dropped rather than failing the scrape
const _port = {
    postMessage: (message) => ports.forEach((port) => {
        try {
            port.postMessage(message);
        } catch {
            ports.delete(port);
        }
    })
};
let pendingPresent = null;
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'set-version' && sender.url === chrome.runtime.getURL("background.js")) {
        version = message.version;
    }
    if (message.type === 'ps-login' && sender.url?.startsWith('https://powerschool.bcp.org/')) {
        _port.postMessage({type: 'ps-login'});
    }
});

chrome.runtime.onMessageExternal.addListener(handleMessages);

chrome.runtime.onConnectExternal.addListener((port) => {
    ports.add(port);
    port.onDisconnect.addListener(() => {
        ports.delete(port);
    });
});

function handleMessages(message, sender, sendResponse) {
    if (message.target !== 'offscreen') {
        return false;
    }

    switch (message.type) {
        case 'get-present':
            // Share one scrape between tabs that ask while it's running
            pendingPresent ??= getPresentOrLocked(message.classData || null, message.termData || null, _port, version).catch((e) => ({success: false, message: e.message})).finally(() => pendingPresent = null);
            pendingPresent.then((data) => sendResponse({
                type: 'get-present-response', data: data
            }));
            return true;
        case 'get-history':
            getHistoryOrLocked(message.classData || null, _port, version).catch((e) => ({success: false, message: e.message})).then((data) => sendResponse({
                type: 'get-history-response', data: data
            }));
            return true;
        default:
            return false;
    }
}
