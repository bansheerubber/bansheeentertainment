from flask import Flask, send_from_directory

app = Flask(__name__)

@app.route("/<path:file>", defaults={"file": "index.html"})
def serve_results(file):
	return send_from_directory("./client/", file)

app.run(host="192.168.0.83", debug=True, port=8001)