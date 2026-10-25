// Landing page: scroll reveals and the click to play demo video. No inline scripts: the CSP only allows 'self'.
document.documentElement.classList.add("js");

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Reveal on scroll. Only items below the fold at load are hidden, so the first screen is complete at once.
const items = [...document.querySelectorAll(".reveal, .printer")];
if ("IntersectionObserver" in window && !reduce) {
  const fold = innerHeight * 0.92;
  for (const el of items) {
    if (el.classList.contains("reveal") && el.getBoundingClientRect().top > fold) el.classList.add("pre");
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (el.classList.contains("reveal") && !el.classList.contains("pre")) el.classList.add("now");
      el.classList.remove("pre");
      el.classList.add("in");
      io.unobserve(el);
    }
  }, { threshold: 0.18 });
  items.forEach((el) => io.observe(el));
} else {
  items.forEach((el) => el.classList.add("in"));
}

// The demo video loads from YouTube only after the visitor presses play.
const poster = document.getElementById("poster");
const box = document.getElementById("video-box");
if (poster && box) {
  const id = box.dataset.video;
  poster.addEventListener("click", () => {
    poster.classList.add("is-loading");
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1`;
    frame.title = "Consent Receipts demo video";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.addEventListener("load", () => poster.remove());
    box.appendChild(frame);
  });
}

// "Watch the demo" buttons scroll to the video and start it.
for (const btn of document.querySelectorAll("[data-play]")) {
  btn.addEventListener("click", (ev) => {
    if (!poster || !poster.isConnected) return;
    ev.preventDefault();
    document.getElementById("demo").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setTimeout(() => poster.click(), reduce ? 0 : 450);
  });
}
