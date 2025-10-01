import {getPresentOrLocked, getHistory} from './scraper.js';

chrome.runtime.onMessageExternal.addListener(handleMessages);

let _port = null;
chrome.runtime.onConnectExternal.addListener((port) => _port = port);

function handleMessages(message, sender, sendResponse) {
    if (message.target !== 'offscreen') {
        return false;
    }

    switch (message.type) {
        case 'get-present':
            getPresentOrLocked(message.classData || null, message.termData || null, _port).then((data) => sendResponse({
                type: 'get-present-response', data: data
            }));
            return true;
        case 'get-history':
            getHistory(_port).then((data) => sendResponse({
                type: 'get-history-response', data: data
            }));
            return true;
        default:
            return false;
    }
}
