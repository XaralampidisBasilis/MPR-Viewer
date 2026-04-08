import * as THREE from "three";

export class InteractionController {
	constructor(app) {
		this.app = app;
	}

	get mode() {
		return this.app.display.userData.modes[0];
	}

	setMode(mode) {
		const orderedModes = ["Place", "Inspect", "Edit", "Segment"];

		if (!orderedModes.includes(mode) || mode === this.mode) {
			return;
		}

		if (this.mode === "Segment") {
			this.onLeavingSegmentMode();
		}

		this.app.display.userData.modes = [
			mode,
			...orderedModes.filter((entry) => entry !== mode),
		];
		this.app.displayManager.updateUI();
		this.app.desktopControls.syncMode(mode);

		if (mode === "Segment") {
			this.onEnteringSegmentMode();
		}

		if (this.app.uiManager?.modeController) {
			this.app.uiManager.modeState.mode = mode;
			this.app.uiManager.modeController.updateDisplay();
		}
	}

	reportError(context, error) {
		console.error(`${context} failed`, error);
	}

	getErrorMessage(error) {
		return error instanceof Error ? error.message : String(error);
	}

	async showBusyStatus(id, title, message) {
		if (!this.app.uiManager) {
			return;
		}

		this.app.uiManager.updateStatus(id, title, message);
		await this.app.uiManager.flushStatusFrame();
	}

	async onVolumeUpload(event) {
		const input = event.target;
		const file = input.files?.[0];
		const statusId = "volume-load";
		const hadMask = Boolean(this.app.mask.userData.image3D);

		if (!file) {
			input.value = "";
			return;
		}

		try {
			this.app.uiManager?.startStatus(
				statusId,
				"Loading volume",
				`Reading ${file.name}`,
			);

			const [image3D, raw] = await Promise.all([
				this.app.utils.loadNIFTI(file),
				this.app.utils.loadRawNIFTI(file),
			]);
			await this.showBusyStatus(
				statusId,
				"Applying volume",
				"Creating textures and preparing the scene data",
			);
			this.app.volumeManager.update(image3D);
			this.app.volume.userData.raw = raw;
			this.app.volume.userData.fileName = file.name;

			if (!hadMask) {
				this.app.maskManager.updateFromVolume();
				this.app.mask.userData.raw = raw;
				this.app.mask.userData.fileName = file.name;
			}

			await this.showBusyStatus(
				statusId,
				"Building model",
				"Updating slice views and the 3D model",
			);
			this.app.refreshWorldFromData();
			this.app.uiManager?.completeStatus(
				statusId,
				"Volume ready",
				hadMask
					? "The volume, slices, and model are ready."
					: "The volume is ready and a blank mask was created from it.",
			);
		} catch (error) {
			this.app.uiManager?.failStatus(
				statusId,
				"Volume load failed",
				this.getErrorMessage(error),
			);
			this.reportError("Volume upload", error);
		} finally {
			input.value = "";
		}
	}

	async onMaskUpload(event) {
		const input = event.target;
		const file = input.files?.[0];
		const statusId = "mask-load";
		const hadVolume = Boolean(this.app.volume.userData.image3D);

		if (!file) {
			input.value = "";
			return;
		}

		try {
			this.app.uiManager?.startStatus(
				statusId,
				"Loading mask",
				`Reading ${file.name}`,
			);

			const [image3D, raw] = await Promise.all([
				this.app.utils.loadNIFTI(file),
				this.app.utils.loadRawNIFTI(file),
			]);
			await this.showBusyStatus(
				statusId,
				"Applying mask",
				"Creating mask textures and syncing the scene data",
			);

			this.app.maskManager.update(image3D);
			this.app.mask.userData.raw = raw;
			this.app.mask.userData.fileName = file.name;

			if (!hadVolume) {
				this.app.volumeManager.updateFromMask();
			}

			await this.showBusyStatus(
				statusId,
				"Building model",
				"Updating slice views and the 3D model",
			);
			this.app.refreshWorldFromData();
			this.app.uiManager?.completeStatus(
				statusId,
				"Mask ready",
				hadVolume
					? "The edited mask is ready in both the slices and the 3D model."
					: "The mask is ready and a matching volume was derived from it.",
			);
		} catch (error) {
			this.app.uiManager?.failStatus(
				statusId,
				"Mask load failed",
				this.getErrorMessage(error),
			);
			this.reportError("Mask upload", error);
		} finally {
			input.value = "";
		}
	}

