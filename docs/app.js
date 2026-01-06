(async function () {
  function slugify(text) {
    return String(text)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  function enhanceAnchors(container) {
    const root = document.getElementById(container);
    if (!root) return;
    const headings = root.querySelectorAll("h2, h3");
    headings.forEach((h) => {
      if (!h.id) h.id = slugify(h.textContent);
      if (!h.querySelector(".anchor-link")) {
        const a = document.createElement("a");
        a.href = `#${h.id}`;
        a.className = "anchor-link";
        a.textContent = "#";
        h.appendChild(a);
      }
    });
  }

  async function loadMarkdown(targetId, url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      document.getElementById(targetId).innerHTML = marked.parse(text);
      enhanceAnchors(targetId);
    } catch (e) {
      document.getElementById(targetId).textContent =
        "Failed to load: " + url + " — " + (e?.message || e);
    }
  }

  await Promise.all([
    loadMarkdown("readme-html", "/md/README.md"),
    loadMarkdown("endpoints-html", "/md/ENDPOINTS.md"),
    loadMarkdown("architecture-html", "/md/ARCHITECTURE.md"),
  ]);

  // Reveal animation for cards when they enter viewport
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal");
          revealObserver.unobserve(entry.target); // one-time reveal
        }
      });
    },
    { threshold: 0.15 }
  );
  document
    .querySelectorAll(".card")
    .forEach((card) => revealObserver.observe(card));

  // Active tab on scroll
  const tabs = Array.from(document.querySelectorAll(".tabs .tab"));
  const sections = ["readme", "endpoints", "architecture"];
  const map = new Map(
    tabs.map((a) => [a.getAttribute("href").replace("#", ""), a])
  );

  // expose header height to CSS and keep it in sync on resize
  function updateHeaderHeight() {
    const header = document.querySelector(".site-header");
    const height = header
      ? Math.ceil(header.getBoundingClientRect().height)
      : 72;
    document.documentElement.style.setProperty(
      "--header-height",
      height + "px"
    );
    return height;
  }
  updateHeaderHeight();
  window.addEventListener("resize", () => updateHeaderHeight());

  // smooth-scroll behavior for nav tabs that accounts for header height
  tabs.forEach((tab) => {
    tab.addEventListener("click", (e) => {
      const href = tab.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      const id = href.slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const header = document.querySelector(".site-header");
      const headerHeight = header
        ? header.getBoundingClientRect().height
        : parseInt(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--header-height"
            ) || "72"
          );
      const offset = headerHeight + 12;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
      // update active class
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
    });
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          tabs.forEach((t) => t.classList.remove("active"));
          const link = map.get(id);
          if (link) link.classList.add("active");
        }
      });
    },
    { rootMargin: "-40% 0px -55% 0px", threshold: [0, 1] }
  );
  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });

  // Back to top button
  const backBtn = document.getElementById("backToTop");
  function toggleBackBtn() {
    if (window.scrollY > 300) backBtn?.classList.add("show");
    else backBtn?.classList.remove("show");
  }
  window.addEventListener("scroll", toggleBackBtn, { passive: true });
  backBtn?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  toggleBackBtn();
})();
