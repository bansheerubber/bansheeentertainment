class EntertainmentWebSocket {
	constructor() {
		this.websocket = new WebSocket("ws://192.168.0.83:10000/")
		this.websocket.onopen = this.opened.bind(this)
		this.websocket.onmessage = this.messaged.bind(this)

		this.openPromises = []
		this.opened = false

		this.audioInfo = []
		this.subtitleInfo = []

		this.currentTime = null
		this.totalTime = null
		this.updateScrubber()

		this.isPlaying = false
		this.updatePlayPause()
	}

	async waitUntilConnected() {
		return new Promise((resolve, reject) => {
			if(this.opened) {
				return resolve()
			}
			
			this.openPromises.push(resolve)
		})
	}

	opened() {
		this.opened = true
		for(const promise of this.openPromises) {
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
			
			case "is_playing": {
				this.isPlaying = Boolean(jsonData.info)
				this.updatePlayPause()
				break
			}
		}
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
		
		document.getElementById("scrubber-bar").style.width = `${(this.currentTime / this.totalTime) * 100}%`
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
				console.log("oh hey there")
				this.send(`strack ${element[0]}\n`)
				event.preventDefault()
			})
		}
	}

	scrub(percent) {
		if(!this.isPlaying) {
			this.send("pause\n")
		}

		this.send(`seek ${Math.floor(percent * this.totalTime)}\n`)

		if(!this.isPlaying) {
			this.send("pause\n")
		}
	}

	send(message) {
		this.websocket.send(message)
	}
}

const socket = new EntertainmentWebSocket()

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

document.getElementById("scrubber-background-bar").addEventListener("click", (event) => {
	socket.scrub(event.offsetX / document.getElementById("scrubber-background-bar").clientWidth)
})