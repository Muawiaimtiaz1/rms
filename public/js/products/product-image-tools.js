// Product image tools: POS-card crop + lightweight background removal.
// This stays separate from app.js so image-editing features can evolve safely.
(function () {
  const ASPECTS = {
    pos: { label: "Product Card (4:3)", width: 4, height: 3 },
  };

  const DEFAULT_STATE = {
    originalImage: null,
    image: null,
    fileName: "product-image",
    aspectKey: "pos",
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    bgTolerance: 46,
    bgRemoved: false,
  };

  let state = { ...DEFAULT_STATE };

  function resetState() {
    state = { ...DEFAULT_STATE };
  }

  function getAspectOptions(selected = "pos") {
    return Object.entries(ASPECTS)
      .map(([value, aspect]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${aspect.label}</option>`)
      .join("");
  }

  function setStatus(message, tone = "info") {
    const el = document.getElementById("pf-image-tool-status");
    if (!el) return;
    const toneClass = tone === "error"
      ? "text-rose-500"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-slate-500 dark:text-slate-400";
    el.className = `text-[11px] font-bold ${toneClass}`;
    el.textContent = message || "";
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function previewFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      const src = await readFileAsDataUrl(file);
      const img = await loadImage(src);
      state = {
        ...DEFAULT_STATE,
        originalImage: img,
        image: img,
        fileName: file.name || "product-image",
      };

      const editor = document.getElementById("pf-crop-editor");
      if (editor) editor.classList.remove("hidden");
      resetControls();
      renderCrop();
      applyCrop(false);
      setStatus("Image loaded. Adjust crop or remove background before saving.");
    } catch (error) {
      setStatus("Could not read this image. Try another file.", "error");
      console.error("[ProductImageTools] Image preview failed:", error);
    }
  }

  function resetControls() {
    const aspect = document.getElementById("pf-crop-aspect");
    const zoom = document.getElementById("pf-crop-zoom");
    const x = document.getElementById("pf-crop-x");
    const y = document.getElementById("pf-crop-y");
    const tolerance = document.getElementById("pf-bg-tolerance");

    if (aspect) aspect.value = state.aspectKey || "pos";
    if (zoom) zoom.value = state.zoom || 1;
    if (x) x.value = state.offsetX || 0;
    if (y) y.value = state.offsetY || 0;
    if (tolerance) tolerance.value = state.bgTolerance || DEFAULT_STATE.bgTolerance;
  }

  function updateCrop(patch = {}) {
    if (!state.image) return;
    state = { ...state, ...patch };
    renderCrop();
    applyCrop(false);
  }

  function setAspect(aspectKey) {
    if (!state.image || !ASPECTS[aspectKey]) return;
    updateCrop({ aspectKey, offsetX: 0, offsetY: 0 });
    resetControls();
  }

  function resetCrop() {
    if (!state.image) return;
    state = {
      ...state,
      aspectKey: "pos",
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    };
    resetControls();
    renderCrop();
    applyCrop(false);
    setStatus("Crop reset.");
  }

  function getCanvasSize() {
    const aspect = ASPECTS[state.aspectKey] || ASPECTS.pos;
    const width = 720;
    return { width, height: Math.round(width * (aspect.height / aspect.width)) };
  }

  function renderCrop() {
    if (!state.image) return null;
    const canvas = document.getElementById("pf-crop-canvas");
    if (!canvas) return null;

    const { width, height } = getCanvasSize();
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    const img = state.image;
    ctx.clearRect(0, 0, width, height);
    if (!state.bgRemoved) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, width, height);
    }

    const baseScale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const scale = baseScale * (state.zoom || 1);
    const drawWidth = img.naturalWidth * scale;
    const drawHeight = img.naturalHeight * scale;
    const maxX = Math.max(0, (drawWidth - width) / 2);
    const maxY = Math.max(0, (drawHeight - height) / 2);
    const dx = (width - drawWidth) / 2 + ((state.offsetX || 0) / 100) * maxX;
    const dy = (height - drawHeight) / 2 + ((state.offsetY || 0) / 100) * maxY;

    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
    return canvas;
  }

  function applyCrop(showStatus = true) {
    const canvas = renderCrop();
    const preview = document.getElementById("pf-img-preview");
    if (canvas && preview) {
      preview.innerHTML = `<img src="${canvas.toDataURL(state.bgRemoved ? "image/png" : "image/jpeg", 0.9)}" class="w-full h-full object-cover" />`;
    }
    if (showStatus) setStatus("Crop applied.", "success");
  }

  function setBgTolerance(value) {
    state.bgTolerance = Number(value) || DEFAULT_STATE.bgTolerance;
  }

  function colorDistanceSq(data, idx, samples) {
    let best = Infinity;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    for (const sample of samples) {
      const dr = r - sample.r;
      const dg = g - sample.g;
      const db = b - sample.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < best) best = dist;
    }
    return best;
  }

  function averageBlock(data, width, height, startX, startY, size) {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    const endX = Math.min(width, startX + size);
    const endY = Math.min(height, startY + size);
    for (let y = Math.max(0, startY); y < endY; y += 1) {
      for (let x = Math.max(0, startX); x < endX; x += 1) {
        const idx = (y * width + x) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        count += 1;
      }
    }
    return {
      r: Math.round(r / Math.max(1, count)),
      g: Math.round(g / Math.max(1, count)),
      b: Math.round(b / Math.max(1, count)),
    };
  }

  function removeConnectedBackground(imageData, width, height) {
    const data = imageData.data;
    const block = Math.max(4, Math.round(Math.min(width, height) * 0.035));
    const samples = [
      averageBlock(data, width, height, 0, 0, block),
      averageBlock(data, width, height, width - block, 0, block),
      averageBlock(data, width, height, 0, height - block, block),
      averageBlock(data, width, height, width - block, height - block, block),
    ];

    const thresholdSq = (state.bgTolerance || DEFAULT_STATE.bgTolerance) ** 2;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;

    const isBackground = (pixelIndex) => colorDistanceSq(data, pixelIndex * 4, samples) <= thresholdSq;
    const push = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const pixel = y * width + x;
      if (visited[pixel] || !isBackground(pixel)) return;
      visited[pixel] = 1;
      queue[tail] = pixel;
      tail += 1;
    };

    for (let x = 0; x < width; x += 1) {
      push(x, 0);
      push(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      push(0, y);
      push(width - 1, y);
    }

    while (head < tail) {
      const pixel = queue[head];
      head += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      data[pixel * 4 + 3] = 0;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    return imageData;
  }

  async function removeBackground() {
    if (!state.originalImage) return;
    setStatus("Removing background...");

    const source = state.originalImage;
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(source.naturalWidth, source.naturalHeight));
    const width = Math.max(1, Math.round(source.naturalWidth * scale));
    const height = Math.max(1, Math.round(source.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    ctx.putImageData(removeConnectedBackground(imageData, width, height), 0, 0);

    const img = await loadImage(canvas.toDataURL("image/png"));
    state = { ...state, image: img, bgRemoved: true };
    renderCrop();
    applyCrop(false);
    setStatus("Background removed. Adjust sensitivity and run again if needed.", "success");
  }

  function restoreBackground() {
    if (!state.originalImage) return;
    state = { ...state, image: state.originalImage, bgRemoved: false };
    renderCrop();
    applyCrop(false);
    setStatus("Original background restored.");
  }

  function getUploadFile() {
    if (!state.image) return Promise.resolve(null);
    const canvas = renderCrop();
    if (!canvas) return Promise.resolve(null);

    const mime = state.bgRemoved ? "image/png" : "image/jpeg";
    const ext = state.bgRemoved ? "png" : "jpg";
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null);
        const baseName = (state.fileName || "product-image").replace(/\.[^.]+$/, "");
        resolve(new File([blob], `${baseName}-edited.${ext}`, { type: mime }));
      }, mime, 0.9);
    });
  }

  window.ProductImageTools = {
    ASPECTS,
    getAspectOptions,
    resetState,
    previewFile,
    updateCrop,
    setAspect,
    resetCrop,
    applyCrop,
    setBgTolerance,
    removeBackground,
    restoreBackground,
    getUploadFile,
  };

  window.previewProductImage = (input) => window.ProductImageTools.previewFile(input);
  window.updateProductImageCrop = (patch) => window.ProductImageTools.updateCrop(patch);
  window.setProductImageCropAspect = (aspectKey) => window.ProductImageTools.setAspect(aspectKey);
  window.resetProductImageCrop = () => window.ProductImageTools.resetCrop();
  window.applyProductImageCrop = () => window.ProductImageTools.applyCrop(true);
  window.updateProductImageBgTolerance = (value) => window.ProductImageTools.setBgTolerance(value);
  window.removeProductImageBackground = () => window.ProductImageTools.removeBackground();
  window.restoreProductImageBackground = () => window.ProductImageTools.restoreBackground();
})();
