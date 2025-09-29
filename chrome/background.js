chrome.runtime.onMessageExternal.addListener(handleMessages);

let _port = null;
chrome.runtime.onConnectExternal.addListener((port) => _port = port);

chrome.runtime.onInstalled.addListener(async () => {
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

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: rules.map(r => r.id),
        addRules: rules,
    });
});

let creating; // A global promise to avoid concurrency issues
async function setupOffscreenDocument(path, reasons, justification) {
    // Check all windows controlled by the service worker to see if one
    // of them is the offscreen document with the given path
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        console.log('Already created');
        return;
    }

    // create offscreen document
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: reasons,
            justification: justification,
        });
        await creating;
        creating = null;
    }
}

function handleMessages(message, sender, sendResponse) {
    if (message.type !== 'get-version') {
        return false;
    }

    sendResponse({version: chrome.runtime.getManifest().version});
    return false;
}

(async () => {
    await setupOffscreenDocument('offscreen.html', ['DOM_PARSER'], 'Needed to parse PowerSchool data in the background');
})();