	onMaskDownload() {
		const imageData = this.app.mask.userData.texture?.image?.data;
		const image3D = this.app.mask.userData.image3D;
		const templateRaw =
			this.app.mask.userData.raw ?? this.app.volume.userData.raw ?? null;

		if (!imageData || (!templateRaw && !image3D)) {
			return;
		}

		try {
			const fileName = this.app.utils.getMaskDownloadFileName(
				this.app.mask.userData.fileName,
				this.app.volume.userData.fileName,
			);
			const buffer = this.app.utils.buildMaskDownloadBuffer({
				imageData,
				image3D,
				templateRaw,
			});

			this.app.utils.saveData([buffer], fileName);
		} catch (error) {
			this.reportError("Mask download", error);
		}
	}

	onResize() {
		this.app.camera.aspect = window.innerWidth / window.innerHeight;
		this.app.camera.updateProjectionMatrix();
		this.app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.app.renderer.setSize(window.innerWidth, window.innerHeight);
	}

	onKeydown(event) {
		switch (event.keyCode) {
			case 49:
			case 97:
				this.setMode("Place");
				break;
			case 50:
			case 98:
				this.setMode("Inspect");
				break;
			case 51:
			case 99:
				this.setMode("Edit");
				break;
			case 52:
			case 100:
				this.setMode("Segment");
				break;
			case 88:
				if (this.mode === "Edit" || this.mode === "Segment") {
					this.onGestureToggleBrush({ end: true });
				}
				break;
			case 67:
				if (this.mode === "Segment") {
					this.onGestureClearPoints({ end: true });
				}
				break;
			case 90:
				if (event.ctrlKey || event.metaKey) {
					event.preventDefault();
					if (this.mode === "Place") this.app.displayManager.undo();
					if (this.mode === "Inspect") this.app.screenManager.undo();
					if (this.mode === "Edit") this.app.maskManager.undo();
				}
				break;
			case 89:
				if (event.ctrlKey || event.metaKey) {
					event.preventDefault();
					if (this.mode === "Place") this.app.displayManager.redo();
					if (this.mode === "Inspect") this.app.screenManager.redo();
					if (this.mode === "Edit") this.app.maskManager.redo();
				}
				break;
			case 71:
				if (this.mode === "Place") this.app.displayManager.reset();
				if (this.mode === "Inspect") this.app.screenManager.reset();
				if (this.mode === "Edit") this.app.maskManager.reset();
				if (this.mode === "Segment") this.onGestureClearPoints({ end: true });
				break;
			case 81:
				this.app.transformControls.setSpace(
					this.app.transformControls.space === "local" ? "world" : "local",
				);
				break;
			case 84:
				this.app.transformControls.setMode("translate");
				break;
			case 82:
				this.app.transformControls.setMode("rotate");
				break;
			case 83:
				this.app.transformControls.setMode("scale");
				break;
			case 187:
			case 107:
				this.app.transformControls.setSize(
					this.app.transformControls.size + 0.1,
				);
				break;
			case 189:
			case 109:
				this.app.transformControls.setSize(
					Math.max(this.app.transformControls.size - 0.1, 0.1),
				);
				break;
			case 68:
				this.app.transformControls.enabled =
					!this.app.transformControls.enabled;
				this.app.transformControls.visible =
					!this.app.transformControls.visible;
				break;
			case 27:
				this.app.transformControls.reset();
				break;
		}
	}

	onEnteringSegmentMode() {
		this.app.workerManager.runEncodeAll();

		this.app.screen.rotation.set(0, 0, 0);
		this.app.brush.scale.setScalar(0.4);
		this.app.screenManager.updateUniformsBrush();
	}

	onLeavingSegmentMode() {}

	onPolytap(event) {
		if (event.numTaps === 1 && this.mode === "Segment") {
			this.onGestureAddPoint(event);
		}

		if (event.numTaps !== 2) {
			return;
		}

		if (this.mode === "Place") this.onGesturePlaceDisplay(event);
		if (this.mode === "Inspect") this.onGestureHideScreenMonitor(event);
		if (this.mode === "Edit") this.onGestureToggleBrush(event);
		if (this.mode === "Segment") this.onGestureToggleBrush(event);
		if (this.mode === "Segment3D") this.onGestureUpdateSegmentation3D(event);
	}

	onSwipe(event) {
		if (
			this.mode === "Segment" &&
			(event.direction === "RIGHT" || event.direction === "LEFT")
		) {
			this.onLeavingSegmentMode();
		}

		if (event.direction === "RIGHT") {
			this.app.displayManager.shiftMode();
			if (this.mode === "Segment") this.onEnteringSegmentMode();
		}

		if (event.direction === "LEFT") {
			this.app.displayManager.unshiftMode();
			if (this.mode === "Segment") this.onEnteringSegmentMode();
		}

		if (event.direction === "DOWN") {
			if (this.mode === "Place") this.app.displayManager.undo();
			if (this.mode === "Inspect") this.app.screenManager.undo();
			if (this.mode === "Edit") this.app.maskManager.undo();
			if (this.mode === "Segment3D") this.app.selector3DManager.undo();
		}

		if (event.direction === "UP") {
			if (this.mode === "Place") this.app.displayManager.redo();
			if (this.mode === "Inspect") this.app.screenManager.redo();
			if (this.mode === "Edit") this.app.maskManager.redo();
			if (this.mode === "Segment3D") this.app.selector3DManager.redo();
		}
	}

