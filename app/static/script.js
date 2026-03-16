/* ═══════════════════════════════════════════════════════
   SNIP — URL Shortener Frontend Logic
   ═══════════════════════════════════════════════════════ */

const API_BASE = "";

// ── DOM References ──────────────────────────────
const shortenForm = document.getElementById("shorten-form");
const urlInput = document.getElementById("url-input");
const aliasInput = document.getElementById("alias-input");
const expiryInput = document.getElementById("expiry-input");
const shortenBtn = document.getElementById("shorten-btn");
const toggleOptionsBtn = document.getElementById("toggle-options-btn");
const advancedOptions = document.getElementById("advanced-options");
const resultCard = document.getElementById("result-card");
const resultUrl = document.getElementById("result-url");
const resultOriginal = document.getElementById("result-original");
const recentTbody = document.getElementById("recent-tbody");
const emptyState = document.getElementById("empty-state");
const statsModal = document.getElementById("stats-modal");
const modalBody = document.getElementById("modal-body");
const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");

// ── Toggle Advanced Options ─────────────────────
toggleOptionsBtn.addEventListener("click", () => {
    advancedOptions.classList.toggle("visible");
});

// ── Shorten URL ─────────────────────────────────
shortenForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await shortenUrl();
});

async function shortenUrl() {
    const url = urlInput.value.trim();
    if (!url) return;

    const alias = aliasInput.value.trim() || null;
    const expiresInHours = expiryInput.value ? parseInt(expiryInput.value) : null;

    // Show loading state
    shortenBtn.classList.add("loading");
    shortenBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/shorten`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: url,
                custom_alias: alias,
                expires_in_hours: expiresInHours,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to shorten URL");
        }

        const data = await response.json();

        // Show result
        resultUrl.value = data.short_url;
        resultOriginal.textContent = `Original: ${data.original_url}`;
        resultCard.classList.add("visible");

        // Clear form
        urlInput.value = "";
        aliasInput.value = "";
        expiryInput.value = "";
        advancedOptions.classList.remove("visible");

        // Refresh recent URLs
        await loadRecentUrls();

    } catch (err) {
        showToast(err.message, true);
    } finally {
        shortenBtn.classList.remove("loading");
        shortenBtn.disabled = false;
    }
}

// ── Copy to Clipboard ───────────────────────────
async function copyToClipboard() {
    const url = resultUrl.value;
    if (!url) return;

    try {
        await navigator.clipboard.writeText(url);
        showToast("Copied to clipboard!");
    } catch {
        // Fallback
        resultUrl.select();
        document.execCommand("copy");
        showToast("Copied to clipboard!");
    }
}

// ── Load Recent URLs ────────────────────────────
async function loadRecentUrls() {
    try {
        const response = await fetch(`${API_BASE}/api/recent`);
        if (!response.ok) throw new Error("Failed to fetch recent URLs");

        const urls = await response.json();

        if (urls.length === 0) {
            recentTbody.innerHTML = "";
            emptyState.classList.add("visible");
            document.getElementById("recent-table").style.display = "none";
            return;
        }

        emptyState.classList.remove("visible");
        document.getElementById("recent-table").style.display = "table";

        recentTbody.innerHTML = urls
            .map((u) => {
                const created = new Date(u.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                });

                return `
                    <tr>
                        <td>
                            <a href="${u.short_url}" target="_blank" rel="noopener">${u.short_code}</a>
                        </td>
                        <td class="original-url-cell" title="${escapeHtml(u.original_url)}">
                            ${escapeHtml(u.original_url)}
                        </td>
                        <td>
                            <span class="click-badge">${u.click_count}</span>
                        </td>
                        <td>${created}</td>
                        <td>
                            <button class="btn btn-stats" onclick="showStats('${u.short_code}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="20" x2="18" y2="10" />
                                    <line x1="12" y1="20" x2="12" y2="4" />
                                    <line x1="6" y1="20" x2="6" y2="14" />
                                </svg>
                                Stats
                            </button>
                        </td>
                    </tr>
                `;
            })
            .join("");
    } catch (err) {
        console.error("Failed to load recent URLs:", err);
    }
}

// ── Show Stats Modal ────────────────────────────
async function showStats(shortCode) {
    try {
        const response = await fetch(`${API_BASE}/api/stats/${shortCode}`);
        if (!response.ok) throw new Error("Failed to fetch stats");

        const stats = await response.json();

        const created = new Date(stats.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        const expires = stats.expires_at
            ? new Date(stats.expires_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : "Never";

        let clicksHtml = "";
        if (stats.recent_clicks && stats.recent_clicks.length > 0) {
            clicksHtml = `
                <p class="clicks-list-title">Recent Clicks</p>
                ${stats.recent_clicks
                    .slice(0, 10)
                    .map((click) => {
                        const time = new Date(click.clicked_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        });
                        const agent = click.user_agent
                            ? parseUserAgent(click.user_agent)
                            : "Unknown";
                        return `
                            <div class="click-item">
                                <span class="click-time">${time}</span>
                                <span class="click-agent" title="${escapeHtml(click.user_agent || "")}">${agent}</span>
                            </div>
                        `;
                    })
                    .join("")}
            `;
        } else {
            clicksHtml = `<p style="color: var(--text-muted); font-size: 0.85rem;">No clicks yet.</p>`;
        }

        modalBody.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Total Clicks</div>
                    <div class="stat-value accent">${stats.total_clicks}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Short Code</div>
                    <div class="stat-value">${stats.short_code}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Created</div>
                    <div class="stat-url">${created}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Expires</div>
                    <div class="stat-url">${expires}</div>
                </div>
            </div>
            <div class="stat-card" style="margin-bottom: 20px;">
                <div class="stat-label">Original URL</div>
                <div class="stat-url">${escapeHtml(stats.original_url)}</div>
            </div>
            ${clicksHtml}
        `;

        statsModal.classList.add("visible");
    } catch (err) {
        showToast("Failed to load stats", true);
    }
}

function closeModal() {
    statsModal.classList.remove("visible");
}

// Close modal on overlay click
statsModal.addEventListener("click", (e) => {
    if (e.target === statsModal) closeModal();
});

// Close modal on Escape
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
});

// ── Toast Notification ──────────────────────────
function showToast(message, isError = false) {
    toastText.textContent = message;
    toast.style.background = isError ? "var(--danger)" : "var(--success)";
    toast.classList.add("visible");

    setTimeout(() => {
        toast.classList.remove("visible");
    }, 3000);
}

// ── Utilities ───────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function parseUserAgent(ua) {
    if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Edg")) return "Edge";
    if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
    return "Other Browser";
}

// ── Init ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    loadRecentUrls();
    urlInput.focus();
});
