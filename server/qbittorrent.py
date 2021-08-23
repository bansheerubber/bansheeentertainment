import asyncio
import json

class QBitTorrent:
	def __init__(self, connections, loop):
		self.connections = connections
		self.loop = loop
	
	async def get_torrents(self):
		process = await asyncio.create_subprocess_exec(
			"qbt",
			"torrent",
			"list",
			"--format=json",
			stdout=asyncio.subprocess.PIPE,
			stderr=asyncio.subprocess.PIPE
		)

		stdout, stderr = await process.communicate()
		info = json.dumps({
			"command": "torrent_list",
			"info": json.loads(stdout.decode("utf8"))
		})
		for connection in self.connections:
			self.loop.create_task(connection.send(info + "\r\n"))
	
	async def send_command(self, command_array):
		command_array = ["qbt"] + command_array
		process = await asyncio.create_subprocess_exec(*command_array, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
		stdout, stderr = await process.communicate()
		await self.get_torrents()