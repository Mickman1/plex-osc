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
let lastOSCMessageTimeMs

async function getPlexSessions() {
	const result = await plexAPI.sessions.getSessions()


	result.object.mediaContainer.metadata.forEach(async session => {
		// IDs stored as strings for some reason
		if (session.user.id === '1') {
			console.log(session)

			let title = session.title
			let subtitle = session.parentTitle

			// Don't repeat title twice, for instances like Singles. Use Artist title instead
			if (session.title === session.parentTitle)
				subtitle = session.grandparentTitle

			const chatboxMessage = `🎶 ${title} 🎶\n${subtitle} (${session.parentYear})`

			// Avoid VRChat spam by negating sending the same message twice in less than 5 seconds
			if (lastOSCMessage === chatboxMessage && new Date().getTime() - lastOSCMessageTimeMs <= 5000)
				return;
			
			oscClient.send('/chatbox/input', chatboxMessage, true)
			console.log(chalk`{cyan [${new Date().toLocaleTimeString()}]} {white 💬: "${chatboxMessage.replace('\n', ' | ')}"}`)

			lastOSCMessage = chatboxMessage
			lastOSCMessageTimeMs = new Date().getTime()
		}
	})
}

setInterval(() => {
	getPlexSessions()
}, 500)