	onHold(event) {
		if (this.mode === "Place") {
			this.onGestureMoveDisplay(event);
		}

		if (this.mode === "Inspect") {
			if (event.start) {
				event.userData.flag = this.app.screenManager.intersectsCenter(
					this.app.gestures.raycasters.hand[0].ray,
				);
			}

			if (event.userData.flag) this.onGestureMoveScreen(event);
			if (!event.userData.flag) this.onGestureMoveScreenMonitor(event);
		}

		if (this.mode === "Edit") {
			this.onGestureEditMask(event);
		}

		if (this.mode === "Segment") {
			if (event.start) {
				event.userData.flag = this.app.screenManager
					.intersect(this.app.gestures.raycasters.hand[0].ray)
					.some(Boolean);
			}

			if (event.userData.flag) this.onGestureMoveScreenMonitor(event);
			if (!event.userData.flag) this.onGestureMoveDisplay(event);

			if (event.userData.flag && event.end) {
				this.app.workerManager.runEncodeAll();
			}
		}

		if (this.mode === "Segment3D") {
			if (event.start) {
				event.userData.flag = this.app.selector3DManager.intersects(
					this.app.gestures.raycasters.hand[0].ray,
				);
			}

			if (event.userData.flag === "vertex") {
				this.onGestureMoveSelectorVertex3D(event);
			}
			if (event.userData.flag === "face") {
				this.onGestureMoveSelectorFace3D(event);
			}
			if (event.userData.flag === "obb") {
				this.onGestureMoveSelector3D(event);
			}
		}
	}

	onPan(event) {
		if (this.mode === "Place") this.onGestureRotateDisplay(event);
		if (this.mode === "Inspect") this.onGestureRotateScreenMonitor(event);
		if (this.mode === "Edit") this.onGestureRotateDisplay(event);
		if (this.mode === "Segment") this.onGestureRotateDisplay(event);
		if (this.mode === "Segment3D") this.onGestureRotateDisplay(event);
	}

	onPinch(event) {
		if (this.mode === "Place") this.onGestureResizeDisplay(event);
		if (this.mode === "Inspect") this.onGestureResizeDisplay(event);
		if (this.mode === "Edit") this.onGestureResizeBrush(event);
		if (this.mode === "Segment") this.onGestureResizeDisplay(event);
		if (this.mode === "Segment3D") this.onGestureResizeSelector3D(event);
	}

	onTwist(event) {
		if (this.mode === "Place") this.onGestureRollDisplay(event);
		if (this.mode === "Inspect") this.onGestureRollScreen(event);
		if (this.mode === "Edit") this.onGestureContrastScreen(event);
		if (this.mode === "Segment") this.onGestureRollDisplay(event);
		if (this.mode === "Segment3D") this.onGestureRollDisplay(event);
	}

	onExplode(event) {
		if (event.end) {
			this.app.renderer.xr.getSession().end();
		}
	}

	onImplode(event) {
		if (this.mode === "Place") this.app.displayManager.reset();
		if (this.mode === "Inspect") this.app.screenManager.reset();
		if (this.mode === "Edit") this.app.maskManager.reset();
		if (this.mode === "Segment") this.onGestureClearPoints(event);
		if (this.mode === "Segment3D") this.app.selector3DManager.reset();
	}

	onGestureAttachObject(event, object) {
		event.userData.cache ??= {};
		const data = event.userData.cache;

		if (event.start) {
			data.object = new THREE.Object3D();

			object.matrixWorld.decompose(
				data.object.position,
				data.object.quaternion,
				data.object.scale,
			);
			data.object.updateMatrixWorld(true);

			this.app.gestures.controller[0].attach(data.object);
		}

		if (event.current) {
			data.object.updateMatrixWorld(true);

			this.app.shared.matrix4.copy(object.parent.matrixWorld).invert();
			this.app.shared.matrix4.multiply(data.object.matrixWorld);
			this.app.shared.matrix4.decompose(
				object.position,
				object.quaternion,
				object.scale,
			);

			object.updateMatrix();
		}

		if (event.end) {
			this.app.gestures.controller[0].remove(data.object);
			event.userData.cache = {};
		}
	}

