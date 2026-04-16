# Project Context

This file is the durable quick-reference for the `MPR-Viewer` repository. It is meant to help future contributors and coding agents re-enter the project quickly without rediscovering the same architecture, assumptions, and rough edges from scratch.

The source of truth is the code under `app/`. `docs/` is generated output from Vite and should usually be treated as a build artifact, not hand-edited source.

## 1. Repo Snapshot

- The project is a browser-based medical volume viewer for NIFTI data.
- It supports two workflows:
  - desktop/browser interaction with mouse + keyboard
  - optional WebXR AR interaction on supported mobile devices
- The app is built as a single Vite site rooted at `app/`.
- `npm run build` outputs the deployable site into `docs/`.
- The runtime centers on a shared `Experience` object composed from manager classes.
- The main user-facing workflow is `Place -> Inspect -> Edit -> Segment`.
- Segmentation is currently 2D, prompt-based, and effectively axial-only.

## 2. Read These Files First

If you only have time to inspect a few files, start here:

- `app/src/Experience.js`: composition root and shared runtime state
- `app/src/core/InteractionController.js`: high-level behavior for modes, loading, gestures, and desktop/XR actions
- `app/src/core/DesktopControls.js`: browser mouse, wheel, and keyboard workflow
- `app/src/managers/DisplayManager.js`: mode-driven visibility and UI state
- `app/src/managers/ScreenManager.js`: tri-planar slice monitors and slice uniforms
- `app/src/managers/ModelManager.js`: 3D mask rendering and ROI bounding box
- `app/src/managers/SegmentationWorkerManager.js`: main-thread slice segmentation orchestration
- `app/src/workers/segmentation.worker.js`: MobileSAM worker logic
- `app/index.html`: app shell, help modal, hidden file inputs, overlay root
- `vite.config.mjs`: confirms `app/` as source root and `docs/` as build output

## 3. Repo Layout

Top level:

- `package.json`: Vite scripts and runtime dependencies
- `vite.config.mjs`: Vite root is `app`, build output is `docs`
- `readme.md`: user-facing setup and workflow overview
- `PROJECT_CONTEXT.md`: this file
- `app/`: editable application source
- `docs/`: generated site output for deployment

Important app folders:

- `app/index.html`: static shell, help modal, hidden upload inputs, overlay container
- `app/style.css`: application and help-modal styling
- `app/script.js`: minimal bootstrap entry
- `app/src/Experience.js`: central runtime object
- `app/src/core/`: cross-cutting control and utility code
- `app/src/managers/`: scene/data/view managers
- `app/src/xr/`: custom gesture recognizer
- `app/src/workers/`: segmentation worker
- `app/src/shaders/`: slice and model GLSL
- `app/assets/examples/`: sample NIFTI volume + mask
- `app/assets/models/`: bundled MobileSAM ONNX models
- `app/src/vendor/pixpipe.esmodule.js`: bundled decoding helper used for `Image3D`

## 4. Boot Sequence And Lifecycle

Startup flow:

1. `app/script.js` calls `Experience.bootstrap()`.
2. `Experience` constructs shared scratch objects, utilities, managers, and controllers.
3. `Experience.init()` loads shader source strings.
4. `SceneManager.setupObjects()` creates the main Three.js objects and the plain `volume` / `mask` state objects.
5. `SceneManager.setupScene()` creates the renderer, camera, controls, scene graph, and global DOM event listeners.
6. `DesktopControls.setup()` enables browser interaction.
7. `UIManager.setup()` builds the lil-gui controls, help modal wiring, and status HUD.
8. `XRManager.setup()` creates the reticle, gesture listeners, and AR button.
9. `SegmentationWorkerManager.setup()` creates and loads the segmentation worker.
10. The render loop is attached through `renderer.setAnimationLoop(...)`, which delegates to `XRManager.updateAnimation(...)`.

Data reload flow:

