import GUI from "lil-gui";

export class UIManager {
	constructor(app) {
		this.app = app;
	}

	openHelp() {
		this.popupBackdrop.style.display = "block";
		this.popupWindow.style.display = "block";
	}

	closeHelp() {
		this.popupBackdrop.style.display = "none";
		this.popupWindow.style.display = "none";
	}

	setup() {
		const gui = new GUI({ closeFolders: true });
		gui.domElement.classList.add("force-touch-styles");
		this.gui = gui;

		const folders = [];
		const controls = [];

		this.modeState = {
			mode: this.app.interaction.mode,
		};

		folders[4] = gui.addFolder("Mode");
		this.modeController = folders[4]
			.add(this.modeState, "mode", ["Place", "Inspect", "Edit", "Segment"])
			.name("Current");
		this.modeController.onChange((mode) => this.app.interaction.setMode(mode));

		controls[0] = [];
		controls[0][0] = document.getElementById("volumeId");
		controls[0][0].addEventListener("change", (event) =>
			this.app.interaction.onVolumeUpload(event),
		);

		folders[0] = gui.addFolder("Volume");
		folders[0].add(controls[0][0], "click").name("Upload");

		controls[1] = [];
		controls[1][0] = document.getElementById("maskId");
		controls[1][0].addEventListener("change", (event) =>
			this.app.interaction.onMaskUpload(event),
		);

		folders[1] = gui.addFolder("Mask");
		folders[1].add(controls[1][0], "click").name("Upload");
		folders[1]
			.add(
				{ action: (event) => this.app.interaction.onMaskDownload(event) },
				"action",
			)
			.name("Download");

		controls[3] = [];
		controls[3][0] = document.getElementById("volumeFile");
		controls[3][1] = document.getElementById("maskFile");

		folders[3] = gui.addFolder("Examples");
		folders[3].add(controls[3][0], "click").name("Volume");
		folders[3].add(controls[3][1], "click").name("Mask");

		this.popupWindow = document.getElementById("popup-window");
		this.popupBackdrop = document.getElementById("popup-backdrop");

		const closeButton = document.getElementById("close-button");
		closeButton.addEventListener("click", () => this.closeHelp());
		this.popupBackdrop.addEventListener("click", () => this.closeHelp());
		window.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				this.closeHelp();
			}
		});

		controls[2] = document.getElementById("popup-link");
		controls[2].addEventListener("click", (event) => {
			event.preventDefault();
			this.openHelp();
		});

		folders[2] = gui.addFolder("Info");
		folders[2].add(controls[2], "click").name("Open");
	}
}
