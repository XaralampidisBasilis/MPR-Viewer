import * as THREE from "three";

export class DisplayManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		this.app.screenManager.setup();
		this.app.modelManager.setup();
		this.app.containerManager.setup();
		this.app.brushManager.setup();
		this.app.selector3DManager.setup();

		this.setupGlobalUniforms();
		this.app.screenManager.setupUniforms();
		this.app.modelManager.setupUniforms();

		this.app.display.visible = false;
		this.app.display.matrixAutoUpdate = false;
		this.app.display.userData.modes = ["Place", "Inspect", "Edit", "Segment"];
		this.app.display.userData.history = [];
		this.app.display.userData.future = [];
		this.app.display.userData.points = [];

		this.updateUI();
	}

	update() {
		this.app.display.updateMatrix();

		if (this.app.container.visible) this.app.containerManager.update();
		if (this.app.screen.visible) this.app.screenManager.update();
		if (this.app.model.visible) this.app.modelManager.update();
		if (this.app.brush.visible) this.app.brushManager.update();
		if (this.app.selector3D.visible) this.app.selector3DManager.update();

		this.updateGlobalUniforms();
		this.app.screenManager.updateUniforms();
		this.app.modelManager.updateUniforms();
	}

	updateUI() {
		const mode = this.app.display.userData.modes[0];

		this.app.brush.visible = mode === "Edit" || mode === "Segment";
		this.app.selector3D.visible = mode === "Segment3D";

		for (const point of this.app.display.userData.points) {
			point.visible = mode === "Segment";
		}

		if (mode === "Place") {
			this.app.container.material.opacity = 0.2;
			this.app.container.userData.outline.visible = true;
			this.app.model.visible = true;
			this.app.model.material.uniforms.uModelAlpha.value = 0.8;
			this.app.model.material.uniforms.uModelAlphaClip.value = 0.8;

			for (const monitor of this.app.screen.userData.monitors) {
				monitor.renderOrder = 1.0;
				monitor.visible = true;
				monitor.userData.axis.visible = true;

				const uniforms = monitor.material.uniforms;
				uniforms.uPlaneAlpha.value = 1.0;
				uniforms.uBrushVisible.value = this.app.brush.visible;
				uniforms.uSelectorVisible.value = this.app.selector3D.visible;
				uniforms.uAxisVisible.value = true;
			}
		}

		if (mode === "Inspect") {
			this.app.container.material.opacity = 0.0;
			this.app.container.userData.outline.visible = true;
			this.app.model.visible = true;
			this.app.model.material.uniforms.uModelAlpha.value = 0.8;
			this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;

			for (const monitor of this.app.screen.userData.monitors) {
				monitor.renderOrder = 1.0;
				monitor.visible = true;
				monitor.userData.axis.visible = true;

				const uniforms = monitor.material.uniforms;
				uniforms.uPlaneAlpha.value = 1.0;
				uniforms.uBrushVisible.value = this.app.brush.visible;
				uniforms.uSelectorVisible.value = this.app.selector3D.visible;
				uniforms.uAxisVisible.value = true;
			}
		}

		if (mode === "Edit") {
			this.app.container.material.opacity = 0.0;
			this.app.container.userData.outline.visible = false;
			this.app.model.visible = false;
			this.app.model.material.uniforms.uModelAlpha.value = 0.0;
			this.app.model.material.uniforms.uModelAlphaClip.value = 0.0;

			for (const monitor of this.app.screen.userData.monitors) {
				const isSelected =
					monitor.userData.index === this.app.brush.userData.monitorIndex;

				monitor.renderOrder = isSelected ? 1.5 : 1.0;
				monitor.visible = true;
				monitor.userData.axis.visible = true;

				const uniforms = monitor.material.uniforms;
				uniforms.uPlaneAlpha.value = isSelected ? 1.0 : 0.6;
				uniforms.uBrushVisible.value = this.app.brush.visible;
				uniforms.uSelectorVisible.value = this.app.selector3D.visible;
				uniforms.uAxisVisible.value = true;
			}
		}

		if (mode === "Segment") {
			this.app.container.material.opacity = 0.0;
			this.app.container.userData.outline.visible = true;
			this.app.model.visible = false;
			this.app.model.material.uniforms.uModelAlpha.value = 0.0;
			this.app.model.material.uniforms.uModelAlphaClip.value = 0.0;
			this.app.screen.visible = true;

			for (const monitor of this.app.screen.userData.monitors) {
				monitor.visible = monitor.userData.index === 2;
				monitor.userData.axis.visible = true;

				const uniforms = monitor.material.uniforms;
				uniforms.uAxisVisible.value = false;
				uniforms.uPlaneAlpha.value = 1.0;
				uniforms.uSelectorVisible.value = this.app.selector3D.visible;
			}
		}

		if (mode === "Segment3D") {
			this.app.container.material.opacity = 0.0;
			this.app.container.userData.outline.visible = false;
			this.app.model.visible = false;
			this.app.model.material.uniforms.uModelAlpha.value = 0.4;
			this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;

			for (const monitor of this.app.screen.userData.monitors) {
				monitor.renderOrder = 1.0;
				monitor.visible = true;

				const uniforms = monitor.material.uniforms;
				uniforms.uPlaneAlpha.value = 1.0;
				uniforms.uBrushVisible.value = this.app.brush.visible;
				uniforms.uSelectorVisible.value = this.app.selector3D.visible;
			}
		}
	}

	shiftMode() {
		this.app.display.userData.modes.push(
			this.app.display.userData.modes.shift(),
		);
		this.updateUI();
	}

	unshiftMode() {
		this.app.display.userData.modes.unshift(
			this.app.display.userData.modes.pop(),
		);
		this.updateUI();
	}

	reset() {
		this.save();
		this.app.display.quaternion.copy(new THREE.Quaternion());
		this.update();
	}

	save() {
		this.app.display.updateMatrix();
		this.app.display.userData.history.unshift({
			matrix: this.app.display.matrix.clone(),
		});
	}

	undo() {
		this.app.display.updateMatrix();
		this.app.display.userData.future.unshift({
			matrix: this.app.display.matrix.clone(),
		});

		if (this.app.display.userData.history.length === 0) {
			return;
		}

		this.app.display.matrix.copy(
			this.app.display.userData.history.shift().matrix,
		);
		this.app.display.matrix.decompose(
			this.app.display.position,
			this.app.display.quaternion,
			this.app.display.scale,
		);

		this.update();
	}

	redo() {
		this.app.display.updateMatrix();
		this.app.display.userData.history.unshift({
			matrix: this.app.display.matrix.clone(),
		});

		if (this.app.display.userData.future.length === 0) {
			return;
		}

		this.app.display.matrix.copy(
			this.app.display.userData.future.shift().matrix,
		);
		this.app.display.matrix.decompose(
			this.app.display.position,
			this.app.display.quaternion,
			this.app.display.scale,
		);

		this.update();
	}

	setupGlobalUniforms() {
		this.app.display.userData.uNormalize = new THREE.Matrix4();
		this.app.display.userData.uDeNormalize = new THREE.Matrix4();
		this.app.display.userData.uMatrix = new THREE.Matrix4();
		this.app.display.userData.uCameraPosition = new THREE.Vector3();
		this.app.display.userData.uPlaneHessian = new Array(3)
			.fill()
			.map(() => new THREE.Vector4());
		this.app.display.userData.uPlaneNormal = new Array(3)
			.fill()
			.map(() => new THREE.Vector3());
		this.app.display.userData.uPlaneOrigin = new THREE.Vector3();
	}

	updateGlobalUniforms() {
		this.app.display.userData.uNormalize
			.copy(this.app.display.matrixWorld)
			.scale(this.app.volume.userData.size)
			.invert();
		this.app.display.userData.uDeNormalize
			.copy(this.app.display.matrixWorld)
			.scale(this.app.volume.userData.size)
			.transpose();
		this.app.display.userData.uMatrix
			.copy(this.app.screen.matrix)
			.invert()
			.scale(this.app.volume.userData.size);
		this.app.display.userData.uCameraPosition
			.copy(this.app.camera.position)
			.applyMatrix4(this.app.display.userData.uNormalize);
		this.app.display.userData.uPlaneOrigin
			.copy(this.app.screen.getWorldPosition(new THREE.Vector3()))
			.applyMatrix4(this.app.display.userData.uNormalize);

		this.app.display.userData.uPlaneNormal.forEach((planeNormal, i) => {
			planeNormal
				.copy(this.app.screen.userData.planes[i].normal)
				.transformDirection(this.app.display.userData.uNormalize);
		});

		this.app.display.userData.uPlaneHessian.forEach((planeHessian, i) => {
			planeHessian
				.set(
					...this.app.screen.userData.planes[i].normal.toArray(),
					this.app.screen.userData.planes[i].constant,
				)
				.applyMatrix4(this.app.display.userData.uDeNormalize);
		});
	}
}
