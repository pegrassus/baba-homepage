// BAbA – kleine Interaktionen. Alle Inhalte stehen bereits als statisches HTML in den Seiten.
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("hauptnavigation");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // Organigramm: alle Abteilungen auf- bzw. zuklappen
  document.querySelectorAll("[data-org-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("data-org-toggle") === "open";
      document.querySelectorAll(".org-abt").forEach(function (d) { d.open = open; });
    });
  });

  // Suche über api/suche.json
  var results = document.getElementById("suchergebnisse");
  if (results) {
    var base = results.getAttribute("data-base") || "";
    var input = document.getElementById("suchbegriff");
    var q = new URLSearchParams(location.search).get("q") || "";
    input.value = q;
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    fetch(base + "api/suche.json").then(function (r) { return r.json(); }).then(function (index) {
      var run = function () {
        var terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) { results.innerHTML = "<p>Bitte geben Sie einen Suchbegriff ein.</p>"; return; }
        var hits = index.eintraege.filter(function (e) {
          var hay = (e.titel + " " + e.text + " " + e.typ).toLowerCase();
          return terms.every(function (t) { return hay.indexOf(t) !== -1; });
        });
        results.innerHTML = "<p>" + hits.length + " Treffer</p>" + (hits.length ? '<ul class="list-plain">' + hits.map(function (h) {
          return '<li><span class="tag">' + esc(h.typ) + '</span> <a href="' + base + esc(h.url) + '"><strong>' + esc(h.titel) + "</strong></a><br><small>" + esc(h.text.slice(0, 180)) + "</small></li>";
        }).join("") + "</ul>" : "");
      };
      run();
      input.addEventListener("input", run);
    });
  }
})();
