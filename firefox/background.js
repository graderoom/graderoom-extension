import {getPresentOrLocked, getHistoryOrLocked} from './scraper.js';

browser.runtime.onMessage.addListener(handleMessages);

let _port = null;
browser.runtime.onConnect.addListener((port) => _port = port);

browser.runtime.onInstalled.addListener(async () => {
    const rules = [{
        id: 1,
        action: {
            type: 'modifyHeaders',
            requestHeaders: [
                {
                    header: 'Origin', operation: 'set', value: 'https://powerschool.bcp.org'
                },
                {
                    header: 'Referer', operation: 'set', value: 'https://powerschool.bcp.org/guardian/home.html'
                },],
        },
        condition: {
            urlFilter: 'https://powerschool.bcp.org/ws/xte/assignment/lookup?_='
        }
    }];

    await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: rules.map(r => r.id),
        addRules: rules,
    });
});

function handleMessages(message, sender, sendResponse) {
    if (message.type === 'get-version') {
        sendResponse({version: browser.runtime.getManifest().version});
        return false;
    }

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
            getHistoryOrLocked(message.classData || null, _port).then((data) => sendResponse({
                type: 'get-history-response', data: data
            }));
            return true;
        default:
            return false;
    }
}
