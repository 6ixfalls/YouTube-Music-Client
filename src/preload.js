const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

function init() {
	window.isElectron = true;
	window.ipcRenderer = ipcRenderer;

	window.addEventListener('DOMContentLoaded', () => {
		// append renderer.js to body
		const script = document.createElement('script');
		script.innerHTML = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
		script.type = 'text/javascript';
		document.body.appendChild(script);
	});
}

init();
