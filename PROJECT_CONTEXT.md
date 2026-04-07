# Project Context

This file is a durable quick-reference for the `MPR-Viewer` repository so future work can start with the project shape, main responsibilities, and the current rough edges already in mind.

This summary focuses on the project-owned source and on the role of bundled assets. Large third-party or binary files are inventoried here rather than described line by line.

## 1. What This Repo Is

The repo is a small workspace that serves a browser-based medical volume viewer / AR interaction prototype.

At runtime it is:

- A single-page app in `docs/index.html`
- Driven almost entirely by one large module: `docs/script.js`
- Rendered with Three.js and WebXR AR
- Focused on loading NIFTI volumes and masks, showing 3 orthogonal slice planes plus a volumetric mask render, and editing/segmenting masks with XR gestures

Historically it is still labeled "Augmented Reality Tool" in the README and HTML title, even though the repository name is now `mpr-viewer`.

## 2. Repo Layout

Top-level:

- `package.json`: root workspace wrapper; delegates `npm run dev` to the `docs` workspace
- `readme.md`: short setup notes, still using older project naming
- `docs/`: the actual app

App files:

- `docs/package.json`: local dev server (`serve`) and formatting/lint tooling
- `docs/index.html`: static shell, hidden file inputs, popup help, import map, module entry point
- `docs/style.css`: very small amount of page styling
- `docs/script.js`: almost all app logic

Support files in `docs/prm/`:

- `docs/prm/XRGestures.js`: custom XR hand/controller gesture detector
- `docs/prm/worker.js`: TensorFlow.js + ONNXRuntime worker for 2D segmentation prompts
- `docs/prm/vertex_screen.glsl` and `docs/prm/fragment_screen.glsl`: slice-plane shader pair
- `docs/prm/vertex_model.glsl` and `docs/prm/fragment_model.glsl`: 3D mask ray-march shader pair
- `mobilesam*.onnx`: bundled MobileSAM models used by the worker
- `lung.nii.gz` and `lung_mask.nii.gz`: sample volume/mask assets
- `pixpipe.esmodule.js`: bundled third-party imaging helper used for NIFTI decoding

## 3. Runtime Architecture

The app has no real build step. It is served as static files and loads most dependencies directly from CDNs.

Main startup path in `docs/script.js`:

1. Load GLSL shader source with `loadShader(...)`
2. `main()`
3. `setupObjects()`
4. `setupScene()`
5. `setupGui()`
6. `setupButton()`
7. `setupWorkers()`
8. `renderer.setAnimationLoop(updateAnimation)`

Per-frame work:

- If XR is active and reticle placement is enabled, perform hit testing
- If XR is active, update custom gesture detection
- If the main `display` object is visible, update scene objects and shader uniforms
- Render the scene

Important implementation style:

- The code is monolithic and stateful
- Scene objects and plain JS state objects are mixed together
- Most state lives in `userData`
- There is heavy coupling between geometry updates, shader uniform updates, and gesture handlers

## 4. Core Scene Graph And State Objects

The scene graph is built in `docs/script.js` and looks like this conceptually:

- `scene`
- `camera`
- `display`
- `screen`
- `model`
- `selector3D`
- `brush`
- `container`
- `reticle`
- `transformControls`

### `display`

`display` is the top-level object representing the loaded volume/mask assembly in space.

Responsibilities:

- Holds the entire medical object in world/AR space
- Stores mode state in `display.userData.modes`
- Stores transform undo/redo history
- Owns visual prompt points used during segmentation
- Owns global matrices/vectors shared with shaders

Important note:

- The active mode is always `display.userData.modes[0]`
- Swiping rotates this modes array rather than assigning a single enum value

### `volume`

`volume` is a plain object, not a mesh.

Responsibilities:

- Stores the loaded scalar image volume
- Keeps raw data, dimensions, voxel size, physical size, and `Data3DTexture`
- Feeds slice shaders

Important fields:

- `image3D`
- `data0`
- `texture`
- `samples`
- `voxelSize`
- `size`

### `mask`

`mask` is also a plain object, parallel to `volume`.

Responsibilities:

- Stores editable segmentation data
- Keeps its own history/future stacks for undo/redo
- Feeds slice shaders and the volumetric model shader

Editing rule of thumb:

- After changing mask texture data, the code usually also updates screen uniforms, model uniforms, recomputes the model bounding box, updates box uniforms, and marks the texture as dirty

### `container`

`container` is a visible box around the loaded data.

Responsibilities:

- Shows the physical extent of the volume
- Provides an OBB for intersection testing
- Helps constrain screen-axis calculations and hit testing

### `screen`

`screen` is the 3-slice plane system.

Responsibilities:

- Holds 3 monitors, one per orthogonal plane
- Tracks plane equations in world space
- Owns axis helpers and a center marker
- Has its own history/future stacks for undo/redo

