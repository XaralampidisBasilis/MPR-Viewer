export class SegmentationWorkerManager {
	constructor(app) {
		this.app = app;
	}

	setup() {
		const workerUrl = new URL("../../prm/worker.js", import.meta.url);

		this.app.workers = new Array(1)
			.fill()
			.map(() => new Worker(workerUrl, { type: "module" }));

		this.app.workers.forEach((worker, i) => {
			worker.userData = {
				id: i,
				loaded: false,
				encoding: false,
				encoded: false,
				decoding: false,
				decoded: false,
				slice: {
					coords: [],
					labels: [],
					axis: undefined,
					number: undefined,
					data: [],
					textureData: [],
					indices: [],
				},
			};

			worker.addEventListener("message", (event) => {
				if (event.data.type === "load") this.onLoaded(event);
				if (event.data.type === "encode") this.onEncoded(event);
				if (event.data.type === "decode") this.onDecoded(event);
			});

			this.runLoad(i);
		});
	}

	runLoad(id) {
		console.log(`Worker ${id}: Loading models`);

		this.app.workers[id].postMessage({
			type: "load",
			data: {},
		});
	}

	runEncode(id) {
		this.app.brush.visible = false;

		const workerData = this.app.workers[id].userData;
		if (workerData.encoding) {
			clearInterval(workerData.encoding);
		}

		console.log(`Worker ${id}: Buffered encoding`);

		workerData.encoding = this.app.utils.bufferAction(
			() => workerData.loaded,
			() => {
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

				const textureData = this.app.mask.userData.texture.image.data;
				slice.textureData = Array.from(
					slice.indices.map((index) => textureData[index]),
				);

				const dimensions = this.app.volume.userData.samples
					.toArray()
					.toSpliced(slice.axis, 1);

				this.app.workers[id].postMessage({
					type: "encode",
					input: {
						data: new Float32Array(slice.data),
						width: dimensions[0],
						height: dimensions[1],
					},
				});
			},
		);
	}

	runDecode(id) {
		const workerData = this.app.workers[id].userData;
		if (workerData.decoding) {
			clearInterval(workerData.decoding);
		}

		console.log(`Worker ${id}: Buffered decoding`);

		workerData.decoding = this.app.utils.bufferAction(
			() => workerData.encoded,
			() => {
				const { slice } = workerData;

				this.app.workers[id].postMessage({
					type: "decode",
					input: {
						points: slice.coords,
						labels: slice.labels,
					},
				});

				console.log(`Worker ${id}: Started decoding`);
			},
		);
	}

	onLoaded(event) {
		const workerData = event.currentTarget.userData;
		workerData.loaded = true;

		console.log(
			`Worker ${workerData.id}: Loading models took ${event.data.output.time} seconds`,
		);
	}

	onEncoded(event) {
		const workerData = event.currentTarget.userData;

		this.app.brush.visible = true;
		workerData.encoding = false;
		workerData.encoded = true;

		console.log(
			`Worker ${workerData.id}: Computing image embedding took ${event.data.output.time} seconds`,
		);
	}

	onDecoded(event) {
		const workerData = event.currentTarget.userData;
		const textureData = this.app.mask.userData.texture.image.data;
		const segmentData = event.data.output.mask;
		const sliceIndices = workerData.slice.indices;

		workerData.decoding = false;
		workerData.decoded = true;

		console.log(
			`Worker ${workerData.id}: Generating masks took ${event.data.output.time} seconds`,
		);

		this.app.mask.userData.history.push({
			data: Array.from(sliceIndices.map((index) => textureData[index])),
			indices: Array.from(sliceIndices),
			box: this.app.model.userData.box.clone(),
		});

		for (let n = 0; n < sliceIndices.length; n++) {
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
}