- Loading a new volume, mask, or example dataset ends by calling `Experience.refreshWorldFromData()`.
- That method clears prompt points, resets worker slice state, rebuilds `screen`, `model`, `container`, `brush`, and `selector3D`, then rebinds uniforms and refreshes the display/UI state.

## 5. Runtime Architecture

### 5.1 Scene graph

The scene graph is intentionally simple:

- `scene`
- `camera`
- `display`
- `reticle`
- `transformControls`

Children of `display`:

- `screen`
- `model`
- `selector3D`
- `brush`
- `container`

`display` is the spatial parent for the loaded dataset. If something should move with the medical object, it probably belongs under `display`.

### 5.2 State holders

`volume` and `mask` are plain objects with `userData`, not Three.js meshes.

Main state objects:

- `display`: parent transform, mode order, history/future, segmentation prompt points, shared matrices/vectors used by shaders
- `volume`: source image volume, dimensions, voxel size, physical size, `Data3DTexture`
- `mask`: editable segmentation volume, history/future, export metadata, `Data3DTexture`
- `screen`: three slice monitors, world-space planes, axis helpers, center handle, history/future
- `model`: box mesh with the raymarch shader and a dynamic `userData.box` ROI around non-zero mask voxels
- `brush`: edit/segment sphere, active plane, projected monitor index, bounding sphere/box
- `container`: visible box around the dataset plus an `OBB` used for hit testing
- `selector3D`: interactive 3D box for the unfinished 3D segmentation path

### 5.3 Managers and controllers

- `SceneManager`: scene objects, renderer, camera, orbit controls, transform controls, scene graph
- `DisplayManager`: mode-driven visibility, shared shader matrices, display history/undo/redo
- `ScreenManager`: slice monitor creation, plane math, monitor intersections, slice uniforms, undo/redo
- `ModelManager`: 3D mask material, mask ROI box, model uniforms
- `VolumeManager` / `MaskManager`: volume and mask texture lifecycle
- `BrushManager`: brush projection onto the active slice
- `ContainerManager`: visible bounds box and OBB/raycast helpers
- `Selector3DManager`: 3D selector handles and interactions
- `SegmentationWorkerManager`: worker lifecycle, encode/decode scheduling, slice prompt state
- `UIManager`: lil-gui folders, help dialog, transient status cards
- `XRManager`: AR button, reticle, hit testing, XR animation updates
- `InteractionController`: the shared behavior layer used by both XR gestures and desktop controls
- `DesktopControls`: desktop-only input mapping into `InteractionController`

## 6. Data Loading, Export, And Build Notes

Volume and mask loading:

- File uploads are wired through hidden inputs in `app/index.html`.
- `AppUtils.loadNIFTI()` uses PIXPIPE to decode into an `Image3D`.
- `AppUtils.loadRawNIFTI()` separately reads the raw NIFTI bytes for later export.
- Loading only a volume creates a blank mask from that volume.
- Loading only a mask creates a blank volume from that mask.
- The example dataset is fetched from bundled assets and wrapped back into `File` objects so it follows the same pipeline.

Mask export:

- `InteractionController.onMaskDownload()` uses `AppUtils.buildMaskDownloadBuffer(...)`.
- If raw NIFTI bytes exist, the exporter reuses the original header and rewrites datatype/scaling fields for `UInt8`.
- If not, the app builds a minimal NIFTI-1 mask file from available metadata.

Build/deploy notes:

- Vite serves from `app/` and emits into `docs/`.
- `base: "./"` means the build is designed to work as a static relative-path site.
- Do not edit files under `docs/assets/` as if they were source code.

## 7. Rendering Model

### 7.1 Slice monitors

`ScreenManager` builds three large plane meshes, one per orthogonal axis:

- monitor `0`: sagittal-style plane
- monitor `1`: coronal-style plane
- monitor `2`: axial-style plane

