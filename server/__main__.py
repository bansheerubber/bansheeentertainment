import asyncio
from enum import Enum
import json
import os
import re
import socket
import websockets
from time import time

import random

CONNECTIONS = []
VLCCLIENT = None
LOOP = asyncio.get_event_loop()
VLC_DOWNLOADS = "Downloads"
VLC_DOWNLOADS_PREFIX = "/home/me/"

class InterpretMode(Enum):
	NONE = 0
	SUBTITLE = 1
	AUDIO = 2
	PLAYLIST = 3

class VLCClient(asyncio.Protocol):
	def __init__(self):
		global VLCCLIENT
		VLCCLIENT = self
		
		self.buffer = ""
		self.command_queue = []
		self.subtitle_info = []
		self.audio_info = []
		self.playlist_info = []
		self.playlist_flat = []
		self.current_title = None
		self.last_current_title_set = 0
		self.current_time = None
		self.total_time = None
		self.mode = InterpretMode.NONE
		self.is_playing = False
		self.volume = 0
		self.flip_flop = 0
	
	def query_tracks(self):
		self.enqueue_command(b"get_time\r\n")
		self.enqueue_command(b"get_length\r\n")

		if self.flip_flop: # alternate getting information so we don't screw up VLC
			self.transport.write(b"volume\r\n")
			self.transport.write(b"atrack\r\n")
			self.transport.write(b"strack\r\n")
		else:
			self.transport.write(b"playlist\r\n")
			self.transport.write(b"get_title\r\n")

		self.flip_flop = not self.flip_flop
	
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
		if time() - self.last_current_title_set > 5000:
			self.current_title = None
		
		self.mode = InterpretMode.NONE
		split = output.split("\r\n")
		for line in split:
			line = line.strip()
			if self.mode == InterpretMode.SUBTITLE: # handle subtitles
				self.handle_tracks(line, self.subtitle_info, "strack")
			elif self.mode == InterpretMode.AUDIO: # handle audio tracks
				self.handle_tracks(line, self.audio_info, "atrack")
			elif self.mode == InterpretMode.PLAYLIST: # handle audio tracks
				self.handle_tracks(line, self.playlist_info, "playlist")
				self.playlist_flat = []
				regex = re.compile(r"(.+?)(?:\(.+\))$")
				for _, name in self.playlist_info:
					matched = regex.match(name)
					if matched:
						self.playlist_flat.append(matched.group(1).strip())
			
			if "Press pause to continue" in line:
				self.set_is_playing(False)
			elif line in self.playlist_flat:
				self.current_title = line
				self.last_current_title_set = time()

				self.send_to_all(json.dumps({
					"command": "get_title",
					"info": self.current_title,
				}))
			elif line == "+----[ Subtitle Track ]":
				self.mode = InterpretMode.SUBTITLE
				self.subtitle_info = []

				self.set_is_playing(True)
			elif line == "+----[ Audio Track ]":
				self.mode = InterpretMode.AUDIO
				self.audio_info = []

				self.set_is_playing(True)
			elif line == "|- Playlist":
				self.mode = InterpretMode.PLAYLIST
				self.playlist_info = []

				self.set_is_playing(True)
			elif "audio volume" in line:
				match = re.search(r"([0-9]+)", line)
				if match:
					self.volume = int(match.group(1))
					self.send_to_all(json.dumps({
						"command": "volume",
						"info": self.volume,
					}))
			elif re.compile("\d+").match(line):
				if self.command_queue[0] == b"get_time\r\n":
					self.current_time = int(line)
					self.send_to_all(json.dumps({
						"command": "get_time",
						"info": self.current_time,
					}))
				elif self.command_queue[0] == b"get_length\r\n":
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
			LOOP.create_task(connection.send(message + "\r\n"))
	
	def handle_tracks(self, line, array, array_command):
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
			"command": "get_title",
			"info": self.current_title,
		}))
		
		self.send_to_all(json.dumps({
			"command": "atrack",
			"info": self.audio_info,
		}))

		self.send_to_all(json.dumps({
			"command": "strack",
			"info": self.subtitle_info,
		}))

		self.send_to_all(json.dumps({
			"command": "playlist",
			"info": self.playlist_info,
		}))

		self.send_to_all(json.dumps({
			"command": "volume",
			"info": self.volume,
		}))

		global VLC_DOWNLOADS_PREFIX
		self.send_to_all(json.dumps({
			"command": "path_prefix",
			"info": VLC_DOWNLOADS_PREFIX,
		}))

async def connection(websocket, path):
	CONNECTIONS.append(websocket)

	VLCCLIENT.send_info(websocket)
	send_directories(websocket)

	while True:
		try:
			command = await websocket.recv()
		except: # disconnection or something
			CONNECTIONS.remove(websocket)
			return
		
		if command.strip() == "refresh-directory":
			send_directories(websocket)
		else:
			VLCCLIENT.send_command(command)

websocket_loop = websockets.serve(connection, "%%ipaddress%%", 10000)

# this works, idk how, don't touch it
def send_directories(connection = None):
	global VLC_DOWNLOADS
	global VLC_DOWNLOADS_PREFIX
	
	structure = {}
	def create_directory_in_structure(split):
		name = split[-1]

		found_structure = structure
		for i in range(0, len(split) - 1):
			new_name = split[i]
			found_structure = found_structure[new_name]["structure"]

		if name not in found_structure:
			directory = {
				"directory": True,
				"name": name,
				"path": "/".join(split),
				"paths": [],
			}
			
			found_structure[name] = {
				"path_object": directory,
				"structure": {},
			}

			return directory
		else:
			found_structure[name]["path_object"]["directory"] = True
			found_structure[name]["path_object"]["paths"] = []
			return found_structure[name]["path_object"]
	
	def get_path_object_from_root(split):
		found_object = None
		found_structure = structure
		for i in range(0, len(split)):
			name = split[i]
			found_object = found_structure[name]["path_object"]
			found_structure = found_structure[name]["structure"]

		return found_object

	output = create_directory_in_structure([VLC_DOWNLOADS])
	
	for root, directories, files in os.walk(f"{VLC_DOWNLOADS_PREFIX}{VLC_DOWNLOADS}"):
		without_prefix = root.replace(VLC_DOWNLOADS_PREFIX, "")
		split = root.replace(VLC_DOWNLOADS_PREFIX, "").split("/")
		path = create_directory_in_structure(split)

		for directory in directories:
			path["paths"].append(create_directory_in_structure(split + [directory]))
		
		for file in files:
			path["paths"].append({
				"directory": False,
				"name": file,
				"path": f"{without_prefix}/{file}",
			})
	
	message = json.dumps({
		"command": "paths",
		"info": output,
	})

	if connection == None:
		global CONNECTIONS
		for connection in CONNECTIONS:
			LOOP.create_task(connection.send(message + "\r\n"))
	else:
			LOOP.create_task(connection.send(message + "\r\n"))

LOOP.run_until_complete(websocket_loop)
LOOP.run_until_complete(LOOP.create_connection(VLCClient, "localhost", 4212))
LOOP.run_forever()