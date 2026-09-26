const $ = (id) => document.getElementById(id);
let busy = false;
let poll;
let inferenceDisabled = false;

function text(parent, tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function render(session) {
  inferenceDisabled = session.inferenceEnabled === false;
  if (session.modelMode === "workers-ai") {
    api("/api/inference").then((quota) => {
      $("inference-status").textContent = `Live model attempts: ${quota.used}/${quota.limit} · inference ${quota.enabled ? "enabled" : "disabled"}`;
      $("attempt-ledger").hidden = false;
      $("attempt-outcomes").textContent = (quota.attempts ?? []).map((attempt) => `${attempt.number}: ${attempt.outcome}${attempt.failureReason ? ` (${attempt.failureReason})` : ""}`).join("\n");
      $("disable-inference").hidden = !quota.enabled;
      if (!quota.enabled) { inferenceDisabled = true; setBusy(busy); }
    }).catch(() => { $("inference-status").textContent = "Unable to read live inference quota."; });
  }
  $("mode").textContent = session.modelMode === "fixture"
    ? "LOCAL TEST MODEL · deterministic responses, no live AI inference or API charges"
    : inferenceDisabled ? "LIVE INFERENCE DISABLED · saved investigations remain available · synthetic diagnostics"
      : "Workers AI · real model responses · synthetic diagnostics";
  $("chat").replaceChildren();
  for (const turn of session.turns) {
    const user = text($("chat"), "article", "", "user");
    text(user, "div", "You", "speaker");
    text(user, "p", turn.question);
    const answer = text($("chat"), "article", "", "answer");
    text(answer, "div", "Advisory response", "speaker");
    if (turn.answer && turn.status === "completed") {
      const separatedAdvice = turn.promptVersion === "synthetic-advisor-v4";
      for (const paragraph of separatedAdvice ? turn.answer.summary.split("\n\n") : [turn.answer.summary]) text(answer, "p", paragraph);
      for (const finding of turn.answer.findings) {
        const item = text(answer, "div", "", "finding");
        text(item, "strong", separatedAdvice ? "Diagnostic evidence · cause unconfirmed" : `${finding.severity.toUpperCase()} · ${finding.category.replaceAll("_", " ")}`);
        text(item, "p", finding.recommendation);
        text(item, "p", separatedAdvice ? finding.validationPlan : `Validate: ${finding.validationPlan}`);
        text(item, "p", `Rollback considerations: ${finding.rollbackPlan}`);
        text(item, "p", "Human review required before any action.", "small");
        for (const citation of finding.citations) {
          // Server validates membership; browser additionally limits link schemes.
          if (!citation.url.startsWith("https://")) continue;
          const link = text(item, "a", citation.section);
          link.href = citation.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
      }
      text(answer, "p", `Used saved evidence ${turn.usedEvidenceHash?.slice(0, 12) ?? "unknown"}`, "evidence-ref");
    } else {
      text(answer, "p", turn.error ?? "Investigating…");
    }
  }
  $("evidence-status").textContent = session.evidence
    ? `Synthetic snapshot · ${session.evidence.hash.slice(0, 12)}`
    : "Evidence will appear after the diagnostic runs.";
  $("evidence").textContent = session.evidence ? JSON.stringify(session.evidence.audit, null, 2) : "";
  const pending = session.turns.some((turn) => turn.status === "pending");
  setBusy(pending);
  clearTimeout(poll);
  if (pending) poll = setTimeout(restore, 1000);
}

function setBusy(value) {
  busy = value;
  $("send").disabled = value || inferenceDisabled;
  $("reset").disabled = value;
  $("status").textContent = value ? "Investigating and saving evidence…" : "";
}

async function api(path, body) {
  const response = await fetch(path, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

async function restore() {
  try { render(await api("/api/investigation")); }
  catch { setBusy(false); $("status").textContent = "Unable to restore the investigation. Refresh to retry."; }
}

$("question-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || inferenceDisabled) return;
  const question = $("question").value.trim();
  if (!question) return;
  setBusy(true);
  try {
    const session = await api("/api/investigation", { requestId: crypto.randomUUID(), question });
    render(session);
    $("question").value = "";
  } catch (error) {
    setBusy(false);
    $("status").textContent = `${error.message}. Refresh to check saved progress before sending again.`;
  }
});
$("reset").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try { render(await api("/api/session", {})); }
  catch { setBusy(false); $("status").textContent = "Unable to start a new investigation."; }
});
$("disable-inference").addEventListener("click", async () => {
  $("disable-inference").disabled = true;
  try {
    const response = await fetch("/api/inference", { method: "DELETE" });
    if (!response.ok) throw new Error("Shutdown failed");
    inferenceDisabled = true;
    await restore();
  } catch {
    $("status").textContent = "Unable to confirm shutdown. Retry or disable inference through deployment configuration.";
    $("disable-inference").disabled = false;
  }
});
setBusy(true);
restore();
