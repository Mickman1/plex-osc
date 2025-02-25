import 'dotenv/config'
import chalk from 'chalk'

// Commander
import { Command } from 'commander'
const program = new Command()

program
	.name('node index')
	.description('Show Plex "Now Playing" session in VRChat chatbox over OSC')
	.option('-t, --token <X-Plex-Token>', 'Set Plex server token')
	.option('-a, --address <Plex server IP / address & port>', 'Set Plex server address, including protocol and port (Example: http://127.0.0.1:32400)')
	.option('-s, --short', 'Enable "short" mode. Disables subtitle from appearing for tracks.')
	.option('-u, --superscript', 'Enable small timestamps. Uses superscript characters.')
	.option('-p, --polling-rate <Polling rate in milliseconds>', 'Set polling rate for contacting Plex API in milliseconds (Default: 500ms)')
	.helpOption('-h, --help', 'Show help information')
	.parse()

const options = program.opts()

// VRChat OSC
import { Client } from 'node-osc'
const oscClient = new Client('127.0.0.1', 9000)

// Plex API
import { PlexAPI } from '@lukehagar/plexjs'
const plexAPI = new PlexAPI({
	serverURL: options.address || process.env.PLEX_SERVER_ADDRESS,
	accessToken: options.token || process.env.PLEX_TOKEN,
})

const pollingRateMs = parseInt(options.pollingRate) || 500
let lastOSCMessage = ''
let lastOSCMessageTimeMs = 0
let lastViewOffsetMs = 0
let viewOffsetMs = 0

async function getPlexSessions() {
	let isAdminPlaying = false
	const sessions = await plexAPI.sessions.getSessions()

	sessions.object.mediaContainer.metadata?.forEach(async session => {
		// Check if not Admin account, IDs stored as strings for some reason.
		if (session.user.id !== '1')
			return;

		isAdminPlaying = true

		let title = session.title
		let subtitle = `${session.grandparentTitle} | ${session.parentTitle}`
		let newline = '\n'
		let year = 0
		let emoji = ''

		switch (session.type) {
			case 'track':
				emoji = '🎵'
				// Don't repeat title twice, for instances like Singles. Use Artist title instead.
				if (session.title === session.parentTitle)
					subtitle = session.grandparentTitle
				if (options.short)
						subtitle = ''
				year = session.parentYear
				break
			case 'movie':
				emoji = '🍿'
				subtitle = ''
				newline = ''
				year = await getMediaYear(session.ratingKey)
				break
			case 'episode':
				emoji = '📺'
				title = session.grandparentTitle
				subtitle = `Season ${session.parentIndex} Episode ${session.index}`
				// Specials / Season 0
				if (session.parentIndex === 0)
					subtitle = `Special Episode ${session.index}`
				year = await getMediaYear(session.ratingKey)
				break
		}

		// Plex API viewOffset only gets updated about every 10-15 seconds depending on the client.
		// When it updates with a different viewOffset from last time, set local viewOffset and start the 'clock'.
		// Add polling rate each cycle to keep in time. If viewOffsetMs and session.viewOffset are the same, trust local. If not, trust server.
		if (lastViewOffsetMs !== session.viewOffset) {
			lastViewOffsetMs = session.viewOffset
			viewOffsetMs = session.viewOffset
		}
		viewOffsetMs += pollingRateMs

		if (session.player.state === 'paused') {
			emoji = '⏸️'

			lastViewOffsetMs = session.viewOffset
			viewOffsetMs = session.viewOffset
		}

		let durationTimestamp = secondsToTimestamp(session.duration / 1000)
		let currentTimestamp = secondsToTimestamp(viewOffsetMs / 1000)
		if (options.superscript) {
			durationTimestamp = toSuperScript(secondsToTimestamp(session.duration / 1000))
			currentTimestamp = toSuperScript(secondsToTimestamp(viewOffsetMs / 1000))
		}

		let timestampSeparator = '/'
		if (options.superscript) {
			timestampSeparator = ''
		}

		let incompleteMessage = `${emoji}${title}${emoji}${newline}${subtitle}`
		let chatboxMessage = `${incompleteMessage} (${year})\n${currentTimestamp} ${timestampSeparator} ${durationTimestamp}`
		if (options.short && session.type === 'track')
			chatboxMessage = `${incompleteMessage}${currentTimestamp} ${timestampSeparator} ${durationTimestamp}`

		// VRChat has max Chatbox length of 144 characters. Chop off extra characters *before* year and timestamp, and add '...'
		if (chatboxMessage.length > 144) {
			incompleteMessage = incompleteMessage.slice(0, incompleteMessage.length - (chatboxMessage.length - 141)).concat('...')
			chatboxMessage = `${incompleteMessage} (${year})\n${currentTimestamp} / ${durationTimestamp}`
		}

		// Avoid VRChat spam by not sending the same message twice in less than 3 seconds.
		if (lastOSCMessage === incompleteMessage && new Date().getTime() - lastOSCMessageTimeMs < 3000)
			return;

		oscClient.send('/chatbox/input', chatboxMessage, true, false)
		console.log(chalk`{cyan [${new Date().toLocaleTimeString()}]} {white 💬: ${chatboxMessage.replaceAll('\n', ' | ')}}`)

		lastOSCMessage = incompleteMessage
		lastOSCMessageTimeMs = new Date().getTime()
	})

	// Playback stopped / no playback
	if (!isAdminPlaying && lastOSCMessage !== '') {
		oscClient.send('/chatbox/input', '', true)
		console.log(chalk`{cyan [${new Date().toLocaleTimeString()}]} {white 🧹: Cleared}`)
		lastOSCMessage = ''
	}
}

