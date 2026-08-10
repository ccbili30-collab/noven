const stage = document.getElementById("map-stage");
const canvas = document.getElementById("map-canvas");
const context = canvas.getContext("2d");
const card = document.getElementById("region-card");
const baseImage = new Image();
const maskImage = new Image();
let cachedRegionLayers;
let manifest;
let maskData;
let maskColors;
let regionsByColor;
let selectedRegion;
let selectedPoint;
let dragging;

start().catch(showError);

async function start() {
  manifest = await fetch("map-manifest.json").then(requireResponse).then((response) => response.json());
  await Promise.all([loadImage(baseImage, manifest.base), loadImage(maskImage, manifest.mask)]);
  requireRuntimeContract();
  canvas.width = baseImage.naturalWidth;
  canvas.height = baseImage.naturalHeight;
  fitCanvas();
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskImage.naturalWidth;
  maskCanvas.height = maskImage.naturalHeight;
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskContext.drawImage(maskImage, 0, 0);
  maskData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  validateMaskPixels();
  render();
}

window.addEventListener("resize", () => {
  if (!canvas.width || !canvas.height) return;
  fitCanvas();
  if (!card.hidden) clampCard();
});

function fitCanvas() {
  const scale = Math.min(stage.clientWidth / canvas.width, stage.clientHeight / canvas.height);
  canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
  canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
}

function requireRuntimeContract() {
  if (manifest.schemaVersion !== 1) throw new Error("manifest_schema_unsupported");
  if (baseImage.naturalWidth !== manifest.canvas.width || baseImage.naturalHeight !== manifest.canvas.height) throw new Error("base_dimensions_mismatch");
  if (maskImage.naturalWidth !== manifest.canvas.width || maskImage.naturalHeight !== manifest.canvas.height) throw new Error("mask_dimensions_mismatch");
}

function validateMaskPixels() {
  regionsByColor = new Map(manifest.regions.map((region) => [Number.parseInt(region.maskColor.slice(1), 16), region]));
  const counts = new Map(manifest.regions.map((region) => [region.id, 0]));
  maskColors = new Uint32Array(maskData.width * maskData.height);
  for (let pixel = 0; pixel < maskColors.length; pixel++) {
    const offset = pixel * 4;
    if (maskData.data[offset + 3] !== 255) throw new Error("mask_transparency_not_allowed");
    const color = (maskData.data[offset] << 16) | (maskData.data[offset + 1] << 8) | maskData.data[offset + 2];
    maskColors[pixel] = color;
    const region = regionsByColor.get(color);
    if (!region) throw new Error(`mask_unknown_color:#${color.toString(16).padStart(6, "0")}`);
    counts.set(region.id, counts.get(region.id) + 1);
  }
  for (const [id, count] of counts) if (count === 0) throw new Error(`mask_region_empty:${id}`);
}

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(baseImage, 0, 0);
  if (!selectedRegion) return;
  const layers = getRegionLayers(selectedRegion);
  if (selectedRegion.kind !== "land") {
    context.save();
    context.globalCompositeOperation = "screen";
    context.globalAlpha = .22;
    context.drawImage(layers.waterHighlight, 0, 0);
    context.restore();
    drawOutline(layers.outline, 0);
    return;
  }
  const scale = displayedScale();
  const lift = Math.max(8, Math.round(11 / Math.max(scale, .1)));
  context.save();
  context.globalAlpha = .94;
  context.drawImage(layers.hole, 0, 0);
  for (let depth = 5; depth >= 1; depth--) {
    context.globalAlpha = .42 + depth * .07;
    context.drawImage(layers.side, 0, -lift + depth);
  }
  context.restore();
  context.save();
  context.shadowColor = "rgba(0,0,0,.62)";
  context.shadowBlur = 10 / Math.max(scale, .1);
  context.shadowOffsetY = 5 / Math.max(scale, .1);
  context.drawImage(layers.art, 0, -lift);
  context.restore();
  drawOutline(layers.outline, -lift);
}

function drawOutline(outline, offsetY) {
  context.save();
  context.globalAlpha = .42;
  context.filter = "blur(4px)";
  context.drawImage(outline, 0, offsetY);
  context.globalAlpha = 1;
  context.filter = "none";
  context.drawImage(outline, 0, offsetY);
  context.restore();
}

