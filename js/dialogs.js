// A single modal keeps notifications and choices in the editor. Queue requests
// so simultaneous errors do not replace a question the user is answering.
const queue = [];
let active = null;
let initialized = false;

function openNext() {
  if (active || !queue.length) return;
  const dialog = document.getElementById("appDialog"),
    form = document.getElementById("appDialogForm"),
    input = document.getElementById("appDialogInput"),
    error = document.getElementById("appDialogError");
  if (!initialized) {
    initialized = true;
    const cancel = () => dialog.close("cancel");
    document.getElementById("appDialogCancel").onclick = cancel;
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      cancel();
    });
    input.addEventListener("input", () => {
      error.hidden = true;
      input.removeAttribute("aria-invalid");
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (active.kind === "number" &&
          (!input.value.trim() || !Number.isFinite(Number(input.value)) || Number(input.value) <= 0)) {
        error.textContent = "Enter a number greater than zero.";
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      dialog.close("accept");
    });
    dialog.addEventListener("close", () => {
      const request = active;
      active = null;
      const accepted = dialog.returnValue === "accept";
      request.resolve(request.kind === "number" ? (accepted ? Number(input.value) : null) : accepted);
      queueMicrotask(openNext);
    });
  }
  active = queue.shift();
  dialog.returnValue = "";
  document.getElementById("appDialogTitle").textContent = active.title;
  document.getElementById("appDialogMessage").textContent = active.message;
  document.getElementById("appDialogField").hidden = active.kind !== "number";
  document.getElementById("appDialogCancel").hidden = active.kind === "alert";
  const accept = document.getElementById("appDialogAccept");
  accept.textContent = active.acceptLabel;
  accept.className = active.danger ? "danger" : "primary";
  input.value = active.value ?? "";
  error.hidden = true;
  input.removeAttribute("aria-invalid");
  dialog.showModal();
  if (active.kind === "number") {
    input.focus();
    input.select();
  } else if (active.kind === "confirm") {
    document.getElementById("appDialogCancel").focus();
  } else accept.focus();
}

function request(options) {
  return new Promise(resolve => {
    queue.push({ ...options, resolve });
    openNext();
  });
}

export function showAlert(message, title = "Something went wrong") {
  return request({ kind:"alert", message, title, acceptLabel:"OK" });
}

export function askConfirm(message, { title = "Confirm action", acceptLabel = "Continue", danger = false } = {}) {
  return request({ kind:"confirm", message, title, acceptLabel, danger });
}

export function askNumber(message, value) {
  return request({ kind:"number", message, value, title:"Object size", acceptLabel:"Apply" });
}
