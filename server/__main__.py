import asyncio
from enum import Enum
import json
import re
import socket
import websockets

import random

CONNECTIONS = []
VLCCLIENT = None
LOOP = asyncio.get_event_loop()

class InterpretMode(Enum):
	NONE = 0
	SUBTITLE = 1
	AUDIO = 2

class VLCClient(asyncio.Protocol):
	def __init__(self):
		global VLCCLIENT
		VLCCLIENT = self
		
		self.buffer = ""
		self.command_queue = []
		self.subtitle_info = []
		self.audio_info = []
		self.current_time = None
		self.total_time = None
		self.mode = InterpretMode.NONE
		self.is_playing = False
	
	def query_tracks(self):
		self.enqueue_command(b"get_time\n")
		self.enqueue_command(b"get_length\n")
		self.transport.write(b"atrack\n")
		self.transport.write(b"strack\n")
	
	def enqueue_command(self, command): # handle get_time and get_length
		self.transport.write(command)
		self.command_queue.append(command)

	async def query_tracks_loop(self):
		while True:
			self.query_tracks()
			await asyncio.sleep(1)

	def connection_made(self, transport):
		self.transport = transport

		global LOOP
		LOOP.create_task(self.query_tracks_loop())
	
	def send_command(self, command):
		self.transport.write(command.encode("utf8"))
		self.query_tracks()
	
	def data_received(self, data):
		latest = data.decode("utf8")
		self.buffer = self.buffer + latest
		output = None
		while ": returned" in self.buffer:
			index = self.buffer.index(": returned")
			output = self.buffer[:index + len(": returned") + 2]
			for i in range(0, 30):
				if self.buffer[index:index + 2] == "\r\n":
					self.buffer = self.buffer[index + 2:]
					break
				index = index + 1

		if output:
			self.interpret_output(output)
	
	def interpret_output(self, output):
		self.mode = InterpretMode.NONE
		split = output.split("\r\n")
		for line in split:
			line = line.strip()
			if self.mode == InterpretMode.SUBTITLE: # handle subtitles
				self.handle_tracks(line, self.subtitle_info, "strack")
			elif self.mode == InterpretMode.AUDIO: # handle audio tracks
				self.handle_tracks(line, self.audio_info, "atrack")
			
			if "Press pause to continue" in line:
				self.set_is_playing(False)
			elif line == "+----[ Subtitle Track ]":
				self.mode = InterpretMode.SUBTITLE
				self.subtitle_info = []

				self.set_is_playing(True)
			elif line == "+----[ Audio Track ]":
				self.mode = InterpretMode.AUDIO
				self.audio_info = []

				self.set_is_playing(True)
			elif re.compile("\d+").match(line):
				if self.command_queue[0] == b"get_time\n":
					self.current_time = int(line)
					self.send_to_all(json.dumps({
						"command": "get_time",
						"info": self.current_time,
					}))
				elif self.command_queue[0] == b"get_length\n":
					self.total_time = int(line)
					self.send_to_all(json.dumps({
						"command": "get_length",
						"info": self.total_time,
					}))
				
				self.command_queue.pop(0)
	
	def set_is_playing(self, is_playing):
		self.is_playing = is_playing
		self.send_to_all(json.dumps({
			"command": "is_playing",
			"info": self.is_playing,
		}))

	def send_to_all(self, message):
		global CONNECTIONS
		for connection in CONNECTIONS:
			async def test():
				number = random.random()
				# if "is_playing" in message:
				# 	print(f"trying to send... {message}")
				await connection.send(message + "\r\n")
				# print("done")
			LOOP.create_task(test())
	
	def handle_tracks(self, line, array, array_command):
		global CONNECTIONS

		regex = re.compile(r"(?:\|\s+)([-\d]+)(?:[\s-]+)(.+)")
		matches = regex.match(line)
		if not matches:
			self.mode = InterpretMode.NONE
			self.send_to_all(json.dumps({
				"command": array_command,
				"info": array,
			}))
		else:
			last_match = matches.group(2)
			if last_match[-1] == "*":
				last_match = last_match[:-2]
			array.append((matches.group(1), last_match))
	
	def send_info(self, connection):
		self.send_to_all(json.dumps({
			"command": "is_playing",
			"info": self.is_playing,
		}))
		
		self.send_to_all(json.dumps({
			"command": "get_time",
			"info": self.current_time,
		}))

		self.send_to_all(json.dumps({
			"command": "get_length",
			"info": self.total_time,
		}))
		
		self.send_to_all(json.dumps({
			"command": "atrack",
			"info": self.audio_info,
		}))

		self.send_to_all(json.dumps({
			"command": "strack",
			"info": self.subtitle_info,
		}))

async def connection(websocket, path):
	CONNECTIONS.append(websocket)

	VLCCLIENT.send_info(websocket)

	while True:
		try:
			command = await websocket.recv()
		except: # disconnection or something
			CONNECTIONS.remove(websocket)
			return
		VLCCLIENT.send_command(command)

websocket_loop = websockets.serve(connection, "192.168.0.83", 10000)

LOOP.run_until_complete(websocket_loop)
LOOP.run_until_complete(LOOP.create_connection(VLCClient, "localhost", 4212))
LOOP.run_forever()