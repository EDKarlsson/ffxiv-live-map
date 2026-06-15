import { describe, it, expect } from "vitest";
import { parseQuery, siteUrl } from "../../public/src/features/search-parse.js";

// parseQuery is the grammar behind the command palette: bare text → zones,
// "/cat" → a category (alias-resolved), "@site" → an external lookup; a partial
// prefix resolves to null so the UI can hint. siteUrl builds the external URL.
describe("parseQuery", () => {
	it("treats bare text as a zone search", () => {
		expect(parseQuery("limsa")).toEqual({ kind: "zone", term: "limsa" });
		expect(parseQuery("   ")).toEqual({ kind: "zone", term: "" });
	});

	it("resolves /category aliases", () => {
		expect(parseQuery("/npc nanamo")).toMatchObject({ kind: "category", cat: "npc", term: "nanamo" });
		expect(parseQuery("/min copper")).toMatchObject({ kind: "category", cat: "material", term: "copper" });
		expect(parseQuery("/mob ladybug")).toMatchObject({ kind: "category", cat: "monster", term: "ladybug" });
		expect(parseQuery("/n")).toMatchObject({ kind: "category", cat: "npc", term: "" });
	});

	it("returns cat=null + prefix for an unknown category", () => {
		expect(parseQuery("/zz")).toMatchObject({ kind: "category", cat: null, prefix: "zz" });
	});

	it("resolves @site aliases", () => {
		expect(parseQuery("@uni iron ore")).toMatchObject({ kind: "site", site: "universalis", term: "iron ore" });
		expect(parseQuery("@gt cactuar")).toMatchObject({ kind: "site", site: "garlandtools", term: "cactuar" });
	});

	it("returns site=null + prefix for an unknown site", () => {
		expect(parseQuery("@zz x")).toMatchObject({ kind: "site", site: null, prefix: "zz" });
	});
});

describe("siteUrl", () => {
	it("builds an encoded external search URL", () => {
		expect(siteUrl("universalis", "iron ore")).toBe("https://universalis.app/search?q=iron%20ore");
		expect(siteUrl("garlandtools", "cactuar")).toBe("https://www.garlandtools.org/db/#search/cactuar");
	});

	it("returns null for an unknown site", () => {
		expect(siteUrl("nope", "x")).toBe(null);
	});
});
