import "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest";
import "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.14.0/ort.wasm.min.js";

ort.env.wasm.wasmPaths =
	"https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.14.0/";

class SamWorker {
	constructor() {
		this.tensor = null;
		this.embedding = null;
		this.encoder = null;
		this.decoder = null;
		this.image = null;
	}

	async handleMessage(event) {
		const { type, input } = event.data;

		if (type === "load") {
			await this.loadModels();
		}

		if (type === "encode") {
			await this.encode(input);
		}

		if (type === "decode") {
			await this.decode(input);
		}
	}

	async loadModels() {
		const start = Date.now();

		ort.env.wasm.numThreads = 1;
		this.encoder = await ort.InferenceSession.create("mobilesam.encoder.onnx");
		this.decoder = await ort.InferenceSession.create(
			"mobilesam.decoder.quant.onnx",
		);

		self.postMessage({
			type: "load",
			output: {
				time: (Date.now() - start) / 1000,
			},
		});
	}

	async encode(input) {
		try {
			const start = Date.now();

			this.image = input;
			this.tensor = tf.tensor(
				this.image.data,
				[this.image.width, this.image.height, 1],
				"float32",
			);

			const moments = tf.moments(this.tensor);
			this.tensor = this.tensor.sub(moments.mean).div(moments.variance.sqrt());
			this.tensor = tf
				.div(
					this.tensor.sub(this.tensor.mean()),
					this.tensor.max().sub(this.tensor.min()),
				)
				.mul(255);
			this.tensor = tf.image.resizeBilinear(this.tensor, [1024, 1024]);
			this.tensor = tf.image.grayscaleToRGB(this.tensor);

			ort.env.wasm.numThreads = 5;

			const feeds = {
				input_image: new ort.Tensor(this.tensor.dataSync(), this.tensor.shape),
			};
			const results = await this.encoder.run(feeds);

			this.embedding = results.image_embeddings;

			self.postMessage({
				type: "encode",
				output: {
					embedding: this.embedding,
					time: (Date.now() - start) / 1000,
				},
			});
		} catch (error) {
			console.log(`caught error: ${error}`);
		}
	}

	async decode(input) {
		try {
			const start = Date.now();

			ort.env.wasm.numThreads = 5;

			input.points = input.points.map((point) =>
				point.map((value) => Math.round(1024 * value)),
			);

			const feeds = {
				image_embeddings: this.embedding,
				point_coords: new ort.Tensor(new Float32Array(input.points.flat()), [
					1,
					input.points.length,
					2,
				]),
				point_labels: new ort.Tensor(new Float32Array(input.labels), [
					1,
					input.labels.length,
				]),
				mask_input: new ort.Tensor(
					new Float32Array(256 * 256),
					[1, 1, 256, 256],
				),
				has_mask_input: new ort.Tensor(new Float32Array([0]), [1]),
				orig_im_size: new ort.Tensor(
					new Float32Array([this.image.width, this.image.height]),
					[2],
				),
			};

			const results = await this.decoder.run(feeds);

			this.tensor = tf.tensor(results.masks.data, results.masks.dims).squeeze();
			this.tensor = tf.mul(this.tensor, 255).maximum(0).minimum(255);
			this.tensor = tf.greater(this.tensor, 0).mul(255);

			self.postMessage({
				type: "decode",
				output: {
					mask: this.tensor.dataSync(),
					time: (Date.now() - start) / 1000,
				},
			});
		} catch (error) {
			console.log(`caught error: ${error}`);
		}
	}
}

const samWorker = new SamWorker();
self.onmessage = async (event) => samWorker.handleMessage(event);
