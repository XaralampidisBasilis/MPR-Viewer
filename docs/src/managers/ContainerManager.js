import * as THREE from "three";
import { OBB } from "three/addons/math/OBB.js";

export class ContainerManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		const { container, volume } = this.app;

		container.clear();

		const offset = 0.00001 * volume.userData.size.length();
		const size = new THREE.Vector3()
			.copy(volume.userData.size)
			.addScalar(offset);
		const geometry = new THREE.BoxGeometry(...size.toArray());
		const material = new THREE.MeshBasicMaterial({
			color: 0xff9999,
			side: THREE.DoubleSide,
			visible: true,
			transparent: true,
			opacity: 0.2,
			depthTest: true,
			depthWrite: true,
		});

		const box = new THREE.Box3().setFromCenterAndSize(
			new THREE.Vector3(),
			size,
		);
		const obb = new OBB().fromBox3(box);
		const outline = new THREE.Box3Helper(box, material.color);

		container.geometry = geometry;
		container.material = material;
		container.userData.obb = obb;
		container.userData.obb0 = new OBB().copy(obb);
		container.userData.outline = outline;
		container.add(outline);
	}

	update() {
		this.app.container.userData.obb
			.copy(this.app.container.userData.obb0)
			.applyMatrix4(this.app.container.matrixWorld);
	}

	intersect(rayOrOrigin, direction) {
		const { raycaster, container } = this.app;

		if (rayOrOrigin instanceof THREE.Ray && direction === undefined) {
			raycaster.set(rayOrOrigin.origin, rayOrOrigin.direction);
		} else {
			raycaster.set(rayOrOrigin, direction);
		}

		let intersections = raycaster.intersectObject(container, false);
		intersections = intersections.filter((result, i) => {
			return !intersections.slice(i + 1).some((candidate) => {
				return Math.abs(candidate.distance - result.distance) < 1e-6;
			});
		});

		return intersections;
	}
}
