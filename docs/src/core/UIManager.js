import GUI from "lil-gui";

export class UIManager {
	constructor(app) {
		this.app = app;
		this.statusEntries = new Map();
		this.statusTimeouts = new Map();
	}

	openHelp() {
		this.setHelpVisibility(true);
	}

	closeHelp() {
		this.setHelpVisibility(false);
	}

	setHelpVisibility(visible) {
		this.popupBackdrop.style.display = visible ? "block" : "none";
		this.popupWindow.style.display = visible ? "block" : "none";
	}

	getRequiredElement(id) {
		const element = document.getElementById(id);

		if (!element) {
			throw new Error(`Missing required UI element: #${id}`);
		}

		return element;
	}

	setupStatusHud() {
		this.overlayRoot = this.getRequiredElement("overlay-content");
		this.statusHud = document.createElement("section");
		this.statusHud.className = "status-hud";
		this.statusHud.setAttribute("aria-live", "polite");
		this.statusHud.setAttribute("aria-atomic", "false");
		this.statusHud.hidden = true;
		this.overlayRoot.appendChild(this.statusHud);
	}

	flushStatusFrame() {
		return new Promise((resolve) => {
			window.requestAnimationFrame(() => resolve());
		});
	}

	startStatus(id, title, message = "") {
		this.setStatus(id, { title, message, state: "busy" });
	}

	updateStatus(id, title, message = "") {
		this.setStatus(id, { title, message, state: "busy" });
	}

	completeStatus(id, title, message = "", timeoutMs = 2400) {
		this.setStatus(id, { title, message, state: "success", timeoutMs });
	}

	failStatus(id, title, message = "", timeoutMs = 5200) {
		this.setStatus(id, { title, message, state: "error", timeoutMs });
	}

	dismissStatus(id) {
		this.clearStatusTimeout(id);
		this.statusEntries.delete(id);
		this.renderStatuses();
	}

	clearStatusTimeout(id) {
		const timeoutId = this.statusTimeouts.get(id);

		if (!timeoutId) {
			return;
		}

		window.clearTimeout(timeoutId);
		this.statusTimeouts.delete(id);
	}

	setStatus(id, { title, message = "", state = "busy", timeoutMs = null }) {
		if (!this.statusHud) {
			return;
		}

		const existing = this.statusEntries.get(id);

		this.clearStatusTimeout(id);
		this.statusEntries.set(id, {
			id,
			title: title ?? existing?.title ?? "Working",
			message: message ?? existing?.message ?? "",
			state,
			createdAt: existing?.createdAt ?? Date.now(),
			updatedAt: Date.now(),
		});
		this.renderStatuses();

		if (timeoutMs) {
			this.statusTimeouts.set(
				id,
				window.setTimeout(() => this.dismissStatus(id), timeoutMs),
			);
		}
	}

	renderStatuses() {
		if (!this.statusHud) {
			return;
		}

		const entries = [...this.statusEntries.values()]
			.sort((entryA, entryB) => {
				const entryABusy = entryA.state === "busy";
				const entryBBusy = entryB.state === "busy";

				if (entryABusy !== entryBBusy) {
					return entryABusy ? -1 : 1;
				}

				return entryB.updatedAt - entryA.updatedAt;
			})
			.slice(0, 4);

		this.statusHud.hidden = entries.length === 0;
		this.statusHud.replaceChildren(
			...entries.map((entry) => this.createStatusCard(entry)),
		);
	}

	createStatusCard(entry) {
		const card = document.createElement("article");
		card.className = "status-card";
		card.dataset.state = entry.state;

		const icon = document.createElement("span");
		icon.className = `status-card-icon status-card-icon--${entry.state}`;
		if (entry.state === "success") {
			icon.textContent = "OK";
		} else if (entry.state === "error") {
			icon.textContent = "!";
		}

		const copy = document.createElement("div");
		copy.className = "status-card-copy";

		const badge = document.createElement("span");
		badge.className = "status-card-badge";
		badge.textContent = this.getStatusLabel(entry.state);

		const title = document.createElement("p");
		title.className = "status-card-title";
		title.textContent = entry.title;

		copy.append(badge, title);

		if (entry.message) {
			const message = document.createElement("p");
			message.className = "status-card-message";
			message.textContent = entry.message;
			copy.append(message);
		}

		card.append(icon, copy);

		return card;
	}

	getStatusLabel(state) {
		if (state === "busy") {
			return "Loading";
		}

		if (state === "success") {
			return "Ready";
		}

		if (state === "error") {
			return "Error";
		}

		return "Info";
	}

	setup() {
		const gui = new GUI({ closeFolders: true });
		gui.domElement.classList.add("force-touch-styles");
		this.gui = gui;
		this.setupStatusHud();

		this.modeState = {
			mode: this.app.interaction.mode,
		};

		const modeFolder = gui.addFolder("Mode");
		this.modeController = modeFolder
			.add(this.modeState, "mode", ["Place", "Inspect", "Edit", "Segment"])
			.name("Current");
		this.modeController.onChange((mode) => this.app.interaction.setMode(mode));

		const volumeInput = this.getRequiredElement("volumeId");
		volumeInput.addEventListener("change", (event) =>
			this.app.interaction.onVolumeUpload(event),
		);
		const volumeFolder = gui.addFolder("Volume");
		volumeFolder.add(volumeInput, "click").name("Upload");

		const maskInput = this.getRequiredElement("maskId");
		maskInput.addEventListener("change", (event) =>
			this.app.interaction.onMaskUpload(event),
		);
		const maskFolder = gui.addFolder("Mask");
		maskFolder.add(maskInput, "click").name("Upload");
		maskFolder
			.add(
				{ action: (event) => this.app.interaction.onMaskDownload(event) },
				"action",
			)
			.name("Download");

		const volumeExampleUrl = new URL(
			"../../assets/examples/ct_train_1002_image.nii.gz",
			import.meta.url,
		);
		const maskExampleUrl = new URL(
			"../../assets/examples/ct_train_1002_label.nii.gz",
			import.meta.url,
		);
		const examplesFolder = gui.addFolder("Examples");
		examplesFolder
			.add(
				{
					action: () =>
						this.app.interaction.loadExampleVolume(
							volumeExampleUrl,
							"ct_train_1002_image.nii.gz",
						),
				},
				"action",
			)
			.name("Volume");
		examplesFolder
			.add(
				{
					action: () =>
						this.app.interaction.loadExampleMask(
							maskExampleUrl,
							"ct_train_1002_label.nii.gz",
						),
				},
				"action",
			)
			.name("Mask");

		this.popupWindow = this.getRequiredElement("popup-window");
		this.popupBackdrop = this.getRequiredElement("popup-backdrop");

		const closeButton = this.getRequiredElement("close-button");
		closeButton.addEventListener("click", () => this.closeHelp());
		this.popupBackdrop.addEventListener("click", () => this.closeHelp());
		window.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				this.closeHelp();
			}
		});

		const popupLink = this.getRequiredElement("popup-link");
		popupLink.addEventListener("click", (event) => {
			event.preventDefault();
			this.openHelp();
		});

		const infoFolder = gui.addFolder("Info");
		infoFolder.add(popupLink, "click").name("Open");
	}
}