Each monitor:

- Is a `THREE.Mesh` plane using the slice shader
- Stores its own local plane
- Stores visibility/alpha and other per-plane uniforms

### `model`

`model` is the volumetric mask rendering mesh.

Responsibilities:

- Draws a box mesh with a custom shader
- Ray-marches the mask texture
- Clips itself against screen planes
- Uses `model.userData.box` as a dynamic ROI / bounding box around non-zero mask voxels

Important note:

- The function `updateModel()` exists but is empty; the real work is mostly in shader uniforms and bounding-box updates

### `brush`

`brush` is a sphere used in `Edit` and `Segment`.

Responsibilities:

- Projects onto the currently viewed monitor
- Represents add/subtract mode with color and label semantics
- Defines a sphere and box used for voxel editing

Brush modes:

- `ADD`: pink, mask value `255`, SAM prompt label `1`
- `SUB`: cyan, mask value `0`, SAM prompt label `0`

### `selector3D`

`selector3D` is a resizable 3D box with draggable vertices/faces.

Responsibilities:

- Holds OBB, outline, draggable corner handles, and draggable face handles
- Has its own history/future stacks
- Is intended for a 3D segmentation workflow

Current status:

- The interaction code exists
- The actual segmentation logic is placeholder-only
- The normal mode rotation does not currently include `Segment3D`

### `reticle`

Shown during AR placement before the display is placed.

Responsibilities:

- Receives WebXR hit-test results
- Provides the pose used to place the display in AR

### `workers`

Workers are created in `setupWorkers()`.

Current implementation:

- Only one worker is created, even though comments imply one per plane
- The worker handles 2D image embedding + prompted segmentation using MobileSAM

## 5. Coordinate Systems

One of the repo's own TODOs is to simplify coordinate systems, and that matches what the code shows.

There are three important spaces:

- World space: regular Three.js / XR coordinates
- Display-local space: coordinates centered on the volume object, using physical volume size
- Display-normalized space: shader-friendly unit-box space, mostly `[-0.5, 0.5]`

Common pattern:

- CPU-side gesture and geometry math often happens in world or display-local space
- GPU-side sampling happens in normalized space after applying `uNormalize`

This distinction matters a lot when changing interaction code or shader uniforms.

## 6. Modes And UX Model

The app is built around interaction modes. The current default rotation is:

- `Place`
- `Inspect`
- `Edit`
- `Segment`

The code also contains `Segment3D`, but it is not included in the default `display.userData.modes` array after setup or session reset.

### `Place`

Purpose:

- Place the display on the AR reticle
- Move/rotate/scale the whole volume assembly

Visual behavior:

- Container visible
- Model visible
- All monitors visible

### `Inspect`

Purpose:

- Manipulate slice planes
- Hide/reveal planes
- Adjust slice orientation and contrast

Visual behavior:

- Container outlined
- Model visible with more clipping transparency
- All monitors visible

### `Edit`

Purpose:

- Paint directly into the mask using the brush

Visual behavior:

- Model hidden
- All monitors visible
- Active monitor emphasized
- Brush projected onto the selected monitor

### `Segment`

Purpose:

- Use prompt points plus MobileSAM on a single slice

Visual behavior:

- Only monitor index `2` is shown
- Stored prompt points are visible
- Brush remains active

Important current limitation:

- The worker encoding path is hard-coded to `slice.axis = 2`, so segmentation is effectively axial-only in the current implementation

### `Segment3D`

Purpose:

- Intended 3D box-based segmentation workflow

Current reality:

- Box interactions exist
- `computeSegmentation3D()` is just a placeholder returning a full array of `1`
- The mode is effectively inactive unless manually added to the modes list

## 7. Gesture Mapping

Gesture detection lives in `docs/prm/XRGestures.js`.

Detected gestures:

- `tap`
- `polytap`
- `swipe`
- `hold`
- `pan`
- `pinch`
- `twist`
- `explode`
- `implode`

App-level mapping in `docs/script.js`:

- `swipe left/right`: cycle modes
- `swipe down/up`: undo/redo depending on current mode
- `implode`: reset current mode state
- `explode`: exit AR
- `double tap` in `Place`: place/hide display
- `double tap` in `Inspect`: hide/reveal selected plane
- `double tap` in `Edit` or `Segment`: toggle brush add/subtract
- `hold`: usually translate something or edit the mask
- `pan`: rotate display or screen monitor depending on mode
- `pinch`: resize display, resize brush, or resize selector
- `twist`: roll display, roll screen, or change contrast depending on mode

Gesture implementation detail:

- `XRGestures` tracks controller positions in camera space and computes movement, path distance, turning, angle offsets, pinch distance, and twist angle from that
- It dispatches semantic gestures only after threshold checks

## 8. Data Loading And Saving

Volume/mask input:

