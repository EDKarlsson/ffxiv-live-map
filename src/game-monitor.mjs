import { execFile } from "child_process";
import { GAME_POLL_MS, GAME_PROCESS } from "./config.mjs";
import { enableCapture, disableCapture } from "./capture.mjs";

// Watch for the FFXIV process and attach/detach capture to match — the same
// behavior as Teamcraft: when the game launches we start listening, and when it
// exits we fall back to browse mode. No manual restart when the user starts or
// stops the Mac game. On platforms without `pgrep` (e.g. Windows) the match
// simply never succeeds, so we stay in browse mode harmlessly.

let timer = null;
let present = null; // last known game presence (null = unknown, before first poll)

function gameRunning() {
	return new Promise((resolve) => {
		// execFile (no shell) avoids any interpretation of GAME_PROCESS. `pgrep -f`
		// matches the full command line; exit 0 with output = running, anything
		// else (no match, or pgrep absent) = not running.
		execFile("pgrep", ["-f", GAME_PROCESS], (err, stdout) => resolve(!err && stdout.trim().length > 0));
	});
}

async function poll() {
	const now = await gameRunning();
	if (now === present) return; // only act on transitions
	present = now;
	if (now) {
		console.log(`[monitor] ${GAME_PROCESS} detected — attaching capture.`);
		enableCapture();
	} else {
		console.log(`[monitor] ${GAME_PROCESS} not running — browse mode.`);
		disableCapture();
	}
}

export function startGameMonitor() {
	if (timer) return;
	poll(); // check immediately rather than waiting a full interval
	timer = setInterval(poll, GAME_POLL_MS);
	timer.unref?.(); // the poll alone shouldn't keep the process alive
	console.log(`[monitor] watching for ${GAME_PROCESS} every ${GAME_POLL_MS}ms (browse mode).`);
}

export function stopGameMonitor() {
	if (timer) { clearInterval(timer); timer = null; }
	present = null;
}
