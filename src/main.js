'use strict';
const DiscordRPC = require('discord-rpc');
const { app, BrowserWindow, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { clearInterval } = require('timers');

const dataPath = app.getPath('userData');
const generalConfigPath = path.join(dataPath, 'config.json');

let config = {
	continueURL: 'https://music.youtube.com/',
	continueWhereLeftOf: false,
};

try {
	config = JSON.parse(fs.readFileSync(generalConfigPath));
} catch (ex) {
	fs.writeFileSync(generalConfigPath, JSON.stringify(config));
}

if (!config.continueWhereLeftOf || typeof config.continueWhereLeftOf !== 'boolean') config.continueWhereLeftOf = false;
if (!config.continueURL || typeof config.continueURL !== 'string') config.continueURL = 'https://music.youtube.com/';

let reconnectTimer, injected;

const resourcePath = process.platform === 'darwin' ? 'Contents/Resources' : 'resources';

function executeJavaScript(target, code) {
	return new Promise(resolve => {
		target.webContents.executeJavaScript(code).then(data => resolve(data));
	});
}

let settingsClosed, mainClosed = false;
let win, settingsWin;
const menuTemplate = [
	{
		label: 'Interface',
		submenu: [
			{ role: 'Reload' },
		],
	},
];

if (process.platform === 'darwin') {
	menuTemplate.unshift({});
}

const debug = process.argv[2] === '--debug' || false;

function createSettingsWindow() {
	settingsClosed = false;
	settingsWin = new BrowserWindow({
		width: 300,
		height: 150,
		title: `Settings - YouTube Music - v${require('../package.json').version}`,
		webPreferences: {
			preload: path.join(process.cwd(), 'src', 'preload.js'),
			contextIsolation: false,
		},
	});
	settingsWin.setMinimumSize(300, 150);
	settingsWin.setResizable(false);
	const menu = Menu.buildFromTemplate(menuTemplate);
	Menu.setApplicationMenu(menu);
	settingsWin.setMenuBarVisibility(false);

	settingsWin.on('show', () => settingsWin.focus());

	settingsWin.on('close', async e => {
		if (settingsClosed === true) return;
		e.preventDefault();

		const left_off = await executeJavaScript(settingsWin,
			'document.getElementById(\'left-off\').checked;');

		let result = {};

		if (left_off !== config.continueWhereLeftOf) {
			result = await dialog.showMessageBox({
				type: 'warning',
				buttons: ['Cancel', 'Ok'],
				title: 'Do not forget to safe your changes',
				cancelId: 0,
				defaultId: 1,
				noLink: true,
			});
		}

		// eslint-disable-next-line no-undef
		if (result.response === 0) {
			// Cancel the close process
		} else if (settingsWin) {
			settingsClosed = true;
			settingsWin.close();
		}
	});

	settingsWin.loadFile(path.join(process.cwd(), 'resources', 'page', 'settings.html'));
}

function createWindow() {
	// Create the browser window.
	win = new BrowserWindow({
		width: 800,
		height: 700,
		title: `YouTube Music - v${require('../package.json').version}`,
		webPreferences: {
			preload: path.join(process.cwd(), 'src', 'preload.js'),
			contextIsolation: false,
		},
	});
	win.setMinimumSize(300, 300);
	win.setResizable(true);
	const menu = Menu.buildFromTemplate(menuTemplate);
	Menu.setApplicationMenu(menu);
	win.setMenuBarVisibility(false);

	win.on('close', async e => {
		if (mainClosed) return;
		e.preventDefault();
		let tempInfo = await getContent().catch(() => null);
		// eslint-disable-next-line no-unused-vars
		const { time, paused } = tempInfo ||
		{
			time: undefined,
			paused: undefined,
		};

		if (!config.continueWhereLeftOf) {
			config.continueURL = 'https://music.youtube.com/';
		} else {
			await executeJavaScript(win,
				'document.querySelector(\'[aria-label="Open player page"] > tp-yt-iron-icon\').click();').catch(null);

			config.continueURL = win.webContents.getURL();
			config.continueURL += `&autoplay=0&t=${time[0]}`;
		}

		console.log(config.continueURL);
		fs.writeFileSync(generalConfigPath, JSON.stringify(config, null, '\t'));

		mainClosed = true;
		win.close();
	});
	win.on('closed', () => {
		win = null;
	});
	win.on('page-title-updated', (e, title) => {
		e.preventDefault();
		win.setTitle(`${title} - v${require('../package.json').version}`);
	});
	win.webContents.on('will-navigate', (e, url) => {
		const domain = url.match(/^https?:\/\/([\w.\-_]*)\//i)[1];
		if (domain !== 'music.youtube.com') {
			e.preventDefault();
		}
	});

	win.webContents.on('dom-ready', settingsHook);
	win.webContents.on('will-prevent-unload', e => e.preventDefault());

	win.loadURL(config.continueURL, {
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:80.0) Gecko/20100101 Firefox/80.0',
		// eslint-disable-next-line max-len
		// Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36
	});

	if (debug) win.webContents.openDevTools();

	if (!config.continueWhereLeftOf) return;

	win.webContents.once('media-started-playing', async () => {
		await executeJavaScript(win, 'document.querySelector(\'#play-pause-button > tp-yt-iron-icon\').click();');
	});
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
	saveConfig();
	app.quit();
});
app.on('will-quit', () => {
	saveConfig();
});

