var createTorrentTable = (torrents) => {
	const table = document.getElementById("torrents-body")
	table.innerHTML = ""

	for(const torrent of torrents) {
		const tr = document.createElement("tr")
		table.appendChild(tr)

		const td = document.createElement("td")
		tr.appendChild(td)

		const div = document.createElement("div")
		div.className = "torrent-info-container"
		td.appendChild(div)

		const progress = document.createElement("div")
		progress.innerHTML = `${Math.floor(torrent.progress * 100)}%`
		progress.className = "torrent-progress"
		div.appendChild(progress)

		const name = document.createElement("div")
		name.innerHTML = torrent.name
		name.className = "torrent-name"
		div.appendChild(name)

		// delete button
		const deleteDiv = document.createElement("div")
		deleteDiv.className = "torrent-delete"
		div.appendChild(deleteDiv)

		const deleteButton = document.createElement("button")
		deleteButton.innerHTML = "&times;"
		deleteDiv.appendChild(deleteButton)
		deleteButton.addEventListener("click", (event) => {
			socket.send(`qbt torrent delete ${torrent.hash}\n`)
		})
	}
}
