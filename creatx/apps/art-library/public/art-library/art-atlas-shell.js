document.querySelector(".chat-reveal")?.addEventListener("click", () => {
  window.parent.postMessage({ type: "creatx:art-library.open-chat" }, "*")
})
