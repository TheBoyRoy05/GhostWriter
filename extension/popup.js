const $ = (id) => document.getElementById(id);

chrome.storage.local.get("linkedin").then(({ linkedin }) => ($("linkedin").value = linkedin ?? ""));

function send(msg, pending) {
  $("status").textContent = pending;
  chrome.runtime.sendMessage(msg, (res) => {
    const error = chrome.runtime.lastError?.message ?? res?.error;
    if (error) $("status").textContent = error;
    else if (res?.needsConfirmation) {
      $("status").textContent = "";
      $("page-text-warning").hidden = false;
    } else window.close();
  });
}

$("scrape").onclick = () => send({ type: "START_SCRAPE", linkedin: $("linkedin").value.trim() }, "Opening LinkedIn…");
$("apply").onclick = () => send({ type: "APPLY" }, "Reading page…");
$("send-page").onclick = () => send({ type: "APPLY", sendPageAnyway: true }, "Sending…");
$("paste").onclick = () => send({ type: "SEND_PASTE", description: $("description").value.trim(), link: $("link").value.trim() }, "Sending…");