	onGestureResizeObject(event, object) {
		event.userData.cache ??= {};
		const data = event.userData.cache;

		if (event.start) {
			data.scale0 = object.scale.clone();
			data.scalar = 1;
		}

		if (event.current) {
			data.scalar =
				this.app.gestures.parametersDual.distance /
				this.app.gestures.parametersDual.distance0;
			data.scalar = data.scalar ** 1.5;
			object.scale.copy(data.scale0).multiplyScalar(data.scalar);
		}

		if (event.end) {
			event.userData.cache = {};
		}
	}

	onGestureTranslateObject(event, object) {
		event.userData.cache ??= {};
		const data = event.userData.cache;

		if (event.start) {
			data.point = new THREE.Points();
			object.getWorldPosition(data.point.position);
			this.app.gestures.controller[0].attach(data.point);
		}

		if (event.current) {
			data.point.getWorldPosition(object.position);
			object.parent.worldToLocal(object.position);
			object.updateMatrix();
		}

		if (event.end) {
			this.app.gestures.controller[0].remove(data.point);
			event.userData.cache = {};
		}
	}

	onGestureRollObject(event, object) {
		event.userData.cache ??= {};
		const data = event.userData.cache;

		if (event.start) {
			data.angle = 0;
			data.scalar = 1.2;
			data.axis = new THREE.Vector3();
			data.quaternion0 = object.quaternion.clone();
		}

		if (event.current) {
			data.angle =
				(this.app.gestures.parametersDual.angleOffset * Math.PI) / 180;
			data.angle = -data.scalar * data.angle;
			data.axis.copy(this.app.gestures.raycasters.view.ray.direction);

			object.quaternion.copy(data.quaternion0);
			object.rotateOnWorldAxis(data.axis, data.angle);
		}

		if (event.end) {
			event.userData.cache = {};
		}
	}

	onGestureTurnObject(event, object) {
		event.userData.cache ??= {};
		const data = event.userData.cache;

		if (event.start) {
			data.angle = 0;
			data.scalar = Math.PI / 60.0;
			data.axis = new THREE.Vector3();
			data.xAxis = new THREE.Vector3();
			data.yAxis = new THREE.Vector3();
			data.quaternion0 = object.quaternion.clone();
		}

		if (event.current) {
			this.app.shared.vector2.copy(
				this.app.gestures.parameters[0].pointerOffset,
			);
			data.angle = data.scalar * this.app.shared.vector2.length();
			data.yAxis.copy(this.app.shared.axes.y);
			data.xAxis
				.copy(this.app.shared.axes.x)
				.negate()
				.transformDirection(this.app.camera.matrixWorld);

			data.axis.set(0, 0, 0);
			data.axis.addScaledVector(data.yAxis, this.app.shared.vector2.x);
			data.axis.addScaledVector(data.xAxis, this.app.shared.vector2.y);
			data.axis.normalize();

			object.quaternion.copy(data.quaternion0);
			object.rotateOnWorldAxis(data.axis, data.angle);
		}

		if (event.end) {
			event.userData.cache = {};
		}
	}

	onGesturePlaceDisplay(event) {
		if (!event.end) {
			return;
		}

		if (this.app.display.visible === false) {
			this.app.display.position.setFromMatrixPosition(this.app.reticle.matrix);
			this.app.display.scale.divideScalar(
				3 * Math.max(...this.app.volume.userData.size.toArray()),
			);
			this.app.display.translateY(0.2);
			this.app.displayManager.update();
		}

		this.app.display.visible = !this.app.display.visible;
		this.app.reticle.visible = !this.app.reticle.visible;
		this.app.reticle.userData.enabled = !this.app.reticle.userData.enabled;
	}

	onGestureMoveDisplay(event) {
		this.onGestureTranslateObject(event, this.app.display);

		if (event.start) this.app.displayManager.save();
		if (event.current) this.app.displayManager.update();
	}

	onGestureResizeDisplay(event) {
		this.onGestureResizeObject(event, this.app.display);

		if (event.start) this.app.displayManager.save();
		if (event.current) this.app.displayManager.update();
	}

	onGestureRollDisplay(event) {
		this.onGestureRollObject(event, this.app.display);

		if (event.start) this.app.displayManager.save();
		if (event.current) this.app.displayManager.update();
	}

	onGestureRotateDisplay(event) {
		this.onGestureTurnObject(event, this.app.display);

		if (event.start) this.app.displayManager.save();
		if (event.current) this.app.displayManager.update();
	}

	onGestureMoveScreen(event) {
		this.onGestureTranslateObject(event, this.app.screen);

		if (event.start) this.app.screenManager.save();

		if (event.current) {
			this.app.screenManager.setClampedWorldPosition(
				this.app.screen.getWorldPosition(this.app.shared.position),
			);
			this.app.screenManager.update();
			this.app.screenManager.updateUniformsPlanes();
			this.app.modelManager.updateUniformsPlanes();
		}
	}

