import * as THREE from "three";
import * as nifti from "nifti-reader-js";
import { OBB } from "three/addons/math/OBB.js";
import * as PIXPIPE from "../vendor/pixpipe.esmodule.js";

export class AppUtils {
	constructor(app) {
		this.app = app;
	}

	loadNIFTI(file) {
		return new Promise((resolve, reject) => {
			if (!file) {
				reject(new Error("No file selected"));
				return;
			}

			try {
				const reader = new PIXPIPE.FileToArrayBufferReader();
				reader.on("ready", function () {
					try {
						const decoder = new PIXPIPE.Image3DGenericDecoder();
						const output = this.getOutput();
						decoder.addInput(output);
						decoder.update();

						const image3D = decoder.getOutput();
						if (!image3D) {
							reject(new Error(`File cannot be decoded: ${file.name}`));
							return;
						}

						resolve(image3D);
					} catch (error) {
						reject(error);
					}
				});

				reader.addInput(file);
				reader.update();
			} catch (error) {
				reject(error);
			}
		});
	}

	loadRawNIFTI(file) {
		return new Promise((resolve, reject) => {
			if (!file) {
				reject(new Error("No file selected"));
				return;
			}

			const fileReader = new FileReader();
			fileReader.onerror = () => {
				reject(new Error(`Failed to read file: ${file.name}`));
			};
			fileReader.readAsArrayBuffer(file);

			fileReader.onloadend = (event) => {
				if (event.target?.readyState !== FileReader.DONE) {
					return;
				}

				try {
					const rawBuffer = event.target.result;
					const result = nifti.isCompressed(rawBuffer)
						? nifti.decompress(rawBuffer)
						: rawBuffer;
					resolve(result);
				} catch (error) {
					reject(error);
				}
			};
		});
	}

	async loadBundledFile(url, fileName) {
		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(
				`Failed to load bundled file: ${fileName} (${response.status})`,
			);
		}

