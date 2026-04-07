import * as THREE from "three";

export class DesktopControls {
	constructor(app) {
		this.app = app;

		this.pointerNdc = new THREE.Vector2();
		this.pointerClient = new THREE.Vector2();
		this.pointerDownClient = new THREE.Vector2();
		this.viewRaycaster = new THREE.Raycaster();
		this.viewRay = new THREE.Ray(
			new THREE.Vector3(),
			new THREE.Vector3(0, 0, -1),
		);

		this.drag = null;
		this.pointerIsDown = false;
		this.modeState = {
			mode: "Place",
		};
	}

	get mode() {
		return this.app.interaction.mode;
	}

	setup() {
		const domElement = this.app.renderer.domElement;

		this.modeState.mode = this.app.interaction.mode;

		// Keep left mouse free for app interactions. Use right mouse for orbit and wheel for zoom.
		this.app.orbitControls.mouseButtons.LEFT = -1;
		this.app.orbitControls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
		this.app.orbitControls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;

		domElement.addEventListener("contextmenu", (event) =>
			event.preventDefault(),
		);
		domElement.addEventListener("pointermove", (event) =>
			this.onPointerMove(event),
		);
		domElement.addEventListener("pointerdown", (event) =>
			this.onPointerDown(event),
		);
		domElement.addEventListener("dblclick", (event) =>
			this.onDoubleClick(event),
		);
		domElement.addEventListener("wheel", (event) => this.onWheel(event), {
			passive: false,
		});
		window.addEventListener("pointerup", (event) => this.onPointerUp(event));
	}

	update() {
		this.updateViewRay();
	}

	syncMode(mode) {
		this.modeState.mode = mode;
	}

	updatePointer(event) {
		const rect = this.app.renderer.domElement.getBoundingClientRect();

		this.pointerClient.set(event.clientX, event.clientY);
		this.pointerNdc.set(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1,
		);
	}

	updateViewRay() {
		this.viewRaycaster.setFromCamera(this.pointerNdc, this.app.camera);
		this.viewRay.copy(this.viewRaycaster.ray);
	}

	getPointerTravel() {
		return this.pointerClient.distanceTo(this.pointerDownClient);
	}

	getHoveredScreenIntersection(visibleOnly = true) {
		const intersections = this.app.screenManager.intersect(this.viewRay);

		if (!visibleOnly) {
			return intersections[0];
		}

		return intersections.find((intersection) => {
			return (
				intersection.object.visible &&
				intersection.object.material.uniforms.uPlaneVisible.value
			);
		});
	}

	getDisplayDragPlane(point) {
		const normal = this.app.camera.getWorldDirection(new THREE.Vector3());
		return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
	}

	getRayPlanePoint(plane) {
		return this.viewRay.intersectPlane(plane, new THREE.Vector3());
	}

	onPointerDown(event) {
		if (event.button !== 0 || !this.app.display.visible) {
			return;
		}

		this.pointerIsDown = true;
		this.updatePointer(event);
		this.pointerDownClient.copy(this.pointerClient);
		this.updateViewRay();

		if (this.mode === "Place") {
			if (event.altKey) {
				this.beginDisplayRotation(event);
			} else {
				this.beginDisplayMove(event);
			}
		}

		if (this.mode === "Inspect") {
			if (event.altKey) {
				this.beginScreenRotation(event);
			} else {
				this.beginScreenMove(event);
			}
		}

		if (this.mode === "Edit") {
			this.beginMaskEdit(event);
		}

		if (this.drag) {
			event.preventDefault();
			this.app.orbitControls.enabled = false;
			this.app.renderer.domElement.setPointerCapture(event.pointerId);
		}
	}

	onPointerMove(event) {
		this.updatePointer(event);
		this.updateViewRay();

		if (!this.drag) {
			return;
		}

		event.preventDefault();

		if (this.drag.type === "moveDisplay") {
			this.updateDisplayMove();
		}

		if (this.drag.type === "rotateDisplay") {
			this.updateDisplayRotation();
		}

		if (this.drag.type === "moveScreen") {
			this.updateScreenMove();
		}

		if (this.drag.type === "rotateScreen") {
			this.updateScreenRotation();
		}

		if (this.drag.type === "editMask") {
			this.updateMaskEdit();
		}
	}

	onPointerUp(event) {
		if (!this.pointerIsDown) {
			return;
		}

		this.pointerIsDown = false;
		this.updatePointer(event);
		this.updateViewRay();

		if (this.drag) {
			if (this.drag.type === "moveDisplay") {
				this.endDisplayMove();
			}

			if (this.drag.type === "rotateDisplay") {
				this.endDisplayRotation();
			}

			if (this.drag.type === "moveScreen") {
				this.endScreenMove();
			}

			if (this.drag.type === "rotateScreen") {
				this.endScreenRotation();
			}

			if (this.drag.type === "editMask") {
				this.endMaskEdit();
			}

			this.drag = null;
			this.app.orbitControls.enabled = true;
		} else if (
			this.mode === "Segment" &&
			event.button === 0 &&
			this.getPointerTravel() < 6
		) {
			this.handleSegmentClick();
		}
	}

