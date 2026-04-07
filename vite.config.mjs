import { defineConfig } from "vite";

export default defineConfig({
	root: "docs",
	base: "./",
	publicDir: false,
	assetsInclude: ["**/*.nii.gz", "**/*.onnx"],
	server: {
		host: true,
		port: 3000,
	},
	preview: {
		host: true,
		port: 4173,
	},
	build: {
		outDir: "../dist",
		emptyOutDir: true,
	},
});