		const blob = await response.blob();
		return new File([blob], fileName, {
			type: blob.type || "application/octet-stream",
		});
	}

	getTypedArrayMax(array) {
		let maxValue = 0;

		for (const value of array) {
			if (value > maxValue) {
				maxValue = value;
			}
		}

		return maxValue;
	}

	getMaskDownloadFileName(maskFileName, volumeFileName) {
		const templateName = maskFileName || volumeFileName || "mask";
		const baseName = templateName.replace(/\.nii(\.gz)?$/iu, "");

		if (maskFileName) {
			return `${baseName}-edited.nii`;
		}

		if (volumeFileName) {
			return `${baseName}-mask.nii`;
		}

		return "mask-edited.nii";
	}

	buildMaskDownloadBuffer({ imageData, image3D, templateRaw }) {
		const data =
			imageData instanceof Uint8Array
				? imageData
				: new Uint8Array(
						imageData.buffer,
						imageData.byteOffset,
						imageData.byteLength,
					);

		if (templateRaw && nifti.isNIFTI(templateRaw)) {
			return this.buildNiftiBufferFromTemplate(templateRaw, data);
		}

		return this.buildMinimalMaskNiftiBuffer(image3D, data);
	}

	buildNiftiBufferFromTemplate(templateRaw, imageData) {
		const header = nifti.readHeader(templateRaw);

		if (!header) {
			throw new Error("Unable to read the NIfTI header used for export");
		}

		const voxOffset = Math.max(
			Math.round(header.vox_offset),
			header instanceof nifti.NIFTI2 ? 544 : 352,
		);
		const output = new Uint8Array(voxOffset + imageData.byteLength);
		const prefixLength = Math.min(voxOffset, templateRaw.byteLength);

		output.set(new Uint8Array(templateRaw, 0, prefixLength));

		const view = new DataView(output.buffer);
		const littleEndian = header.littleEndian;
		const maxValue = this.getTypedArrayMax(imageData);

		if (header instanceof nifti.NIFTI2) {
			view.setInt16(12, nifti.NIFTI2.TYPE_UINT8, littleEndian);
			view.setInt16(14, 8, littleEndian);
			view.setFloat64(176, 1, littleEndian);
			view.setFloat64(184, 0, littleEndian);
			view.setFloat64(192, maxValue, littleEndian);
			view.setFloat64(200, 0, littleEndian);
		} else {
			view.setInt16(70, nifti.NIFTI1.TYPE_UINT8, littleEndian);
			view.setInt16(72, 8, littleEndian);
			view.setFloat32(112, 1, littleEndian);
			view.setFloat32(116, 0, littleEndian);
			view.setFloat32(124, maxValue, littleEndian);
			view.setFloat32(128, 0, littleEndian);
		}

		output.set(imageData, voxOffset);

		return output.buffer;
	}

	buildMinimalMaskNiftiBuffer(image3D, imageData) {
		if (!image3D) {
			throw new Error("No mask metadata is available for export");
		}

		const dimensions = image3D.getMetadata("dimensions");
		const getDimension = (axis) =>
			dimensions[image3D.getDimensionIndexFromName(axis)];
		const xDimension = getDimension("x");
		const yDimension = getDimension("y");
		const zDimension = getDimension("z");
		const voxOffset = 352;
		const buffer = new ArrayBuffer(voxOffset + imageData.byteLength);
		const bytes = new Uint8Array(buffer);
		const view = new DataView(buffer);
		const maxValue = this.getTypedArrayMax(imageData);
		const encoder = new TextEncoder();
		const xStep = Math.abs(xDimension?.step || 1);
		const yStep = Math.abs(yDimension?.step || 1);
		const zStep = Math.abs(zDimension?.step || 1);

		view.setInt32(0, 348, true);
		view.setUint8(39, 0);
		view.setInt16(40, 3, true);
		view.setInt16(42, image3D.getDimensionSize("x"), true);
		view.setInt16(44, image3D.getDimensionSize("y"), true);
		view.setInt16(46, image3D.getDimensionSize("z"), true);
		view.setInt16(48, 1, true);
		view.setInt16(50, 1, true);
		view.setInt16(52, 1, true);
		view.setInt16(54, 1, true);
		view.setInt16(70, nifti.NIFTI1.TYPE_UINT8, true);
		view.setInt16(72, 8, true);
		view.setFloat32(76, 1, true);
		view.setFloat32(80, xStep, true);
		view.setFloat32(84, yStep, true);
		view.setFloat32(88, zStep, true);
		view.setFloat32(92, 1, true);
		view.setFloat32(108, voxOffset, true);
		view.setFloat32(112, 1, true);
		view.setFloat32(116, 0, true);
		view.setUint8(123, 2);
		view.setFloat32(124, maxValue, true);
		view.setFloat32(128, 0, true);
		view.setInt16(252, 1, true);
		view.setInt16(254, 1, true);
		view.setFloat32(280, xStep, true);
		view.setFloat32(296, yStep, true);
		view.setFloat32(312, zStep, true);
		bytes.set(encoder.encode("mask"), 148);
		bytes.set(Uint8Array.from([0, 0, 0, 0]), 348);
		bytes.set(Uint8Array.from([0x6e, 0x2b, 0x31, 0x00]), 344);
		bytes.set(imageData, voxOffset);

		return buffer;
	}

	saveData(data, fileName) {
		const blob = new Blob(data, { type: "application/octet-stream" });
		const url = window.URL.createObjectURL(blob);
		const element = this.createTemporaryDownloadLink(url, fileName);

		element.click();

		window.URL.revokeObjectURL(url);
		document.body.removeChild(element);
	}

	downloadURI(uri, name) {
		const element = this.createTemporaryDownloadLink(uri, name);
		element.click();

		if (uri.startsWith("blob:")) {
			window.URL.revokeObjectURL(uri);
		}

		document.body.removeChild(element);
	}

	createTemporaryDownloadLink(href, download) {
		const element = document.createElement("a");
		element.href = href;
		element.download = download;
		element.style.display = "none";
		document.body.appendChild(element);
		return element;
	}

	projectBoxOnPlane(box, plane) {
		const { points, box: scratchBox } = this.app.shared;

		points[0].set(box.min.x, box.min.y, box.min.z);
		points[1].set(box.max.x, box.min.y, box.min.z);
		points[2].set(box.min.x, box.max.y, box.min.z);
		points[3].set(box.max.x, box.max.y, box.min.z);
		points[4].set(box.min.x, box.min.y, box.max.z);
		points[5].set(box.max.x, box.min.y, box.max.z);
		points[6].set(box.min.x, box.max.y, box.max.z);
		points[7].set(box.max.x, box.max.y, box.max.z);

		for (const point of points) {
			plane.projectPoint(point, point);
		}

		return scratchBox.setFromPoints(points).clone();
	}

	positionToAxis(position) {
		const { screen, shared } = this.app;
		const vector = position.clone();

		screen.worldToLocal(vector);

		const octant = vector.toArray().map((value) => Math.sign(value));
		const indices = octant.map((sign) => Math.floor(sign > 0));
		const monitorLengths = screen.userData.monitors.map((monitor, i) =>
			monitor.userData.axis.userData.points[indices[i]].length(),
		);
		const scale = new THREE.Vector3().fromArray(monitorLengths);

		vector.divide(scale);

		const axes = [shared.axes.x, shared.axes.y, shared.axes.z].map((axis) =>
			axis.clone(),
		);
		const correlation = axes.map((axis) =>
			Math.abs(shared.vector3.copy(vector).projectOnVector(axis).length()),
		);

		const index = correlation.indexOf(Math.max(...correlation));
		const axis = axes[index].multiplyScalar(octant[index]);
		axis.transformDirection(screen.matrixWorld);

		return axis;
	}

	formatVector(vector, digits) {
		const sign = vector
			.toArray()
			.map((component) => (component > 0 ? "+" : "-"));

		if (vector instanceof THREE.Vector2) {
			return `(${sign[0] + Math.abs(vector.x).toFixed(digits)}, ${
				sign[1] + Math.abs(vector.y).toFixed(digits)
			})`;
		}

		if (vector instanceof THREE.Vector3) {
			return `(${sign[0] + Math.abs(vector.x).toFixed(digits)}, ${
				sign[1] + Math.abs(vector.y).toFixed(digits)
			}, ${sign[2] + Math.abs(vector.z).toFixed(digits)})`;
		}

		return "";
	}

	mapVector(vector, fun) {
		const { vector3 } = this.app.shared;
		vector3.set(fun(vector.x), fun(vector.y), fun(vector.z));
		return vector3.clone();
	}

	transformArray(array, size, box, fun) {
		let index;
		let offsetX;
		let offsetY;
		let offsetZ;

		for (let k = box.min.z; k <= box.max.z; k++) {
			offsetZ = size.x * size.y * k;

			for (let j = box.min.y; j <= box.max.y; j++) {
				offsetY = size.x * j;

				for (let i = box.min.x; i <= box.max.x; i++) {
					offsetX = i;
					index = offsetX + offsetY + offsetZ;
					array[index] = fun(i, j, k);
				}
			}
		}

		return array;
	}

	bufferAction(condition, action, period = 500) {
		if (condition()) {
			action();
			return null;
		}

		const id = setInterval(() => {
			if (condition()) {
				clearInterval(id);
				action();
			}
		}, period);

		return id;
	}

	voxelIndex3DToLinear(i, j, k, size) {
		const offsetX = i;
		const offsetY = j * size.x;
		const offsetZ = k * size.x * size.y;
		return offsetX + offsetY + offsetZ;
	}

	voxelIndexLinearTo3D(n, size) {
		const offset = size.x * size.y;
		const k = Math.floor(n / offset);
		const j = Math.floor((n - k * offset) / size.x);
		const i = Math.floor(n - j * size.x - k * offset);

		return this.app.shared.vector3.set(i, j, k);
	}

	localPositionToVoxel(position) {
		const { mask } = this.app;
		const samples = mask.userData.samples;
		const voxel = mask.userData.voxelSize;
		const center = new THREE.Vector3().copy(mask.userData.size).divideScalar(2);
		const indices = new THREE.Vector3(
			Math.floor((position.x + center.x) / voxel.x),
			Math.floor((position.y + center.y) / voxel.y),
			Math.floor((position.z + center.z) / voxel.z),
		);

		const minIndices = new THREE.Vector3();
		const maxIndices = new THREE.Vector3().copy(samples).subScalar(1);
		indices.clamp(minIndices, maxIndices);

		return indices;
	}

	worldPositionToVoxel(position) {
		const { display, volume, shared } = this.app;
		shared.matrix4.copy(display.matrixWorld).invert();

		shared.vector3
			.copy(position)
			.applyMatrix4(shared.matrix4)
			.divide(volume.userData.size)
			.addScalar(0.5)
			.multiply(volume.userData.samples)
			.floor();

		return shared.vector3;
	}

	voxelToWorldPosition(index3D) {
		const { display, volume, shared } = this.app;

		shared.vector3
			.copy(index3D)
			.divide(volume.userData.samples)
			.subScalar(0.5)
			.multiply(volume.userData.size)
			.applyMatrix4(display.matrixWorld);

		return shared.vector3;
	}

	getVoxelBox(indexLinearOr3D) {
		const { volume, shared } = this.app;

		if (indexLinearOr3D instanceof THREE.Vector3) {
			shared.vector3.copy(indexLinearOr3D);
		} else {
			shared.vector3.copy(
				this.voxelIndexLinearTo3D(indexLinearOr3D, volume.userData.samples),
			);
		}

		shared.vector3
			.addScalar(0.5)
			.multiply(volume.userData.voxelSize)
			.addScaledVector(volume.userData.size, -0.5);

		shared.box
			.setFromCenterAndSize(shared.vector3, volume.userData.voxelSize)
			.expandByVector(volume.userData.voxelSize);

		return shared.box.clone();
	}

	getSlice(array, size, axis, number) {
		const sliceData = [];
		const sliceIndices = [];

		const iMin = axis === 0 ? number : 0;
		const iMax = axis === 0 ? number + 1 : size.x;
		const jMin = axis === 1 ? number : 0;
		const jMax = axis === 1 ? number + 1 : size.y;
		const kMin = axis === 2 ? number : 0;
		const kMax = axis === 2 ? number + 1 : size.z;

		for (let k = kMin; k < kMax; k++) {
			for (let j = jMin; j < jMax; j++) {
				for (let i = iMin; i < iMax; i++) {
					const n = this.voxelIndex3DToLinear(i, j, k, size);
					sliceData.push(array[n]);
					sliceIndices.push(n);
				}
			}
		}

		return [sliceData, sliceIndices];
	}

	getBox2Vertices(box) {
		return [
			new THREE.Vector2(box.min.x, box.min.y),
			new THREE.Vector2(box.max.x, box.min.y),
			new THREE.Vector2(box.min.x, box.max.y),
			new THREE.Vector2(box.max.x, box.max.y),
		];
	}

	getBoxVertices(box) {
		return [
			new THREE.Vector3(box.min.x, box.min.y, box.min.z),
			new THREE.Vector3(box.max.x, box.min.y, box.min.z),
			new THREE.Vector3(box.min.x, box.max.y, box.min.z),
			new THREE.Vector3(box.max.x, box.max.y, box.min.z),
			new THREE.Vector3(box.min.x, box.min.y, box.max.z),
			new THREE.Vector3(box.max.x, box.min.y, box.max.z),
			new THREE.Vector3(box.min.x, box.max.y, box.max.z),
			new THREE.Vector3(box.max.x, box.max.y, box.max.z),
		];
	}

	getBoxEdges(box) {
		const vertices = this.getBoxVertices(box);

		return [
			new THREE.Line3(vertices[0], vertices[1]),
			new THREE.Line3(vertices[1], vertices[3]),
			new THREE.Line3(vertices[3], vertices[2]),
			new THREE.Line3(vertices[2], vertices[0]),
			new THREE.Line3(vertices[4], vertices[5]),
			new THREE.Line3(vertices[5], vertices[7]),
			new THREE.Line3(vertices[7], vertices[6]),
			new THREE.Line3(vertices[6], vertices[4]),
			new THREE.Line3(vertices[0], vertices[4]),
			new THREE.Line3(vertices[1], vertices[5]),
			new THREE.Line3(vertices[2], vertices[6]),
			new THREE.Line3(vertices[3], vertices[7]),
		];
	}

	intersectBoxEdgesWithPlane(box, plane) {
		return this.getBoxEdges(box)
			.map((edge) => plane.intersectLine(edge, new THREE.Vector3()))
			.filter(Boolean);
	}

	getSliceObb(box, plane) {
		const vertices = this.intersectBoxEdgesWithPlane(box, plane);
		const quaternion = new THREE.Quaternion().setFromUnitVectors(
			plane.normal,
			new THREE.Vector3(0, 0, 1),
		);
		const translation = new THREE.Vector3()
			.addScaledVector(plane.normal, plane.constant)
			.negate();
		const transform = new THREE.Matrix4().compose(
			translation,
			quaternion,
			new THREE.Vector3(1, 1, 1),
		);
		const points = vertices.map((vertex) => vertex.applyMatrix4(transform));
		const bounds = new THREE.Box3().setFromPoints(points);

		return new OBB().fromBox3(bounds).applyMatrix4(transform.invert());
	}

	getVolumeSlice() {
		const { screen, display, volume, renderer, scene, shared } = this.app;

		screen.rotateX(Math.PI / 4);
		screen.rotateY(Math.PI / 4);
		screen.rotateZ(Math.PI / 4);
		this.app.screenManager.update();
		this.app.screenManager.updateUniforms();

		const index = 0;
		const monitor = screen.userData.monitors[index];
		const box = new THREE.Box3().setFromCenterAndSize(
			new THREE.Vector3(),
			volume.userData.size,
		);
		const plane = monitor.userData.plane.clone();
		const boundingPoints = this.intersectBoxEdgesWithPlane(box, plane);

		for (const point of boundingPoints) {
			point.applyMatrix4(display.matrixWorld);
			point.applyMatrix4(shared.matrix4.copy(monitor.matrixWorld).invert());
		}

		const bounds = new OBB().fromBox3(shared.box.setFromPoints(boundingPoints));
		const cameraRT = new THREE.OrthographicCamera(
			-bounds.halfSize.x,
			bounds.halfSize.x,
			-bounds.halfSize.y,
			bounds.halfSize.y,
			-bounds.halfSize.z,
			bounds.halfSize.z,
			0,
			1,
		);
		cameraRT.position.copy(bounds.center);
		monitor.add(cameraRT);

		const previousRT = renderer.getRenderTarget();
		const renderTarget = new THREE.WebGLRenderTarget(
			window.innerWidth,
			window.innerHeight,
		);

		renderer.setRenderTarget(renderTarget);
		renderer.clear();
		renderer.setClearColor(0x000000, 1);
		renderer.render(scene, cameraRT);
		renderer.setClearColor(0xffffff, 0);

		const pixels = new Uint8Array(window.innerWidth * window.innerHeight * 4);
		renderer.readRenderTargetPixels(
			renderTarget,
			0,
			0,
			window.innerWidth,
			window.innerHeight,
			pixels,
		);

		renderer.setRenderTarget(previousRT);

		const canvas = document.createElement("canvas");
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;

		const context = canvas.getContext("2d");
		const imageData = context.createImageData(canvas.width, canvas.height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		this.downloadURI(canvas.toDataURL(), "slice.png");
		display.remove(cameraRT);
	}

	computeMinimalBox2(points) {
		return points;
	}
}
