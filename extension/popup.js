const $ = (id) => document.getElementById(id);

chrome.storage.local.get("linkedin").then(({ linkedin }) => ($("linkedin").value = linkedin ?? ""));

function send(msg, pending) {
  $("status").textContent = pending;
  chrome.runtime.sendMessage(msg, (res) => {
    const error = chrome.runtime.lastError?.message ?? res?.error;
    if (error) $("status").textContent = error;
    else window.close();
  });
}

$("scrape").onclick = () => send({ type: "START_SCRAPE", linkedin: $("linkedin").value.trim() }, "Opening LinkedIn…");
$("job").onclick = () => send({ type: "SEND_JOB" }, "Sending…");
