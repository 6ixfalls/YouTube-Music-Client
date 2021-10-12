// eslint-disable-next-line no-unused-vars
function saveSettings() {
	const left_off = document.getElementById('left-off').checked;
	window.ipcRenderer.sendSync('left-of-checked', left_off);
	window.close();
}

document.addEventListener('DOMContentLoaded', () => {
	const left_off = window.ipcRenderer.sendSync('get-left-of-checked');
	document.getElementById('left-off').checked = left_off;
});

window.addEventListener('beforeunload', () => {
	window.ipcRenderer.send('settings-closing');
});
