import GUI from "lil-gui";

export class UIManager {
	constructor(app) {
		this.app = app;
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

	setup() {
		const gui = new GUI({ closeFolders: true });
		gui.domElement.classList.add("force-touch-styles");
		this.gui = gui;

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

		const volumeExampleLink = this.getRequiredElement("volumeFile");
		const maskExampleLink = this.getRequiredElement("maskFile");
		const examplesFolder = gui.addFolder("Examples");
		examplesFolder.add(volumeExampleLink, "click").name("Volume");
		examplesFolder.add(maskExampleLink, "click").name("Mask");

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
