(() => {
  "use strict";

  const PAGE = document.body.dataset.conceptPage;
  const STORAGE_KEY = "artConcept.approvalDemo.v1";
  const BOOK_NAMES = {
    megastructure: "巨构艺术",
    "monument-valley": "纪念碑谷",
    monument_valley: "纪念碑谷",
  };
  const LIBRARY_POEMS = {
    "巨构艺术": "建筑在雾里留下文明的回声。",
    "暖色风格": "颜色越过地平线，留下安静的光。",
    "纪念碑谷": "不可能的道路，在寂静中彼此相遇。",
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const query = new URLSearchParams(location.search);

  async function loadJson(path) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) {
          const error = new Error(`${path} 读取失败（${response.status}）`);
          error.status = response.status;
          throw error;
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (error.status && error.status < 500) throw error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      }
    }
    throw new Error(`${path} 暂时无法读取：${lastError?.message || "网络连接失败"}`);
  }

  async function loadConceptData() {
    if (window.ART_CONCEPT_DATA) return window.ART_CONCEPT_DATA;
    const data = await loadJson("./art-concept-data.json");
    if (!Array.isArray(data.orbitItems) || !Array.isArray(data.approvalItems) || !Array.isArray(data.detailItems)) {
      throw new Error("艺术馆数据格式无效");
    }
    return data;
  }

  function splitMeta(meta = "") {
    return meta.split(" / ").map((part) => part.trim()).filter(Boolean);
  }

  function compactMeta(meta = "") {
    const parts = splitMeta(meta);
    return {
      date: parts[0] || "日期未记录",
      artist: parts[1] || "作者未记录",
      source: parts.slice(2).join(" / ") || "来源未记录",
    };
  }

  function toast(message) {
    let node = $(".toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      document.body.append(node);
    }
    node.textContent = message;
    node.classList.add("is-visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("is-visible"), 1800);
  }

  const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function installCircularScrollGesture(fallbackSelector) {
    const surface = document.documentElement;
    const interactiveSelector = "a, button, input, textarea, select, option, summary, [contenteditable='true']";
    const pixelsPerTurn = 1120;
    let gesture = null;
    let activeScrollTarget = null;
    let targetScroll = 0;
    let animationFrame = 0;

    function isScrollable(element) {
      if (!element) return false;
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
    }

    function findScrollTarget(start) {
      let element = start instanceof Element ? start : null;
      while (element && element !== document.body) {
        if (isScrollable(element)) return element;
        element = element.parentElement;
      }
      const pageScroller = document.scrollingElement;
      if (pageScroller?.scrollHeight > pageScroller.clientHeight + 2) return pageScroller;
      const fallback = $(fallbackSelector);
      return isScrollable(fallback) ? fallback : null;
    }

    function gesturePoint(event) {
      const x = event.clientX - window.innerWidth / 2;
      const y = event.clientY - window.innerHeight / 2;
      return { angle: Math.atan2(y, x), radius: Math.hypot(x, y) };
    }

    function shortestAngleDelta(next, previous) {
      let delta = next - previous;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      return delta;
    }

    function animateScroll() {
      animationFrame = 0;
      if (!activeScrollTarget) return;
      const distance = targetScroll - activeScrollTarget.scrollTop;
      activeScrollTarget.scrollTop += distance * 0.24;
      if (Math.abs(distance) > 0.7) animationFrame = requestAnimationFrame(animateScroll);
      else activeScrollTarget.scrollTop = targetScroll;
    }

    function requestScroll() {
      if (!animationFrame) animationFrame = requestAnimationFrame(animateScroll);
    }

    function onPointerDown(event) {
      if (event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary) return;
      if (event.target.closest?.(interactiveSelector)) return;
      const scrollTarget = findScrollTarget(event.target);
      if (!scrollTarget) return;
      const point = gesturePoint(event);
      gesture = {
        pointerId: event.pointerId,
        captureElement: event.target instanceof Element ? event.target : surface,
        scrollTarget,
        previousAngle: point.radius >= 64 ? point.angle : null,
        angularTravel: 0,
      };
      activeScrollTarget = scrollTarget;
      targetScroll = scrollTarget.scrollTop;
      gesture.captureElement.setPointerCapture?.(event.pointerId);
      document.body.classList.add("is-circle-scrolling");
      event.preventDefault();
    }

    function onPointerMove(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const point = gesturePoint(event);
      if (point.radius < 56) {
        gesture.previousAngle = null;
        return;
      }
      if (gesture.previousAngle === null) {
        gesture.previousAngle = point.angle;
        return;
      }
      const angleDelta = shortestAngleDelta(point.angle, gesture.previousAngle);
      gesture.previousAngle = point.angle;
      if (Math.abs(angleDelta) > 0.85) return;
      gesture.angularTravel += Math.abs(angleDelta);
      const maximum = Math.max(0, gesture.scrollTarget.scrollHeight - gesture.scrollTarget.clientHeight);
      targetScroll = clamp(targetScroll + angleDelta * pixelsPerTurn / (Math.PI * 2), 0, maximum);
      requestScroll();
      event.preventDefault();
    }

    function endGesture(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const { captureElement } = gesture;
      if (captureElement.hasPointerCapture?.(event.pointerId)) captureElement.releasePointerCapture(event.pointerId);
      gesture = null;
      document.body.classList.remove("is-circle-scrolling");
    }

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", endGesture);
    surface.addEventListener("pointercancel", endGesture);
  }

  function createLibraryOrbit(stage, library, onFocusChange) {
    const track = $(".library-orbit", stage);
    const items = library.items;
    const compositionSlots = [
      { x: 0.58, size: 0.52, y: -0.04 },
      { x: 0.23, size: 0.61, y: -0.12 },
      { x: 0.81, size: 0.70, y: 0.08 },
      { x: 0.40, size: 0.78, y: -0.06 },
      { x: 0.73, size: 0.87, y: 0.05 },
      { x: 0.55, size: 1.00, y: 0.00 },
      { x: 0.27, size: 0.86, y: -0.04 },
      { x: 0.85, size: 0.76, y: 0.08 },
      { x: 0.44, size: 0.67, y: -0.08 },
      { x: 0.78, size: 0.58, y: 0.10 },
      { x: 0.60, size: 0.50, y: -0.04 },
    ];
    const centerSlot = Math.floor(compositionSlots.length / 2);

    function compositionAt(distance) {
      const bounded = clamp(distance, -centerSlot, centerSlot);
      const lowerDistance = Math.floor(bounded);
      const upperDistance = Math.ceil(bounded);
      const progress = bounded - lowerDistance;
      const lower = compositionSlots[lowerDistance + centerSlot];
      const upper = compositionSlots[upperDistance + centerSlot];
      return {
        x: lower.x + (upper.x - lower.x) * progress,
        size: lower.size + (upper.size - lower.size) * progress,
        y: lower.y + (upper.y - lower.y) * progress,
      };
    }
    track.innerHTML = `
      <div class="library-orbit__cards">
        ${items.map((item, itemIndex) => {
          const meta = compactMeta(item.meta);
          return `
          <figure class="library-orbit__card" data-waterfall-item="${itemIndex}" aria-hidden="true">
            <a href="${detailHref(item, { from: "library", library: library.name })}" data-route-mist="rtl" aria-label="查看作品：${escapeHtml(item.title)}">
              <img alt="${escapeHtml(item.title)}" decoding="async">
            </a>
            <figcaption><span class="gold">${String(itemIndex + 1).padStart(2, "0")}</span>　${escapeHtml(item.title)}<small>${escapeHtml(meta.artist)}　/　${escapeHtml(meta.date)}</small></figcaption>
          </figure>`;
        }).join("")}
      </div>
      <span class="library-orbit__hint">SCROLL / DRAG / INFINITE EXHIBITION</span>`;

    const records = $$('[data-waterfall-item]', track).map((element, itemIndex) => {
      const item = items[itemIndex];
      return {
        element,
        anchor: $("a", element),
        image: $("img", element),
        caption: $("figcaption", element),
        item,
        itemIndex,
        aspectRatio: 0.72,
        source: "",
      };
    });
    const focusDetail = $("[data-library-focus-detail]", stage);
    const itemsPerGestureTurn = Math.min(7, Math.max(3, items.length));
    let position = 0;
    let target = position;
    let animationFrame = 0;
    let settleTimer = 0;
    let destroyed = false;
    let pointerGesture = null;
    let suppressNextClick = false;
    let pointerDownAnchor = null;
    let activeItemIndex = -1;

    function syncFocusDetailVisibility() {
      if (!focusDetail) return;
      const focusedRecord = records.find((record) => record.element.classList.contains("is-detail-focused"));
      const isVisible = Boolean(focusedRecord
        && (focusedRecord.anchor.matches(":hover") || focusedRecord.anchor === document.activeElement));
      focusDetail.classList.toggle("is-visible", isVisible);
      focusDetail.setAttribute("aria-hidden", isVisible ? "false" : "true");
    }

    function queueFocusDetailSync() {
      requestAnimationFrame(() => {
        if (!destroyed) syncFocusDetailVisibility();
      });
    }

    function ensureImage(record) {
      if (record.source === record.item.image && record.image.hasAttribute("src")) return;
      record.source = record.item.image;
      record.image.dataset.source = record.source;
      record.image.onload = () => {
        if (record.image.dataset.source !== record.source) return;
        if (record.image.naturalWidth && record.image.naturalHeight) {
          record.aspectRatio = record.image.naturalWidth / record.image.naturalHeight;
        }
        record.element.classList.add("is-ready");
        requestRender();
      };
      record.image.src = record.source;
    }

    function releaseImage(record) {
      if (!record.source && !record.image.hasAttribute("src")) return;
      record.source = "";
      record.image.removeAttribute("src");
      delete record.image.dataset.source;
      record.element.classList.remove("is-ready");
    }

    function render(nextPosition) {
      const width = track.clientWidth;
      const height = track.clientHeight;
      if (!width || !height) return;
      const rowGap = clamp(height * 0.245, 170, 240);
      const renderDistance = height / rowGap / 2 + 1.75;
      const preloadDistance = renderDistance + 2.25;
      const baseWidth = clamp(width * 0.19, 150, 235);
      const centerY = height * 0.5;
      let focusedRecord = null;
      let focusedDistance = Number.POSITIVE_INFINITY;

      records.forEach((record) => {
        const nearestCycle = Math.round((nextPosition - record.itemIndex) / items.length);
        const virtualIndex = record.itemIndex + nearestCycle * items.length;
        const distance = virtualIndex - nextPosition;
        const composition = compositionAt(distance);
        const visualDistance = distance + composition.y;
        const absoluteDistance = Math.abs(visualDistance);
        if (absoluteDistance > preloadDistance) {
          releaseImage(record);
          record.element.hidden = true;
          record.element.setAttribute("aria-hidden", "true");
          record.element.classList.remove("is-focused", "is-detail-focused", "caption-left");
          return;
        }

        ensureImage(record);
        if (absoluteDistance > renderDistance) {
          record.element.hidden = true;
          record.element.setAttribute("aria-hidden", "true");
          record.element.classList.remove("is-focused", "is-detail-focused", "caption-left");
          return;
        }
        const focusAmount = Math.exp(-Math.pow(visualDistance / 0.54, 2));
        const focusScale = 1 + 0.78 * focusAmount;
        const scale = composition.size * focusScale;
        const aspectWidth = clamp(Math.pow(record.aspectRatio / 0.72, 0.18), 0.88, 1.16);
        const cardWidth = baseWidth * aspectWidth;
        const scaledWidth = cardWidth * scale;
        const desiredX = width * composition.x;
        const x = clamp(desiredX, scaledWidth / 2 + 18, width - scaledWidth / 2 - 18);
        const y = centerY + visualDistance * rowGap;
        const viewportFade = clamp((renderDistance - absoluteDistance) / 0.9, 0, 1);
        const depthOpacity = 0.5 + 0.5 * Math.exp(-absoluteDistance * 0.33);
        const opacity = viewportFade * depthOpacity;
        const captionOnLeft = x > width * 0.61;
        const captionOffset = scaledWidth / 2 + 16;

        record.element.hidden = false;
        record.element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
        record.element.style.opacity = opacity.toFixed(3);
        record.element.style.zIndex = String(2000 - Math.round(absoluteDistance * 100));
        record.element.style.pointerEvents = opacity < 0.22 ? "none" : "auto";
        record.element.style.setProperty("--card-width", `${cardWidth.toFixed(2)}px`);
        record.element.style.setProperty("--card-scale", scale.toFixed(4));
        record.caption.style.left = captionOnLeft ? "auto" : `${captionOffset.toFixed(2)}px`;
        record.caption.style.right = captionOnLeft ? `${captionOffset.toFixed(2)}px` : "auto";
        record.element.classList.toggle("caption-left", captionOnLeft);
        record.element.classList.toggle("is-focused", focusAmount > 0.58);
        record.element.setAttribute("aria-hidden", opacity < 0.22 ? "true" : "false");
        if (absoluteDistance < focusedDistance) {
          focusedDistance = absoluteDistance;
          focusedRecord = record;
        }
      });
      if (focusedRecord && focusedRecord.itemIndex !== activeItemIndex) {
        activeItemIndex = focusedRecord.itemIndex;
        onFocusChange?.(focusedRecord.item, focusedRecord.itemIndex);
      }
      if (focusedRecord && focusDetail) {
        const panelBounds = stage.getBoundingClientRect();
        const imageBounds = focusedRecord.anchor.getBoundingClientRect();
        const detailGap = 14;
        focusDetail.style.left = `${(imageBounds.left - panelBounds.left - focusDetail.offsetWidth - detailGap).toFixed(2)}px`;
        focusDetail.style.top = `${(imageBounds.top - panelBounds.top - 22).toFixed(2)}px`;
      }
      const isCentered = focusedRecord
        && focusedDistance < 0.001
        && Math.abs(target - Math.round(target)) < 0.001;
      records.forEach((record) => record.element.classList.toggle("is-detail-focused", isCentered && record === focusedRecord));
      syncFocusDetailVisibility();
    }

    function animate() {
      animationFrame = 0;
      if (destroyed) return;
      const distance = target - position;
      position += distance * 0.19;
      if (Math.abs(distance) < 0.0008) position = target;
      render(position);
      if (position !== target) animationFrame = requestAnimationFrame(animate);
    }

    function requestRender() {
      if (!animationFrame) animationFrame = requestAnimationFrame(animate);
    }

    function scheduleSettle(delay = 130) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        target = Math.round(target);
        requestRender();
      }, delay);
    }

    function onWheel(event) {
      event.preventDefault();
      const modeMultiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? window.innerHeight : 1;
      const delta = clamp(event.deltaY * modeMultiplier, -180, 180);
      target += delta * 0.0052;
      requestRender();
      scheduleSettle();
    }

    function onKeyDown(event) {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
      event.preventDefault();
      target = Math.round(target) + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1);
      requestRender();
    }

    function pointerAngle(event) {
      const bounds = track.getBoundingClientRect();
      return Math.atan2(event.clientY - (bounds.top + bounds.height / 2), event.clientX - (bounds.left + bounds.width / 2));
    }

    function onPointerDown(event) {
      if (event.button !== 0 || !event.isPrimary) return;
      pointerGesture = {
        pointerId: event.pointerId,
        angle: pointerAngle(event),
        distance: 0,
      };
      pointerDownAnchor = event.target.closest?.("a") || null;
      suppressNextClick = false;
      clearTimeout(settleTimer);
      track.classList.add("is-dragging");
      track.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    function onPointerMove(event) {
      if (!pointerGesture || event.pointerId !== pointerGesture.pointerId) return;
      const nextAngle = pointerAngle(event);
      let angleDelta = nextAngle - pointerGesture.angle;
      if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
      if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      pointerGesture.angle = nextAngle;
      pointerGesture.distance += Math.abs(angleDelta);
      target += angleDelta * itemsPerGestureTurn / (Math.PI * 2);
      if (pointerGesture.distance > 0.035) suppressNextClick = true;
      requestRender();
      event.preventDefault();
    }

    function endPointerGesture(event) {
      if (!pointerGesture || event.pointerId !== pointerGesture.pointerId) return;
      const moved = pointerGesture.distance > 0.035;
      const clickAnchor = pointerDownAnchor;
      pointerDownAnchor = null;
      if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
      pointerGesture = null;
      track.classList.remove("is-dragging");
      if (moved) scheduleSettle(80);
      if (event.type === "pointerup" && !moved && clickAnchor?.href) {
        window.ArtRouteTransition?.navigate(clickAnchor.href, clickAnchor.dataset.routeMist || "rtl");
      }
    }

    function onClickCapture(event) {
      if (!suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
    }

    const resizeObserver = new ResizeObserver(() => render(position));
    resizeObserver.observe(track);
    stage.addEventListener("wheel", onWheel, { passive: false });
    track.addEventListener("keydown", onKeyDown);
    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("pointerup", endPointerGesture);
    track.addEventListener("pointercancel", endPointerGesture);
    track.addEventListener("click", onClickCapture, true);
    track.addEventListener("pointerover", queueFocusDetailSync);
    track.addEventListener("pointerout", queueFocusDetailSync);
    track.addEventListener("focusin", queueFocusDetailSync);
    track.addEventListener("focusout", queueFocusDetailSync);
    track.tabIndex = 0;
    track.setAttribute("aria-label", `${library.name}作品循环轨道，使用鼠标滚轮、按住画圈或方向键浏览`);
    render(position);

    return () => {
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      clearTimeout(settleTimer);
      resizeObserver.disconnect();
      stage.removeEventListener("wheel", onWheel);
      track.removeEventListener("keydown", onKeyDown);
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerup", endPointerGesture);
      track.removeEventListener("pointercancel", endPointerGesture);
      track.removeEventListener("click", onClickCapture, true);
      track.removeEventListener("pointerover", queueFocusDetailSync);
      track.removeEventListener("pointerout", queueFocusDetailSync);
      track.removeEventListener("focusin", queueFocusDetailSync);
      track.removeEventListener("focusout", queueFocusDetailSync);
    };
  }

  function detailHref(item, extra = {}) {
    const params = new URLSearchParams(extra);
    if (item.id) params.set("id", item.id);
    if (Number.isInteger(item.index)) params.set("orbitIndex", String(item.index));
    if (item.title || item.title_zh) params.set("title", item.title || item.title_zh);
    return `./artwork-detail-concept.html?${params.toString()}`;
  }

  function renderLibrary(data) {
    const detailByLibraryAndTitle = new Map();
    data.detailItems.forEach((detail) => {
      (detail.groups || []).forEach((group) => detailByLibraryAndTitle.set(`${group}\n${detail.title}`, detail));
    });
    const groups = new Map();
    data.orbitItems.forEach((item) => {
      if (!groups.has(item.library)) groups.set(item.library, []);
      groups.get(item.library).push({
        ...item,
        detail: detailByLibraryAndTitle.get(`${item.library}\n${item.title}`) || null,
      });
    });
    const libraries = Array.from(groups, ([name, items]) => ({ name, items }));
    if (!libraries.length) throw new Error("艺术库中没有可展示作品");
    let selectedName = query.get("library");
    if (!groups.has(selectedName)) selectedName = libraries[0].name;

    document.body.innerHTML = `
      <main class="concept-shell">
        <section class="library-layout">
          <aside class="library-index">
            <h1>艺术库</h1>
            <div class="library-index__rule"></div>
            <ol class="library-list">
              ${libraries.map((library, index) => `
                <li><button type="button" data-library="${escapeHtml(library.name)}" class="${library.name === selectedName ? "is-active" : ""}">
                  <span class="library-list__no">${String(index + 1).padStart(2, "0")}</span>
                  <span class="library-list__name">${escapeHtml(library.name)}</span>
                  <span class="library-list__count">${library.items.length} WORKS</span>
                </button></li>`).join("")}
            </ol>
            <p class="library-index__hint">点击艺术库切换陈列。作品数量与名称读取当前艺术库数据。</p>
          </aside>
          <section class="library-stage" aria-live="polite"></section>
        </section>
      </main>`;

    const stage = $(".library-stage");
    const panelDestroyers = new WeakMap();
    let activePanel = null;
    let displayedName = selectedName;
    let isTransitioning = false;
    let queuedName = "";

    function preloadLibrary(library) {
      const sources = library.items.slice(0, 7).map((item) => item.image).filter(Boolean);
      const preload = Promise.all(sources.map((source) => new Promise((resolve) => {
        const image = new Image();
        const finish = () => resolve();
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
        image.src = source;
        if (image.complete) resolve();
      })));
      return Promise.race([preload, new Promise((resolve) => setTimeout(resolve, 700))]);
    }

    function createLibraryPanel(library, initialClasses = []) {
      const libraryNumber = libraries.indexOf(library) + 1;
      const panel = document.createElement("div");
      panel.className = ["library-panel", ...initialClasses].join(" ");
      panel.innerHTML = `
        <div class="library-copy">
          <div class="library-copy__number">${String(libraryNumber).padStart(2, "0")}</div>
          <h2>${escapeHtml(library.name)}</h2>
          <p class="library-copy__poem">${escapeHtml(LIBRARY_POEMS[library.name] || "图像在时间里彼此照见。")}</p>
          <p class="library-copy__count">${library.items.length} WORKS</p>
          <div class="library-actions">
            <a class="library-return" href="./art-atlas.html" data-route-mist="ltr" aria-label="返回主展览">
              <span class="library-return__arrow" data-arrow="←" aria-hidden="true">←</span>
              <span class="library-return__label">返回</span>
            </a>
            <a class="library-enter" data-library-enter data-route-mist="rtl" href="${detailHref(library.items[0], { from: "library", library: library.name })}">进入 <span aria-hidden="true">→</span></a>
          </div>
        </div>
        <aside class="library-focus-detail" data-library-focus-detail aria-hidden="true">
          <div class="library-focus-detail__eyebrow">
            <span data-focus-number></span>
            <span data-focus-library></span>
          </div>
          <h3 data-focus-title></h3>
          <p class="library-focus-detail__analysis" data-focus-analysis></p>
          <dl class="library-focus-detail__meta">
            <div><dt>作者</dt><dd data-focus-artist></dd></div>
            <div><dt>日期</dt><dd data-focus-date></dd></div>
            <div><dt>来源</dt><dd data-focus-source></dd></div>
          </dl>
          <p class="library-focus-detail__tags" data-focus-tags></p>
        </aside>
        <div class="library-orbit"></div>`;
      stage.append(panel);
      const destroyOrbit = createLibraryOrbit(panel, library, (focusedItem, focusedItemIndex) => {
        const enter = $("[data-library-enter]", panel);
        if (enter) {
          enter.href = detailHref(focusedItem, { from: "library", library: library.name });
          enter.setAttribute("aria-label", `进入作品：${focusedItem.title || "当前作品"}`);
        }
        const detail = $("[data-library-focus-detail]", panel);
        if (!detail) return;
        const meta = compactMeta(focusedItem.meta);
        $("[data-focus-number]", detail).textContent = `${String(focusedItemIndex + 1).padStart(2, "0")} / ${String(library.items.length).padStart(2, "0")}`;
        $("[data-focus-library]", detail).textContent = library.name;
        $("[data-focus-title]", detail).textContent = focusedItem.title || "未命名作品";
        $("[data-focus-analysis]", detail).textContent = focusedItem.detail?.analysis || "该作品暂未登记详细解读。";
        $("[data-focus-artist]", detail).textContent = meta.artist;
        $("[data-focus-date]", detail).textContent = meta.date;
        $("[data-focus-source]", detail).textContent = meta.source;
        const tags = $("[data-focus-tags]", detail);
        tags.textContent = focusedItem.tags || "";
        tags.hidden = !focusedItem.tags;
      });
      panelDestroyers.set(panel, destroyOrbit);
      return panel;
    }

    function commitLibrary(library) {
      displayedName = library.name;
      $$("[data-library]").forEach((button) => button.classList.toggle("is-active", button.dataset.library === library.name));
      const nextQuery = new URLSearchParams(location.search);
      nextQuery.set("library", library.name);
      history.replaceState(null, "", `?${nextQuery.toString()}`);
    }

    async function switchLibrary(targetName) {
      if (targetName === displayedName && !isTransitioning) return;
      if (isTransitioning) {
        queuedName = targetName;
        return;
      }
      isTransitioning = true;
      queuedName = "";
      const library = libraries.find((entry) => entry.name === targetName) || libraries[0];
      const currentIndex = libraries.findIndex((entry) => entry.name === displayedName);
      const targetIndex = libraries.indexOf(library);
      const direction = targetIndex >= currentIndex ? 1 : -1;
      const directionName = direction > 0 ? "next" : "previous";
      $$("[data-library]").forEach((button) => button.classList.toggle("is-active", button.dataset.library === library.name));

      await preloadLibrary(library);
      if (queuedName && queuedName !== library.name) {
        const latestName = queuedName;
        queuedName = "";
        isTransitioning = false;
        if (latestName === displayedName) {
          $$("[data-library]").forEach((button) => button.classList.toggle("is-active", button.dataset.library === displayedName));
        } else {
          switchLibrary(latestName);
        }
        return;
      }
      const previousPanel = activePanel;
      const nextPanel = createLibraryPanel(library, ["is-entering", `is-${directionName}`, "is-paused"]);
      nextPanel.setAttribute("aria-hidden", "true");
      activePanel = nextPanel;
      commitLibrary(library);

      requestAnimationFrame(() => {
        previousPanel?.classList.add("is-leaving", `is-${directionName}`);
        previousPanel?.setAttribute("aria-hidden", "true");
        nextPanel.classList.remove("is-paused");
        nextPanel.removeAttribute("aria-hidden");
      });

      setTimeout(() => {
        if (previousPanel) {
          panelDestroyers.get(previousPanel)?.();
          panelDestroyers.delete(previousPanel);
          previousPanel.remove();
        }
        nextPanel.classList.remove("is-entering", `is-${directionName}`);
        isTransitioning = false;
        const nextQueuedName = queuedName;
        queuedName = "";
        if (nextQueuedName && nextQueuedName !== displayedName) switchLibrary(nextQueuedName);
      }, 880);
    }

    $$("[data-library]").forEach((button) => button.addEventListener("click", () => switchLibrary(button.dataset.library)));
    const initialLibrary = libraries.find((entry) => entry.name === selectedName) || libraries[0];
    activePanel = createLibraryPanel(initialLibrary);
    commitLibrary(initialLibrary);
  }

  function getDecisions() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  function renderApproval(data) {
    const priority = ["雪城中轴", "灰穹正殿", "暗球入口", "星腔剖面", "穹内星幕", "蓝橙迷台"];
    const items = [...data.approvalItems].sort((a, b) => priority.indexOf(a.title_zh) - priority.indexOf(b.title_zh));
    if (!items.length) throw new Error("审批队列为空");
    let current = Math.max(0, items.findIndex((item) => item.id === query.get("id")));
    let approvalTransitionActive = false;

    document.body.innerHTML = `
      <main class="concept-shell">
        <section class="approval-layout">
          <aside class="approval-queue">
            <h1>待复核　${items.length}</h1>
            <div class="approval-items"></div>
          </aside>
          <section class="approval-stage"></section>
          <aside class="approval-inspector"></aside>
        </section>
      </main>`;

    function queueStatus(item) {
      const choice = getDecisions()[item.id];
      return choice === "accept" ? "已采纳（本地）" : choice === "reject" ? "已驳回（本地）" : choice === "hold" ? "已暂缓（本地）" : "待复核";
    }

    function drawQueue() {
      $(".approval-items").innerHTML = items.map((item, index) => `
        <button class="approval-card ${index === current ? "is-active" : ""}" type="button" data-index="${index}">
          <span class="approval-card__no">${String(index + 1).padStart(2, "0")}</span>
          <img src="${escapeHtml(item.cover_href)}" alt="" loading="lazy" decoding="async">
          <span>
            <span class="approval-card__title">${escapeHtml(item.title_zh)}</span>
            <span class="approval-card__meta">${escapeHtml(item.source_platform || "来源未记录")}<br>${escapeHtml(item.collected_date || item.published_date || "日期未记录")}</span>
            <span class="approval-card__status" data-approval-status>${escapeHtml(queueStatus(item))}</span>
          </span>
        </button>`).join("");
      $$(".approval-card").forEach((button) => button.addEventListener("click", () => {
        const next = Number(button.dataset.index);
        if (next === current) return;
        changeApproval(next, next > current ? "next" : "previous");
      }));
    }

    function syncQueue() {
      $$(".approval-card").forEach((button) => {
        const index = Number(button.dataset.index);
        button.classList.toggle("is-active", index === current);
        const status = $("[data-approval-status]", button);
        if (status) status.textContent = queueStatus(items[index]);
      });
    }

    function preloadApproval(index) {
      return new Promise((resolve) => {
        const image = new Image();
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
        image.src = items[index].cover_href;
        if (image.complete) finish();
        setTimeout(finish, 700);
      });
    }

    async function changeApproval(next, direction) {
      if (approvalTransitionActive || next === current) return;
      approvalTransitionActive = true;
      await preloadApproval(next);
      const root = document.documentElement;
      root.dataset.approvalDirection = direction;
      root.classList.add("is-approval-transitioning");
      const update = () => {
        current = next;
        draw();
        const inspector = $(".approval-inspector");
        if (inspector) inspector.scrollTop = 0;
      };
      try {
        if (typeof document.startViewTransition === "function") {
          const transition = document.startViewTransition(update);
          await transition.finished;
        } else {
          update();
        }
      } finally {
        delete root.dataset.approvalDirection;
        root.classList.remove("is-approval-transitioning");
        approvalTransitionActive = false;
      }
    }

    function draw() {
      const item = items[current];
      const suggestion = BOOK_NAMES[item.auto?.suggested_book] || item.auto?.suggested_book || "未建议";
      const confidence = Math.round((item.auto?.confidence || 0) * 100);
      const tags = [...(item.pattern_tags || []), ...(item.composition_tags || [])].slice(0, 5);
      const prompt = item.prompt_draft || "当前作品尚无 Prompt 记录。";
      $(".approval-stage").innerHTML = `
        <div class="approval-stage__image"><img src="${escapeHtml(item.cover_href)}" alt="${escapeHtml(item.title_zh)}"></div>
        <footer class="approval-stage__footer">
          <button type="button" data-step="-1">←　上一幅</button>
          <span class="approval-stage__source">来源　${escapeHtml(item.source_platform || "未记录")}<br>${escapeHtml(item.collected_date || item.published_date || "日期未记录")}</span>
          <button type="button" data-step="1">下一幅　→</button>
        </footer>`;
      $(".approval-inspector").innerHTML = `
        <a class="approval-return library-return" href="./art-atlas.html" data-route-mist="ltr" aria-label="返回主展览">
          <span class="library-return__arrow" data-arrow="←" aria-hidden="true">←</span>
          <span class="library-return__label">返回</span>
        </a>
        <span class="approval-inspector__count">${String(current + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}</span>
        <h2>${escapeHtml(item.title_zh)}</h2>
        <div class="approval-inspector__meta">${escapeHtml(item.artist_display || "作者未记录")}<br>${escapeHtml(item.collected_date || item.published_date || "日期未记录")}</div>
        <section class="approval-inspector__block"><h3>AI 识读</h3><p>${escapeHtml(item.style_analysis || "当前作品尚无识读记录。")}</p></section>
        <section class="approval-inspector__block approval-recommendation"><span>建议归入：${escapeHtml(suggestion)}</span><span>${confidence}%</span></section>
        <div class="approval-form">
          <div class="approval-field"><label for="approval-title">作品标题</label><input id="approval-title" value="${escapeHtml(item.title_zh)}"></div>
          <div class="approval-field"><label>标签</label><div class="tag-editor">${tags.length ? tags.map((tag) => `<span class="tag">${escapeHtml(tag)}　×</span>`).join("") : '<span class="muted">暂无标签</span>'}</div></div>
        </div>
        <details class="approval-prompt"><summary>Prompt Draft　展开</summary><pre>${escapeHtml(prompt)}</pre></details>
        <a class="line-button" data-route-mist="rtl" href="${detailHref({ id: item.id, title_zh: item.title_zh }, { from: "approval" })}">查看完整详情　→</a>
        <div class="approval-actions">
          <button type="button" data-decision="reject">驳回</button>
          <button type="button" data-decision="hold">暂缓</button>
          <button type="button" data-decision="accept">采纳入库</button>
        </div>
        <div class="approval-demo-note">当前为前端演示：决定仅保存在本浏览器，不写回艺术库事实源。</div>`;
      syncQueue();
      history.replaceState(null, "", `?id=${encodeURIComponent(item.id)}`);
      $$('[data-step]').forEach((button) => button.addEventListener("click", () => {
        const step = Number(button.dataset.step);
        const next = (current + step + items.length) % items.length;
        changeApproval(next, step > 0 ? "next" : "previous");
      }));
      $$('[data-decision]').forEach((button) => button.addEventListener("click", () => {
        const decisions = getDecisions();
        decisions[item.id] = button.dataset.decision;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
        toast(button.dataset.decision === "accept" ? "已在本地演示中采纳" : button.dataset.decision === "reject" ? "已在本地演示中驳回" : "已在本地演示中暂缓");
        syncQueue();
        changeApproval((current + 1) % items.length, "next");
      }));
    }
    drawQueue();
    draw();
    installCircularScrollGesture(".approval-inspector");
  }

  function normalizeDetail(item, kind) {
    if (kind === "detail") {
      return {
        id: item.id,
        title: item.title,
        artist: item.artist,
        date: item.date,
        source: "WeChat Official Account",
        image: item.image,
        library: item.groups?.[0] || "艺术库",
        analysis: item.analysis,
        lede: item.movementNote || item.analysis,
        palette: item.palette || [],
        keywords: [...(item.moodTags || []), ...(item.patternTags || [])].slice(0, 6),
        prompt: item.aigcPrompt?.prompts?.positive_prompt_en || item.promptDraft,
        negative: item.aigcPrompt?.prompts?.negative_prompt_en || (item.negativeTags || []).join(", "),
        sourceUrl: item.sourceUrl,
        noteHref: item.noteHref,
      };
    }
    if (kind === "approval") return {
      id: item.id,
      title: item.title_zh,
      artist: item.artist_display,
      date: item.collected_date || item.published_date,
      source: item.source_platform,
      image: item.cover_href,
      library: BOOK_NAMES[item.auto?.suggested_book] || item.auto?.suggested_book || "待审批",
      analysis: item.style_analysis,
      lede: item.movement_note || item.style_analysis,
      palette: item.palette || [],
      keywords: [...(item.mood_tags || []), ...(item.pattern_tags || [])].slice(0, 6),
      prompt: item.prompt_draft,
      negative: (item.negative_tags || []).join(", "),
      sourceUrl: item.source_url,
      noteHref: "",
    };
    const meta = compactMeta(item.meta);
    return {
      id: `orbit-${item.index}`,
      title: item.title,
      artist: meta.artist,
      date: meta.date,
      source: meta.source,
      image: item.image,
      library: item.library,
      analysis: `这件作品当前只登记了展览级元数据，尚未生成独立的深度解读。它以“${item.tags || "未记录标签"}”进入当前艺术库。`,
      lede: LIBRARY_POEMS[item.library] || "图像在时间里彼此照见。",
      palette: [],
      keywords: String(item.tags || "").split(" · ").filter(Boolean),
      prompt: "",
      negative: "",
      sourceUrl: item.href,
      noteHref: "",
    };
  }

  let detailTransitionActive = false;

  function renderDetail(data) {
    const requestedId = query.get("id");
    const requestedTitle = query.get("title");
    const requestedLibrary = query.get("library");
    const requestedOrbitIndex = query.has("orbitIndex") ? Number(query.get("orbitIndex")) : Number.NaN;
    const detailIndex = data.detailItems.findIndex((item) => item.id === requestedId || item.title === requestedTitle);
    const approvalIndex = data.approvalItems.findIndex((item) => item.id === requestedId || item.title_zh === requestedTitle);
    const orbitIndex = Number.isInteger(requestedOrbitIndex) ? data.orbitItems.findIndex((item) => item.index === requestedOrbitIndex) : -1;
    let sourceItems;
    let rawIndex;
    let kind;
    let normalizeSourceItem;
    if (query.get("from") === "library" && requestedLibrary) {
      sourceItems = data.orbitItems.filter((item) => item.library === requestedLibrary);
      rawIndex = sourceItems.findIndex((item) => (
        (Number.isInteger(requestedOrbitIndex) && item.index === requestedOrbitIndex)
        || item.id === requestedId
        || item.title === requestedTitle
      ));
      if (rawIndex < 0) rawIndex = 0;
      kind = "orbit";
      normalizeSourceItem = (item) => {
        const detail = data.detailItems.find((entry) => entry.id === item.id || entry.title === item.title);
        return detail
          ? { ...normalizeDetail(detail, "detail"), library: requestedLibrary }
          : normalizeDetail(item, "orbit");
      };
    } else if (approvalIndex >= 0) {
      sourceItems = data.approvalItems;
      rawIndex = approvalIndex;
      kind = "approval";
    } else if (detailIndex < 0 && orbitIndex >= 0) {
      sourceItems = data.orbitItems.filter((item) => item.library === data.orbitItems[orbitIndex].library);
      rawIndex = sourceItems.findIndex((item) => item.index === requestedOrbitIndex);
      kind = "orbit";
    } else {
      sourceItems = data.detailItems;
      rawIndex = detailIndex >= 0 ? detailIndex : Math.max(0, data.detailItems.findIndex((item) => item.title === "冰壁巨柱"));
      kind = "detail";
    }
    if (!sourceItems.length) throw new Error("作品详情数据为空");
    normalizeSourceItem ||= (item) => normalizeDetail(item, kind);
    const work = normalizeSourceItem(sourceItems[rawIndex]);
    const fromApproval = query.get("from") === "approval" || kind === "approval";
    const backHref = fromApproval ? "./art-approval-concept.html" : `./art-library-concept.html${query.get("library") ? `?library=${encodeURIComponent(query.get("library"))}` : ""}`;
    const backLabel = fromApproval ? "返回审批" : `返回${work.library || "艺术库"}`;
    const palette = work.palette.length ? work.palette.slice(0, 5) : ["#2d4b5d", "#6d899d", "#a9bac9", "#d0d1cf", "#aea79a"];
    const promptText = work.prompt || "当前作品尚无 Prompt 记录。";

    document.body.innerHTML = `
      <main class="concept-shell">
        <article class="detail-layout">
          <section class="detail-visual">
            <a class="detail-back library-return" href="${backHref}" data-route-mist="ltr" aria-label="${escapeHtml(backLabel)}">
              <span class="library-return__arrow" data-arrow="←" aria-hidden="true">←</span>
              <span class="library-return__label">返回</span>
            </a>
            <figure class="detail-frame">
              <span class="detail-frame__no">${String(rawIndex + 1).padStart(2, "0")}</span>
              <img src="${escapeHtml(work.image)}" alt="${escapeHtml(work.title)}">
              <figcaption>${escapeHtml(work.date || "日期未记录")}　·　${escapeHtml(work.library)}　·　${escapeHtml(work.source || "来源未记录")}</figcaption>
            </figure>
          </section>
          <span class="detail-visual-progress" aria-hidden="true"></span>
          <section class="detail-reading">
            <div class="detail-reading__top">作品详情</div>
            <p class="eyebrow">WORK ${String(rawIndex + 1).padStart(2, "0")} / ${kind === "approval" ? "PENDING" : kind === "orbit" ? "CATALOGUED" : "APPROVED"}</p>
            <h1>${escapeHtml(work.title)}</h1>
            <p class="detail-meta">${escapeHtml(work.date || "日期未记录")}　·　${escapeHtml(work.library)}　·　${escapeHtml(work.artist || "作者未记录")}</p>
            <p class="detail-lede">${escapeHtml(work.lede || "当前作品尚无补充说明。")}</p>
            <nav class="detail-tabs" aria-label="详情章节">
              <a href="#reading">作品解读</a><a href="#composition">构图与色彩</a><a href="#prompt">AI Prompt</a><a href="#source">来源记录</a>
            </nav>
            <section class="detail-section" id="reading">
              <h2>作品解读</h2>
              <p>${escapeHtml(work.analysis || "当前作品尚无解读记录。")}</p>
              <p>${escapeHtml(work.lede || "")}</p>
            </section>
            <section class="detail-section" id="composition">
              <h2>构图与色彩</h2>
              <div class="palette">${palette.map((color) => `<span style="background:${escapeHtml(color)}" title="${escapeHtml(color)}"></span>`).join("")}</div>
              <div class="keyword-row">${work.keywords.length ? work.keywords.map((word) => `<span>${escapeHtml(word)}</span>`).join("") : "<span>暂无关键词</span>"}</div>
            </section>
            <section class="detail-section" id="prompt">
              <h2>AI Prompt</h2>
              <div class="prompt-card">
                <div class="prompt-card__head"><span>Prompt Draft</span><button type="button" id="copy-prompt">复制 Prompt</button></div>
                <pre>${escapeHtml(promptText)}${work.negative ? `\n\nNegative: ${escapeHtml(work.negative)}` : ""}</pre>
              </div>
            </section>
            <section class="detail-section" id="source">
              <h2>来源记录</h2>
              <ul class="source-list">
                <li><strong>作者</strong>　${escapeHtml(work.artist || "未记录")}</li>
                <li><strong>日期</strong>　${escapeHtml(work.date || "未记录")}</li>
                <li><strong>平台</strong>　${escapeHtml(work.source || "未记录")}</li>
                ${work.sourceUrl ? `<li><a class="line-button" href="${escapeHtml(work.sourceUrl)}" target="_blank" rel="noreferrer">打开来源　→</a></li>` : ""}
              </ul>
            </section>
          </section>
          <aside class="detail-pagination" aria-label="作品切换">
            <span>${String(rawIndex + 1).padStart(2, "0")}</span><span class="detail-pagination__track" aria-hidden="true"></span><span>${String(sourceItems.length).padStart(2, "0")}</span>
            <div class="detail-pagination__arrows">
              <button class="detail-step detail-step--previous" type="button" data-detail-step="-1" aria-label="上一件"><span class="detail-step__arrow" data-arrow="↑" aria-hidden="true">↑</span><span class="detail-step__label">上一件</span></button>
              <button class="detail-step detail-step--next" type="button" data-detail-step="1" aria-label="下一件"><span class="detail-step__arrow" data-arrow="↓" aria-hidden="true">↓</span><span class="detail-step__label">下一件</span></button>
            </div>
          </aside>
        </article>
      </main>`;

    $("#copy-prompt").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(promptText);
        toast("Prompt 已复制");
      } catch {
        toast("浏览器未授权剪贴板，请手动复制");
      }
    });
    $$('[data-detail-step]').forEach((button) => button.addEventListener("click", async () => {
      if (detailTransitionActive) return;
      detailTransitionActive = true;
      const step = Number(button.dataset.detailStep);
      const next = (rawIndex + step + sourceItems.length) % sourceItems.length;
      const candidate = sourceItems[next];
      const nextWork = normalizeSourceItem(candidate);
      const nextHref = detailHref(
        { id: candidate.id, index: candidate.index, title: candidate.title, title_zh: candidate.title_zh },
        { from: kind === "approval" ? "approval" : "library", library: work.library },
      );
      const nextUrl = new URL(nextHref, location.href);
      const preload = new Image();
      preload.src = nextWork.image;
      try {
        await Promise.race([
          typeof preload.decode === "function" ? preload.decode() : new Promise((resolve) => preload.addEventListener("load", resolve, { once: true })),
          new Promise((resolve) => setTimeout(resolve, 650)),
        ]);
      } catch {
        // The destination still renders its own image error state if decoding fails.
      }

      const direction = step > 0 ? "next" : "previous";
      document.documentElement.dataset.detailDirection = direction;
      const update = () => {
        [...query.keys()].forEach((key) => query.delete(key));
        nextUrl.searchParams.forEach((value, key) => query.append(key, value));
        history.pushState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
        renderDetail(data);
      };

      if (typeof document.startViewTransition === "function") {
        const transition = document.startViewTransition(update);
        const finishTransition = () => {
          delete document.documentElement.dataset.detailDirection;
          detailTransitionActive = false;
        };
        transition.finished.then(finishTransition, finishTransition);
      } else {
        update();
        delete document.documentElement.dataset.detailDirection;
        detailTransitionActive = false;
      }
    }));
    function bindDetailProgress(scroller, track, handleHeight, activitySurface) {
      if (!scroller || !track) return;
      let progressFrame = 0;
      let hideTimer = 0;
      const surface = activitySurface || track;
      function revealProgress() {
        surface.classList.add("is-scroll-active");
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => surface.classList.remove("is-scroll-active"), 760);
      }
      function updateProgress() {
        progressFrame = 0;
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const progress = maxScroll ? scroller.scrollTop / maxScroll : 0;
        const handleTravel = Math.max(0, track.clientHeight - handleHeight);
        track.style.setProperty("--detail-handle-y", `${(progress * handleTravel).toFixed(2)}px`);
        track.classList.toggle("is-inactive", maxScroll < 2);
      }
      scroller.addEventListener("scroll", () => {
        revealProgress();
        if (!progressFrame) progressFrame = requestAnimationFrame(updateProgress);
      }, { passive: true });
      if (typeof ResizeObserver === "function") {
        const resizeObserver = new ResizeObserver(updateProgress);
        resizeObserver.observe(scroller);
      }
      updateProgress();
    }
    bindDetailProgress($(".detail-visual"), $(".detail-visual-progress"), 28);
    bindDetailProgress($(".detail-reading"), $(".detail-pagination__track"), 34, $(".detail-pagination"));
    installCircularScrollGesture(".detail-reading");
  }

  function renderConcept(data) {
    if (!Array.isArray(data?.orbitItems) || !Array.isArray(data?.approvalItems) || !Array.isArray(data?.detailItems)) {
      throw new Error("艺术馆数据格式无效");
    }
    if (PAGE === "library") renderLibrary(data);
    else if (PAGE === "approval") renderApproval(data);
    else if (PAGE === "detail") renderDetail(data);
    else throw new Error(`未知概念页：${PAGE || "未声明"}`);
    window.dispatchEvent(new CustomEvent("art-route-ready"));
  }

  function renderError(error) {
    console.error(error);
    document.body.innerHTML = `<main class="concept-error"><div><strong>页面数据未能加载</strong>${escapeHtml(error.message)}<br><br><button type="button" data-retry-load>重新读取</button></div></main>`;
    $("[data-retry-load]")?.addEventListener("click", () => location.reload());
    window.dispatchEvent(new CustomEvent("art-route-ready"));
  }

  function init() {
    if (window.ART_CONCEPT_DATA) {
      try { renderConcept(window.ART_CONCEPT_DATA); }
      catch (error) { renderError(error); }
      return;
    }
    loadConceptData().then(renderConcept, renderError);
  }

  init();
})();
