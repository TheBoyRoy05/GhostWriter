const $ = (id) => document.getElementById(id);

chrome.storage.local.get("linkedin").then(({ linkedin }) => ($("linkedin").value = linkedin ?? ""));

function send(msg, pending) {
  $("status").textContent = pending;
  chrome.runtime.sendMessage(msg, (res) => {
    if (res?.error) $("status").textContent = res.error;
    else window.close();
  });
}

$("scrape").onclick = () => send({ type: "START_SCRAPE", linkedin: $("linkedin").value.trim() }, "Opening LinkedIn…");
$("job").onclick = () => send({ type: "SEND_JOB" }, "Sending…");