app.on('activate', () => {
	if (win === null) {
		createWindow();
	}
});

async function settingsHook() {
	if (injected) return;

	// eslint-disable-next-line max-len
	await executeJavaScript(win, fs.readFileSync(path.join(process.cwd(), 'src', 'settingsInjection.js')).toString().replaceAll('\r', ''));
	injected = true;
}

ipcMain.on('left-of-checked', (event, checked) => {
	config.continueWhereLeftOf = checked;

	if (checked === false) {
		config.continueURL = 'https://music.youtube.com/';
	}

	event.returnValue = undefined;
});

ipcMain.on('get-left-of-checked', event => {
	event.returnValue = config.continueWhereLeftOf;
});

ipcMain.on('settings-closing', () => {
	win.setIgnoreMouseEvents(false);
	win.focus();
	saveConfig();
});

ipcMain.on('settings-clicked', () => {
	win.setIgnoreMouseEvents(true);
	createSettingsWindow();
});

function getContent() {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (resolve, reject) => {
		let title,
			artist,
			timeMax,
			timeNow,
			paused,
			isFirst,
			result;

		// eslint-disable-next-line max-len
		result = await executeJavaScript(win, 'document.querySelector(\'div.content-info-wrapper yt-formatted-string.title\').title;');
		if (!result) return reject('Error grabbing title');
		title = result;

		result = await executeJavaScript(win,
			'document.querySelector(\'span.subtitle yt-formatted-string.byline\').title;');
		if (!result) return reject('Error grabbing artist');
		artist = result.split(' • ');

		result = await executeJavaScript(win, 'document.querySelector(\'#progress-bar\').getAttribute(\'aria-valuemax\');');
		if (!result) return reject('Error grabbing time max');
		timeMax = result;

		result = await executeJavaScript(win, 'document.querySelector(\'#progress-bar\').getAttribute(\'aria-valuenow\');');
		if (!result) return reject('Error grabbing time now');
		timeNow = result;

		result = await executeJavaScript(win, 'document.querySelector(\'#play-pause-button\').title;');
		if (!result) return reject('Error grabbing play status');
		paused = result !== 'Pause';

		result = await executeJavaScript(win,
			'document.querySelector(\'#content\').firstElementChild.selected');
		isFirst = result;

		return resolve({ title, artist, time: [timeNow, timeMax], paused, isFirst });
	});
}

const clientId = '633709502784602133';
DiscordRPC.register(clientId);

let rpc = new DiscordRPC.Client({ transport: 'ipc' });
let startTimestamp = new Date(),
	endTimestamp,
	prevSong;

let songInfo;