function getRegionLayers(region) {
  if (cachedRegionLayers?.id === region.id) return cachedRegionLayers.layers;
  const mask = document.createElement("canvas");
  mask.width = canvas.width;
  mask.height = canvas.height;
  const maskContext = mask.getContext("2d");
  const regionMask = maskContext.createImageData(canvas.width, canvas.height);
  const outline = document.createElement("canvas");
  outline.width = canvas.width;
  outline.height = canvas.height;
  const outlineContext = outline.getContext("2d");
  const boundary = outlineContext.createImageData(canvas.width, canvas.height);
  const target = Number.parseInt(region.maskColor.slice(1), 16);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const pixel = y * canvas.width + x;
      const offset = pixel * 4;
      if (maskColors[pixel] !== target) continue;
      regionMask.data[offset] = 255;
      regionMask.data[offset + 1] = 255;
      regionMask.data[offset + 2] = 255;
      regionMask.data[offset + 3] = 255;
      const edge = x === 0 || y === 0 || x === canvas.width - 1 || y === canvas.height - 1;
      const neighborDiffers = !edge && (
        maskColors[pixel - 1] !== target ||
        maskColors[pixel + 1] !== target ||
        maskColors[pixel - canvas.width] !== target ||
        maskColors[pixel + canvas.width] !== target
      );
      if (!edge && !neighborDiffers) continue;
      boundary.data[offset] = 255;
      boundary.data[offset + 1] = 218;
      boundary.data[offset + 2] = 113;
      boundary.data[offset + 3] = 255;
    }
  }
  maskContext.putImageData(regionMask, 0, 0);
  outlineContext.putImageData(boundary, 0, 0);
  const art = clippedBase(mask);
  const layers = {
    art,
    outline,
    hole: tintedMask(mask, "#05090a"),
    side: tintedMask(mask, "#51493d"),
    waterHighlight: tintedMask(mask, region.kind === "water" ? "#5e9aaa" : "#8d8270"),
  };
  cachedRegionLayers = { id: region.id, layers };
  return layers;
}

function clippedBase(mask) {
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const layerContext = layer.getContext("2d");
  layerContext.drawImage(baseImage, 0, 0);
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.drawImage(mask, 0, 0);
  return layer;
}

function tintedMask(mask, color) {
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const layerContext = layer.getContext("2d");
  layerContext.fillStyle = color;
  layerContext.fillRect(0, 0, layer.width, layer.height);
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.drawImage(mask, 0, 0);
  return layer;
}

canvas.addEventListener("click", (event) => {
  if (!maskData) return;
  const point = imagePoint(event.clientX, event.clientY);
  if (!point) return;
  const region = regionsByColor.get(maskColors[point.y * canvas.width + point.x]);
  if (!region) return;
  if (selectedRegion?.id === region.id) {
    clearSelection();
    return;
  }
  selectedRegion = region;
  selectedPoint = { x: event.clientX, y: event.clientY };
  showCard(region, selectedPoint);
  render();
});

document.getElementById("region-close").addEventListener("click", clearSelection);
window.addEventListener("keydown", (event) => { if (event.key === "Escape") clearSelection(); });

function showCard(region, point) {
  document.getElementById("region-kind").textContent = region.kind === "land" ? "LAND REGION" : region.kind === "water" ? "WATER REGION" : "UNKNOWN REGION";
  document.getElementById("region-name").textContent = region.name;
  document.getElementById("region-summary").textContent = region.summary ?? "";
  const details = document.getElementById("region-details");
  details.replaceChildren();
  for (const item of region.details ?? []) {
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = item.label;
    value.textContent = item.value;
    details.append(term, value);
  }
  const sources = document.getElementById("region-sources");
  sources.textContent = region.sourcePaths?.length ? `依据：${region.sourcePaths.join(" · ")}` : "";
  card.hidden = false;
  card.style.left = `${point.x + 18}px`;
  card.style.top = `${point.y + 18}px`;
  requestAnimationFrame(clampCard);
}

function clearSelection() {
  selectedRegion = undefined;
  selectedPoint = undefined;
  card.hidden = true;
  render();
}

const cardHeader = document.querySelector(".region-card-header");
cardHeader.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  const rectangle = card.getBoundingClientRect();
  dragging = { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  event.currentTarget.setPointerCapture(event.pointerId);
});
cardHeader.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  card.style.left = `${event.clientX - dragging.x}px`;
  card.style.top = `${event.clientY - dragging.y}px`;
  clampCard();
});
cardHeader.addEventListener("pointerup", () => { dragging = undefined; });
cardHeader.addEventListener("pointercancel", () => { dragging = undefined; });

function clampCard() {
  const rectangle = card.getBoundingClientRect();
  card.style.left = `${Math.max(12, Math.min(parseFloat(card.style.left), innerWidth - rectangle.width - 12))}px`;
  card.style.top = `${Math.max(12, Math.min(parseFloat(card.style.top), innerHeight - rectangle.height - 12))}px`;
}

function imagePoint(clientX, clientY) {
  const rectangle = canvas.getBoundingClientRect();
  const scale = displayedScale();
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  const x = (clientX - rectangle.left - (rectangle.width - width) / 2) / scale;
  const y = (clientY - rectangle.top - (rectangle.height - height) / 2) / scale;
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return undefined;
  return { x: Math.floor(x), y: Math.floor(y) };
}

function displayedScale() {
  const rectangle = canvas.getBoundingClientRect();
  return Math.min(rectangle.width / canvas.width, rectangle.height / canvas.height);
}

function loadImage(image, source) {
  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error(`image_load_failed:${source}`)), { once: true });
    image.src = source;
  });
}

function requireResponse(response) {
  if (!response.ok) throw new Error(`http_${response.status}`);
  return response;
}

function showError(error) {
  const output = document.getElementById("map-error");
  output.hidden = false;
  output.textContent = error instanceof Error ? error.message : String(error);
}
