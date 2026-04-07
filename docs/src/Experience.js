import * as THREE from "three";
import { AppUtils } from "./core/AppUtils.js";
import { InteractionController } from "./core/InteractionController.js";
import { SceneManager } from "./core/SceneManager.js";
import { SegmentationWorkerManager } from "./core/SegmentationWorkerManager.js";
import { UIManager } from "./core/UIManager.js";
import { XRManager } from "./core/XRManager.js";
import { BrushManager } from "./managers/BrushManager.js";
import { ContainerManager } from "./managers/ContainerManager.js";
import { DisplayManager } from "./managers/DisplayManager.js";
import { MaskManager } from "./managers/MaskManager.js";
import { ModelManager } from "./managers/ModelManager.js";
import { ScreenManager } from "./managers/ScreenManager.js";
import { Selector3DManager } from "./managers/Selector3DManager.js";
import { VolumeManager } from "./managers/VolumeManager.js";

export class Experience {
	static async bootstrap() {
		const experience = new Experience();
		await experience.init();
		return experience;
	}

	constructor() {
		this.shaders = {};
		this.hitTestSource = null;
		this.hitTestSourceRequested = false;
		this.hitTestResult = null;

		this.shared = {
			position: new THREE.Vector3(),
			direction: new THREE.Vector3(),
			scale: new THREE.Vector3(),
			vector2: new THREE.Vector2(),
			vector3: new THREE.Vector3(),
			matrix4: new THREE.Matrix4(),
			box: new THREE.Box3(),
			points: new Array(8).fill().map(() => new THREE.Vector3()),
			axes: {
				x: new THREE.Vector3(1, 0, 0),
				y: new THREE.Vector3(0, 1, 0),
				z: new THREE.Vector3(0, 0, 1),
			},
			colors: {
				x: new THREE.Color(1, 0, 0),
				y: new THREE.Color(0, 1, 0),
				z: new THREE.Color(0, 0, 1),
			},
		};

		this.utils = new AppUtils(this);
		this.volumeManager = new VolumeManager(this);
		this.maskManager = new MaskManager(this);
		this.containerManager = new ContainerManager(this);
		this.brushManager = new BrushManager(this);
		this.selector3DManager = new Selector3DManager(this);
		this.screenManager = new ScreenManager(this);
		this.modelManager = new ModelManager(this);
		this.displayManager = new DisplayManager(this);
		this.workerManager = new SegmentationWorkerManager(this);
		this.interaction = new InteractionController(this);
		this.sceneManager = new SceneManager(this);
		this.uiManager = new UIManager(this);
		this.xrManager = new XRManager(this);
	}

	async init() {
		await this.loadShaders();
		this.sceneManager.setupObjects();
		this.sceneManager.setupScene();
		this.uiManager.setup();
		this.xrManager.setup();
		this.workerManager.setup();

		this.renderer.setAnimationLoop((timestamp, frame) =>
			this.xrManager.updateAnimation(timestamp, frame),
		);
	}

	async loadShaders() {
		this.shaders.vertexScreen = await this.utils.loadShader(
			new URL("../prm/vertex_screen.glsl", import.meta.url),
		);
		this.shaders.fragmentScreen = await this.utils.loadShader(
			new URL("../prm/fragment_screen.glsl", import.meta.url),
		);
		this.shaders.vertexModel = await this.utils.loadShader(
			new URL("../prm/vertex_model.glsl", import.meta.url),
		);
		this.shaders.fragmentModel = await this.utils.loadShader(
			new URL("../prm/fragment_model.glsl", import.meta.url),
		);
	}

	refreshWorldFromData() {
		if (this.display.userData.points?.length) {
			this.display.remove(...this.display.userData.points);
		}

		this.display.userData.points = [];
		this.screenManager.setup();
		this.modelManager.setup();
		this.containerManager.setup();
		this.brushManager.setup();
		this.selector3DManager.setup();
		this.screenManager.setupUniforms();
		this.modelManager.setupUniforms();
		this.screenManager.updateUniforms();
		this.modelManager.updateUniforms();
		this.displayManager.update();
		this.displayManager.updateUI();
		this.display.visible = true;
	}
}
