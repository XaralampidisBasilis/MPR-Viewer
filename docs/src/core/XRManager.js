import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { XRGestures } from "../../prm/XRGestures.js";

export class XRManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		this.setupReticle();
		this.setupGestures();
		this.setupButton();
	}

	setupReticle() {
		const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(
			-Math.PI / 2,
		);
		const material = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.7,
		});

		this.app.reticle.visible = false;
		this.app.reticle.geometry = geometry;
		this.app.reticle.material = material;
		this.app.reticle.matrixAutoUpdate = false;
		this.app.reticle.userData.enabled = false;
	}

	setupGestures() {
		this.app.gestures = new XRGestures(this.app.renderer);

		this.app.gestures.addEventListener("polytap", (event) =>
			this.app.interaction.onPolytap(event),
		);
		this.app.gestures.addEventListener("hold", (event) =>
			this.app.interaction.onHold(event),
		);
		this.app.gestures.addEventListener("pan", (event) =>
			this.app.interaction.onPan(event),
		);
		this.app.gestures.addEventListener("swipe", (event) =>
			this.app.interaction.onSwipe(event),
		);
		this.app.gestures.addEventListener("pinch", (event) =>
			this.app.interaction.onPinch(event),
		);
		this.app.gestures.addEventListener("twist", (event) =>
			this.app.interaction.onTwist(event),
		);
		this.app.gestures.addEventListener("implode", (event) =>
			this.app.interaction.onImplode(event),
		);
		this.app.gestures.addEventListener("explode", (event) =>
			this.app.interaction.onExplode(event),
		);
	}

	setupButton() {
		const overlay = document.getElementById("overlay-content");
		const button = ARButton.createButton(this.app.renderer, {
			requiredFeatures: ["hit-test"],
			optionalFeatures: ["dom-overlay"],
			domOverlay: { root: overlay },
		});

		document.body.appendChild(button);
		button.addEventListener("click", (event) => this.onButton(event));
	}

	updateAnimation(timestamp, frame) {
		if (!this.app.renderer.xr.isPresenting) {
			this.app.desktopControls.update();
		}

		if (
			this.app.renderer.xr.isPresenting &&
			this.app.reticle.userData.enabled
		) {
			this.updateHitTest(frame);
		}

		if (this.app.renderer.xr.isPresenting) {
			this.app.gestures.update();
		}

		if (this.app.display.visible) {
			this.app.displayManager.update();
		}

		this.app.sceneManager.render();
	}

	updateHitTest(frame) {
		const session = this.app.renderer.xr.getSession();
		const referenceSpace = this.app.renderer.xr.getReferenceSpace();

		if (session && this.app.hitTestSourceRequested === false) {
			session.requestReferenceSpace("viewer").then((viewerSpace) => {
				session.requestHitTestSource({ space: viewerSpace }).then((source) => {
					this.app.hitTestSource = source;
				});
			});

			session.addEventListener("end", () => {
				this.app.hitTestSourceRequested = false;
				this.app.hitTestSource = null;
				this.onSessionEnd();
			});

			this.app.hitTestSourceRequested = true;
		}

		if (!this.app.hitTestSource) {
			return;
		}

		const hitTestResults = frame.getHitTestResults(this.app.hitTestSource);

		if (hitTestResults.length === 0) {
			this.onHitTestResultEmpty();
			return;
		}

		this.app.hitTestResult = hitTestResults[0];

		if (!this.app.hitTestResult || !referenceSpace) {
			return;
		}

		const hitPose = this.app.hitTestResult.getPose(referenceSpace);
		if (hitPose) {
			this.onHitTestResultReady(hitPose.transform.matrix);
		}
	}

	onButton() {
		this.app.display.visible = false;
		this.app.display.position.set(0, 0, 0);
		this.app.renderer.xr.enabled = true;
		this.app.reticle.userData.enabled = true;
		this.app.hitTestSourceRequested = false;
		this.app.hitTestSource = null;
	}

	onHitTestResultReady(hitPoseTransformed) {
		if (!hitPoseTransformed) {
			return;
		}

		this.app.reticle.visible = true;
		this.app.reticle.matrix.fromArray(hitPoseTransformed);
	}

	onHitTestResultEmpty() {
		this.app.reticle.visible = false;
	}

	onSessionEnd() {
		this.app.reticle.visible = false;
		this.app.reticle.userData.enabled = false;
		this.app.camera.position.set(1, 0.6, 1);
		this.app.display.position
			.copy(this.app.volume.userData.size)
			.divideScalar(2);
		this.app.interaction.setMode("Place");
		this.app.displayManager.update();
	}
}
