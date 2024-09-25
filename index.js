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
	const sessions = await plexAPI.sessions.getSessions()
	//console.log(sessions.object.mediaContainer)

	sessions.object.mediaContainer.metadata?.forEach(async session => {
		// Check if not Admin account, IDs stored as strings for some reason
		if (session.user.id !== '1')
			return;

		let title = session.title
		let subtitle = session.parentTitle
		let newline = '\n'
		let year = 0
		let emoji = ''

		switch (session.type) {
			case 'track':
				// Don't repeat title twice, for instances like Singles. Use Artist title instead
				if (session.title === session.parentTitle)
					subtitle = session.grandparentTitle

				year = session.parentYear

				emoji = '🎶'
				break
			case 'movie':
				subtitle = ''
				newline = ''
				year = session.year
				//const result = await plexAPI.library.getMetaDataByRatingKey(Number.parseInt(session.ratingKey), { retries: { retryConnectionErrors: true } })

				emoji = '🍿'
				break
			case 'episode':
				emoji = '📺'
				break
		}

		const chatboxMessage = `${emoji} ${title} ${emoji}${newline}${subtitle} (${year})`

		// Avoid VRChat spam by negating sending the same message twice in less than 5 seconds
		if (lastOSCMessage === chatboxMessage && new Date().getTime() - lastOSCMessageTimeMs <= 5000)
			return;
		
		oscClient.send('/chatbox/input', chatboxMessage, true)
		console.log(chalk`{cyan [${new Date().toLocaleTimeString()}]} {white 💬: "${chatboxMessage.replace('\n', ' | ')}"}`)

		lastOSCMessage = chatboxMessage
		lastOSCMessageTimeMs = new Date().getTime()
	})
}

setInterval(() => {
	getPlexSessions()
}, 500)
