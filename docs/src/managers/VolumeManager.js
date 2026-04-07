import * as THREE from "three";

export class VolumeManager {
	constructor(app) {
		this.app = app;
	}

	setupObject() {
		this.app.volume = { userData: {} };
		this.app.volume.userData.data0 = new Uint8Array();
		this.app.volume.userData.texture = new THREE.Data3DTexture();
		this.app.volume.userData.size = new THREE.Vector3();
		this.app.volume.userData.samples = new THREE.Vector3();
		this.app.volume.userData.voxelSize = new THREE.Vector3();
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

		this.app.volume.userData.image3D = image3D;
		this.app.volume.userData.data0 = image3D.getData();
		this.app.volume.userData.texture = texture;
		this.app.volume.userData.samples = samples;
		this.app.volume.userData.voxelSize = voxelSize;
		this.app.volume.userData.size = size;
	}

	updateFromMask() {
		const image3D = this.app.mask.userData.image3D.clone();
		const data = image3D.getDataUint8().fill(0);

		const size = this.app.mask.userData.size.clone();
		const samples = this.app.mask.userData.samples.clone();
		const voxelSize = this.app.mask.userData.voxelSize.clone();

		const texture = new THREE.Data3DTexture(data, ...samples.toArray());
		texture.format = THREE.RedFormat;
		texture.type = THREE.UnsignedByteType;
		texture.minFilter = THREE.NearestFilter;
		texture.magFilter = THREE.NearestFilter;
		texture.unpackAlignment = 1;
		texture.needsUpdate = true;

		this.app.volume.userData.image3D = image3D;
		this.app.volume.userData.data0 = data;
		this.app.volume.userData.texture = texture;
		this.app.volume.userData.samples = samples;
		this.app.volume.userData.voxelSize = voxelSize;
		this.app.volume.userData.size = size;
	}
}
