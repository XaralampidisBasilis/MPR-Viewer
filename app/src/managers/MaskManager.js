import * as THREE from "three";

export class MaskManager {
	constructor(app) {
		this.app = app;
	}

	setupObject() {
		this.app.mask = { userData: {} };
		this.app.mask.userData.data0 = new Uint8Array();
		this.app.mask.userData.texture = new THREE.Data3DTexture();
		this.app.mask.userData.samples = new THREE.Vector3();
		this.app.mask.userData.size = new THREE.Vector3();
		this.app.mask.userData.voxelSize = new THREE.Vector3();
		this.app.mask.userData.history = [];
		this.app.mask.userData.future = [];
	}

	update(image3D) {
		for (const dimension of image3D._metadata.dimensions) {
			dimension.step = Math.abs(dimension.step);
		}

		const samples = new THREE.Vector3().fromArray(
			image3D.getMetadata("dimensions").map((dimension) => dimension.length),
		);
		const voxelSize = new THREE.Vector3().fromArray(
			image3D
				.getMetadata("dimensions")
				.map((dimension) => dimension.step * 0.001),
		);
		const size = new THREE.Vector3().fromArray(
			image3D
				.getMetadata("dimensions")
				.map((dimension) => dimension.step * dimension.length * 0.001),
		);

		const texture = new THREE.Data3DTexture(
			image3D.getDataUint8(),
			image3D.getDimensionSize("x"),
			image3D.getDimensionSize("y"),
			image3D.getDimensionSize("z"),
		);

		texture.format = THREE.RedFormat;
		texture.type = THREE.UnsignedByteType;
		texture.minFilter = THREE.NearestFilter;
		texture.magFilter = THREE.NearestFilter;
		texture.unpackAlignment = 1;
		texture.needsUpdate = true;

		this.app.mask.userData.history = [];
		this.app.mask.userData.future = [];
		this.app.mask.userData.image3D = image3D;
		this.app.mask.userData.data0 = image3D.getDataUint8();
		this.app.mask.userData.texture = texture;
		this.app.mask.userData.samples = samples;
		this.app.mask.userData.voxelSize = voxelSize;
		this.app.mask.userData.size = size;
	}

	updateTexture(array, min, max) {
		if (array.length !== this.app.mask.userData.texture.image.data.length) {
			console.error("input array must be the same size as mask");
		}

		const samples = this.app.mask.userData.samples;

		for (let k = min.z; k <= max.z; k++) {
			const offsetK = samples.x * samples.y * k;

			for (let j = min.y; j <= max.y; j++) {
				const offsetJ = samples.x * j;

				for (let i = min.x; i <= max.x; i++) {
					const n = i + offsetJ + offsetK;
					this.app.mask.userData.texture.image.data[n] = array[n];
				}
			}
		}

		this.app.mask.userData.texture.needsUpdate = true;
	}

	updateTextureFromValues(values, indices) {
		for (let n = 0; n < indices.length; n++) {
			this.app.mask.userData.texture.image.data[indices[n]] = values[n];
		}

		this.app.screenManager.updateUniformsMask();
		this.app.modelManager.updateUniformsMask();
		this.app.modelManager.computeBoundingBox();
		this.app.modelManager.updateUniformsBox();
		this.app.mask.userData.texture.needsUpdate = true;
	}

	updateFromVolume() {
		const image3D = this.app.volume.userData.image3D.clone();
		image3D.resetData(0);
		image3D._metadata.statistics.min = 0;
		image3D._metadata.statistics.max = 0;

		const data = image3D.getDataUint8();
		const size = this.app.volume.userData.size.clone();
		const samples = this.app.volume.userData.samples.clone();
		const voxelSize = this.app.volume.userData.voxelSize.clone();

		const texture = new THREE.Data3DTexture(data, ...samples.toArray());
		texture.format = THREE.RedFormat;
		texture.type = THREE.UnsignedByteType;
		texture.minFilter = THREE.NearestFilter;
		texture.magFilter = THREE.NearestFilter;
		texture.unpackAlignment = 1;
		texture.needsUpdate = true;

		this.app.mask.userData.history = [];
		this.app.mask.userData.future = [];
		this.app.mask.userData.image3D = image3D;
		this.app.mask.userData.data0 = image3D.getData();
		this.app.mask.userData.texture = texture;
		this.app.mask.userData.samples = samples;
		this.app.mask.userData.voxelSize = voxelSize;
		this.app.mask.userData.size = size;
	}

	reset() {
		for (let i = 0; i < this.app.mask.userData.data0.length; i++) {
			this.app.mask.userData.texture.image.data[i] =
				this.app.mask.userData.data0[i];
		}

		this.app.mask.userData.texture.needsUpdate = true;
		this.app.modelManager.updateUniformsMask();
		this.app.screenManager.updateUniformsMask();
		this.app.modelManager.computeBoundingBox();
		this.app.modelManager.updateUniformsBox();
		this.app.displayManager.update();
	}

	undo() {
		if (this.app.mask.userData.history.length === 0) {
			return;
		}

		this.app.modelManager.update();

		const recordPrevious = this.app.mask.userData.history.shift();
		const recordCurrent = {
			indices: [...recordPrevious.indices],
			data: [],
			box: this.app.model.userData.box.clone(),
		};

		for (let i = 0; i < recordPrevious.indices.length; i++) {
			const n = recordPrevious.indices[i];
			recordCurrent.data.push(this.app.mask.userData.texture.image.data[n]);
			this.app.mask.userData.texture.image.data[n] = recordPrevious.data[i];
		}

		this.app.mask.userData.future.unshift(recordCurrent);
		this.app.mask.userData.texture.needsUpdate = true;
		this.app.model.userData.box.copy(recordPrevious.box);

		this.app.modelManager.updateUniformsBox();
		this.app.modelManager.updateUniformsMask();
		this.app.screenManager.updateUniformsMask();
		this.app.modelManager.update();
		this.app.screenManager.update();
	}

	redo() {
		if (this.app.mask.userData.future.length === 0) {
			return;
		}

		this.app.modelManager.update();

		const recordNext = this.app.mask.userData.future.shift();
		const recordCurrent = {
			indices: [...recordNext.indices],
			data: [],
			box: this.app.model.userData.box.clone(),
		};

		for (let i = 0; i < recordNext.indices.length; i++) {
			const n = recordNext.indices[i];
			recordCurrent.data.push(this.app.mask.userData.texture.image.data[n]);
			this.app.mask.userData.texture.image.data[n] = recordNext.data[i];
		}

		this.app.mask.userData.history.unshift(recordCurrent);
		this.app.mask.userData.texture.needsUpdate = true;
		this.app.model.userData.box.copy(recordNext.box);

		this.app.modelManager.updateUniforms();
		this.app.screenManager.updateUniforms();
	}
}
