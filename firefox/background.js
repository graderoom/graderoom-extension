import {getPresentOrLocked, getHistoryOrLocked} from './scraper.js';

let version = browser.runtime.getManifest().version;

const ADDON_ID = 'extension@graderoom.me';
const LEGACY_ID = 'extension@graderom.me';
let retired = false;

function retire() {
    retired = true;
    browser.management.uninstallSelf();
}

// The old listing's build removes itself once the new add-on is installed; Graderoom prompts the install
if (browser.runtime.id === LEGACY_ID) {
    browser.runtime.sendMessage(ADDON_ID, {type: 'ping'}).then(retire, () => {});
    browser.runtime.onMessageExternal.addListener((message, sender) => {
        if (sender.id === ADDON_ID && message.type === 'replaced') retire();
    });
} else {
    browser.runtime.onMessageExternal.addListener((message, sender) => {
        if (sender.id === LEGACY_ID && message.type === 'ping') return Promise.resolve(true);
    });
    browser.runtime.onInstalled.addListener(() => {
        browser.runtime.sendMessage(LEGACY_ID, {type: 'replaced'}).catch(() => {});
    });
}

browser.runtime.onMessage.addListener(handleMessages);

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
browser.runtime.onConnect.addListener((port) => {
    ports.add(port);
    port.onDisconnect.addListener(() => {
        ports.delete(port);
    });
});

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
    // Rejecting keeps content.js from relaying an empty reply that would beat the new add-on's
    if (retired) {
        return Promise.reject(new Error('Replaced by the new Graderoom add-on'));
    }

    if (message.type === 'ps-login' && sender.url?.startsWith('https://powerschool.bcp.org/')) {
        _port.postMessage({type: 'ps-login'});
        return false;
    }

    if (message.type === 'get-version') {
        sendResponse({version: browser.runtime.getManifest().version, id: browser.runtime.id});
        return false;
    }

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