- Uploads are wired through hidden file inputs in `docs/index.html`
- `loadNIFTI()` uses PIXPIPE to decode NIFTI into `Image3D`
- `loadRawNIFTI()` reads the original mask bytes for later re-save

Initialization behavior:

- Uploading a volume creates an empty mask if one is missing
- Uploading a mask creates an empty volume if one is missing
- After either load, the app rebuilds screen/model/container/selector objects and their uniforms

Mask saving:

- `onMaskDownload()` reuses the raw NIFTI header and swaps the datatype to `UInt8`
- Texture image data is then written back out as a new `.nii`

## 9. Rendering Model

### Slice planes

The slice shader pair:

- Samples the volume texture and mask texture
- Overlays mask color
- Draws brush overlay, selector overlay, axis lines, and container border
- Applies brightness/contrast on the slice image
- Uses per-monitor visibility and alpha

### Volumetric model

The model shader pair:

- Ray-marches the mask texture
- Computes a surface normal from local texture gradients
- Shades the mask red based on view-normal alignment
- Clips against visible screen planes
- Restricts marching to `model.userData.box`, a tighter ROI around the current mask

## 10. Segmentation Worker Flow

Worker source: `docs/prm/worker.js`

Dependencies loaded inside the worker:

- TensorFlow.js from CDN
- ONNX Runtime Web from CDN
- Local MobileSAM encoder/decoder ONNX files

Flow:

1. `setupWorkers()` creates worker(s) and sends a `load` message
2. Worker loads MobileSAM models
3. Entering `Segment` triggers `runWorkerEncode()`
4. The current slice is extracted from the volume
5. Worker normalizes and resizes the slice, computes image embedding, and caches it
6. Tapping on the slice adds prompt coordinates + labels
7. `runWorkerDecode()` sends prompts to the decoder
8. Decoded mask is merged into the current mask texture

Important current behavior:

- The merge is `Math.max(originalMaskSliceValue, segmentValue)`
- Clearing points restores the cached slice texture data from before prompt-based edits
- Re-encoding also happens after moving the slice monitor in `Segment`

## 11. Important Helper Utilities

Helpers worth remembering in `docs/script.js`:

- `localPositionToVoxel(...)`: display-local -> voxel index
- `worldPositionToVoxel(...)`: world -> voxel index
- `voxelToWorldPosition(...)`: voxel index -> world
- `projectBoxOnPlane(...)`: projects a box onto a plane, used by brush editing
- `getSlice(...)`: extracts a 2D slice and its linear indices
- `bufferAction(...)`: delayed retry loop used for worker readiness
- `positionToAxis(...)`: determines a rotation axis for screen monitor rotation based on hit position

## 12. Known Unfinished Or Risky Areas

These are useful to remember before making changes:

- `Segment3D` is not part of the active mode cycle, despite UI/update code for it
- `computeSegmentation3D()` is a stub
- `updateModel()` is empty
- `onLeavingSegmentMode()` is empty
- `computeMinimalBox2()` is empty
- `transformArray()` references `size` without defining it locally
- `onGestureRotateObjectOnWorldPivot()` appears inconsistent and likely unused/broken
- Comments in worker setup say "one worker for each plane", but the current code creates exactly one worker
- The segmentation worker is effectively hard-coded to plane index / axis `2`
- The app relies on a lot of implicit update ordering; missing a follow-up uniform update can easily cause stale visuals

One smaller correctness concern:

- `updateMaskTexture(array, min, max)` compares `array.length !== mask.userData.texture.image.data`, which looks like a bug because the right side is the array object, not its length

## 13. Practical Reminders For Future Edits

When changing mask data:

- Update texture contents
- Mark `mask.userData.texture.needsUpdate = true`
- Refresh screen/model mask uniforms
- Recompute the model bounding box if the edited region can change it

When changing screen transforms or plane visibility:

- Update the screen object
- Refresh screen plane uniforms
- Refresh model plane uniforms

When changing mode behavior:

- Check `updateUI()`
- Check gesture routing (`onPolytap`, `onSwipe`, `onHold`, `onPan`, `onPinch`, `onTwist`, `onImplode`, `onExplode`)
- Check history/reset behavior for that mode

When changing segmentation:

- Review both the main-thread slice bookkeeping and the worker-side preprocessing/decoding
- Be careful about prompt coordinate normalization and slice-axis assumptions

## 14. Short Mental Model

If you only remember one thing, remember this:

The app is a single-module Three.js/WebXR medical viewer where `display` is the parent world object, `screen` is the tri-planar slice system, `mask` is the editable segmentation volume, `model` is a shader-based 3D rendering of that mask, `brush` is the 2D editing/segment prompt tool, and `worker.js` runs a MobileSAM-based slice segmentation pipeline that currently works in a limited, mostly axial 2D workflow.
