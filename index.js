import 'dotenv/config'
import chalk from 'chalk'

// VRChat OSC
import { Client, Server } from 'node-osc'
const oscClient = new Client('127.0.0.1', 9000)
const oscServer = new Server(9001, '127.0.0.1', () => {
	console.log(chalk.cyan(`[${new Date().toLocaleTimeString()}]`), chalk.yellow('OSC Server started at 9001'))
})

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

	//console.log(result.object.mediaContainer.metadata)

	result.object.mediaContainer.metadata.forEach(async session => {
		// IDs stored as strings for some reason
		if (session.user.id === '1') {
			let activityType = ''
			switch(session.type) {
				case 'episode': case 'movie':
					activityType = 'watching'
					break
				case 'track':
					activityType = 'listening to'
					break
				default:
					activityType = 'experiencing'
			}
			const chatboxMessage = `MiaB is ${activityType}: ${session.title} - ${session.parentTitle} (${session.parentYear})`

			const chatboxMessage = `MiaB is listening to: ${session.title} - ${session.parentTitle} (${session.parentYear})`
			// Avoid VRChat spam by negating sending the same message twice in less than 5 seconds
			if (lastOSCMessage === chatboxMessage && new Date().getTime() - lastOSCMessageTimeMs <= 5000)
				return;
			
			oscClient.send('/chatbox/input', chatboxMessage, true)
			console.log(chalk`{cyan [${new Date().toLocaleTimeString()}]} {white ⌨️: "${chatboxMessage}"}`)

			lastOSCMessage = chatboxMessage
			lastOSCMessageTimeMs = new Date().getTime()
		}
	})
}

setInterval(() => {
	getPlexSessions()
}, 500)
