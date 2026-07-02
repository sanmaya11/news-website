(() => {
  "use strict";

  const FALLBACK_IMG = "assets/fallback-image.svg";

  const state = {
    region: "india",
    date: todayISO(),
  };

  const els = {
    tabs: document.querySelectorAll(".tab"),
    dateInput: document.getElementById("date-input"),
    todayBtn: document.getElementById("today-btn"),
    mastheadDate: document.getElementById("masthead-date"),
    noteBanner: document.getElementById("note-banner"),
    skeleton: document.getElementById("skeleton"),
    emptyState: document.getElementById("empty-state"),
    heroSlot: document.getElementById("hero-slot"),
    grid: document.getElementById("grid"),
    modalOverlay: document.getElementById("modal-overlay"),
    modalBody: document.getElementById("modal-body"),
    modalClose: document.getElementById("modal-close"),
  };

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  function formatDisplayDate(dateStr) {
    try {
      const dt = new Date(dateStr + "T00:00:00");
      return dt.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    } catch {
      return dateStr;
    }
  }

  function relativeTime(iso) {
    if (!iso) return "";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function withImgFallback(imgEl) {
    imgEl.addEventListener(
      "error",
      () => {
        imgEl.onerror = null;
        imgEl.src = FALLBACK_IMG;
      },
      { once: true }
    );
    return imgEl;
  }

  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  let fetchSeq = 0;

  async function fetchNews() {
    const seq = ++fetchSeq;
    setLoading(true);
    els.mastheadDate.textContent = formatDisplayDate(state.date);
    hideNote();

    let data;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        `/api/news?region=${encodeURIComponent(state.region)}&date=${encodeURIComponent(state.date)}`,
        { signal: controller.signal }
      );
      data = await res.json();
    } catch {
      data = { articles: [], meta: { note: "Could not reach the news service. Check your connection and try again." } };
    } finally {
      clearTimeout(timer);
    }

    if (seq !== fetchSeq) return; // a newer request has since started; drop this stale response

    setLoading(false);
    renderNews(data);
  }

  function setLoading(isLoading) {
    els.skeleton.hidden = !isLoading;
    if (isLoading) {
      els.emptyState.hidden = true;
      els.heroSlot.innerHTML = "";
      els.grid.innerHTML = "";
    }
  }

  function showNote(text) {
    els.noteBanner.textContent = text;
    els.noteBanner.hidden = false;
  }

  function hideNote() {
    els.noteBanner.hidden = true;
    els.noteBanner.textContent = "";
  }

  function renderNews(data) {
    const articles = Array.isArray(data.articles) ? data.articles : [];

    if (data.meta && data.meta.note) showNote(data.meta.note);

    if (articles.length === 0) {
      els.emptyState.hidden = false;
      els.heroSlot.innerHTML = "";
      els.grid.innerHTML = "";
      return;
    }

    els.emptyState.hidden = true;
    const [lead, ...rest] = articles;
    els.heroSlot.innerHTML = "";
    els.heroSlot.appendChild(buildHeroCard(lead));

    els.grid.innerHTML = "";
    for (const article of rest) {
      els.grid.appendChild(buildCard(article));
    }
  }

  function buildHeroCard(article) {
    const card = el("article", "hero-card");
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const img = withImgFallback(el("img"));
    img.src = article.imageUrl || FALLBACK_IMG;
    img.alt = "";
    const imgFrame = el("div", "img-frame");
    imgFrame.appendChild(img);

    const textWrap = el("div");
    const kicker = el("div", "kicker", state.region === "india" ? "Top Story &middot; India" : "Top Story &middot; World");
    const h2 = el("h2", null, escapeHtml(article.title));
    const snippet = el("p", "snippet", escapeHtml(article.snippet || ""));
    const byline = el(
      "div",
      "byline",
      `${escapeHtml(article.source || "Unknown Source")} &middot; ${relativeTime(article.publishedAt)}${
        article.dateMatch === "nearby" ? '<span class="nearby-tag">Nearby date</span>' : ""
      }`
    );

    textWrap.append(kicker, h2, snippet, byline);
    card.append(imgFrame, textWrap);
    card.addEventListener("click", () => openModal(article));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openModal(article);
    });
    return card;
  }

  function buildCard(article) {
    const card = el("article", "article-card");
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const img = withImgFallback(el("img"));
    img.src = article.imageUrl || FALLBACK_IMG;
    img.alt = "";
    const imgFrame = el("div", "img-frame");
    imgFrame.appendChild(img);

    const h3 = el("h3", null, escapeHtml(article.title));
    const snippet = el("p", "snippet", escapeHtml(article.snippet || ""));
    const byline = el(
      "div",
      "byline",
      `${escapeHtml(article.source || "Unknown Source")} &middot; ${relativeTime(article.publishedAt)}${
        article.dateMatch === "nearby" ? '<span class="nearby-tag">Nearby</span>' : ""
      }`
    );

    card.append(imgFrame, h3, snippet, byline);
    card.addEventListener("click", () => openModal(article));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openModal(article);
    });
    return card;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  async function openModal(article) {
    els.modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    renderModalSkeleton(article);

    let result;
    try {
      const res = await fetch(`/api/article?url=${encodeURIComponent(article.link)}`);
      result = await res.json();
    } catch {
      result = { extracted: false, reason: "fetch_error" };
    }

    renderModalContent(article, result);
  }

  function renderModalSkeleton(article) {
    els.modalBody.innerHTML = "";
    const kicker = el("div", "modal-kicker", state.region === "india" ? "India" : "World");
    const title = el("h2", "modal-title", escapeHtml(article.title));
    const byline = el(
      "div",
      "modal-byline",
      `${escapeHtml(article.source || "Unknown Source")} &middot; ${relativeTime(article.publishedAt)}`
    );
    const img = withImgFallback(el("img", "modal-image"));
    img.src = article.imageUrl || FALLBACK_IMG;
    img.alt = "";
    const spinner = el("div", "extraction-spinner", "Fetching the full article&hellip;");
    els.modalBody.append(kicker, title, byline, img, spinner);
  }

  function renderModalContent(article, result) {
    const spinner = els.modalBody.querySelector(".extraction-spinner");
    if (spinner) spinner.remove();

    const textWrap = el("div", "modal-text");

    if (result && result.extracted) {
      textWrap.innerHTML = result.html || `<p>${escapeHtml(article.snippet)}</p>`;
    } else {
      textWrap.innerHTML = `<p>${escapeHtml(article.snippet || "A full preview isn't available for this story.")}</p>`;
      const fallbackNote = el(
        "p",
        "fallback-note",
        "The original publisher limits automatic reading here — continue on their site for the full story."
      );
      textWrap.appendChild(fallbackNote);
    }

    const link = el("a", "read-original-btn", "Read Original Article &#8599;");
    link.href = (result && result.resolvedUrl) || article.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    els.modalBody.append(textWrap, link);
  }

  function closeModal() {
    els.modalOverlay.hidden = true;
    els.modalBody.innerHTML = "";
    document.body.style.overflow = "";
  }

  function initControls() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        if (tab.classList.contains("active")) return;
        els.tabs.forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        state.region = tab.dataset.region;
        fetchNews();
      });
    });

    const today = todayISO();
    els.dateInput.max = today;
    els.dateInput.value = state.date;

    const debouncedFetch = debounce(() => {
      state.date = els.dateInput.value || today;
      fetchNews();
    }, 400);

    els.dateInput.addEventListener("change", debouncedFetch);

    els.todayBtn.addEventListener("click", () => {
      els.dateInput.value = today;
      state.date = today;
      fetchNews();
    });

    els.modalClose.addEventListener("click", closeModal);
    els.modalOverlay.addEventListener("click", (e) => {
      if (e.target === els.modalOverlay) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.modalOverlay.hidden) closeModal();
    });
  }

  initControls();
  fetchNews();
})();
