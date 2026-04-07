import * as THREE from "three";

export class ScreenManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		const { screen, volume, shaders } = this.app;

		screen.clear();
		screen.userData.future = [];
		screen.userData.history = [];

		const length = 2 * volume.userData.size.length();
		const geometry = [0, 1, 2].map(
			() => new THREE.PlaneGeometry(length, length),
		);
		const material = [0, 1, 2].map((_, index) => {
			const shaderMaterial = new THREE.ShaderMaterial({
				uniforms: {},
				vertexShader: shaders.vertexScreen,
				fragmentShader: shaders.fragmentScreen,
				glslVersion: THREE.GLSL3,
				side: THREE.DoubleSide,
				transparent: true,
				depthWrite: true,
				depthTest: true,
			});
			shaderMaterial.name = `ScreenMonitorMaterial-${index}`;
			return shaderMaterial;
		});
		const monitors = [];
		monitors[0] = new THREE.Mesh(geometry[0], material[0]).rotateY(Math.PI / 2);
		monitors[1] = new THREE.Mesh(geometry[1], material[1]).rotateX(
			-Math.PI / 2,
		);
		monitors[2] = new THREE.Mesh(geometry[2], material[2]);

		const planes = [
			new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
			new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
			new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
		];

		screen.userData.planes = planes;
		screen.userData.monitors = monitors;

		screen.userData.monitors.forEach((monitor, i) => {
			monitor.matrixAutoUpdate = false;
			monitor.updateMatrix();

			const normal = new THREE.Vector3(0, 0, 1);
			monitor.userData.plane = new THREE.Plane(normal, 0).applyMatrix4(
				monitor.matrix,
			);
			monitor.userData.plane0 = new THREE.Plane().copy(monitor.userData.plane);
			monitor.userData.index = i;

			screen.add(monitor);
		});

		this.setupAxis();
		this.setupCenter();
	}

	setupAxis() {
		const { screen, volume, shared } = this.app;

		screen.userData.monitors.forEach((monitor, i) => {
			const direction = [shared.axes.x, shared.axes.y, shared.axes.z][
				i
			].clone();
			const color = [shared.colors.x, shared.colors.y, shared.colors.z][
				i
			].clone();
			const length = volume.userData.size.length();
			const origin = direction
				.clone()
				.negate()
				.multiplyScalar(0.5 * length);
			const axis = new THREE.ArrowHelper(direction, origin, length, color);

			axis.matrixAutoUpdate = false;
			axis.userData.points = [];
			axis.userData.ray = new THREE.Ray(origin, direction);
			axis.userData.ray0 = axis.userData.ray.clone();

			monitor.userData.axis = axis;
			screen.add(axis);
		});
	}

	setupCenter() {
		const radius = 0.05 * this.app.volume.userData.size.length();
		const geometry = new THREE.OctahedronGeometry(radius, 10);
		const material = new THREE.MeshBasicMaterial({
			color: 0xffff00,
			side: THREE.DoubleSide,
			visible: false,
			transparent: true,
			opacity: 0.4,
			depthTest: true,
			depthWrite: true,
		});

		const center = new THREE.Mesh(geometry, material);
		center.renderOrder = 1;
		this.app.screen.add(center);
		this.app.screen.userData.center = center;
	}

	update() {
		const origin = this.app.screen.getWorldPosition(new THREE.Vector3());

		this.app.screen.userData.planes.forEach((plane, i) => {
			const normal = this.app.screen.userData.monitors[i].getWorldDirection(
				new THREE.Vector3(),
			);
			plane.setFromNormalAndCoplanarPoint(normal, origin);

			const monitor = this.app.screen.userData.monitors[i];
			monitor.userData.plane
				.copy(monitor.userData.plane0)
				.applyMatrix4(this.app.screen.matrix);
		});

		this.updateAxis();
	}

	updateAxis() {
		for (const monitor of this.app.screen.userData.monitors) {
			const axis = monitor.userData.axis;
			axis.userData.ray
				.copy(axis.userData.ray0)
				.applyMatrix4(this.app.screen.matrixWorld);

			const intersections = this.app.containerManager.intersect(
				axis.userData.ray,
			);
			axis.visible = intersections.length === 2;

			if (intersections.length !== 2) {
				continue;
			}

			axis.userData.points = intersections.map((intersection) =>
				this.app.screen.worldToLocal(intersection.point),
			);
			axis.position.copy(axis.userData.points[0]);
			axis.setLength(
				axis.userData.points[0].distanceTo(axis.userData.points[1]),
				0.02,
				0.01,
			);
			axis.updateMatrix();
		}
	}

	intersect(rayOrOrigin, direction) {
		const { raycaster, screen, container } = this.app;

		if (rayOrOrigin instanceof THREE.Ray && direction === undefined) {
			raycaster.set(rayOrOrigin.origin, rayOrOrigin.direction);
		} else {
			raycaster.set(rayOrOrigin, direction);
		}

		let intersections = [];

		for (const monitor of screen.userData.monitors) {
			intersections.push(raycaster.intersectObject(monitor, false)[0]);
		}

		intersections.sort((a, b) => a.distance - b.distance);
		intersections = intersections.filter((intersection) => {
			return (
				intersection && container.userData.obb.containsPoint(intersection.point)
			);
		});

		return intersections;
	}

	intersectsCenter(rayOrOrigin, direction) {
		const { raycaster, screen } = this.app;

		if (rayOrOrigin instanceof THREE.Ray && direction === undefined) {
			raycaster.set(rayOrOrigin.origin, rayOrOrigin.direction);
		} else {
			raycaster.set(rayOrOrigin, direction);
		}

		return raycaster.intersectObject(screen.userData.center, false).length > 0;
	}

	reset() {
		this.save();

		this.app.screen.position.copy(new THREE.Vector3());
		this.app.screen.quaternion.copy(new THREE.Quaternion());

		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.uniforms.uPlaneVisible.value = true;
		}

		this.app.displayManager.update();
	}

	save() {
		this.app.screen.updateMatrix();
		this.app.screen.userData.history.unshift({
			matrix: this.app.screen.matrix.clone(),
			visible: this.app.screen.userData.monitors.map(
				(monitor) => monitor.material.uniforms.uPlaneVisible.value,
			),
		});
	}

	undo() {
		this.app.screen.updateMatrix();
		this.app.screen.userData.future.unshift({
			matrix: this.app.screen.matrix.clone(),
			visible: this.app.screen.userData.monitors.map(
				(monitor) => monitor.material.uniforms.uPlaneVisible.value,
			),
		});

		if (this.app.screen.userData.history.length === 0) {
			return;
		}

		const record = this.app.screen.userData.history.shift();
		this.app.screen.matrix.copy(record.matrix);
		this.app.screen.matrix.decompose(
			this.app.screen.position,
			this.app.screen.quaternion,
			this.app.screen.scale,
		);

		this.app.screen.userData.monitors.forEach((monitor, i) => {
			monitor.material.uniforms.uPlaneVisible.value = record.visible[i];
		});

		this.app.displayManager.update();
	}

	redo() {
		this.app.screen.updateMatrix();
		this.app.screen.userData.history.unshift({
			matrix: this.app.screen.matrix.clone(),
			visible: this.app.screen.userData.monitors.map(
				(monitor) => monitor.material.uniforms.uPlaneVisible.value,
			),
		});

		if (this.app.screen.userData.future.length === 0) {
			return;
		}

		const record = this.app.screen.userData.future.shift();
		this.app.screen.matrix.copy(record.matrix);
		this.app.screen.matrix.decompose(
			this.app.screen.position,
			this.app.screen.quaternion,
			this.app.screen.scale,
		);

		this.app.screen.userData.monitors.forEach((monitor, i) => {
			monitor.material.uniforms.uPlaneVisible.value = record.visible[i];
		});

		this.app.displayManager.update();
	}

	setupUniforms() {
		this.setupUniformsGeneric();
		this.setupUniformsVolume();
		this.setupUniformsMask();
		this.setupUniformsPlanes();
		this.setupUniformsBrush();
		this.setupUniformsSelector();
		this.setupUniformsAxis();
	}

	setupUniformsGeneric() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.needsUpdate = true;
			monitor.material.uniforms.uBrightness = { value: 0.0 };
			monitor.material.uniforms.uContrast = { value: 1.2 };
			monitor.material.uniforms.uNormalize = { value: new THREE.Matrix4() };
		}
	}

	setupUniformsVolume() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.needsUpdate = true;
			monitor.material.uniforms.uVolumeSize = {
				value: this.app.volume.userData.size,
			};
			monitor.material.uniforms.uVolumeMap = {
				value: this.app.volume.userData.texture,
			};
		}
	}

	setupUniformsMask() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.needsUpdate = true;
			monitor.material.uniforms.uMaskSize = {
				value: this.app.mask.userData.size,
			};
			monitor.material.uniforms.uMaskMap = {
				value: this.app.mask.userData.texture,
			};
		}
	}

	setupUniformsPlanes() {
		this.app.screen.userData.monitors.forEach((monitor, i) => {
			monitor.material.uniforms.uPlaneIndex = { value: i };
			monitor.material.uniforms.uPlaneNormal = {
				value: [0, 1, 2].map(() => new THREE.Vector3()),
			};
			monitor.material.uniforms.uPlaneOrigin = { value: new THREE.Vector3() };
			monitor.material.uniforms.uPlaneVisible = { value: true };
			monitor.material.uniforms.uPlaneAlpha = { value: 1.0 };
		});
	}

	setupUniformsSelector() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.uniforms.uSelectorColor = {
				value: this.app.selector3D.material.color,
			};
			monitor.material.uniforms.uSelectorOpacity = {
				value: this.app.selector3D.material.opacity,
			};
			monitor.material.uniforms.uSelectorVisible = { value: false };
			monitor.material.uniforms.uSelectorSize = { value: new THREE.Vector3() };
			monitor.material.uniforms.uSelectorCenter = {
				value: new THREE.Vector3(),
			};
		}
	}

	setupUniformsBrush() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.uniforms.uBrushVisible = { value: false };
			monitor.material.uniforms.uBrushColor = { value: new THREE.Vector3() };
			monitor.material.uniforms.uBrushRadius = { value: 0 };
			monitor.material.uniforms.uBrushCenter = { value: new THREE.Vector3() };
		}
	}

	setupUniformsAxis() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.uniforms.uAxisVisible = { value: true };
		}
	}

	updateUniforms() {
		this.updateUniformsGeneric();
		this.updateUniformsMask();
		this.updateUniformsPlanes();
		this.updateUniformsBrush();
		this.updateUniformsSelector();
	}

	updateUniformsGeneric() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.uniforms.uNormalize.value.copy(
				this.app.display.userData.uNormalize,
			);
		}
	}

	updateUniformsMask() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.needsUpdate = true;
			monitor.material.uniforms.uMaskMap.value = this.app.mask.userData.texture;
		}
	}

	updateUniformsSelector() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.uniforms.uSelectorVisible.value =
				this.app.selector3D.visible;
			monitor.material.uniforms.uSelectorSize.value
				.copy(this.app.selector3D.scale)
				.divide(this.app.volume.userData.size);
			monitor.material.uniforms.uSelectorCenter.value
				.copy(this.app.selector3D.position)
				.divide(this.app.volume.userData.size);
		}
	}

	updateUniformsBrush() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.uniforms.uBrushVisible.value = this.app.brush.visible;
			monitor.material.uniforms.uBrushColor.value.setFromColor(
				this.app.brush.material.color,
			);
			monitor.material.uniforms.uBrushRadius.value =
				this.app.brush.userData.sphere.radius *
				this.app.display.getWorldScale(this.app.shared.scale).x;
			this.app.brush.getWorldPosition(
				monitor.material.uniforms.uBrushCenter.value,
			);
		}
	}

	updateUniformsPlanes() {
		for (const monitor of this.app.screen.userData.monitors) {
			monitor.material.uniforms.uPlaneNormal.value.forEach((value, i) =>
				value.copy(this.app.display.userData.uPlaneNormal[i]),
			);
			monitor.material.uniforms.uPlaneOrigin.value.copy(
				this.app.display.userData.uPlaneOrigin,
			);
		}
	}
}