function setActivity() {
	if (!rpc || !win) {
		return;
	}

	// eslint-disable-next-line no-empty-function
	const { title, artist, time, paused } = songInfo ||
		{
			title: undefined,
			artist: undefined,
			time: undefined,
			paused: undefined,
			isFirst: undefined,
		};
	const now = new Date();

	let details,
		state,
		smallImageKey,
		smallImageText;

	console.log(songInfo);

	if (!title && !artist) {
		details = 'Browsing';
		smallImageKey = undefined;
		smallImageText = 'Browsing';
	} else {
		startTimestamp = now - (time[0] * 1000);
		endTimestamp = startTimestamp + (time[1] * 1000);
		details = title;
		state = `${artist[0] || 'Unknown'} • ${artist[1] || 'Unknown'} (${artist[2] || 'Unknown'})`;

		if (paused) {
			smallImageKey = 'pause';
			smallImageText = 'Paused';
		} else 	if (prevSong !== { title, artist }) {
			prevSong = { title, artist };

			smallImageKey = 'play';
			smallImageText = 'Listening';
		}
	}

	const activity = {
		details,
		state,
		startTimestamp,
		largeImageKey: 'youtube-music-logo',
		largeImageText: 'YouTube Music',
		smallImageKey,
		smallImageText,
		instance: false,
	};

	if (endTimestamp) activity.endTimestamp = endTimestamp;

	rpc.setActivity(activity);
}


async function updateSongInfo() {
	if (!rpc || !win) {
		return;
	}

	songInfo = await getContent().catch(debug ? console.log : null);

	// eslint-disable-next-line no-empty-function
	const { title, artist, time, paused, isFirst } = songInfo ||
		{
			title: undefined,
			artist: undefined,
			time: undefined,
			paused: undefined,
			isFirst: undefined,
		};

	win.setThumbnailClip({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});

	const toolTipButtons = [
		{
			tooltip: 'Previous Song',
			icon: getNativeImage('assets/images/prev.png'),
			async click() {
				await executeJavaScript(win, 'document.querySelector(\'tp-yt-paper-icon-button.previous-button\').click();');
			},
		}, {
			tooltip: 'Play',
			icon: getNativeImage('assets/images/play.png'),
			async click() {
				await executeJavaScript(win, 'document.querySelector(\'tp-yt-paper-icon-button.play-pause-button\').click();');
			},
		}, {
			tooltip: 'Next Song',
			icon: getNativeImage('assets/images/next.png'),
			async click() {
				await executeJavaScript(win, 'document.querySelector(\'tp-yt-paper-icon-button.next-button\').click();');
			},
		},
	];

	if (!title && !artist) {
		if (process.platform === 'win32') {
			// Set progress to a ridiculously low number above 1
			win.setProgressBar(1 + 1e-10);
		}
		win.setOverlayIcon(null, 'Browsing');
	} else if (process.platform === 'win32') {
		win.setProgressBar(time[0] / time[1], {
			mode: paused ? 'paused' : 'normal',
		});

		if (isFirst) {
			toolTipButtons[0].flags = ['disabled'];
		}

		if (paused) {
			win.setOverlayIcon(getNativeImage('assets/images/pause.png'), 'Paused');
			win.setThumbarButtons(toolTipButtons);
		} else 	if (prevSong !== { title, artist }) {
			prevSong = { title, artist };
			win.setOverlayIcon(getNativeImage('assets/images/play.png'), 'Listening');

			toolTipButtons[1].tooltip = 'Pause';
			toolTipButtons[1].icon = getNativeImage('assets/images/pause.png');

			win.setThumbarButtons(toolTipButtons);
		}
	} else {
		win.setProgressBar(time[0] / time[1]);
	}
}

rpc.once('disconnected', () => {
	rpc = null;
	reconnectTimer = setInterval(reconnect, 5e3);
});

function reconnect() {
	rpc = new DiscordRPC.Client({ transport: 'ipc' });
	DiscordRPC.register(clientId);
	rpc.login({ clientId }).then(() => {
		clearInterval(reconnectTimer);
	}).catch(err => {
		rpc = null;
		console.error(err);
	});
}

function getNativeImage(filePath) {
	return nativeImage.createFromPath(path.join(process.cwd(), resourcePath, filePath));
}

rpc.on('ready', () => {
	setActivity();
	setInterval(setActivity, 15e3);
	setInterval(updateSongInfo, 1e3);
});

// eslint-disable-next-line no-console
rpc.login({ clientId }).catch(console.error);

function saveConfig() {
	fs.writeFileSync(generalConfigPath, JSON.stringify(config, null, '\t'));
}