	onGestureRollScreen(event) {
		this.onGestureRollObject(event, this.app.screen);

		if (event.start) this.app.screenManager.save();

		if (event.current) {
			this.app.screenManager.update();
			this.app.screenManager.updateUniformsPlanes();
			this.app.modelManager.updateUniformsPlanes();
		}
	}

	onGestureContrastScreen(event) {
		if (event.start) {
			event.userData.contrast0 = this.app.screen.userData.monitors.map(
				(monitor) => monitor.material.uniforms.uContrast.value,
			);
		}

		if (event.current) {
			this.app.screen.userData.monitors.forEach((monitor, i) => {
				monitor.material.uniforms.uContrast.value =
					event.userData.contrast0[i] -
					(7 * this.app.gestures.parametersDual.angleOffset) / 360;
				monitor.material.needsUpdate = true;
			});
		}

		if (event.end) {
			event.userData = {};
		}
	}

	onGestureHideScreenMonitor(event) {
		if (!event.end) {
			return;
		}

		const selected = this.app.screenManager.intersect(
			this.app.gestures.raycasters.hand[0].ray,
		)[0];

		if (!selected) {
			return;
		}

		this.app.screenManager.save();
		const uniforms = selected.object.material.uniforms;
		uniforms.uPlaneVisible.value = !uniforms.uPlaneVisible.value;
	}

	onGestureMoveScreenMonitor(event) {
		const data = event.userData;

		if (event.start) {
			data.selected = this.app.screenManager
				.intersect(this.app.gestures.raycasters.hand[0].ray)
				.filter((intersection) => {
					return (
						intersection.object.material.uniforms.uPlaneVisible.value &&
						intersection.object.visible
					);
				})[0];

			if (data.selected) {
				const direction = data.selected.object.getWorldDirection(
					new THREE.Vector3(),
				);
				const normal = this.app.camera
					.getWorldDirection(this.app.shared.direction)
					.projectOnPlane(direction);

				if (normal.lengthSq() === 0) {
					data.selected = null;
					return;
				}

				this.app.screenManager.save();
				this.app.scene.attach(this.app.screen);
				this.app.screenManager.update();
				this.app.screenManager.updateUniformsPlanes();

				data.translation = new THREE.Vector3();
				data.direction = direction;
				data.position = this.app.screen.position.clone();
				data.position0 = this.app.screen.position.clone();
				data.origin = data.selected.point.clone();
				data.hitPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
					normal.normalize(),
					data.origin,
				);
				data.point = new THREE.Vector3();

				this.app.model.material.uniforms.uModelAlpha.value = 0.4;
				this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;
				this.app.model.material.needsUpdate = true;
				this.app.modelManager.update();
			}
		}

		if (event.current && data.selected) {
			const hitNormal = this.app.camera
				.getWorldDirection(this.app.shared.direction)
				.projectOnPlane(data.direction);

			if (hitNormal.lengthSq() === 0) {
				return;
			}

			data.hitPlane.normal.copy(hitNormal.normalize());

			const hitPoint = this.app.gestures.raycasters.hand[0].ray.intersectPlane(
				data.hitPlane,
				data.point,
			);

			if (!hitPoint) {
				return;
			}

			data.translation
				.subVectors(data.point, data.origin)
				.projectOnVector(data.direction);
			data.position.copy(data.position0).add(data.translation);
			this.app.screenManager.setClampedWorldPosition(data.position);

			this.app.screenManager.update();
			this.app.screenManager.updateUniformsPlanes();
		}

