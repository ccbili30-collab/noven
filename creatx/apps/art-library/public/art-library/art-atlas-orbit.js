(() => {
  const stage = document.getElementById("orbitStage");
  const items = Array.isArray(window.ART_ATLAS_ORBIT_ITEMS) ? window.ART_ATLAS_ORBIT_ITEMS : [];
  const slotElements = [...document.querySelectorAll("[data-orbit-slot]")];
  const currentLabel = document.getElementById("orbitCurrent");
  const hudLine = document.getElementById("orbitHudLine");
  const zoomLabel = document.getElementById("orbitZoom");
  const workCount = document.getElementById("orbitWorkCount");
  const libraryReel = document.getElementById("orbitLibraryReel");
  const libraryPrev = document.getElementById("orbitLibraryPrev");
  const libraryCurrent = document.getElementById("orbitLibraryCurrent");
  const libraryNext = document.getElementById("orbitLibraryNext");
  if (!stage || !items.length || !slotElements.length) return;

  const slotOffsets = [-3, -2, -1, 0, 1, 2, 3];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const introActive = document.documentElement.classList.contains("has-atlas-intro");
  const introCarTravel = 2200;
  const introCarStagger = 260;
  const introDuration = introCarTravel + introCarStagger * (slotOffsets.length - 1);
  const restingImageScale = 1.256;
  const dialItemsPerTurn = 8;
  const imageRatioCache = new Map();
  const preloadedOrbitImages = [];
  const introImagesReady = document.documentElement.classList.contains("has-atlas-intro")
    ? Promise.all([...new Set(items.map((item) => item.image))].map((source) => new Promise((resolve) => {
      const image = new Image();
      preloadedOrbitImages.push(image);
      image.onload = async () => {
        const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
        if (Number.isFinite(ratio) && ratio > 0) imageRatioCache.set(source, ratio);
        try {
          await image.decode();
        } catch {}
        resolve();
      };
      image.onerror = resolve;
      image.src = source;
    })))
    : Promise.resolve();
  const configuredLibraryNames = Array.isArray(window.ART_ATLAS_LIBRARY_NAMES)
    ? window.ART_ATLAS_LIBRARY_NAMES.filter(Boolean)
    : [];
  const libraryNames = [...new Set(configuredLibraryNames.length
    ? configuredLibraryNames
    : items.map((item) => item.library).filter(Boolean))];
  const records = slotElements.map((element) => ({
    element,
    link: element.querySelector(".piece-image"),
    image: element.querySelector("img"),
    caption: element.querySelector(".piece-caption"),
    number: element.querySelector(".piece-number"),
    title: element.querySelector(".piece-caption strong"),
    meta: element.querySelector(".piece-caption span:not(.piece-number)"),
    tags: element.querySelector(".piece-caption em"),
    item: null,
    itemIndex: null,
    offset: 0,
    ratio: 0,
    source: "",
  }));

  const restingPosition = 2;
  let currentPosition = restingPosition;
  let targetPosition = currentPosition;
  let currentImageScale = introActive ? 1 : restingImageScale;
  let targetImageScale = currentImageScale;
  let reconciledBase = Number.NaN;
  let animationFrame = 0;
  let snapTimer = 0;
  let dragging = false;
  let pointerStartY = 0;
  let pointerStartPosition = 0;
  let pointerPreviousAngle = null;
  let pointerUsesDial = false;
  let pointerDownLink = null;
  let gestureAngularTravel = 0;
  let suppressClickUntil = 0;
  let hudDragging = false;
  let activeLibraryName = "";
  let libraryAnimationTimer = 0;
  let zoomFeedbackTimer = 0;
  let renderedZoomPercent = 100;
  let visibleSlotCount = 0;
  let lastTickTime = 0;
  let introProgress = introActive ? 0 : 1;

  function modulo(value, length) {
    return ((value % length) + length) % length;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(min, max, value) {
    const progress = clamp((value - min) / (max - min), 0, 1);
    return progress * progress * (3 - 2 * progress);
  }

  function updateZoomLabel(force = false) {
    if (!zoomLabel) return;
    const percent = Math.round(currentImageScale * 100);
    if (!force && percent === renderedZoomPercent) return;
    renderedZoomPercent = percent;
    zoomLabel.value = `${percent}%`;
    zoomLabel.textContent = `${percent}%`;
  }

  function setImageScale(value) {
    targetImageScale = clamp(Number(value) || 1, .65, 1.65);
    if (reduceMotion) currentImageScale = targetImageScale;
    stage.classList.add("is-zooming");
    window.clearTimeout(zoomFeedbackTimer);
    zoomFeedbackTimer = window.setTimeout(() => stage.classList.remove("is-zooming"), 720);
    requestTick();
  }

  function gesturePoint(event) {
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width * .62;
    const centerY = rect.top + rect.height * .5;
    const x = event.clientX - centerX;
    const y = event.clientY - centerY;
    return {
      angle: Math.atan2(y, x),
      radius: Math.hypot(x, y),
    };
  }

  function shortestAngleDelta(current, previous) {
    return Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
  }

  function updateLibraryReel(activeItemIndex) {
    if (!libraryReel || !libraryPrev || !libraryCurrent || !libraryNext || !libraryNames.length) return;
    const name = items[activeItemIndex]?.library || libraryNames[0];
    if (name === activeLibraryName) return;
    const libraryIndex = Math.max(0, libraryNames.indexOf(name));
    const libraryAt = (offset) => libraryNames[modulo(libraryIndex + offset, libraryNames.length)] || "";
    const shouldAnimate = Boolean(activeLibraryName) && !reduceMotion;
    activeLibraryName = name;
    libraryPrev.textContent = libraryNames.length > 1 ? libraryAt(-1) : "";
    libraryCurrent.textContent = name;
    libraryNext.textContent = libraryNames.length > 1 ? libraryAt(1) : "";
    libraryReel.setAttribute("aria-label", `当前艺术库：${name}`);
    if (!shouldAnimate) return;
    window.clearTimeout(libraryAnimationTimer);
    libraryReel.classList.remove("is-changing");
    void libraryReel.offsetWidth;
    libraryReel.classList.add("is-changing");
    libraryAnimationTimer = window.setTimeout(() => libraryReel.classList.remove("is-changing"), 560);
  }

  function animateWorkCount() {
    if (!workCount) return;
    const storageKey = "creatx-art-atlas-work-count";
    let previousCount = items.length;
    try {
      const storedCount = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(storedCount) && storedCount >= 0) previousCount = storedCount;
      window.localStorage.setItem(storageKey, String(items.length));
    } catch {
      previousCount = items.length;
    }
    if (previousCount === items.length || reduceMotion) {
      workCount.textContent = String(items.length);
      return;
    }
    const startedAt = performance.now();
    const duration = 620;
    const update = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      workCount.textContent = String(Math.round(previousCount + (items.length - previousCount) * eased));
      if (progress < 1) window.requestAnimationFrame(update);
    };
    window.requestAnimationFrame(update);
  }

  function bindRecord(record, itemIndex) {
    if (record.itemIndex === itemIndex) return;
    const item = items[itemIndex];
    record.item = item;
    record.itemIndex = itemIndex;
    record.ratio = imageRatioCache.get(item.image) || 0;
    record.source = "";
    record.element.dataset.itemIndex = String(itemIndex);
    record.element.className = "orbit-piece";
    const detailQuery = new URLSearchParams({
      from: "library",
      library: item.library || "艺术馆",
      orbitIndex: String(itemIndex),
      title: item.title || "未命名作品",
    });
    record.link.href = `./artwork-detail-concept.html?${detailQuery.toString()}`;
    record.link.dataset.routeMist = "rtl";
    record.link.setAttribute("aria-label", item.title || "艺术馆藏品");
    record.image.alt = item.title || "艺术馆藏品";
    record.image.removeAttribute("src");
    delete record.image.dataset.source;
    record.number.textContent = String(itemIndex + 1).padStart(2, "0");
    record.title.textContent = item.title || "未命名作品";
    record.meta.textContent = item.meta || "艺术馆藏品";
    record.tags.textContent = item.tags || "";
    record.tags.hidden = !item.tags;
  }

  function ensureRecordImage(record) {
    if (!record.item || (record.source === record.item.image && record.image.hasAttribute("src"))) return;
    record.source = record.item.image;
    record.image.dataset.source = record.item.image;
    record.image.src = record.item.image;
    if (record.image.complete) markRecordImageReady(record);
  }

  function markRecordImageReady(record) {
    if (record.image.dataset.source !== record.source || !record.image.naturalWidth) return false;
    const nextRatio = record.image.naturalWidth / Math.max(1, record.image.naturalHeight);
    if (!Number.isFinite(nextRatio) || nextRatio <= 0) return false;
    record.ratio = nextRatio;
    imageRatioCache.set(record.source, nextRatio);
    record.element.classList.add("is-image-ready");
    return true;
  }

  function releaseRecordImage(record) {
    if (!record.source && !record.image.hasAttribute("src")) return;
    record.source = "";
    record.image.removeAttribute("src");
    delete record.image.dataset.source;
    record.element.classList.remove("is-image-ready");
  }

  function reconcileSlots(baseIndex) {
    const desired = slotOffsets.map((offset) => ({
      offset,
      itemIndex: modulo(baseIndex + offset, items.length),
    }));
    const desiredIndices = new Set(desired.map((entry) => entry.itemIndex));
    const used = new Set();

    for (const entry of desired) {
      let record = records.find((candidate) => !used.has(candidate) && candidate.itemIndex === entry.itemIndex);
      if (!record) {
        record = records.find((candidate) => !used.has(candidate) && !desiredIndices.has(candidate.itemIndex));
      }
      if (!record) record = records.find((candidate) => !used.has(candidate));
      used.add(record);
      bindRecord(record, entry.itemIndex);
      record.offset = entry.offset;
    }
    reconciledBase = baseIndex;
  }

  function scaleForDistance(distance) {
    return .39 + .61 * Math.exp(-.52 * distance * distance);
  }

  function focusWidthForRatio(ratio, rect, mobile) {
    const targetHeight = rect.height * (mobile ? .34 : .36);
    const maximumWidth = rect.width * (mobile ? .7 : .33);
    const minimumWidth = rect.width * (mobile ? .24 : .1);
    return clamp(ratio * targetHeight, minimumWidth, maximumWidth);
  }

  function overlapForPair(a, b) {
    const smallerHeight = Math.min(a.height, b.height);
    const distance = Math.max(Math.abs(a.distance), Math.abs(b.distance));
    return clamp(smallerHeight * (.22 + distance * .065), 32, 92);
  }

  function renderOrbit() {
    const rect = stage.getBoundingClientRect();
    const mobile = rect.width < 760;
    const baseIndex = Math.round(currentPosition);
    const fraction = currentPosition - baseIndex;
    if (baseIndex !== reconciledBase) reconcileSlots(baseIndex);

    const metrics = records.map((record) => {
      const distance = record.offset - fraction;
      const ratio = record.ratio || .66;
      const scale = scaleForDistance(Math.abs(distance));
      const focusWidth = focusWidthForRatio(ratio, rect, mobile);
      const width = focusWidth * scale * currentImageScale;
      return {
        record,
        distance,
        scale,
        ratio,
        focusWidth,
        width,
        height: width / ratio,
        y: 0,
      };
    }).sort((a, b) => a.record.offset - b.record.offset);

    const anchor = metrics.find((metric) => metric.record.offset === 0);
    const focusY = rect.height * .5;
    anchor.y = focusY;

    let previous = anchor;
    for (const metric of metrics.filter((entry) => entry.record.offset > 0)) {
      const overlap = overlapForPair(previous, metric);
      metric.y = previous.y + (previous.height + metric.height) * .5 - overlap;
      previous = metric;
    }

    previous = anchor;
    for (const metric of metrics.filter((entry) => entry.record.offset < 0).sort((a, b) => b.record.offset - a.record.offset)) {
      const overlap = overlapForPair(previous, metric);
      metric.y = previous.y - (previous.height + metric.height) * .5 + overlap;
      previous = metric;
    }

    const nextMetric = metrics.find((metric) => metric.record.offset === (fraction >= 0 ? 1 : -1));
    if (nextMetric && fraction !== 0) {
      const travel = Math.abs(nextMetric.y - focusY);
      const shift = -fraction * travel;
      for (const metric of metrics) metric.y += shift;
    }

    const baseX = rect.width * (mobile ? .27 : .3);
    const radiusX = rect.width * (mobile ? .46 : .43);
    const radiusY = rect.height * (mobile ? .56 : .52);
    const activeIndex = modulo(baseIndex, items.length);
    visibleSlotCount = 0;

    for (const metric of metrics) {
      const { record, distance, width, height } = metric;
      let displayY = metric.y;
      let introItemProgress = 1;
      if (introActive && introProgress < 1) {
        const departureOrder = record.offset + 3;
        const elapsed = introProgress * introDuration;
        const localProgress = clamp((elapsed - departureOrder * introCarStagger) / introCarTravel, 0, 1);
        introItemProgress = smoothstep(0, 1, localProgress);
        displayY = rect.height + height * .65 + (metric.y - rect.height - height * .65) * introItemProgress;
      }
      const normalizedY = clamp((displayY - focusY) / radiusY, -1, 1);
      const curveDepth = Math.max(0, 1 - normalizedY * normalizedY);
      const x = baseX + radiusX * curveDepth;
      const visibleTop = Math.max(0, displayY - height * .5);
      const visibleBottom = Math.min(rect.height, displayY + height * .5);
      const visibleFraction = Math.max(0, visibleBottom - visibleTop) / Math.max(1, height);
      const shouldRender = introItemProgress > 0 && Math.abs(distance) <= 3.35 && visibleFraction >= .01;
      if (!shouldRender) {
        if (introActive && introProgress < 1) ensureRecordImage(record);
        else releaseRecordImage(record);
        record.element.style.display = "none";
        record.element.setAttribute("aria-hidden", "true");
        record.element.classList.remove("is-active");
        record.element.classList.remove("is-caption-visible");
        continue;
      }

      ensureRecordImage(record);
      visibleSlotCount += 1;
      const baseOpacity = clamp(1 - Math.abs(distance) * .1, .44, 1);
      const viewportFade = smoothstep(.02, .32, visibleFraction);
      const orbitFade = 1 - smoothstep(2, 3.45, Math.abs(distance));
      const opacity = baseOpacity * viewportFade * orbitFade;
      const isActive = Math.abs(distance) < .5;

      record.element.style.display = "block";
      record.element.style.width = width.toFixed(2) + "px";
      record.element.style.opacity = opacity.toFixed(3);
      record.element.style.zIndex = String(1000 + Math.round(displayY));
      record.element.style.pointerEvents = introProgress < 1 ? "none" : (Math.abs(distance) < 3.35 ? "auto" : "none");
      record.element.style.transform = "translate3d(" + x.toFixed(2) + "px," + displayY.toFixed(2) + "px,0) translate(-50%,-50%)";
      record.element.setAttribute("aria-hidden", Math.abs(distance) < 3.35 ? "false" : "true");
      record.element.classList.toggle("is-active", isActive);

      const showCaption = introItemProgress > .86 && width > (mobile ? 82 : 112) && Math.abs(distance) < 2.35 && opacity > .3;
      const captionOnLeft = x + width * .5 > rect.width * .69 || x > rect.width * .6;
      record.element.style.setProperty("--caption-hidden-y", distance < 0 ? "-12px" : "12px");
      record.element.classList.toggle("caption-left", captionOnLeft);
      record.element.classList.toggle("caption-right", !captionOnLeft);
      record.element.classList.toggle("is-caption-visible", showCaption);
    }

    currentLabel.textContent = String(activeIndex + 1).padStart(2, "0");
    const wrappedPosition = modulo(currentPosition, items.length);
    const progress = items.length > 1 ? clamp(wrappedPosition / (items.length - 1), 0, 1) * 100 : 0;
    hudLine.style.setProperty("--orbit-progress", progress.toFixed(2) + "%");
    hudLine.setAttribute("aria-valuenow", String(activeIndex + 1));
    hudLine.setAttribute("aria-valuetext", items[activeIndex]?.title || `作品 ${activeIndex + 1}`);
    updateZoomLabel();
    updateLibraryReel(activeIndex);
  }

  function requestTick() {
    stage.classList.add("is-moving");
    if (!animationFrame) animationFrame = window.requestAnimationFrame(tick);
  }

  function tick(now) {
    animationFrame = 0;
    const positionDistance = targetPosition - currentPosition;
    const scaleDistance = targetImageScale - currentImageScale;
    if (reduceMotion || (Math.abs(positionDistance) < .0005 && Math.abs(scaleDistance) < .0005)) {
      currentPosition = targetPosition;
      currentImageScale = targetImageScale;
      renderOrbit();
      lastTickTime = 0;
      if (!dragging) stage.classList.remove("is-moving");
      return;
    }
    const frameDuration = lastTickTime ? clamp(now - lastTickTime, 8, 50) : 16.667;
    const follow = 1 - Math.pow(.72, frameDuration / 16.667);
    lastTickTime = now;
    currentPosition += positionDistance * follow;
    currentImageScale += scaleDistance * follow;
    renderOrbit();
    animationFrame = window.requestAnimationFrame(tick);
  }

  function snapOrbit() {
    targetPosition = Math.round(targetPosition);
    requestTick();
  }

  function scheduleSnap() {
    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(snapOrbit, 110);
  }

  function moveOrbit(delta) {
    targetPosition += delta;
    requestTick();
    scheduleSnap();
  }

  function setIntroProgress(value) {
    introProgress = clamp(Number(value) || 0, 0, 1);
    renderOrbit();
  }

  function rotateTo(index) {
    const requested = modulo(Number(index), items.length);
    const currentWrapped = modulo(targetPosition, items.length);
    let delta = requested - currentWrapped;
    if (delta > items.length / 2) delta -= items.length;
    if (delta < -items.length / 2) delta += items.length;
    targetPosition += delta;
    requestTick();
    scheduleSnap();
  }

  function finishIntro() {
    introProgress = 1;
    currentPosition = restingPosition;
    targetPosition = restingPosition;
    lastTickTime = 0;
    renderOrbit();
    stage.classList.remove("is-moving");
    preloadedOrbitImages.length = 0;
    setImageScale(restingImageScale);
  }

  function setOrbitFromHud(clientY) {
    const rect = hudLine.getBoundingClientRect();
    const progress = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    const requested = progress * Math.max(0, items.length - 1);
    const nearestCycle = Math.round((targetPosition - requested) / items.length);
    targetPosition = requested + nearestCycle * items.length;
    currentPosition = targetPosition;
    stage.classList.add("is-moving");
    renderOrbit();
  }

  hudLine.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hudDragging = true;
    hudLine.classList.add("is-dragging");
    hudLine.setPointerCapture(event.pointerId);
    setOrbitFromHud(event.clientY);
  });

  hudLine.addEventListener("pointermove", (event) => {
    if (!hudDragging) return;
    event.preventDefault();
    event.stopPropagation();
    setOrbitFromHud(event.clientY);
  });

  function stopHudDragging(event) {
    if (!hudDragging) return;
    event.preventDefault();
    event.stopPropagation();
    hudDragging = false;
    hudLine.classList.remove("is-dragging");
    if (hudLine.hasPointerCapture(event.pointerId)) hudLine.releasePointerCapture(event.pointerId);
    scheduleSnap();
  }

  hudLine.addEventListener("pointerup", stopHudDragging);
  hudLine.addEventListener("pointercancel", stopHudDragging);
  hudLine.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      moveOrbit(1);
    }
    if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      moveOrbit(-1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      rotateTo(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      rotateTo(items.length - 1);
    }
  });

  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const wheelDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const movement = Math.sign(wheelDelta) * Math.min(Math.abs(wheelDelta) * .0065, 1.35);
    moveOrbit(movement);
  }, { passive: false });

  window.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    const wheelDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const zoomFactor = Math.exp(-wheelDelta * .0015);
    setImageScale(targetImageScale * zoomFactor);
  }, { passive: false, capture: true });

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    dragging = true;
    pointerDownLink = event.target.closest?.(".piece-image") || null;
    pointerStartY = event.clientY;
    pointerStartPosition = targetPosition;
    const point = gesturePoint(event);
    pointerUsesDial = point.radius >= 72;
    pointerPreviousAngle = pointerUsesDial ? point.angle : null;
    gestureAngularTravel = 0;
    stage.classList.add("is-dragging");
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    if (pointerUsesDial) {
      const point = gesturePoint(event);
      if (point.radius < 64) {
        pointerPreviousAngle = null;
        return;
      }
      if (pointerPreviousAngle === null) {
        pointerPreviousAngle = point.angle;
        return;
      }
      const angleDelta = shortestAngleDelta(point.angle, pointerPreviousAngle);
      pointerPreviousAngle = point.angle;
      if (Math.abs(angleDelta) > .85) return;
      targetPosition += angleDelta * (dialItemsPerTurn / (Math.PI * 2));
      gestureAngularTravel += Math.abs(angleDelta);
    } else {
      targetPosition = pointerStartPosition + (event.clientY - pointerStartY) * .011;
    }
    requestTick();
  });

  function stopDragging(event) {
    if (!dragging) return;
    dragging = false;
    const verticalTravel = Math.abs(event.clientY - pointerStartY);
    const moved = gestureAngularTravel > .08 || (!pointerUsesDial && verticalTravel > 6);
    const clickLink = pointerDownLink;
    pointerDownLink = null;
    if (moved) {
      suppressClickUntil = performance.now() + 250;
    }
    pointerPreviousAngle = null;
    pointerUsesDial = false;
    stage.classList.remove("is-dragging");
    if (event.pointerId !== undefined && stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
    scheduleSnap();
    if (event.type === "pointerup" && !moved && clickLink?.href) {
      window.ArtRouteTransition?.navigate(clickLink.href, clickLink.dataset.routeMist || "rtl");
    }
  }

  stage.addEventListener("pointerup", stopDragging);
  stage.addEventListener("pointercancel", stopDragging);
  stage.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) {
      event.preventDefault();
      moveOrbit(1);
    }
    if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      moveOrbit(-1);
    }
  });

  for (const record of records) {
    record.image.addEventListener("load", () => {
      if (markRecordImageReady(record)) requestTick();
    });
    record.element.addEventListener("dragstart", (event) => event.preventDefault());
    record.link.addEventListener("click", (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
      }
    });
  }

  window.addEventListener("resize", renderOrbit);

  window.__artOrbit = {
    getState: () => ({
      currentPosition,
      targetPosition,
      activeIndex: modulo(Math.round(currentPosition), items.length),
      count: items.length,
      renderedSlots: records.length,
      visibleSlots: visibleSlotCount,
      loadedSlots: records.filter((record) => Boolean(record.source)).length,
      imageScale: currentImageScale,
      targetImageScale,
      animationRunning: Boolean(animationFrame),
      introProgress,
    }),
    rotateTo,
    moveOrbit,
    setIntroProgress,
    setImageScale,
    finishIntro,
    introDuration,
    whenImagesReady: () => introImagesReady,
  };

  reconcileSlots(Math.round(currentPosition));
  animateWorkCount();
  updateZoomLabel(true);
  renderOrbit();
})();
