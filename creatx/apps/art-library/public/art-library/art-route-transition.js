(() => {
  "use strict";

  const ROUTE_PARAMETER = "routeMist";
  const DIRECTIONS = new Set(["ltr", "rtl"]);
  const root = document.documentElement;
  const initialDirection = new URLSearchParams(location.search).get(ROUTE_PARAMETER);
  const hasArrival = DIRECTIONS.has(initialDirection);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let navigating = false;
  let readySeen = false;
  let nativeArrival = false;
  let arrivalPlayed = false;
  let fallbackTimer = 0;

  function suppressComponentSnapshots() {
    root.classList.add("is-page-route-snapshot");
  }

  function restoreComponentSnapshots() {
    root.classList.remove("is-page-route-snapshot");
  }

  if (hasArrival) {
    root.classList.add("route-arrival-pending", `route-direction-${initialDirection}`);
  }

  function pageKind(urlValue) {
    const pathname = new URL(urlValue, location.href).pathname;
    if (pathname.endsWith("/art-approval-concept.html")) return "approval";
    if (pathname.endsWith("/art-atlas.html")) return "exhibition";
    if (pathname.endsWith("/art-library-concept.html")) return "library";
    if (pathname.endsWith("/artwork-detail-concept.html")) return "detail";
    return null;
  }

  function inferredDirection(fromValue, toValue) {
    const ranks = { approval: 0, exhibition: 1, library: 2, detail: 3 };
    const from = pageKind(fromValue);
    const to = pageKind(toValue);
    if (!from || !to || from === to) return null;
    return ranks[to] > ranks[from] ? "rtl" : "ltr";
  }

  function transitionDirection(fromValue, toValue) {
    const from = new URL(fromValue, location.href);
    const to = new URL(toValue, location.href);
    const explicit = to.searchParams.get(ROUTE_PARAMETER);
    return DIRECTIONS.has(explicit) ? explicit : inferredDirection(from, to);
  }

  function addTransitionTypes(transition, direction, explicit = false) {
    if (!transition || !DIRECTIONS.has(direction)) return;
    transition.types?.add(`route-${direction}`);
    if (explicit) transition.types?.add("route-explicit");
  }

  function cleanRouteParameter() {
    const cleanUrl = new URL(location.href);
    if (!cleanUrl.searchParams.has(ROUTE_PARAMETER)) return;
    cleanUrl.searchParams.delete(ROUTE_PARAMETER);
    history.replaceState(history.state, "", cleanUrl);
  }

  function clearArrivalClasses() {
    root.classList.remove(
      "route-arrival-pending",
      "is-route-arriving",
      "route-direction-ltr",
      "route-direction-rtl",
    );
    cleanRouteParameter();
  }

  function playFallbackArrival() {
    if (!hasArrival || nativeArrival || arrivalPlayed || !readySeen) return;
    arrivalPlayed = true;
    root.classList.remove("route-arrival-pending");
    if (reducedMotion) {
      clearArrivalClasses();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (nativeArrival) return;
      root.classList.add("is-route-arriving");
      const surface = document.querySelector(".museum-shell, .concept-shell, .concept-error");
      const finish = (event) => {
        if (event && (event.target !== surface || event.animationName !== `route-surface-new-${initialDirection}`)) return;
        surface?.removeEventListener("animationend", finish);
        clearArrivalClasses();
      };
      surface?.addEventListener("animationend", finish);
      setTimeout(finish, 760);
    }));
  }

  function markReady() {
    readySeen = true;
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(playFallbackArrival, 48);
  }

  function commitNavigation(destination, direction) {
    destination.searchParams.set(ROUTE_PARAMETER, direction);
    location.assign(destination.href);
  }

  function navigate(destinationValue, direction) {
    if (navigating) return;
    const destination = new URL(
      typeof destinationValue === "string" ? destinationValue : destinationValue.href,
      location.href,
    );
    if (destination.origin !== location.origin) {
      location.assign(destination.href);
      return;
    }
    const resolvedDirection = DIRECTIONS.has(direction)
      ? direction
      : inferredDirection(location.href, destination.href);
    if (!resolvedDirection || reducedMotion) {
      if (resolvedDirection) destination.searchParams.set(ROUTE_PARAMETER, resolvedDirection);
      location.assign(destination.href);
      return;
    }

    navigating = true;
    root.classList.add("is-route-departing", `route-direction-${resolvedDirection}`);
    document.body.classList.add("is-route-departing");
    window.dispatchEvent(new CustomEvent("art-route-exit"));
    const surface = document.querySelector(".museum-shell, .concept-shell, .concept-error");
    let committed = false;
    const onSurfaceExitFinished = (event) => {
      if (event.target !== surface) return;
      if (event.animationName !== `route-surface-old-${resolvedDirection}`) return;
      commit();
    };
    const commit = () => {
      if (committed) return;
      committed = true;
      surface?.removeEventListener("animationend", onSurfaceExitFinished);
      commitNavigation(destination, resolvedDirection);
    };
    surface?.addEventListener("animationend", onSurfaceExitFinished);
    setTimeout(commit, 520);
  }

  // These listeners are registered by a parser-blocking head script so the
  // incoming page can be prepared before its first rendering opportunity.
  window.addEventListener("pageswap", (event) => {
    const from = event.activation?.from?.url || location.href;
    const to = event.activation?.entry?.url;
    if (!to) return;
    const explicit = new URL(to, location.href).searchParams.has(ROUTE_PARAMETER);
    const direction = transitionDirection(from, to);
    if (event.viewTransition && direction) suppressComponentSnapshots();
    addTransitionTypes(event.viewTransition, direction, explicit);
  });

  window.addEventListener("pagereveal", (event) => {
    const from = globalThis.navigation?.activation?.from?.url;
    const to = globalThis.navigation?.activation?.entry?.url || location.href;
    const explicitDirection = new URL(to, location.href).searchParams.get(ROUTE_PARAMETER);
    const direction = DIRECTIONS.has(explicitDirection)
      ? explicitDirection
      : from
        ? transitionDirection(from, to)
        : null;
    if (event.viewTransition && direction) {
      nativeArrival = true;
      suppressComponentSnapshots();
      clearTimeout(fallbackTimer);
      root.classList.remove("route-arrival-pending", "is-route-arriving");
      addTransitionTypes(event.viewTransition, direction, DIRECTIONS.has(explicitDirection));
      const finish = () => {
        navigating = false;
        restoreComponentSnapshots();
        clearArrivalClasses();
      };
      event.viewTransition.finished.then(finish, finish);
      return;
    }
    playFallbackArrival();
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[data-route-mist][href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin) return;
    if (destination.hash && destination.pathname === location.pathname && destination.search === location.search) return;
    event.preventDefault();
    navigate(destination.href, link.dataset.routeMist);
  });

  window.addEventListener("art-route-ready", markReady);
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.routeReady !== "deferred") markReady();
  }, { once: true });
  window.addEventListener("pageshow", (event) => {
    navigating = false;
    root.classList.remove("is-route-departing");
    restoreComponentSnapshots();
    document.body.classList.remove("is-route-departing");
    if (event.persisted && hasArrival) markReady();
  });

  window.ArtRouteTransition = Object.freeze({ navigate });
})();
