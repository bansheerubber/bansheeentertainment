const collapsedDirectories = {}
const filesUnderDirectory = {}
let isDirectory = {}

function toggleCollapseDirectory(path) {
	if(collapsedDirectories[path]) {
		unCollapseDirectory(path)
	}
	else {
		collapseDirectory(path)
	}
}

function collapseDirectory(path) {
	collapsedDirectories[path] = true
	const container = document.getElementById(`${path}-container`)
	if(container) {
		container.className = "paths-container collapsed"
	}
}

function unCollapseDirectory(path) {
	collapsedDirectories[path] = false
	const container = document.getElementById(`${path}-container`)
	if(container) {
		container.className = "paths-container"
	}
}

const selectedPathsList = []
const selectedPaths = {}
const selectedPathsTimeouts = {}
const lastClickPath = {}

function toggleSelectPath(path) {
	console.log("toggle select path")
	if(selectedPaths[path]) {
		unSelectPath(path)
	}
	else {
		selectPath(path)
	}
}

function selectPath(path) {
	selectedPaths[path] = true
	const name = document.getElementById(`${path}-name`)
	console.log(isDirectory[path])
	if(
		name
		&& (
			selectedPathsList.length == 0
			|| isDirectory[selectedPathsList[0]] === isDirectory[path]
		)
	) {
		if(isDirectory[path] && selectedPathsList.length > 0) {
			return
		}
		
		name.classList.add("selected")
		selectedPathsList.push(path)
	}

	if(selectedPathsList.length > 0) {
		document.getElementById("directory-buttons").style.display = "flex"
	}
}

function unSelectPath(path) {
	selectedPaths[path] = false
	const name = document.getElementById(`${path}-name`)
	if(name) {
		name.classList.remove("selected")
		selectedPathsList.splice(selectedPathsList.indexOf(path), 1)
	}

	if(selectedPathsList.length == 0) {
		document.getElementById("directory-buttons").style.display = "none"
	}
}

const tabWidth = 60

function createDirectoryEntry(path, name, tab) {
	const container = document.createElement("div")
	container.style.maxWidth = "100%"
	container.style.wordBreak = "break-all"
	const pathsContainer = document.createElement("div")
	pathsContainer.id = `${path}-container`

	const nameContainer = document.createElement("div")
	nameContainer.className = "directory-entry"

	const tabbingDiv = document.createElement("div")
	tabbingDiv.className = "tabbing"
	tabbingDiv.style.width = `${tabWidth * tab}px`

	const nameDiv = document.createElement("a")
	nameDiv.className = "name directory"
	nameDiv.id = `${path}-name`
	nameDiv.innerHTML = name
	nameDiv.href = ""
	nameDiv.addEventListener("click", (event) => {
		if(Date.now() - (lastClickPath[path] ?? 0) < 300) {
			toggleCollapseDirectory(path)
			clearTimeout(selectedPathsTimeouts[path])
			delete selectedPathsTimeouts[path]
		}
		else if(!selectedPathsTimeouts[path]) {
			selectedPathsTimeouts[path] = setTimeout(() => {
				toggleSelectPath(path)
				delete selectedPathsTimeouts[path]
			}, 300)
		}

		lastClickPath[path] = Date.now()
		
		event.preventDefault()
	})

	nameContainer.appendChild(tabbingDiv)
	nameContainer.appendChild(nameDiv)

	container.appendChild(nameContainer)
	container.appendChild(pathsContainer)

	if(collapsedDirectories[path]) {
		pathsContainer.className = "paths-container collapsed"
	}
	else {
		pathsContainer.className = "paths-container"
	}

	return [container, pathsContainer]
}

function createFileEntry(path, name, tab) {
	const nameContainer = document.createElement("div")
	nameContainer.className = "directory-entry"

	const tabbingDiv = document.createElement("div")
	tabbingDiv.className = "tabbing"
	tabbingDiv.style.width = `${tabWidth * tab}px`

	const nameDiv = document.createElement("a")
	nameDiv.className = "name"
	nameDiv.id = `${path}-name`
	nameDiv.innerHTML = name
	nameDiv.href = ""
	nameDiv.addEventListener("click", (event) => {
		toggleSelectPath(path)
		event.preventDefault()
	})

	nameContainer.appendChild(tabbingDiv)
	nameContainer.appendChild(nameDiv)
	return nameContainer
}

function createDirectoryList(directory) {
	isDirectory = {}

	function _createDirectoryList(directory, tab = 0) {
		const [container, pathsContainer] = createDirectoryEntry(directory.path, directory.name, tab)
		isDirectory[directory.path] = true
		filesUnderDirectory[directory.path] = []
		tab++
	
		directory.paths.sort((element1, element2) => {
			const element1Lowered = element1.name.toLowerCase()
			const element2Lowered = element2.name.toLowerCase()
			return element2.directory - element1.directory || element1Lowered.localeCompare(element2Lowered)
		})
	
		for(const path of directory.paths) {
			if(path.directory) {
				if(collapsedDirectories[path.path] === undefined) {
					collapseDirectory(path.path)
				}
				pathsContainer.appendChild(_createDirectoryList(path, tab))
			}
			else {
				pathsContainer.appendChild(createFileEntry(path.path, path.name, tab))
				filesUnderDirectory[directory.path].push(path.path)
			}
		}
	
		return container
	}

	return _createDirectoryList(directory)
}

const extensions = ["asx", "dts", "gxf", "m2v", "m3u", "m4v", "mpeg1", "mpeg2", "mts", "mxf", "ogm", "pls", "bup", "a52", "aac", "b4s", "cue", "divx", "dv", "flv", "m1v", "m2ts", "mkv", "mov", "mpeg4", "oma", "spx", "ts", "vlc", "vob", "xspf", "dat", "bin", "ifo", "part", "3g2", "avi", "mpeg", "mpg", "flac", "m4a", "mp1", "ogg", "wav", "xm", "3gp", "srt", "wmv", "ac3", "asf", "mod", "mp2", "mp3", "mp4", "wma", "mka", "m4p"]

const isExtension = {}
for(const extension of extensions) {
	isExtension[extension] = true
}

document.getElementById("clear-playlist").addEventListener("click", (event) => {
	if(!socket.isPlaying) {
		socket.send("pause\n")
	}

	socket.send("clear\n")
})

document.getElementById("refresh-directory").addEventListener("click", (event) => {
	socket.send("refresh-directory\n")
})

document.getElementById("set-playlist").addEventListener("click", (event) => {
	if(!socket.isPlaying) {
		socket.send("pause\n")
	}
	
	socket.send("clear\n")
	
	let paths = selectedPathsList
	if(isDirectory[selectedPathsList[0]]) {
		paths = filesUnderDirectory[selectedPathsList[0]]
	}

	for(const path of paths) {
		const extension = path.match(/\.([0-9a-z]+)$/i)
		if(extension && isExtension[extension[1]]) {
			socket.send(`add ${socket.pathPrefix}${path}\r\n`)
		}
	}

	socket.send("goto 1")
})

document.getElementById("add-to-playlist").addEventListener("click", (event) => {
	if(!socket.isPlaying) {
		socket.send("pause\n")
	}
	
	let paths = selectedPathsList
	if(isDirectory[selectedPathsList[0]]) {
		paths = filesUnderDirectory[selectedPathsList[0]]
	}

	for(const path of paths) {
		const extension = path.match(/\.([0-9a-z]+)$/i)
		if(extension && isExtension[extension[1]]) {
			socket.send(`add ${socket.pathPrefix}${path}\r\n`)
		}
	}
})
