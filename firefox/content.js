let port = null;

function setupPort() {
    port?.disconnect();
    port = browser.runtime.connect();
    port.onMessage.addListener((message) => {
        message ??= {};
        message.direction = 'from-extension';
        window.postMessage(message);
    });
}

window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.origin) return;
    if (!('data' in event) || event.data.direction !== 'to-extension') return;
    if (!('token' in event.data)) return;

    if ((['get-present', 'get-history']).includes(event.data.type)) {
        console.log("Setting up port for", event.data.type);
        setupPort();
    }

    let token = event.data.token;

    browser.runtime.sendMessage(event.data).then((response) => {
        response ??= {};
        response.direction = 'from-extension';
        response.token = token;

        if ((['get-present-response', 'get-history-response']).includes(response.type)) {
            console.log("Disconnecting port after response");
            port?.disconnect();
            port = null;
        }

        window.postMessage(response, event.origin);
    });
});

