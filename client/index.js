class EntertainmentWebSocket {
	constructor() {
		this.connect()

		this.openPromises = []
		this.isOpen = false

		this.audioInfo = []
		this.subtitleInfo = []
		this.playlistInfo = []

		this.currentTime = null
		this.totalTime = null
		this.updateScrubber()

		this.isPlaying = false
		this.updatePlayPause()
	}

	async waitUntilConnected() {
		return new Promise((resolve, reject) => {
			if(this.isOpen) {
				return resolve()
			}
			
			this.openPromises.push([resolve, reject])
		})
	}

	connect() {
		this.websocket = new WebSocket("ws://%%ipaddress%%:10000/")
		this.websocket.onopen = this.opened.bind(this)
		this.websocket.onmessage = this.messaged.bind(this)
		this.websocket.onclose = this.closed.bind(this)
	}

	reconnect() {
		if(this.isOpen) {
			return
		}

		setTimeout(async () => {
			this.connect()
		}, 2000)
	}

	opened() {
		this.isOpen = true
		for(const [promise, _] of this.openPromises) {
			promise()
		}
	}

	messaged(event) {
		const jsonData = JSON.parse(event.data)
		switch(jsonData.command) {
			case "atrack": {
				this.audioInfo = jsonData.info
				this.createTable("atrack", this.audioInfo, "audio-tracks-body")
				break
			}

			case "strack": {
				this.subtitleInfo = jsonData.info
				this.createTable("strack", this.subtitleInfo, "subtitle-tracks-body")
				break
			}

			case "playlist": {
				this.playlistInfo = jsonData.info
				this.createTable("goto", this.playlistInfo, "playlist-body")
				break
			}

			case "get_time": {
				this.currentTime = jsonData.info
				this.updateScrubber()
				break
			}

			case "get_length": {
				this.totalTime = jsonData.info
				this.updateScrubber()
				break
			}
			
			case "get_title": {
				if(jsonData.info !== null) {
					document.getElementById("title").innerHTML = jsonData.info
				}
				else {
					document.getElementById("title").innerHTML = "N/A"
				}
				break
			}
			
			case "is_playing": {
				this.isPlaying = Boolean(jsonData.info)
				this.updatePlayPause()
				break
			}

			case "paths": {
				document.getElementById("directory").innerHTML = ""
				document.getElementById("directory").appendChild(createDirectoryList(jsonData.info))
				break
			}

			case "path_prefix": {
				this.pathPrefix = jsonData.info
				break
			}

			case "volume": {
				this.volume = jsonData.info
				this.updateVolumeScrubberPercent(this.volume / 256)
				break
			}
		}
	}

	closed() {
		this.isOpen = false
		for(const [_, promise] of this.openPromises) {
			promise()
		}

		this.reconnect()
	}

	updatePlayPause() {
		document.getElementById("pause-play-image").src = this.isPlaying
			? "pause.svg"
			: "play.svg"
	}

	updateScrubber() {
		if(this.currentTime === null || this.totalTime === null) {
			document.getElementById("scrubber-current-time").innerHTML = "N/A"
			document.getElementById("scrubber-total-time").innerHTML = "N/A"
			
			document.getElementById("scrubber-bar").style.width = "0%"
			return
		}
		
		// handle current
		let currentHours = Math.floor(this.currentTime / 3600)
		if(currentHours == 0) {
			currentHours = ''
		}
		else if(currentHours < 10) {
			currentHours = `0${currentHours}:`
		}
		else {
			currentHours = `${currentHours}:`
		}
		
		let currentMinutes = Math.floor(this.currentTime / 60)
		if(currentMinutes < 10) {
			currentMinutes = `0${currentMinutes}:`
		}
		else {
			currentMinutes = `${currentMinutes}:`
		}

		let currentSeconds = this.currentTime % 60
		if(currentSeconds < 10) {
			currentSeconds = `0${currentSeconds}`
		}
		else {
			currentSeconds = `${currentSeconds}`
		}

		// handle total
		let totalHours = Math.floor(this.totalTime / 3600)
		if(totalHours == 0) {
			totalHours = ``
		}
		else if(totalHours < 10) {
			totalHours = `0${totalHours}:`
		}
		else {
			totalHours = `${totalHours}:`
		}

		let totalMinutes = Math.floor(this.totalTime / 60)
		if(totalMinutes < 10) {
			totalMinutes = `0${totalMinutes}:`
		}
		else {
			totalMinutes = `${totalMinutes}:`
		}

		let totalSeconds = this.totalTime % 60
		if(totalSeconds < 10) {
			totalSeconds = `0${totalSeconds}`
		}
		else {
			totalSeconds = `${totalSeconds}`
		}
		
		// put it into the DOM
		document.getElementById("scrubber-current-time").innerHTML = `${currentHours}${currentMinutes}${currentSeconds}`
		document.getElementById("scrubber-total-time").innerHTML = `${totalHours}${totalMinutes}${totalSeconds}`
		
		this.updateScrubberPercent(this.currentTime / this.totalTime)
	}

	updateScrubberPercent(percent) {
		document.getElementById("scrubber-bar").style.width = `${percent * 100}%`
	}

	updateVolumeScrubberPercent(percent) {
		document.getElementById("volume-scrubber").style.height = `${percent * 100}%`
		document.getElementById("volume-percent").innerHTML = `${Math.floor(percent * 100)}%`
	}

	createTable(command, array, id) {
		const table = document.getElementById(id)
		table.innerHTML = ""

		for(const element of array) {
			const tr = document.createElement("tr")
			table.appendChild(tr)

			const td = document.createElement("td")
			tr.appendChild(td)

			const a = document.createElement("a")
			td.appendChild(a)
			a.innerHTML = element[1]
			a.href = ""

			a.addEventListener("click", (event) => {
				if(element[0] == "-") { // handle playlist selection
					const newArray = array.map(element => element[1])
					this.send(`${command} ${newArray.indexOf(element[1]) + 1}\n`)
				}
				else {
					this.send(`${command} ${element[0]}\n`)
				}
				event.preventDefault()
			})
		}
	}

	scrub(percent, updateUi = false) {
		if(!this.isPlaying) {
			this.send("pause\n")
		}

		this.send(`seek ${Math.floor(percent * this.totalTime)}\n`)

		if(!this.isPlaying) {
			this.send("pause\n")
		}

		if(updateUi) {
			this.updateScrubberPercent(percent)
		}
	}

	scrubVolume(percent, updateUi = false) {
		this.send(`volume ${Math.floor(percent * 256)}\n`)

		if(updateUi) {
			this.updateVolumeScrubberPercent(percent)
		}
	}

	send(message) {
		this.websocket.send(message)
	}
}