	onDoubleClick(event) {
		this.updatePointer(event);
		this.updateViewRay();

		if (this.mode === "Inspect") {
			const selected = this.getHoveredScreenIntersection(true);

			if (selected) {
				this.app.screenManager.save();
				selected.object.material.uniforms.uPlaneVisible.value =
					!selected.object.material.uniforms.uPlaneVisible.value;
				this.app.displayManager.update();
			}
		}

		if (this.mode === "Edit" || this.mode === "Segment") {
			this.app.interaction.onGestureToggleBrush({ end: true });
		}
	}

	onWheel(event) {
		if (!this.app.display.visible) {
			return;
		}

		if (event.shiftKey && (this.mode === "Place" || this.mode === "Inspect")) {
			event.preventDefault();
			this.scaleDisplay(event.deltaY);
			return;
		}

		if (event.shiftKey && (this.mode === "Edit" || this.mode === "Segment")) {
			event.preventDefault();
			this.resizeBrush(event.deltaY);
			return;
		}

		if (event.altKey && this.mode === "Segment") {
			event.preventDefault();
			this.moveSegmentSlice(event.deltaY);
		}
	}

	beginDisplayMove() {
		const point = this.app.display.getWorldPosition(new THREE.Vector3());
		const plane = this.getDisplayDragPlane(point);
		const hitPoint = this.getRayPlanePoint(plane);

		if (!hitPoint) {
			return;
		}

		this.app.displayManager.save();
		this.drag = {
			type: "moveDisplay",
			plane,
			offset: point.clone().sub(hitPoint),
		};
	}

	updateDisplayMove() {
		const hitPoint = this.getRayPlanePoint(this.drag.plane);

		if (!hitPoint) {
			return;
		}

		const worldTarget = hitPoint.add(this.drag.offset);
		this.app.display.position.copy(worldTarget);
		this.app.display.updateMatrix();
		this.app.displayManager.update();
	}

	endDisplayMove() {}

	beginDisplayRotation() {
		this.app.displayManager.save();
		this.drag = {
			type: "rotateDisplay",
			startPointer: this.pointerClient.clone(),
			quaternion0: this.app.display.quaternion.clone(),
		};
	}

	updateDisplayRotation() {
		const delta = this.pointerClient.clone().sub(this.drag.startPointer);
		const angle = 0.003 * delta.length();
		const axis = new THREE.Vector3();
		const up = this.app.shared.axes.y.clone();
		const right = this.app.shared.axes.x
			.clone()
			.negate()
			.transformDirection(this.app.camera.matrixWorld);

		axis.addScaledVector(up, delta.x);
		axis.addScaledVector(right, delta.y);

		if (axis.lengthSq() === 0) {
			return;
		}

		this.app.display.quaternion.copy(this.drag.quaternion0);
		this.app.display.rotateOnWorldAxis(axis.normalize(), angle);
		this.app.display.updateMatrix();
		this.app.displayManager.update();
	}

	endDisplayRotation() {}

	beginScreenMove() {
		const selected = this.getHoveredScreenIntersection(true);

		if (!selected) {
			return;
		}

		this.app.screenManager.save();
		this.app.scene.attach(this.app.screen);
		this.app.screenManager.update();
		this.app.screenManager.updateUniformsPlanes();

		const direction = selected.object.userData.plane.normal.clone();
		const position0 = this.app.screen.position.clone();
		const normal = this.app.camera
			.getWorldDirection(new THREE.Vector3())
			.projectOnPlane(direction)
			.normalize();
		const origin = selected.point.clone();
		const hitPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
			normal,
			origin,
		);

		this.app.model.material.uniforms.uModelAlpha.value = 0.4;
		this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;
		this.app.model.material.needsUpdate = true;
		this.app.modelManager.update();

