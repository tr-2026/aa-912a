// "Are you sure?" for actions that throw something away. One shared <dialog>, answered with a Promise.
import { el } from "./dom.js";

let dialog = null;

function getDialog() {
  if (!dialog) {
    dialog = el("dialog", { class: "card-dialog confirm-dialog", "aria-labelledby": "confirm-title" });
    document.body.append(dialog);
  }
  return dialog;
}

/**
 * Ask a yes/no question. Resolves true only if the host presses the confirm button (Escape or Cancel gives false).
 * The answer comes straight from the buttons; the dialog's "close" event is only a fallback for the Escape key,
 * because relying on that event alone leaves the question hanging if it is late or never fires.
 * @param {{title: string, message: string, confirmText?: string}} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmText = "Yes, continue" }) {
  const d = getDialog();
  if (d.open) d.close(); // never stack a second question on a stuck one
  return new Promise((resolve) => {
    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      d.removeEventListener("close", onClose);
      if (d.open) d.close();
      resolve(answer);
    };
    const onClose = () => finish(false); // Escape (or anything else that closes it) means no

    d.replaceChildren(
      el("h3", { id: "confirm-title", text: title }),
      el("p", { text: message }),
      el("div", { class: "row" }, [
        el("button", { type: "button", class: "danger", text: confirmText, onclick: () => finish(true) }),
        el("button", { type: "button", text: "Cancel", onclick: () => finish(false) }),
      ]),
    );
    d.addEventListener("close", onClose);
    d.showModal();
  });
}
