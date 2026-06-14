// Small HTTP helpers shared by the route handlers.
export const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

// Read + JSON-parse a request body (resolves {} on empty/invalid).
export function readBody(req) {
	return new Promise((resolve) => {
		let b = "";
		req.on("data", (c) => (b += c));
		req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
	});
}

const url = (req) => new URL(req.url, "http://localhost");
export const getParam = (req, name) => url(req).searchParams.get(name);
export const mapParam = (req) => Number(getParam(req, "map"));

export function sendJson(res, body, status = 200) {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(typeof body === "string" ? body : JSON.stringify(body));
}
