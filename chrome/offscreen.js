import {getPresentOrLocked, getHistoryOrLocked} from './scraper.js';

let version = null;
let _port = null;
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'set-version' && sender.url === chrome.runtime.getURL("background.js")) {
        version = message.version;
    }
    if (message.type === 'ps-login' && sender.url?.startsWith('https://powerschool.bcp.org/')) {
        _port?.postMessage({type: 'ps-login'});
    }
});

chrome.runtime.onMessageExternal.addListener(handleMessages);

chrome.runtime.onConnectExternal.addListener((port) => {
    _port = port;
    port.onDisconnect.addListener(() => {
        _port = null;
    });
});

function handleMessages(message, sender, sendResponse) {
    if (message.target !== 'offscreen') {
        return false;
    }

    switch (message.type) {
        case 'get-present':
            getPresentOrLocked(message.classData || null, message.termData || null, _port, version).then((data) => sendResponse({
                type: 'get-present-response', data: data
            }));
            return true;
        case 'get-history':
            getHistoryOrLocked(message.classData || null, _port, version).then((data) => sendResponse({
                type: 'get-history-response', data: data
            }));
            return true;
        default:
            return false;
    }
}