		this.drag = {
			type: "moveScreen",
			direction,
			origin,
			position0,
			hitPlane,
			point: new THREE.Vector3(),
			translation: new THREE.Vector3(),
		};
	}

	updateScreenMove() {
		this.app.camera
			.getWorldDirection(this.drag.hitPlane.normal)
			.projectOnPlane(this.drag.direction)
			.normalize();

		this.viewRay.intersectPlane(this.drag.hitPlane, this.drag.point);

		if (!this.drag.point) {
			return;
		}

		this.drag.translation
			.subVectors(this.drag.point, this.drag.origin)
			.projectOnVector(this.drag.direction);

		this.app.screen.position
			.copy(this.drag.position0)
			.add(this.drag.translation);

		this.app.screenManager.update();
		this.app.screenManager.updateUniformsPlanes();
		this.app.modelManager.updateUniformsPlanes();
	}

	endScreenMove() {
		this.app.display.attach(this.app.screen);
		this.app.screenManager.update();
		this.app.screenManager.updateUniformsPlanes();
		this.app.modelManager.updateUniformsPlanes();
		this.app.model.material.uniforms.uModelAlpha.value = 1.0;
		this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;
		this.app.model.material.needsUpdate = true;
	}

	beginScreenRotation() {
		const selected = this.getHoveredScreenIntersection(true);

		if (!selected) {
			return;
		}

		this.app.screenManager.save();
		this.app.scene.attach(this.app.screen);
		this.app.screenManager.update();
		this.app.screenManager.updateUniforms();

		const point = selected.point.clone();
		const axis = this.app.utils.positionToAxis(point);

		this.app.screen.getWorldPosition(this.app.shared.position);
		const center = point
			.clone()
			.sub(this.app.shared.position)
			.projectOnVector(axis)
			.add(this.app.shared.position);

		const hitPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
			axis,
			center,
		);
		const pointer = point.clone().sub(center);
		const reference = pointer.clone().normalize();
		const orthogonal = reference
			.clone()
			.applyAxisAngle(axis, Math.PI / 2)
			.normalize();

		this.app.model.material.uniforms.uModelAlpha.value = 0.4;
		this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;
		this.app.model.material.needsUpdate = true;
		this.app.modelManager.update();

		this.drag = {
			type: "rotateScreen",
			point: new THREE.Vector3(),
			axis,
			center,
			hitPlane,
			reference,
			orthogonal,
			radius: new THREE.Vector2(),
			quaternion0: this.app.screen.quaternion.clone(),
		};
	}

	updateScreenRotation() {
		this.viewRay.intersectPlane(this.drag.hitPlane, this.drag.point);

		if (!this.drag.point) {
			return;
		}

		const pointer = this.drag.point.clone().sub(this.drag.center);
		this.drag.radius.set(
			pointer.dot(this.drag.reference),
			pointer.dot(this.drag.orthogonal),
		);

		const angle =
			this.drag.radius.length() > 1e-2
				? Math.atan2(this.drag.radius.y, this.drag.radius.x)
				: 0;

		this.app.screen.quaternion.copy(this.drag.quaternion0);
		this.app.screen.rotateOnWorldAxis(this.drag.axis, angle);
		this.app.screenManager.update();
		this.app.screenManager.updateUniformsPlanes();
		this.app.modelManager.updateUniformsPlanes();
	}

	endScreenRotation() {
		this.app.display.attach(this.app.screen);
		this.app.model.material.uniforms.uModelAlpha.value = 1.0;
		this.app.model.material.uniforms.uModelAlphaClip.value = 0.4;
		this.app.model.material.needsUpdate = true;
		this.app.modelManager.update();
	}

	beginMaskEdit() {
		if (!this.getHoveredScreenIntersection(true)) {
			return;
		}

		this.app.brushManager.update();

		const gestureEvent = {
			start: true,
			current: false,
			end: false,
			userData: {},
		};

		this.app.interaction.onGestureEditMask(gestureEvent);
		this.drag = {
			type: "editMask",
			gestureEvent,
		};
	}

	updateMaskEdit() {
		this.app.brushManager.update();

		this.drag.gestureEvent.start = false;
		this.drag.gestureEvent.current = true;
		this.drag.gestureEvent.end = false;
		this.app.interaction.onGestureEditMask(this.drag.gestureEvent);
	}

	endMaskEdit() {
		this.drag.gestureEvent.start = false;
		this.drag.gestureEvent.current = false;
		this.drag.gestureEvent.end = true;
		this.app.interaction.onGestureEditMask(this.drag.gestureEvent);
	}

	handleSegmentClick() {
		if (!this.getHoveredScreenIntersection(true)) {
			return;
		}

		this.app.brushManager.update();
		this.app.interaction.onGestureAddPoint({ end: true });
	}

	scaleDisplay(deltaY) {
		const scalar = Math.exp(-deltaY * 0.0015);
		this.app.displayManager.save();
		this.app.display.scale.multiplyScalar(scalar);
		this.app.display.updateMatrix();
		this.app.displayManager.update();
	}

	resizeBrush(deltaY) {
		const scalar = Math.exp(-deltaY * 0.0015);
		this.app.brush.scale.multiplyScalar(scalar);
		this.app.brush.updateMatrix();
		this.app.brushManager.update();
		this.app.screenManager.updateUniformsBrush();
	}

	moveSegmentSlice(deltaY) {
		const axis = 2;
		const step =
			Math.sign(deltaY) * this.app.mask.userData.voxelSize.getComponent(axis);
		const halfExtent = this.app.mask.userData.size.getComponent(axis) * 0.5;

		this.app.screen.position.setComponent(
			axis,
			THREE.MathUtils.clamp(
				this.app.screen.position.getComponent(axis) + step,
				-halfExtent,
				halfExtent,
			),
		);

		this.app.screen.updateMatrix();
		this.app.screenManager.update();
		this.app.screenManager.updateUniformsPlanes();
		this.app.modelManager.updateUniformsPlanes();

		for (const worker of this.app.workers) {
			this.app.workerManager.runEncode(worker.userData.id);
		}
	}
}
