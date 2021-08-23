import asyncio
import socket
import sys

LOOP = asyncio.get_event_loop()
RELAY_IP = "192.168.0.83"
RELAY_PORT = int(sys.argv[1])

class RelayClient(asyncio.Protocol):
	def __init__(self):
		self.transport = None
	
	def connection_made(self, transport):
		self.transport = transport

	def data_received(self, data):
		self.source.send(data)
	
	def set_source(self, source):
		self.source = source
	
	def relay(self, data):
		self.transport.write(data)
	
	def close(self):
		self.transport.close()

async def handle_client(client):
	global LOOP

	# create connection for the relay
	_, relay_client = await LOOP.create_connection(RelayClient, RELAY_IP, RELAY_PORT)
	relay_client.set_source(client)

	while True:
		data = await LOOP.sock_recv(client, 4096)
		if not data:
			break

		if len(data) != 0:
			relay_client.relay(data)
		await asyncio.sleep(0.001)
	
	client.close()
	relay_client.close()

async def start_server():
	global LOOP

	server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
	server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
	server.bind(("localhost", RELAY_PORT))
	server.listen(8)
	server.setblocking(False)

	while True:
		client, _ = await LOOP.sock_accept(server)
		LOOP.create_task(handle_client(client))

LOOP.run_until_complete(start_server())
LOOP.run_forever()