Each monitor uses the custom screen shader and carries uniforms for:

- volume texture
- mask texture
- plane visibility and alpha
- global normalization matrix
- plane normals/origin
- brush overlay
- selector overlay
- axis visibility
- brightness and contrast

### 7.2 3D model

`ModelManager` builds a box mesh sized to the physical mask dimensions and shades it with the model fragment shader.

Current model behavior:

- it raymarches the mask texture
- it shades the mask surface from local gradients
- it clips against visible slice planes
- it limits marching to `model.userData.box`, a tighter ROI around non-zero voxels

Important detail:

- `ModelManager.update()` is currently empty; most model changes happen through uniform updates and ROI recomputation rather than per-frame CPU logic

## 8. Modes And Interaction Model

The active mode is always `display.userData.modes[0]`. The normal cycle is:

- `Place`
- `Inspect`
- `Edit`
- `Segment`

`Segment3D` exists in code, but it is not part of the default mode order.

### `Place`

Purpose:

- move, rotate, and scale the whole dataset assembly

Visual state:

- container visible
- model visible
- all slice monitors visible

### `Inspect`

Purpose:

- move slice planes
- rotate the slice stack
- hide/reveal planes
- inspect the volume with the model still visible

Visual state:

- outlined container
- model visible
- all slice monitors visible

### `Edit`

Purpose:

- paint directly into the mask on the currently targeted slice

Visual state:

- model hidden
- all slice monitors visible
- active monitor emphasized
- brush projected onto the selected monitor

### `Segment`

Purpose:

- place positive/negative prompt points and ask MobileSAM for a slice mask

Visual state:

- model hidden
- only monitor index `2` is shown
- prompt points are visible on the display object
- brush stays active for prompt placement

Key limitation:

- the current main-thread worker flow hard-codes `slice.axis = 2`, so prompt segmentation is effectively tied to the axial plane

### `Segment3D`

Purpose:

- intended ROI-driven 3D segmentation workflow

Current reality:

- selector interactions exist
- mode-specific hooks still exist in the controller
- `computeSegmentation3D()` is a placeholder
- the mode is dormant unless manually reintroduced to the active mode list

## 9. Desktop And XR Workflows

### 9.1 Desktop workflow

The project is now desktop-first for day-to-day use.

Desktop input model:

- left mouse is reserved for app interactions
- right drag orbits the camera
- wheel zooms the camera
- `1 / 2 / 3 / 4` switch modes
- `Ctrl/Cmd + Z` and `Ctrl/Cmd + Y` undo/redo in the current mode
- `G` resets the current mode state
- `X` toggles add/subtract brush mode in `Edit` and `Segment`
- `C` clears prompt points in `Segment`

Mode-specific desktop behavior lives in `DesktopControls.js` and forwards into the same underlying interaction methods used by XR.

There is also a developer/debug transform-controls path:

- `D` toggles `TransformControls`
- `Q`, `T`, `R`, `S`, `+`, `-`, `Esc` control transform mode/space/size/reset

This debug path is not the main user workflow, but it exists and can affect the current display state.

### 9.2 XR workflow

XR still exists through `XRManager` and `XRGestures`.

Important XR pieces:

- `ARButton` starts the session
- hit testing drives the reticle before placement
- gestures dispatch semantic events such as `polytap`, `hold`, `pan`, `swipe`, `pinch`, `twist`, `implode`, and `explode`
- `InteractionController` translates those gestures into mode-specific actions

Typical gesture mapping:

- swipe left/right: cycle modes
- swipe down/up: undo/redo in the active mode
- double tap: context action for the current mode
- hold, pan, pinch, twist: manipulate the active object for that mode
- implode: reset current mode state
- explode: exit XR session

## 10. Segmentation Pipeline

Main-thread orchestration lives in `SegmentationWorkerManager`.

Current behavior:

