import SamWorker from "../../prm/worker.js?worker";

export class SegmentationWorkerManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		this.app.workers = Array.from({ length: 1 }, () => {
			return new SamWorker();
		});

		this.app.workers.forEach((worker, id) => {
			worker.userData = this.createWorkerState(id);
			worker.addEventListener("message", (event) => this.onMessage(event));
			worker.addEventListener("error", (event) => this.onWorkerError(event));
			this.runLoad(id);
		});
	}

	createWorkerState(id) {
		return {
			id,
			loaded: false,
			encoded: false,
			decoded: false,
			encodeTimer: null,
			decodeTimer: null,
			lastError: null,
			slice: this.createSliceState(),
		};
	}

	createSliceState() {
		return {
			coords: [],
			labels: [],
			axis: undefined,
			number: undefined,
			data: [],
			textureData: [],
			indices: [],
		};
	}

	getWorker(id) {
		return this.app.workers?.[id] ?? null;
	}

	hasSegmentationSourceData() {
		return Boolean(
			this.app.volume?.userData?.data0 &&
				this.app.volume?.userData?.samples &&
				this.app.mask?.userData?.texture?.image?.data,
		);
	}

	setBrushVisible(visible) {
		if (this.app.brush) {
			this.app.brush.visible = visible;
		}
	}

	cancelBufferedAction(workerData, key) {
		if (!workerData?.[key]) {
			return;
		}

		clearInterval(workerData[key]);
		workerData[key] = null;
	}

	resetSliceState(workerData) {
		if (!workerData) {
			return;
		}

		this.cancelBufferedAction(workerData, "encodeTimer");
		this.cancelBufferedAction(workerData, "decodeTimer");
		workerData.encoded = false;
		workerData.decoded = false;
		workerData.lastError = null;
		workerData.slice = this.createSliceState();
	}

	resetAllSlices() {
		for (const worker of this.app.workers) {
			this.resetSliceState(worker.userData);
		}
	}

	runEncodeAll() {
		for (const worker of this.app.workers) {
			this.runEncode(worker.userData.id);
		}
	}

	runLoad(id) {
		const worker = this.getWorker(id);
		if (!worker) {
			return false;
		}

		console.log(`Worker ${id}: Loading models`);
		worker.postMessage({
			type: "load",
			data: {},
		});

		return true;
	}

	runEncode(id) {
		const worker = this.getWorker(id);
		if (!worker || !this.hasSegmentationSourceData()) {
			return false;
		}

		const workerData = worker.userData;
		this.setBrushVisible(false);
		this.cancelBufferedAction(workerData, "encodeTimer");
		this.cancelBufferedAction(workerData, "decodeTimer");
		workerData.encoded = false;
		workerData.decoded = false;
		workerData.lastError = null;

		console.log(`Worker ${id}: Buffered encoding`);

		workerData.encodeTimer = this.app.utils.bufferAction(
			() => workerData.loaded && this.hasSegmentationSourceData(),
			() => {
				workerData.encodeTimer = null;
				console.log(`Worker ${id}: Started encoding`);

				const { slice } = workerData;
				slice.axis = 2;
				slice.number = this.app.utils
					.localPositionToVoxel(this.app.screen.position)
					.getComponent(slice.axis);
				[slice.data, slice.indices] = this.app.utils.getSlice(
					this.app.volume.userData.data0,
					this.app.volume.userData.samples,
					slice.axis,
					slice.number,
				);

				if (slice.data.length === 0) {
					this.setBrushVisible(true);
					return;
				}

				const textureData = this.app.mask.userData.texture.image.data;
				slice.textureData = Array.from(
					slice.indices.map((index) => textureData[index]),
				);

				const dimensions = this.app.volume.userData.samples
					.toArray()
					.toSpliced(slice.axis, 1);

				worker.postMessage({
					type: "encode",
					input: {
						data: new Float32Array(slice.data),
						width: dimensions[0],
						height: dimensions[1],
					},
				});
			},
		);

		return true;
	}

	runDecode(id) {
		const worker = this.getWorker(id);
		if (!worker) {
			return false;
		}

		const workerData = worker.userData;
		if (workerData.slice.coords.length === 0) {
			return false;
		}

		this.cancelBufferedAction(workerData, "decodeTimer");
		workerData.decoded = false;
		workerData.lastError = null;

		console.log(`Worker ${id}: Buffered decoding`);

		workerData.decodeTimer = this.app.utils.bufferAction(
			() => workerData.encoded && workerData.slice.coords.length > 0,
			() => {
				workerData.decodeTimer = null;
				const { slice } = workerData;

				worker.postMessage({
					type: "decode",
					input: {
						points: slice.coords,
						labels: slice.labels,
					},
				});

				console.log(`Worker ${id}: Started decoding`);
			},
		);

		return true;
	}

	onMessage(event) {
		switch (event.data.type) {
			case "load":
				this.onLoaded(event);
				break;
			case "encode":
				this.onEncoded(event);
				break;
			case "decode":
				this.onDecoded(event);
				break;
			case "error":
				this.onErrored(event);
				break;
		}
	}

	onLoaded(event) {
		const workerData = event.currentTarget.userData;
		workerData.loaded = true;
		workerData.lastError = null;

		console.log(
			`Worker ${workerData.id}: Loading models took ${event.data.output.time} seconds`,
		);
	}

	onEncoded(event) {
		const workerData = event.currentTarget.userData;

		this.setBrushVisible(true);
		workerData.encodeTimer = null;
		workerData.encoded = true;
		workerData.lastError = null;

		console.log(
			`Worker ${workerData.id}: Computing image embedding took ${event.data.output.time} seconds`,
		);
	}

	onDecoded(event) {
		const workerData = event.currentTarget.userData;
		const textureData = this.app.mask?.userData?.texture?.image?.data;
		const segmentData = event.data.output.mask;
		const sliceIndices = workerData.slice.indices;

		workerData.decodeTimer = null;
		workerData.decoded = true;
		workerData.lastError = null;

		if (!textureData || !segmentData || sliceIndices.length === 0) {
			return;
		}

		console.log(
			`Worker ${workerData.id}: Generating masks took ${event.data.output.time} seconds`,
		);

		const count = Math.min(
			sliceIndices.length,
			segmentData.length,
			workerData.slice.textureData.length,
		);

		this.app.mask.userData.history.push({
			data: Array.from(
				sliceIndices.slice(0, count).map((index) => textureData[index]),
			),
			indices: Array.from(sliceIndices.slice(0, count)),
			box: this.app.model.userData.box.clone(),
		});

		for (let n = 0; n < count; n++) {
			textureData[sliceIndices[n]] = Math.max(
				workerData.slice.textureData[n],
				segmentData[n],
			);
		}

		this.app.screenManager.updateUniformsMask();
		this.app.modelManager.updateUniformsMask();
		this.app.modelManager.computeBoundingBox();
		this.app.modelManager.updateUniformsBox();
		this.app.mask.userData.texture.needsUpdate = true;
	}

	onErrored(event) {
		const workerData = event.currentTarget.userData;
		const stage = event.data.output?.stage ?? "worker";
		const message = event.data.output?.message ?? "Unknown worker error";
		this.handleWorkerFailure(workerData, new Error(`[${stage}] ${message}`));
	}

	onWorkerError(event) {
		const workerData = event.currentTarget.userData;
		const location = event.filename
			? ` (${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0})`
			: "";
		const message = `${event.message || "Unknown worker error"}${location}`;
		this.handleWorkerFailure(workerData, new Error(message));
	}

	handleWorkerFailure(workerData, error) {
		this.cancelBufferedAction(workerData, "encodeTimer");
		this.cancelBufferedAction(workerData, "decodeTimer");
		this.setBrushVisible(true);
		workerData.encoded = false;
		workerData.decoded = false;
		workerData.lastError = error;
		console.error(`Worker ${workerData.id} failed`, error);
	}
}