async function getMediaYear(ratingKey) {
	// Horrible solution to a plexjs bug.
	// https://github.com/LukeHagar/plexjs/issues/17
	try {
		await plexAPI.library.getMetaDataByRatingKey(Number.parseInt(ratingKey))
	}
	catch (error) {
		return error.rawValue.object.MediaContainer.Metadata[0].year;
	}
}

function secondsToTimestamp(seconds) {
	let timestampDivider = ':'
	if (options.superscript) {
		timestampDivider = `'`
	}

	const h = Math.floor(seconds / 3600).toString(),
				m = Math.floor(seconds % 3600 / 60).toString(),
				s = Math.floor(seconds % 60).toString().padStart(2,'0')

	// Show hours and pad minutes only if over an hour.
	if (h == 0)
		return `${m}${timestampDivider}${s}`;

	return `${h}${timestampDivider}${m.padStart(2,'0')}${timestampDivider}${s}`;
}

var SUPERSCRIPTS = {
	' ': ' ',
	'0': '⁰',
	'1': '¹',
	'2': '²',
	'3': '³',
	'4': '⁴',
	'5': '⁵',
	'6': '⁶',
	'7': '⁷',
	'8': '⁸',
	'9': '⁹',
	'+': '⁺',
	'-': '⁻',
	'a': 'ᵃ',
	'b': 'ᵇ',
	'c': 'ᶜ',
	'd': 'ᵈ',
	'e': 'ᵉ',
	'f': 'ᶠ',
	'g': 'ᵍ',
	'h': 'ʰ',
	'i': 'ⁱ',
	'j': 'ʲ',
	'k': 'ᵏ',
	'l': 'ˡ',
	'm': 'ᵐ',
	'n': 'ⁿ',
	'o': 'ᵒ',
	'p': 'ᵖ',
	'r': 'ʳ',
	's': 'ˢ',
	't': 'ᵗ',
	'u': 'ᵘ',
	'v': 'ᵛ',
	'w': 'ʷ',
	'x': 'ˣ',
	'y': 'ʸ',
	'z': 'ᶻ'
}

function toSuperScript(string) {
	return string.split('').map(function(character) {
		if (character in SUPERSCRIPTS) {
			return SUPERSCRIPTS[character];
		}
		return character;
	}).join('')
}

setInterval(() => {
	getPlexSessions()
}, pollingRateMs)