var socket = new EntertainmentWebSocket()

document.getElementById("skip-back").addEventListener("click", (event) => {
	socket.send("prev\n")
})

document.getElementById("skip-back-chapter").addEventListener("click", (event) => {
	socket.send("chapter_p\n")
})

document.getElementById("pause-play").addEventListener("click", (event) => {
	socket.send("pause\n")
})

document.getElementById("skip-forward-chapter").addEventListener("click", (event) => {
	socket.send("chapter_n\n")
})

document.getElementById("skip-forward").addEventListener("click", (event) => {
	socket.send("next\n")
})

document.getElementById("scrubber-bar").addEventListener("click", (event) => {
	socket.scrub((event.offsetX / document.getElementById("scrubber-bar").clientWidth) * (socket.currentTime / socket.totalTime))
})

document.getElementById("scrubber-background-bar").addEventListener("touchmove", (event) => {
	const left = document.getElementById("scrubber-background-bar").getBoundingClientRect().left
	const percent = Math.max(0, Math.min(1, (event.changedTouches[0].clientX - left) / document.getElementById("scrubber-background-bar").clientWidth))
	socket.scrub(percent, true)
})

document.getElementById("scrubber-background-bar").addEventListener("click", (event) => {
	socket.scrub(event.offsetX / document.getElementById("scrubber-background-bar").clientWidth)
})

// handle volume stuff
var lastVolumeScrub;
document.getElementById("volume-scrubber").addEventListener("click", (event) => {
	const height = document.getElementById("volume-scrubber").clientHeight
	socket.scrubVolume(((height - event.offsetY) / height) * (socket.volume / 256))
	lastVolumeScrub = Date.now()
})

document.getElementById("volume-scrubber-container").addEventListener("touchmove", (event) => {
	const bottom = document.getElementById("volume-scrubber-container").getBoundingClientRect().bottom
	const percent = Math.max(0, Math.min(1, (bottom - event.changedTouches[0].clientY) / document.getElementById("volume-scrubber-container").clientHeight))
	socket.scrubVolume(percent, true)
	event.preventDefault()
})

document.getElementById("volume-scrubber-container").addEventListener("click", (event) => {
	if(Date.now() - lastVolumeScrub > 20) {
		const height = document.getElementById("volume-scrubber-container").clientHeight
		socket.scrubVolume((height - event.offsetY) / height)
	}
})
