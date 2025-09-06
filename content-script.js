window.addEventListener('message', (event) => {
    if (event.data.target !== 'content-script') {
        return;
    }

    switch (event.data.type) {
        case 'get-present':
            chrome.runtime.sendMessage({target: 'offscreen', type: 'get-present'});
            return;
        case 'get-history':
            chrome.runtime.sendMessage({target: 'offscreen', type: 'get-history'});
            return;
        case 'get-locked':
            chrome.runtime.sendMessage({target: 'offscreen', type: 'get-locked'});
            return;
        default:
            // Ignore all other messages
            break;
    }
});

chrome.runtime.onMessage.addListener(handleMessages);

function handleMessages(message) {
    if (message.target === 'site') {
        window.postMessage(message);
    }

    return false;
}
