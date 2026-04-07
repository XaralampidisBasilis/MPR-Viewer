import * as THREE from "three";

export class BrushManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		const { brush, mask } = this.app;
		const radius = 0.01;
		const sphere = new THREE.Sphere(new THREE.Vector3(), radius);
		const geometry = new THREE.SphereGeometry(radius);
		const material = new THREE.MeshBasicMaterial({
			color: 0xff0055,
			depthTest: true,
			depthWrite: true,
			transparent: true,
			opacity: 0.4,
		});

		brush.geometry = geometry;
		brush.material = material;
		brush.userData.mode = "ADD";
		brush.userData.plane = new THREE.Plane();
		brush.userData.sphere = sphere;
		brush.userData.sphere0 = sphere.clone();
		brush.userData.box = sphere
			.getBoundingBox(new THREE.Box3())
			.expandByVector(mask.userData.voxelSize);
		brush.userData.box0 = brush.userData.box.clone();
	}

	update() {
		const { brush } = this.app;
		brush.userData.sphere
			.copy(brush.userData.sphere0)
			.applyMatrix4(brush.matrix);
		brush.userData.box.copy(brush.userData.box0).applyMatrix4(brush.matrix);
		this.projectOnScreen();
	}

	projectOnScreen() {
		const intersections = this.app.screenManager.intersect(
			this.app.getViewRay(),
		);
		const selected = intersections.filter((intersection) => {
			return (
				intersection.object.material.uniforms.uPlaneVisible.value &&
				intersection.object.visible
			);
		})[0];

		this.app.brush.userData.monitorIndex = undefined;

		if (selected) {
			this.app.brush.userData.monitorIndex = selected.object.userData.index;
			this.app.brush.userData.plane.copy(selected.object.userData.plane);
			this.app.brush.position.copy(
				this.app.display.worldToLocal(selected.point),
			);
			this.app.brush.updateMatrix();
			this.app.displayManager.updateUI();
		} else {
			this.app.brush.position.setScalar(1e6);
		}
	}
}
