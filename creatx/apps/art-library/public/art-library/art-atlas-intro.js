(() => {
  const root = document.documentElement;
  if (!root.classList.contains("has-atlas-intro")) return;

  const opening = document.getElementById("atlasOpening");
  const lines = [...document.querySelectorAll(".opening-line")];
  const bird = document.getElementById("openingBird");
  const body = document.getElementById("openingBirdBody");
  const wing = document.getElementById("openingBirdWing");
  const titleMark = document.querySelector(".title-mark");
  const eyebrow = document.querySelector(".exhibition-intro .eyebrow");
  const title = document.querySelector(".exhibition-intro h1");
  const introCopy = document.querySelector(".intro-copy");
  const portalSwitch = document.querySelector(".portal-switch");
  const orbitStage = document.getElementById("orbitStage");
  const orbitHud = document.querySelector(".orbit-hud");
  const orbitHint = document.querySelector(".orbit-hint");
  const orbit = window.__artOrbit;
  const required = [opening, bird, body, wing, titleMark, eyebrow, title, introCopy, portalSwitch, orbitStage, ...lines];

  if (required.some((element) => !element) || !orbit?.setIntroProgress || !orbit?.finishIntro || !orbit?.getState || !orbit?.whenImagesReady) {
    root.classList.remove("has-atlas-intro");
    opening?.remove();
    return;
  }

  let finished = false;
  let orbitRollFrame = 0;
  const animations = new Set();
  const animate = (element, keyframes, options) => {
    const animation = element.animate(keyframes, { fill: "both", ...options });
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => animations.delete(animation));
    return animation;
  };

  const reveal = (element, delay, duration = 620, distance = 16) => animate(element, [
    { opacity: 0, filter: "blur(7px)", translate: `0 ${distance}px` },
    { opacity: 1, filter: "blur(0)", translate: "0 0" },
  ], { duration, delay, easing: "cubic-bezier(.22,1,.36,1)" });

  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function rollOrbit() {
    const duration = orbit.introDuration;
    return new Promise((resolve) => {
      let startedAt = 0;
      const update = (now) => {
        if (finished) return resolve();
        if (!startedAt) startedAt = now;
        const progress = Math.min(1, (now - startedAt) / duration);
        orbit.setIntroProgress(progress);
        if (progress < 1) {
          orbitRollFrame = requestAnimationFrame(update);
        } else {
          orbitRollFrame = 0;
          resolve();
        }
      };
      orbitRollFrame = requestAnimationFrame(update);
    });
  }

  function semanticLayer(source, pathIds) {
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 1252 1252");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    for (const pathId of pathIds) {
      const path = source.getElementById(pathId)?.cloneNode(true);
      if (!path) continue;
      path.removeAttribute("id");
      svg.append(path);
    }
    return svg;
  }

  async function buildSemanticBird() {
    try {
      const response = await fetch("./assets/bird-wing-logo-clean.svg", { cache: "force-cache" });
      if (!response.ok) throw new Error(`Logo SVG request failed: ${response.status}`);
      const source = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
      if (source.querySelector("parsererror")) throw new Error("Logo SVG could not be parsed");

      const bodySvg = semanticLayer(source, ["path-0002", "path-0003", "path-0007"]);
      const wingSvg = semanticLayer(source, ["path-0001", "path-0004", "path-0005", "path-0006", "path-0008"]);
      body.replaceChildren(bodySvg);
      wing.replaceChildren(wingSvg);
    } catch {
      const fallback = document.createElement("img");
      fallback.src = "./assets/bird-wing-logo-clean.svg";
      fallback.alt = "";
      fallback.draggable = false;
      body.replaceChildren(fallback);
      wing.hidden = true;
    }
  }

  const finish = () => {
    if (finished) return;
    finished = true;
    if (orbitRollFrame) cancelAnimationFrame(orbitRollFrame);
    orbitRollFrame = 0;
    orbit.finishIntro();
    for (const animation of animations) animation.cancel();
    root.classList.remove("has-atlas-intro");
    for (const element of [titleMark, eyebrow, title, introCopy, portalSwitch, orbitStage, orbitHud, orbitHint]) {
      if (!element) continue;
      element.getAnimations().forEach((animation) => animation.cancel());
      element.style.removeProperty("opacity");
      element.style.removeProperty("filter");
      element.style.removeProperty("translate");
      element.style.removeProperty("transform");
      element.style.removeProperty("pointer-events");
    }
    opening.remove();
  };

  const run = async () => {
    await buildSemanticBird();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (finished) return;

    const target = titleMark.getBoundingClientRect();
    const startX = window.innerWidth / 2;
    const startY = window.innerHeight / 2;
    const targetX = target.left + target.width / 2;
    const targetY = target.top + target.height / 2;
    const travelX = targetX - startX;
    const travelY = targetY - startY;
    const targetScale = Math.max(.34, Math.min(.76, target.width / Math.max(1, bird.offsetWidth)));
    const lineSpread = Math.min(112, window.innerWidth * .075);

    lines.forEach((line, index) => {
      const direction = index === 0 ? -1 : 1;
      animate(line, [
        { opacity: 0, transform: "translate(-50%,-50%) translateX(0) scaleY(0)" },
        { opacity: .9, offset: .16, transform: "translate(-50%,-50%) translateX(0) scaleY(.08)" },
        { opacity: .78, offset: .62, transform: "translate(-50%,-50%) translateX(0) scaleY(1)" },
        { opacity: .62, offset: .76, transform: "translate(-50%,-50%) translateX(0) scaleY(1)" },
        { opacity: 0, transform: `translate(-50%,-50%) translateX(${(direction * lineSpread).toFixed(1)}px) scaleY(.72)` },
      ], { duration: 1500, easing: "cubic-bezier(.22,1,.36,1)" });
    });

    animate(bird, [
      { opacity: 0, offset: 0, transform: "translate(-50%,-50%) translate3d(0,8px,0) rotateY(180deg) scale(.64) rotate(-3deg)" },
      { opacity: 1, offset: .14, transform: "translate(-50%,-50%) translate3d(0,0,0) rotateY(180deg) scale(.88) rotate(0deg)" },
      { opacity: 1, offset: .46, transform: `translate(-50%,-50%) translate3d(${(travelX * .32).toFixed(1)}px,${(travelY * .18 - 30).toFixed(1)}px,0) rotateY(180deg) scale(.96) rotate(-8deg)` },
      { opacity: 1, offset: .76, transform: `translate(-50%,-50%) translate3d(${(travelX * .78).toFixed(1)}px,${(travelY * .68 - 20).toFixed(1)}px,0) rotateY(180deg) scale(${(targetScale * 1.2).toFixed(3)}) rotate(3deg)` },
      { opacity: 1, offset: .9, transform: `translate(-50%,-50%) translate3d(${(travelX * .96).toFixed(1)}px,${(travelY - 8).toFixed(1)}px,0) rotateY(180deg) scale(${targetScale.toFixed(3)}) rotate(0deg)` },
      { opacity: 1, offset: .97, transform: `translate(-50%,-50%) translate3d(${travelX.toFixed(1)}px,${travelY.toFixed(1)}px,0) rotateY(0deg) scale(${targetScale.toFixed(3)}) rotate(0deg)` },
      { opacity: 0, transform: `translate(-50%,-50%) translate3d(${travelX.toFixed(1)}px,${travelY.toFixed(1)}px,0) rotateY(0deg) scale(${targetScale.toFixed(3)}) rotate(0deg)` },
    ], { duration: 1840, delay: 1020, easing: "cubic-bezier(.3,.7,.18,1)" });

    animate(wing, [
      { transform: "rotate(0deg) scaleY(1)" },
      { transform: "rotate(-54deg) scaleY(.72)", offset: .12 },
      { transform: "rotate(30deg) scaleY(1.12)", offset: .25 },
      { transform: "rotate(-49deg) scaleY(.76)", offset: .4 },
      { transform: "rotate(27deg) scaleY(1.1)", offset: .55 },
      { transform: "rotate(-41deg) scaleY(.8)", offset: .7 },
      { transform: "rotate(20deg) scaleY(1.07)", offset: .84 },
      { transform: "rotate(0deg) scaleY(1)" },
    ], { duration: 1620, delay: 1110, easing: "ease-in-out" });

    animate(titleMark, [
      { opacity: 0, transform: "translate3d(8px,-3px,0) scale(.92)" },
      { opacity: 1, transform: "translate3d(0,0,0) scale(1)" },
    ], { duration: 380, delay: 2720, easing: "cubic-bezier(.22,1,.36,1)" });

    reveal(eyebrow, 2780, 560, 10);
    const titleAnimation = reveal(title, 2920, 720, 18);
    reveal(introCopy, 3240, 760, 20);
    reveal(portalSwitch, 3640, 620, 10);
    if (orbitHud) reveal(orbitHud, 4040, 500, 8);
    if (orbitHint) reveal(orbitHint, 4190, 500, 8);

    await Promise.all([titleAnimation.finished.catch(() => {}), orbit.whenImagesReady()]);
    if (finished) return;
    await new Promise((resolve) => window.setTimeout(resolve, 140));
    if (finished) return;

    const orbitRoll = rollOrbit();
    const orbitAnimation = animate(orbitStage, [
      { opacity: 0 },
      { opacity: 1 },
    ], { duration: 160, easing: "cubic-bezier(.22,1,.36,1)" });

    await Promise.all([orbitAnimation.finished.catch(() => {}), orbitRoll]);
    finish();
  };

  opening.addEventListener("pointerdown", finish, { once: true });
  window.addEventListener("keydown", (event) => {
    if (["Escape", "Enter", " "].includes(event.key)) finish();
  }, { once: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
