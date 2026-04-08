import * as THREE from "three";
import { OBB } from "three/addons/math/OBB.js";

export class Selector3DManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		const { selector3D, volume } = this.app;

		selector3D.clear();
		selector3D.geometry = new THREE.BoxGeometry(1, 1, 1);
		selector3D.material = new THREE.MeshBasicMaterial({
			color: 0x0055ff,
			side: THREE.DoubleSide,
			visible: true,
			transparent: true,
			opacity: 0.1,
		});

		selector3D.geometry.computeBoundingBox();
		selector3D.userData.pointLength =
			new THREE.Vector3(1, 1, 1).length() * 0.04;
		selector3D.userData.pointScalar = 2;
		selector3D.userData.history = [];
		selector3D.userData.future = [];

		this.setupOutline();
		this.setupObb();
		this.setupVertices();
		this.setupFaces();

		selector3D.scale.copy(volume.userData.size);
		selector3D.updateMatrix();
	}

	setupOutline() {
		this.app.selector3D.userData.outline = new THREE.Box3Helper(
			this.app.selector3D.geometry.boundingBox,
			this.app.selector3D.material.color,
		);
		this.app.selector3D.add(this.app.selector3D.userData.outline);
	}

	setupObb() {
		this.app.selector3D.userData.obb = new OBB().fromBox3(
			this.app.selector3D.geometry.boundingBox,
		);
		this.app.selector3D.userData.obb0 =
			this.app.selector3D.userData.obb.clone();
	}

	setupVertices() {
		const { selector3D } = this.app;
		const halfSize = new THREE.Vector3(
			selector3D.geometry.parameters.width,
			selector3D.geometry.parameters.height,
			selector3D.geometry.parameters.depth,
		).divideScalar(2);
		const positions = [
			new THREE.Vector3(halfSize.x, halfSize.y, halfSize.z),
			new THREE.Vector3(halfSize.x, halfSize.y, -halfSize.z),
			new THREE.Vector3(halfSize.x, -halfSize.y, halfSize.z),
			new THREE.Vector3(halfSize.x, -halfSize.y, -halfSize.z),
			new THREE.Vector3(-halfSize.x, halfSize.y, halfSize.z),
			new THREE.Vector3(-halfSize.x, halfSize.y, -halfSize.z),
			new THREE.Vector3(-halfSize.x, -halfSize.y, halfSize.z),
			new THREE.Vector3(-halfSize.x, -halfSize.y, -halfSize.z),
		];
		const size = new THREE.Vector3().addScalar(selector3D.userData.pointLength);
		const radiusExpand =
			((2 * selector3D.userData.pointLength) / 3) *
			selector3D.userData.pointScalar;
		const geometry = new THREE.BoxGeometry(...size.toArray());
		const material = new THREE.MeshBasicMaterial({
			color: 0x0055ff,
			side: THREE.DoubleSide,
			visible: true,
			transparent: true,
			opacity: 0.5,
			depthTest: true,
			depthWrite: false,
		});

		selector3D.userData.vertices = new Array(positions.length).fill();

		for (let i = 0; i < positions.length; i++) {
			selector3D.userData.vertices[i] = new THREE.Mesh(geometry, material);
			selector3D.userData.vertices[i].position.copy(positions[i]);
			selector3D.userData.vertices[i].matrixAutoUpdate = false;
			selector3D.userData.vertices[i].renderOrder =
				selector3D.renderOrder - 0.5;
			selector3D.userData.vertices[i].userData.sphere = new THREE.Sphere(
				new THREE.Vector3(),
				radiusExpand,
			);
			selector3D.userData.vertices[i].userData.sphere0 =
				selector3D.userData.vertices[i].userData.sphere.clone();
			selector3D.add(selector3D.userData.vertices[i]);
		}
	}

	setupFaces() {
		const { selector3D } = this.app;
		const halfSize = new THREE.Vector3(
			selector3D.geometry.parameters.width,
			selector3D.geometry.parameters.height,
			selector3D.geometry.parameters.depth,
		).divideScalar(2);
		const positions = [
			new THREE.Vector3(halfSize.x, 0, 0),
			new THREE.Vector3(-halfSize.x, 0, 0),
			new THREE.Vector3(0, halfSize.y, 0),
			new THREE.Vector3(0, -halfSize.y, 0),
			new THREE.Vector3(0, 0, halfSize.z),
			new THREE.Vector3(0, 0, -halfSize.z),
		];
		const radius = (2 * selector3D.userData.pointLength) / 3;
		const radiusExpand = radius * selector3D.userData.pointScalar;
		const geometry = new THREE.SphereGeometry(radius);
		const material = new THREE.MeshBasicMaterial({
			color: 0xffff55,
			side: THREE.DoubleSide,
			visible: true,
			transparent: true,
			opacity: 0.5,
			depthTest: false,
			depthWrite: false,
		});

		selector3D.userData.faces = new Array(positions.length).fill();

		for (let i = 0; i < positions.length; i++) {
			selector3D.userData.faces[i] = new THREE.Mesh(geometry, material);
			selector3D.userData.faces[i].position.copy(positions[i]);
			selector3D.userData.faces[i].matrixAutoUpdate = false;
			selector3D.userData.faces[i].renderOrder = selector3D.renderOrder - 0.5;
			selector3D.userData.faces[i].userData.sphere = new THREE.Sphere(
				new THREE.Vector3(),
				radiusExpand,
			);
			selector3D.userData.faces[i].userData.sphere0 =
				selector3D.userData.faces[i].userData.sphere.clone();
			selector3D.add(selector3D.userData.faces[i]);
		}
	}

	update() {
		this.updateObb();
		this.updateVertices();
		this.updateFaces();
	}

	updateObb() {
		this.app.selector3D.userData.obb
			.copy(this.app.selector3D.userData.obb0)
			.applyMatrix4(this.app.selector3D.matrixWorld);
	}

	updateVertices() {
		for (let i = 0; i < this.app.selector3D.userData.vertices.length; i++) {
			const vertex = this.app.selector3D.userData.vertices[i];

			vertex.scale
				.set(1, 1, 1)
				.divide(this.app.selector3D.scale)
				.multiplyScalar(
					(this.app.selector3D.scale.x +
						this.app.selector3D.scale.y +
						this.app.selector3D.scale.z) /
						3,
				);
			vertex.updateMatrix();
			vertex.userData.sphere
				.copy(vertex.userData.sphere0)
				.applyMatrix4(vertex.matrixWorld);
		}
	}

	updateFaces() {
		for (let i = 0; i < this.app.selector3D.userData.faces.length; i++) {
			const face = this.app.selector3D.userData.faces[i];

			face.scale
				.set(1, 1, 1)
				.divide(this.app.selector3D.scale)
				.multiplyScalar(
					(this.app.selector3D.scale.x +
						this.app.selector3D.scale.y +
						this.app.selector3D.scale.z) /
						3,
				);
			face.updateMatrix();
			face.userData.sphere
				.copy(face.userData.sphere0)
				.applyMatrix4(face.matrixWorld);
		}
	}

	intersectObb(rayOrOrigin, direction) {
		const { raycaster, selector3D } = this.app;

		if (rayOrOrigin instanceof THREE.Ray && direction === undefined) {
			raycaster.set(rayOrOrigin.origin, rayOrOrigin.direction);
		} else {
			raycaster.set(rayOrOrigin, direction);
		}

		let intersections = raycaster.intersectObject(selector3D, false);
		intersections = intersections.filter((intersection0, i) => {
			return !intersections.slice(i + 1).some((intersection1) => {
				return Math.abs(intersection1.distance - intersection0.distance) < 1e-6;
			});
		});

		return intersections;
	}

	intersectVertices(rayOrOrigin, direction) {
		const { raycaster, selector3D } = this.app;

		if (rayOrOrigin instanceof THREE.Ray && direction === undefined) {
			raycaster.set(rayOrOrigin.origin, rayOrOrigin.direction);
		} else {
			raycaster.set(rayOrOrigin, direction);
		}

		let indices = [];
		const points = [];

		for (let i = 0; i < selector3D.userData.vertices.length; i++) {
			const vertex = selector3D.userData.vertices[i];
			points.push(
				raycaster.ray.intersectSphere(
					vertex.userData.sphere,
					new THREE.Vector3(),
				),
			);
			indices.push(i);
		}

		indices = indices.filter((i) => points[i] instanceof THREE.Vector3);

		const distance = [];
		for (let i = 0; i < indices.length; i++) {
			const n = indices[i];
			distance.push(points[n].distanceTo(raycaster.ray.origin));
		}

		indices.sort((i, j) => distance[i] - distance[j]);

		const intersections = [];
		for (let i = 0; i < indices.length; i++) {
			const n = indices[i];
			intersections.push({
				object: selector3D.userData.vertices[n],
				point: points[n],
				distance: distance[n],
			});
		}

		return intersections;
	}

	intersectFaces(rayOrOrigin, direction) {
		const { raycaster, selector3D } = this.app;

		if (rayOrOrigin instanceof THREE.Ray && direction === undefined) {
			raycaster.set(rayOrOrigin.origin, rayOrOrigin.direction);
		} else {
			raycaster.set(rayOrOrigin, direction);
		}

		let indices = [];
		const points = [];

		for (let i = 0; i < selector3D.userData.faces.length; i++) {
			const face = selector3D.userData.faces[i];
			points.push(
				raycaster.ray.intersectSphere(
					face.userData.sphere,
					new THREE.Vector3(),
				),
			);
			indices.push(i);
		}

		indices = indices.filter((i) => points[i] instanceof THREE.Vector3);

		const distance = [];
		for (let i = 0; i < indices.length; i++) {
			const n = indices[i];
			distance.push(points[n].distanceTo(raycaster.ray.origin));
		}

		indices.sort((i, j) => distance[i] - distance[j]);

		const intersections = [];
		for (let i = 0; i < indices.length; i++) {
			const n = indices[i];
			intersections.push({
				object: selector3D.userData.faces[n],
				point: points[n],
				distance: distance[n],
			});
		}

		return intersections;
	}

	intersects(rayOrOrigin, direction) {
		if (this.intersectVertices(rayOrOrigin, direction).length > 0) {
			return "vertex";
		}

		if (this.intersectFaces(rayOrOrigin, direction).length > 0) {
			return "face";
		}

		if (this.intersectObb(rayOrOrigin, direction).length > 0) {
			return "obb";
		}

		return false;
	}

	reset() {
		this.save();
		this.app.selector3D.position.set(0, 0, 0);
		this.app.selector3D.scale.copy(this.app.volume.userData.size);
		this.app.selector3D.updateMatrix();
		this.update();
	}

	save() {
		this.app.selector3D.updateMatrix();
		this.app.selector3D.userData.history.unshift({
			matrix: this.app.selector3D.matrix.clone(),
		});
	}

	undo() {
		this.app.selector3D.updateMatrix();
		this.app.selector3D.userData.future.unshift({
			matrix: this.app.selector3D.matrix.clone(),
		});

		if (this.app.selector3D.userData.history.length === 0) {
			return;
		}

		this.app.selector3D.matrix.copy(
			this.app.selector3D.userData.history.shift().matrix,
		);
		this.app.selector3D.matrix.decompose(
			this.app.selector3D.position,
			this.app.selector3D.quaternion,
			this.app.selector3D.scale,
		);
		this.update();
	}

	redo() {
		this.app.selector3D.updateMatrix();
		this.app.selector3D.userData.history.unshift({
			matrix: this.app.selector3D.matrix.clone(),
		});

		if (this.app.selector3D.userData.future.length === 0) {
			return;
		}

		this.app.selector3D.matrix.copy(
			this.app.selector3D.userData.future.shift().matrix,
		);
		this.app.selector3D.matrix.decompose(
			this.app.selector3D.position,
			this.app.selector3D.quaternion,
			this.app.selector3D.scale,
		);
		this.update();
	}
}
