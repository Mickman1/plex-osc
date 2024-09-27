import 'dotenv/config'
import chalk from 'chalk'

// VRChat OSC
import { Client } from 'node-osc'
const oscClient = new Client('127.0.0.1', 9000)

// Plex API
import { PlexAPI } from '@lukehagar/plexjs'
const plexAPI = new PlexAPI({
	serverURL: process.env.PLEX_SERVER_ADDRESS,
	accessToken: process.env.PLEX_TOKEN,
})

let lastOSCMessage = ''
let lastOSCMessageTimeMs = 0

async function getPlexSessions() {
	let isAdminPlaying = false
	const sessions = await plexAPI.sessions.getSessions()

	sessions.object.mediaContainer.metadata?.forEach(async session => {
		// Check if not Admin account, IDs stored as strings for some reason
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
				// Don't repeat title twice, for instances like Singles. Use Artist title instead
				if (session.title === session.parentTitle)
					subtitle = session.grandparentTitle
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

		const durationTimestamp = secondsToTimestamp(session.duration / 1000)
		const currentTimestamp = secondsToTimestamp(session.viewOffset / 1000)

		const chatboxMessage = `${emoji}${title}${emoji}${newline}${subtitle} (${year})`

		// Avoid VRChat spam by negating sending the same message twice in less than 5 seconds
		if (lastOSCMessage === chatboxMessage && new Date().getTime() - lastOSCMessageTimeMs <= 5000)
			return;
		
		oscClient.send('/chatbox/input', `${chatboxMessage}\n${currentTimestamp} / ${durationTimestamp}`, true)
		console.log(chalk`{cyan [${new Date().toLocaleTimeString()}]} {white 💬: ${chatboxMessage.replace('\n', ' | ')} | ${currentTimestamp} / ${durationTimestamp}}`)

		lastOSCMessage = chatboxMessage
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
	const h = Math.floor(seconds / 3600).toString(),
				m = Math.floor(seconds % 3600 / 60).toString(),
				s = Math.floor(seconds % 60).toString().padStart(2,'0')
	
	// Show hours and pad minutes only if over an hour
	if (h == 0)
		return `${m}:${s}`;
	
	return `${h}:${m.padStart(2,'0')}:${s}`;
}

setInterval(() => {
	getPlexSessions()
}, 500)
