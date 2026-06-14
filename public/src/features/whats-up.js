import { map } from "../core/map.js";
import { state } from "../core/state.js";
import { coordLL } from "../core/coords.js";
import { nodeStatus, fmtMins } from "../core/eorzea-time.js";
import { viewMap, setFollow } from "../core/view-map.js";

// "What's up now" timed-node planner (all maps).
let allTimed = [];

export async function initWhatsUp() {
	allTimed = await fetch("/timed-nodes").then((r) => r.json());
	renderUp();
}

export function renderUp() {
	const job = document.getElementById("upJob").value;
	const maxLvl = Number(document.getElementById("upLevel").value) || 100;
	const upOnly = document.getElementById("upOnly").checked;
	const el = document.getElementById("upList");
	if (!allTimed.length) { el.textContent = "loading…"; return; }
	let rows = allTimed
		.filter((n) => n.level <= maxLvl)
		.filter((n) => job === "any" || (job === "min" ? n.type <= 1 : n.type === 2 || n.type === 3))
		.map((n) => ({ n, st: nodeStatus(n) }))
		.filter((r) => !upOnly || r.st.up)
		.sort((a, b) => (a.st.up === b.st.up) ? a.st.secsLeft - b.st.secsLeft : (a.st.up ? -1 : 1))
		.slice(0, 60);
	el.innerHTML = rows.length ? rows.map(({ n, st }) =>
		`<div class="uprow" data-map="${n.map}" data-x="${n.x}" data-y="${n.y}">` +
		`<span class="${st.up ? "up" : "down"}">${st.up ? "● " + fmtMins(st.secsLeft) + " left" : "○ in " + fmtMins(st.secsLeft)}</span> ` +
		`Lv${n.level} ${n.items[0]?.name ?? "?"}${n.legendary ? " ⭐" : n.ephemeral ? " ✦" : ""}<br>` +
		`<span class="upzone">${n.mapName} (${n.x}, ${n.y})</span></div>`).join("")
		: `<span class="muted">nothing matches</span>`;
	[...el.querySelectorAll(".uprow")].forEach((row) => {
		row.onclick = async () => {
			const mapId = Number(row.dataset.map);
			if (state.viewedMap?.id !== mapId) {
				setFollow(false);
				await viewMap(await fetch(`/map?id=${mapId}`).then((r) => r.json()));
			}
			map.flyTo(coordLL(Number(row.dataset.x), Number(row.dataset.y)), 2);
		};
	});
}
