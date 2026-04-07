import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export class SceneManager {
	constructor(app) {
		this.app = app;
	}

	setupObjects() {
		this.app.display = new THREE.Object3D();
		this.app.screen = new THREE.Object3D();
		this.app.container = new THREE.Mesh();
		this.app.model = new THREE.Mesh();
		this.app.brush = new THREE.Mesh();
		this.app.reticle = new THREE.Mesh();
		this.app.selector3D = new THREE.Mesh();
		this.app.raycaster = new THREE.Raycaster();

		this.app.volumeManager.setupObject();
		this.app.maskManager.setupObject();
	}

	setupScene() {
		this.app.canvas = document.createElement("div");
		document.body.appendChild(this.app.canvas);

		this.app.renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: false,
			sortObjects: false,
			powerPreference: "low-power",
			preserveDrawingBuffer: true,
		});

		this.app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.app.renderer.setSize(window.innerWidth, window.innerHeight);
		this.app.canvas.appendChild(this.app.renderer.domElement);

		this.app.camera = new THREE.PerspectiveCamera(
			50,
			window.innerWidth / window.innerHeight,
			0.001,
			10,
		);
		this.app.camera.position.set(1, 0.6, 1);

		this.app.orbitControls = new OrbitControls(
			this.app.camera,
			this.app.canvas,
		);
		this.app.orbitControls.target.set(0, 0, 0);
		this.app.orbitControls.update();

		this.app.transformControls = new TransformControls(
			this.app.camera,
			this.app.canvas,
		);
		this.app.transformControls.addEventListener("dragging-changed", (event) => {
			this.app.orbitControls.enabled = !event.value;
		});
		this.app.transformControls.enabled = false;
		this.app.transformControls.visible = false;

		this.app.scene = new THREE.Scene();
		this.app.scene.add(
			this.app.camera,
			this.app.display,
			this.app.reticle,
			this.app.transformControls,
		);
		this.app.display.add(
			this.app.screen,
			this.app.model,
			this.app.selector3D,
			this.app.brush,
			this.app.container,
		);

		[
			this.app.reticle,
			this.app.screen,
			this.app.model,
			this.app.selector3D,
			this.app.brush,
			this.app.container,
		].forEach((object3D, i) => {
			object3D.renderOrder = i;
		});

		window.addEventListener("resize", (event) =>
			this.app.interaction.onResize(event),
		);
		window.addEventListener("keydown", (event) =>
			this.app.interaction.onKeydown(event),
		);

		this.app.displayManager.setup();
	}

	render() {
		this.app.renderer.render(this.app.scene, this.app.camera);
	}
}
