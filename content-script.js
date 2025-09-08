window.addEventListener('message', async (event) => {
    if (event.data.target !== 'content-script') {
        return;
    }

    switch (event.data.type) {
        case 'get-present':
            chrome.runtime.sendMessage({target: 'offscreen', type: 'get-present', token: event.data.token, email: event.data.email}, (response) => {
                window.postMessage(response);
            });
            return;
        case 'get-history':
            chrome.runtime.sendMessage({target: 'offscreen', type: 'get-history', token: event.data.token, email: event.data.email}, (response) => {
                window.postMessage(response);
            });
            return;
        default:
            // Ignore all other messages
            break;
    }
});
