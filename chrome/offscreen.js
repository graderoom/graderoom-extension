import {getPresentOrLocked, getHistory} from './scraper.js';

chrome.runtime.onMessageExternal.addListener(handleMessages);

function handleMessages(message, sender, sendResponse) {
    if (message.target !== 'offscreen') {
        return false;
    }

    switch (message.type) {
        case 'get-present':
            getPresentOrLocked(message.classData || null, message.termData || null).then((data) => sendResponse({
                type: 'get-present-response', data: data
            }));
            return true;
        case 'get-history':
            getHistory().then((data) => sendResponse({
                type: 'get-history-response', data: data
            }));
            return true;
        default:
            return false;
    }
}
