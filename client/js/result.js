(() => {
  "use strict";
  async function loadResult(id) {
    const response = await fetch(`/api/results/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Result not found.");
    return data.result;
  }
  window.ResultAPI = { loadResult };
})();
