import { Experience } from "./src/Experience.js";

async function main() {
	await Experience.bootstrap();
}

main().catch((error) => {
	console.error("Failed to bootstrap experience:", error);
});
