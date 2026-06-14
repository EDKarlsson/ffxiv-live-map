// Small HTTP helpers shared by the route handlers.
export const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

// Read + JSON-parse a request body (resolves {} on empty/invalid/oversize). The
// only POST body is a tiny custom-marker; cap at 1 MB so a huge payload can't
// grow memory without bound.
const MAX_BODY = 1_000_000;
export function readBody(req) {
	return new Promise((resolve) => {
		let b = "";
		req.on("data", (c) => {
			b += c;
			if (b.length > MAX_BODY) { b = ""; req.destroy(); resolve({}); }
		});
		req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
		req.on("error", () => resolve({}));
	});
}

const url = (req) => new URL(req.url, "http://localhost");
export const getParam = (req, name) => url(req).searchParams.get(name);
export const mapParam = (req) => Number(getParam(req, "map"));

export function sendJson(res, body, status = 200) {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(typeof body === "string" ? body : JSON.stringify(body));
}
