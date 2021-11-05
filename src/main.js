'use strict';
const DiscordRPC = require('discord-rpc');
// eslint-disable-next-line no-unused-vars
const { app, BrowserWindow, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const { clearInterval } = require('timers');

let reconnectTimer;
let win;
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

function createWindow() {
	// Create the browser window.
	win = new BrowserWindow({
		width: 800,
		height: 700,
		title: `YouTube Music`,
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

	win.webContents.on('will-prevent-unload', e => e.preventDefault());

	win.loadURL('https://music.youtube.com/', {
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:80.0) Gecko/20100101 Firefox/80.0',
		// eslint-disable-next-line max-len
		// Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36
	});

	if (!app.isPackaged) win.webContents.openDevTools();
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
	app.quit();
});

app.on('activate', () => {
	if (win === null) {
		createWindow();
	}
});

const clientId = '633709502784602133';
DiscordRPC.register(clientId);

let rpc = new DiscordRPC.Client({ transport: 'ipc' });
let startTimestamp = new Date(),
	endTimestamp;

let songInfo = {
	title: undefined,
	artist: undefined,
	time: { now: 0, max: 0 },
	paused: undefined,
};

let rpcSet = false;

function setActivity() {
	if (!rpc || !win) {
		return;
	}

	// eslint-disable-next-line no-empty-function
	const { title, artist, time, paused } = songInfo;
	const now = new Date();

	let details,
		state,
		smallImageKey,
		smallImageText;

	if (title && artist) {
		startTimestamp = now - (time.now * 1000);
		endTimestamp = startTimestamp + (time.max * 1000);
		details = title;
		state = artist[0];
	} else {
		return;
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

	if (paused === false && artist[0] !== 'Video will play after ad') {
		rpc.setActivity(activity);
		rpcSet = true;
	} else {
		if (!rpcSet) return;
		rpcSet = false;
		console.log('clear rpc');
		rpc.clearActivity();
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

// updating song info
// ipc events:
/*
title-changed
artist-changed
time-now
time-max
paused-changed
*/
ipcMain.on('title-changed', (event, args) => {
	songInfo.title = args;
	console.log(args);
	setActivity();
});

ipcMain.on('artist-changed', (event, args) => {
	songInfo.artist = args;
	console.log(args);
	setActivity();
});

ipcMain.on('time-now', (event, args) => {
	songInfo.time.now = args;
});

ipcMain.on('time-max', (event, args) => {
	if (songInfo.time.max !== args) {
		songInfo.time.max = args;
		console.log(args);
		setActivity();
	}
});

ipcMain.on('paused-changed', (event, args) => {
	songInfo.paused = args;
	console.log(args);
	setActivity();
});

// eslint-disable-next-line no-console
rpc.login({ clientId }).catch(console.error);
