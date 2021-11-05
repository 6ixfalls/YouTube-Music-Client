console.log('renderer init');

const title = document.querySelector('div.content-info-wrapper yt-formatted-string.title');
const artistContainer = document.querySelector('span.subtitle');
const time = document.querySelector('#progress-bar');
const paused = document.querySelector('#play-pause-button');

console.log(title);
console.log(artistContainer);
console.log(time);
console.log(paused);

// title observer
const titleObserver = new MutationObserver(() => {
    window.ipcRenderer.send('title-changed', title.title);
});
const artistObserver = new MutationObserver(() => {
    if (artistContainer.querySelector('yt-formatted-string.byline')) {
        window.ipcRenderer.send('artist-changed', artistContainer.querySelector('yt-formatted-string.byline').title.split(' • '));
    }
});
const timeObserver = new MutationObserver(mutationList => {
    mutationList.forEach(mutation => {
        if (mutation.type === 'attributes') {
            if (mutation.attributeName === 'aria-valuenow') {
                window.ipcRenderer.send('time-now', time.getAttribute('aria-valuenow'));
            } else if (mutation.attributeName === 'aria-valuemax') {
                window.ipcRenderer.send('time-max', time.getAttribute('aria-valuemax'));
            }
        }
    });
});

const pausedObserver = new MutationObserver(mutationList => {
    mutationList.forEach(mutation => {
        if (mutation.type === 'attributes') {
            if (mutation.attributeName === 'title') {
                window.ipcRenderer.send('paused-changed', paused.title !== 'Pause');
            }
        }
    });
});

const observerConfig = { characterData: false, attributes: true, childList: false, subtree: false };
const observerChildConfig = { characterData: false, attributes: true, childList: false, subtree: true };

titleObserver.observe(title, observerConfig);
artistObserver.observe(artistContainer, observerChildConfig);
timeObserver.observe(time, observerChildConfig);
pausedObserver.observe(paused, observerConfig);
