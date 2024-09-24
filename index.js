import 'dotenv/config'
import { PlexAPI } from '@lukehagar/plexjs'

const plexAPI = new PlexAPI({
	serverURL: process.env.PLEX_SERVER_ADDRESS,
	accessToken: process.env.PLEX_TOKEN,
})

async function run() {
	const result = await plexAPI.sessions.getSessions()

	console.log(result.object.mediaContainer.metadata)

	result.object.mediaContainer.metadata.forEach(async session => {
		// IDs stored as strings for some reason
		if (session.user.id === '1') {
			console.log(`MiaB is listening to: ${session.title} - ${session.parentTitle} (${session.parentYear})`)
		}
	})
}

run()
