// eslint-disable-next-line no-restricted-globals
const ctx: Worker = self as any;

// Respond to message from parent thread
ctx.addEventListener('message', (event) => {
    setTimeout(() => {
        ctx.postMessage('Hello from Worker after 2 seconds');
    }, 2000);
});

export default ctx;
