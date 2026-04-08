import * as THREE from "three";

export class ModelManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		this.app.model.geometry = new THREE.BoxGeometry(
			...this.app.mask.userData.size.toArray(),
		);
		this.app.model.material = new THREE.ShaderMaterial({
			glslVersion: THREE.GLSL3,
			uniforms: {},
			vertexShader: this.app.shaders.vertexModel,
			fragmentShader: this.app.shaders.fragmentModel,
			side: THREE.BackSide,
			transparent: true,
			depthTest: false,
			depthWrite: true,
		});
		this.app.model.material.name = "VolumeMaskModelMaterial";

		this.computeBoundingBox();
	}

	update() {}

	computeBoundingBox() {
		const samples = this.app.mask.userData.samples;
		const voxel = this.app.mask.userData.voxelSize;
		const offset = voxel.length() * 0.01;
		const center = new THREE.Vector3()
			.copy(this.app.mask.userData.size)
			.divideScalar(2);
		const min = new THREE.Vector3();
		const max = new THREE.Vector3();
		const point = new THREE.Vector3();
		const data = this.app.mask.userData.texture.image.data;

		let n = 0;

		for (let k = 0; k < samples.z; k++) {
			const offsetK = samples.x * samples.y * k;

			for (let j = 0; j < samples.y; j++) {
				const offsetJ = samples.x * j;

				for (let i = 0; i < samples.x; i++) {
					n = i + offsetJ + offsetK;

					if (data[n] <= 0) {
						continue;
					}

					point.set(i, j, k).multiply(voxel).sub(center);
					min.x = Math.min(min.x, point.x);
					min.y = Math.min(min.y, point.y);
					min.z = Math.min(min.z, point.z);
					max.x = Math.max(max.x, point.x);
					max.y = Math.max(max.y, point.y);
					max.z = Math.max(max.z, point.z);
				}
			}
		}

		min.sub(voxel).subScalar(offset);
		max.add(voxel).addScalar(offset);
		this.app.model.userData.box = new THREE.Box3(min, max);
	}

	setupUniforms() {
		this.setupUniformsGeneric();
		this.setupUniformsMask();
		this.setupUniformsPlanes();
		this.setupUniformsBox();
	}

	setupUniformsGeneric() {
		const uniforms = this.app.model.material.uniforms;

		uniforms.uModelAlpha = { value: 1.0 };
		uniforms.uModelAlphaClip = { value: 1.0 };
		uniforms.uNormalize = { value: new THREE.Matrix4() };
		uniforms.uDeNormalize = { value: new THREE.Matrix4() };
		uniforms.uMatrix = { value: new THREE.Matrix4() };
		uniforms.uCameraPosition = { value: new THREE.Vector3() };
	}

	setupUniformsMask() {
		this.app.model.material.needsUpdate = true;
		const uniforms = this.app.model.material.uniforms;

		uniforms.uMaskSize = { value: this.app.mask.userData.size };
		uniforms.uMaskSamples = { value: this.app.mask.userData.samples };
		uniforms.uMaskVoxelSize = { value: this.app.mask.userData.voxelSize };
		uniforms.uMaskTexelSize = {
			value: this.app.utils.mapVector(
				this.app.mask.userData.samples,
				(x) => 1 / x,
			),
		};
		uniforms.uMaskResolution = {
			value: uniforms.uMaskTexelSize.value.length(),
		};
		uniforms.uMaskMap = { value: this.app.mask.userData.texture };
	}

	setupUniformsBox() {
		this.app.model.material.needsUpdate = true;
		this.app.model.material.uniforms.uBoxMin = {
			value: new THREE.Vector3().addScalar(-0.5),
		};
		this.app.model.material.uniforms.uBoxMax = {
			value: new THREE.Vector3().addScalar(0.5),
		};
	}

	setupUniformsPlanes() {
		this.app.model.material.uniforms.uPlaneHessian = {
			value: [0, 1, 2].map(() => new THREE.Vector4()),
		};
		this.app.model.material.uniforms.uPlaneVisible = {
			value: [0, 1, 2].map(() => true),
		};
		this.app.model.material.uniforms.uPlaneAlpha = {
			value: [0, 1, 2].map(() => 1.0),
		};
	}

	updateUniforms() {
		this.updateUniformsGeneric();
		this.updateUniformsMask();
		this.updateUniformsPlanes();
		this.updateUniformsBox();
	}

	updateUniformsGeneric() {
		const uniforms = this.app.model.material.uniforms;

		uniforms.uNormalize.value.copy(this.app.display.userData.uNormalize);
		uniforms.uDeNormalize.value.copy(this.app.display.userData.uDeNormalize);
		uniforms.uCameraPosition.value.copy(
			this.app.display.userData.uCameraPosition,
		);
		uniforms.uMatrix.value.copy(this.app.display.userData.uMatrix);
	}

	updateUniformsPlanes() {
		const uniforms = this.app.model.material.uniforms;

		uniforms.uPlaneHessian.value.forEach((value, i) => {
			value.copy(this.app.display.userData.uPlaneHessian[i]);
		});
		uniforms.uPlaneVisible.value.forEach((_, i, array) => {
			array[i] =
				this.app.screen.userData.monitors[
					i
				].material.uniforms.uPlaneVisible.value;
		});
		uniforms.uPlaneAlpha.value.forEach((_, i, array) => {
			array[i] =
				this.app.screen.userData.monitors[
					i
				].material.uniforms.uPlaneAlpha.value;
		});
	}

	updateUniformsMask() {
		this.app.model.material.needsUpdate = true;
		this.app.model.material.uniforms.uMaskMap.value =
			this.app.mask.userData.texture;
	}

	updateUniformsBox() {
		this.app.model.material.needsUpdate = true;
		this.app.model.material.uniforms.uBoxMin.value
			.copy(this.app.model.userData.box.min)
			.divide(this.app.mask.userData.size);
		this.app.model.material.uniforms.uBoxMax.value
			.copy(this.app.model.userData.box.max)
			.divide(this.app.mask.userData.size);
	}
}