		if (event.end && data.selected) {
			this.app.display.attach(this.app.screen);
			this.app.screenManager.update();
			this.app.screenManager.updateUniformsPlanes();
			this.app.model.material.uniforms.uModelAlpha.value = 1.0;
			this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;
			this.app.model.material.needsUpdate = true;
			event.userData = {};
		}
	}

	onGestureRotateScreenMonitor(event) {
		const data = event.userData;

		if (event.start) {
			data.selected = this.app.screenManager
				.intersect(this.app.gestures.raycasters.hand[0].ray)
				.filter(
					(intersection) =>
						intersection.object.material.uniforms.uPlaneVisible.value,
				)[0];

			if (data.selected) {
				this.app.screenManager.save();
				this.app.scene.attach(this.app.screen);
				this.app.screenManager.update();
				this.app.screenManager.updateUniforms();

				data.point = data.selected.point.clone();
				data.axis = this.app.utils.positionToAxis(data.point);

				this.app.screen.getWorldPosition(this.app.shared.position);
				data.center = data.point
					.clone()
					.sub(this.app.shared.position)
					.projectOnVector(data.axis)
					.add(this.app.shared.position);
				data.hitPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
					data.axis,
					data.center,
				);

				data.pointer = data.point.clone().sub(data.center);
				data.reference = data.pointer.clone().normalize();
				data.orthogonal = data.reference
					.clone()
					.applyAxisAngle(data.axis, Math.PI / 2)
					.normalize();

				data.radius = new THREE.Vector2();
				data.angle = 0;
				data.quaternion0 = this.app.screen.quaternion.clone();

				this.app.model.material.uniforms.uModelAlpha.value = 0.4;
				this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;
				this.app.model.material.needsUpdate = true;
				this.app.modelManager.update();
			}
		}

		if (event.current && data.selected) {
			this.app.gestures.raycasters.hand[0].ray.intersectPlane(
				data.hitPlane,
				data.point,
			);

			if (data.point) {
				data.pointer.copy(data.point).sub(data.center);
				data.radius.set(
					data.pointer.dot(data.reference),
					data.pointer.dot(data.orthogonal),
				);
				data.angle =
					data.radius.length() > 1e-2
						? Math.atan2(data.radius.y, data.radius.x)
						: 0;

				this.app.screen.quaternion.copy(data.quaternion0);
				this.app.screen.rotateOnWorldAxis(data.axis, data.angle);
				this.app.screenManager.update();
			}
		}

		if (event.end) {
			this.app.display.attach(this.app.screen);
			this.app.model.material.uniforms.uModelAlpha.value = 1.0;
			this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;
			this.app.model.material.needsUpdate = true;
			this.app.modelManager.update();
			event.userData = {};
		}
	}

	onGestureEditMask(event) {
		const data = event.userData;

		if (event.start) {
			data.center = this.app.mask.userData.size.clone().multiplyScalar(0.5);
			data.offset = this.app.mask.userData.voxelSize
				.clone()
				.multiplyScalar(0.01);
			data.bounds = new THREE.Box3();
			data.value = this.app.brush.userData.mode === "ADD" ? 255 : 0;
			data.voxelCenter = new THREE.Vector3();
			data.voxelBox = new THREE.Box3();
			data.record = {
				indices: [],
				data: [],
				box: this.app.model.userData.box.clone(),
			};
		}

		if (event.current) {
			data.bounds = this.app.utils.projectBoxOnPlane(
				this.app.brush.userData.box,
				this.app.brush.userData.plane,
			);
			data.bounds.min = this.app.utils
				.localPositionToVoxel(data.bounds.min)
				.subScalar(1);
			data.bounds.max = this.app.utils
				.localPositionToVoxel(data.bounds.max)
				.addScalar(1);

			for (let k = data.bounds.min.z; k <= data.bounds.max.z; k++) {
				const offsetK =
					this.app.mask.userData.samples.x *
					this.app.mask.userData.samples.y *
					k;

				for (let j = data.bounds.min.y; j <= data.bounds.max.y; j++) {
					const offsetJ = this.app.mask.userData.samples.x * j;

					for (let i = data.bounds.min.x; i <= data.bounds.max.x; i++) {
						const n = i + offsetJ + offsetK;

						if (this.app.mask.userData.texture.image.data[n] === data.value) {
							continue;
						}

						data.voxelCenter
							.set(i, j, k)
							.addScalar(0.5)
							.multiply(this.app.mask.userData.voxelSize)
							.sub(data.center);
						data.voxelBox
							.setFromCenterAndSize(
								data.voxelCenter,
								this.app.mask.userData.voxelSize,
							)
							.expandByVector(data.offset);

						if (
							data.voxelBox.intersectsPlane(this.app.brush.userData.plane) &&
							data.voxelBox.intersectsSphere(this.app.brush.userData.sphere)
						) {
							data.record.indices.push(n);
							data.record.data.push(
								this.app.mask.userData.texture.image.data[n],
							);
							this.app.mask.userData.texture.image.data[n] = data.value;

							if (this.app.brush.userData.mode === "ADD") {
								this.app.model.userData.box.union(data.voxelBox);
							}
						}
					}
				}
			}

			this.app.mask.userData.texture.needsUpdate = true;
			this.app.screenManager.updateUniformsMask();
			this.app.modelManager.updateUniformsMask();

			if (this.app.brush.userData.mode === "ADD") {
				this.app.modelManager.updateUniformsBox();
			}
		}

		if (event.end) {
			this.app.mask.userData.history.unshift(data.record);

			if (this.app.brush.userData.mode === "SUB") {
				this.app.modelManager.computeBoundingBox();
				this.app.modelManager.updateUniformsBox();
			}

			this.app.model.material.needsUpdate = true;
			event.userData = {};
		}
	}

	onGestureToggleBrush(event) {
		if (!event.end) {
			return;
		}

		if (this.app.brush.userData.mode === "ADD") {
			this.app.brush.userData.mode = "SUB";
			this.app.brush.material.color.set(0x00ffff);
		} else {
			this.app.brush.userData.mode = "ADD";
			this.app.brush.material.color.set(0xff0055);
		}
	}

	onGestureResizeBrush(event) {
		this.onGestureResizeObject(event, this.app.brush);

		if (event.current) {
			this.app.screenManager.updateUniformsBrush();
		}
	}

	onGestureAddPoint(event) {
		if (!event.end) {
			return;
		}

		const worker = this.app.workers[0];
		if (!worker || this.app.brush.userData.monitorIndex === undefined) {
			return;
		}

		const label = this.app.brush.userData.mode === "ADD" ? 1 : 0;
		const coord = this.app.utils
			.localPositionToVoxel(this.app.brush.position)
			.divide(this.app.volume.userData.samples);
		const dim = [0, 1, 2].toSpliced(this.app.brush.userData.monitorIndex, 1);

		worker.userData.slice.coords.push([
			coord.getComponent(dim[0]),
			coord.getComponent(dim[1]),
		]);
		worker.userData.slice.labels.push(label);

		const point = this.app.brush.clone(false);
		point.material = this.app.brush.material.clone();
		point.material.transparent = false;

		this.app.display.userData.points.push(point);
		this.app.display.add(point);
		this.app.workerManager.runDecode(0);
	}

	onGestureClearPoints(event) {
		if (!event.end) {
			return;
		}

		const workerData = this.app.workers[0]?.userData;
		if (!workerData || !this.app.mask.userData.texture?.image) {
			return;
		}

		this.app.display.remove(...this.app.display.userData.points);
		this.app.display.userData.points = [];
		workerData.slice.coords = [];
		workerData.slice.labels = [];

		this.app.displayManager.update();

		const textureData = this.app.mask.userData.texture.image.data;
		const sliceIndices = workerData.slice.indices;

		this.app.mask.userData.history.push({
			data: sliceIndices.map((index) => textureData[index]),
			indices: Array.from(sliceIndices),
			box: this.app.model.userData.box.clone(),
		});

		for (let n = 0; n < sliceIndices.length; n++) {
			textureData[sliceIndices[n]] = workerData.slice.textureData[n];
		}

		this.app.screenManager.updateUniformsMask();
		this.app.modelManager.updateUniformsMask();
		this.app.modelManager.computeBoundingBox();
		this.app.modelManager.updateUniformsBox();
		this.app.mask.userData.texture.needsUpdate = true;
	}

	async computeSegmentation3D() {
		return new Uint8Array(this.app.mask.userData.data0.length).fill(1);
	}

	async onGestureUpdateSegmentation3D(event) {
		if (!event.end) {
			return;
		}

		const array = await this.computeSegmentation3D();
		const points = this.app.selector3D.userData.vertices.map((vertex) =>
			vertex.position.clone().applyMatrix4(this.app.selector3D.matrix),
		);
		const box = new THREE.Box3().setFromPoints(points);
		const boxMin = this.app.utils.localPositionToVoxel(box.min);
		const boxMax = this.app.utils.localPositionToVoxel(box.max);

		this.app.maskManager.updateTexture(array, boxMin, boxMax);
		this.app.modelManager.updateUniformsMask();
		this.app.screenManager.updateUniformsMask();
		this.app.modelManager.computeBoundingBox();
		this.app.modelManager.updateUniformsBox();
		this.app.displayManager.update();
	}

	onGestureResizeSelector3D(event) {
		this.onGestureResizeObject(event, this.app.selector3D);

		if (event.start) this.app.selector3DManager.save();
		if (event.current) {
			this.app.selector3DManager.update();
			this.app.screenManager.updateUniformsSelector();
		}
	}

	onGestureMoveSelector3D(event) {
		this.onGestureTranslateObject(event, this.app.selector3D);

		if (event.start) this.app.selector3DManager.save();
		if (event.current) {
			this.app.selector3DManager.update();
			this.app.screenManager.updateUniformsSelector();
		}
	}

	onGestureMoveSelectorVertex3D(event) {
		const data = event.userData;

		if (event.start) {
			data.intersection = this.app.selector3DManager.intersectVertices(
				this.app.gestures.raycasters.hand[0].ray,
			)[0];
		}

		if (event.start && data.intersection) {
			this.app.selector3DManager.save();

			data.selector = {
				scale0: new THREE.Vector3().copy(this.app.selector3D.scale),
				position0: new THREE.Vector3().copy(this.app.selector3D.position),
			};
			data.matrices = {
				w: new THREE.Matrix4().copy(this.app.display.matrixWorld).invert(),
				m: new THREE.Matrix4().copy(this.app.selector3D.matrix),
			};
			data.points = {
				o: new THREE.Vector3()
					.copy(data.intersection.object.position)
					.applyMatrix4(data.matrices.m),
				p: new THREE.Vector3()
					.copy(data.intersection.point)
					.applyMatrix4(data.matrices.w),
				q: new THREE.Vector3(),
			};
			data.vectors = {
				s: new THREE.Vector3().copy(
					this.app.utils.mapVector(data.points.o, Math.sign),
				),
				op: new THREE.Vector3().subVectors(data.points.p, data.points.o),
				pq: new THREE.Vector3(),
			};
			data.shapes = {
				object3D: new THREE.Object3D(),
			};

			data.shapes.object3D.position.copy(data.intersection.point);
			this.app.gestures.controller[0].attach(data.shapes.object3D);
		}

		if (event.current && data.intersection) {
			data.shapes.object3D
				.getWorldPosition(data.points.q)
				.applyMatrix4(data.matrices.w);
			data.vectors.pq.subVectors(data.points.q, data.points.p);

			this.app.selector3D.position
				.copy(data.selector.position0)
				.addScaledVector(data.vectors.pq, 0.5);

			data.vectors.pq.multiply(data.vectors.s);
			this.app.selector3D.scale.copy(data.selector.scale0).add(data.vectors.pq);

			this.app.selector3DManager.update();
			this.app.screenManager.updateUniformsSelector();
		}

		if (event.end) {
			this.app.gestures.controller[0].remove(data.shapes.object3D);
			event.userData = {};
		}
	}

	onGestureMoveSelectorFace3D(event) {
		const data = event.userData;

		if (event.start) {
			data.intersection = this.app.selector3DManager.intersectFaces(
				this.app.gestures.raycasters.hand[0].ray,
			)[0];
		}

		if (event.start && data.intersection) {
			this.app.selector3DManager.save();

			data.selector = {
				scale0: new THREE.Vector3().copy(this.app.selector3D.scale),
				position0: new THREE.Vector3().copy(this.app.selector3D.position),
			};
			data.matrices = {
				w: new THREE.Matrix4().copy(this.app.display.matrixWorld).invert(),
				m: new THREE.Matrix4().copy(this.app.selector3D.matrix),
			};
			data.points = {
				o: new THREE.Vector3()
					.copy(data.intersection.object.position)
					.applyMatrix4(data.matrices.m),
				p: new THREE.Vector3()
					.copy(data.intersection.point)
					.applyMatrix4(data.matrices.w),
				q: new THREE.Vector3(),
			};
			data.vectors = {
				n: new THREE.Vector3(),
				s: new THREE.Vector3().copy(
					this.app.utils.mapVector(data.points.o, Math.sign),
				),
				d: new THREE.Vector3()
					.subVectors(data.points.o, data.selector.position0)
					.normalize(),
				op: new THREE.Vector3().subVectors(data.points.p, data.points.o),
				pq: new THREE.Vector3(),
			};

			data.vectors.n
				.copy(this.app.gestures.raycasters.view.ray.direction)
				.transformDirection(data.matrices.w)
				.projectOnPlane(data.vectors.d)
				.normalize();

			data.shapes = {
				plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
					data.vectors.n,
					data.points.p,
				),
				ray: new THREE.Ray()
					.copy(this.app.gestures.raycasters.hand[0].ray)
					.applyMatrix4(data.matrices.w),
				line: new THREE.Line3().set(
					data.points.p,
					data.points.p.clone().add(data.vectors.d),
				),
			};
		}

		if (event.current && data.intersection) {
			data.shapes.plane.normal
				.copy(this.app.gestures.raycasters.view.ray.direction)
				.transformDirection(data.matrices.w)
				.projectOnPlane(data.vectors.d)
				.normalize();

			data.shapes.ray
				.copy(this.app.gestures.raycasters.hand[0].ray)
				.applyMatrix4(data.matrices.w);
			data.shapes.ray.intersectPlane(data.shapes.plane, data.points.q);

			if (data.points.q) {
				data.shapes.line.closestPointToPoint(
					data.points.q,
					false,
					data.points.q,
				);
				data.vectors.pq.subVectors(data.points.q, data.points.p);

				this.app.selector3D.position
					.copy(data.selector.position0)
					.addScaledVector(data.vectors.pq, 0.5);

				data.vectors.pq.multiply(data.vectors.s);
				this.app.selector3D.scale
					.copy(data.selector.scale0)
					.add(data.vectors.pq);

				this.app.selector3DManager.update();
				this.app.screenManager.updateUniformsSelector();
			}
		}

		if (event.end) {
			event.userData = {};
		}
	}
}
