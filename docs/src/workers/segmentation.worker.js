import * as tf from "@tensorflow/tfjs";
import * as ort from "onnxruntime-web";
import decoderModelUrl from "../../assets/models/mobilesam.decoder.quant.onnx?url";
import encoderModelUrl from "../../assets/models/mobilesam.encoder.onnx?url";

ort.env.wasm.wasmPaths =
	"https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.14.0/";

class SamWorker {
	constructor() {
		this.embedding = null;
		this.encoder = null;
		this.decoder = null;
		this.image = null;
	}

	postError(stage, error) {
		self.postMessage({
			type: "error",
			output: {
				stage,
				message: error instanceof Error ? error.message : String(error),
			},
		});
	}

	async handleMessage(event) {
		const { type, input } = event.data;

		try {
			switch (type) {
				case "load":
					await this.loadModels();
					break;
				case "encode":
					await this.encode(input);
					break;
				case "decode":
					await this.decode(input);
					break;
				default:
					throw new Error(`Unsupported worker message type: ${type}`);
			}
		} catch (error) {
			this.postError(type, error);
		}
	}

	async loadModels() {
		const start = performance.now();

		ort.env.wasm.numThreads = 1;
		this.encoder = await ort.InferenceSession.create(encoderModelUrl);
		this.decoder = await ort.InferenceSession.create(decoderModelUrl);

		self.postMessage({
			type: "load",
			output: {
				time: (performance.now() - start) / 1000,
			},
		});
	}

	prepareEncoderInput(input) {
		return tf.tidy(() => {
			const tensor = tf.tensor(
				input.data,
				[input.width, input.height, 1],
				"float32",
			);
			const { mean, variance } = tf.moments(tensor);
			const standardized = tensor
				.sub(mean)
				.div(variance.sqrt().add(tf.scalar(1e-6)));
			const centered = standardized.sub(standardized.mean());
			const range = standardized.max().sub(standardized.min());
			const scaled = centered.div(range.add(tf.scalar(1e-6))).mul(255);
			const resized = tf.image.resizeBilinear(scaled, [1024, 1024]);
			return tf.image.grayscaleToRGB(resized);
		});
	}

	async encode(input) {
		const start = performance.now();

		this.image = input;
		const tensor = this.prepareEncoderInput(input);

		try {
			ort.env.wasm.numThreads = 1;

			const feeds = {
				input_image: new ort.Tensor(tensor.dataSync(), tensor.shape),
			};
			const results = await this.encoder.run(feeds);

			this.embedding = results.image_embeddings;

			self.postMessage({
				type: "encode",
				output: {
					embedding: this.embedding,
					time: (performance.now() - start) / 1000,
				},
			});
		} finally {
			tensor.dispose();
		}
	}

	buildDecodeMask(results) {
		return tf.tidy(() => {
			const tensor = tf
				.tensor(results.masks.data, results.masks.dims)
				.squeeze();
			const mask = tf.mul(tensor, 255).maximum(0).minimum(255);
			return tf.greater(mask, 0).mul(255).dataSync();
		});
	}

	async decode(input) {
		if (!this.embedding || !this.image) {
			throw new Error("Decode requested before an image embedding was ready");
		}

		if (!input.points?.length || !input.labels?.length) {
			throw new Error("Decode requested without prompt points");
		}

		const start = performance.now();
		ort.env.wasm.numThreads = 1;

		const roundedPoints = input.points.map((point) =>
			point.map((value) => Math.round(1024 * value)),
		);

		const feeds = {
			image_embeddings: this.embedding,
			point_coords: new ort.Tensor(new Float32Array(roundedPoints.flat()), [
				1,
				roundedPoints.length,
				2,
			]),
			point_labels: new ort.Tensor(new Float32Array(input.labels), [
				1,
				input.labels.length,
			]),
			mask_input: new ort.Tensor(new Float32Array(256 * 256), [1, 1, 256, 256]),
			has_mask_input: new ort.Tensor(new Float32Array([0]), [1]),
			orig_im_size: new ort.Tensor(
				new Float32Array([this.image.width, this.image.height]),
				[2],
			),
		};

		const results = await this.decoder.run(feeds);
		const mask = this.buildDecodeMask(results);

		self.postMessage({
			type: "decode",
			output: {
				mask,
				time: (performance.now() - start) / 1000,
			},
		});
	}
}

const samWorker = new SamWorker();
self.onmessage = async (event) => samWorker.handleMessage(event);