- exactly one worker is created
- worker state tracks whether the model is loaded, whether the current slice is encoded, and the prompt state for the active slice
- entering `Segment` calls `runEncodeAll()`
- moving the segment slice re-schedules encoding
- clicking/tapping on the slice adds prompt coordinates and labels, then triggers decode

Worker flow:

1. Load MobileSAM encoder and decoder ONNX models.
2. Extract the current slice from the volume.
3. Normalize and resize that slice to `1024 x 1024`.
4. Compute and cache the image embedding.
5. Decode prompt points into a mask proposal.
6. Merge the proposal back into the slice portion of the editable mask.

Merge rule:

- decoded values are merged with `Math.max(existingSliceValue, segmentValue)`

Prompt clearing behavior:

- the worker caches the slice mask values from before prompt-based edits
- clearing points restores that cached slice region

Operational caveat:

- `segmentation.worker.js` imports the ONNX models from bundled assets, but `onnxruntime-web` is configured to fetch its WASM runtime from `cdnjs`
- this means segmentation may fail in offline or restricted-network environments even if the viewer itself loads correctly

## 11. Coordinate Systems And Spatial Rules

Three coordinate spaces matter most:

- world space: regular Three.js / XR coordinates
- display-local space: physical coordinates centered on the dataset
- normalized shader space: the unit-box style space used after `uNormalize`

Rule of thumb:

- CPU interaction math usually happens in world space or display-local physical space
- GPU sampling and clipping logic happen in normalized shader space

Important spatial constraints:

- slice movement is clamped so planes stay inside the volume bounds
- brush projection depends on ray intersection with visible slice monitors
- mask editing ultimately resolves to voxel indices through `localPositionToVoxel(...)`

## 12. Practical Invariants For Future Edits

When loading or rebuilding dataset state:

- update the relevant `volume` / `mask` object
- call `refreshWorldFromData()`

When changing mask texture contents:

- write into `mask.userData.texture.image.data`
- set `mask.userData.texture.needsUpdate = true`
- refresh screen and model mask uniforms
- recompute `model.userData.box` when the edited region can shrink or expand the non-zero mask bounds
- refresh model box uniforms after recomputing the ROI

When changing slice transform or plane visibility:

- update the `screen` object
- call `screenManager.update()`
- refresh screen plane uniforms
- refresh model plane uniforms

When changing mode behavior:

- inspect `DisplayManager.updateUI()`
- inspect `InteractionController.setMode(...)`
- inspect `DesktopControls.js`
- inspect the mode GUI wiring in `UIManager.js`
- inspect help text in `app/index.html` if user-facing controls changed

When changing segmentation:

- inspect both `SegmentationWorkerManager.js` and `segmentation.worker.js`
- check prompt coordinate normalization and slice-axis assumptions
- remember that the current Segment mode only exposes monitor `2`

## 13. Known Rough Edges

These are the current gaps or likely footguns:

- `Segment3D` is present in code but not part of the active mode cycle
- `computeSegmentation3D()` is still a placeholder
- `InteractionController.onLeavingSegmentMode()` is empty
- `ModelManager.update()` is empty
- `AppUtils.computeMinimalBox2()` is still a placeholder
- segmentation is effectively limited to the axial slice path
- uniform updates are still manually chained in many places, so missing one follow-up call can leave stale visuals
- the app still mixes scene objects, mutable `userData`, and shared scratch objects heavily; debugging often depends on understanding update order rather than isolated pure functions

## 14. Short Mental Model

If you only keep one summary in your head, use this one:

The app is a Vite-hosted Three.js medical viewer where `display` is the parent world object, `screen` is the tri-planar slice system, `mask` is the editable segmentation volume, `model` is the raymarched 3D view of that mask, `brush` is the edit/prompt tool projected onto the current slice, `DesktopControls` and XR gestures both feed the same `InteractionController`, and the current segmentation workflow is a single-worker MobileSAM pipeline that operates on the axial slice only.
