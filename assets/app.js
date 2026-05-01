const container = document.getElementById("offers");
const buttons = document.querySelectorAll(".filters button");

let offers = [];
let currentFilter = "all";

async function loadOffers() {
    const res = await fetch("data/offers.json");
    offers = await res.json();
    render();
}

function render() {
    container.innerHTML = "";

    const filtered = offers.filter(o =>
        currentFilter === "all" ? true : o.type === currentFilter
    );

    filtered.forEach(o => {
        const el = document.createElement("div");
        el.className = "card";

        el.innerHTML = `
      <span class="badge ${o.type}">${o.type}</span>
      <h3>${o.title}</h3>
      <p>${o.endsAt ? `Ends: ${o.endsAt}` : "No expiry"}</p>
      <a href="${o.url}" target="_blank">View</a>
    `;

        container.appendChild(el);
    });
}

buttons.forEach(btn => {
    btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        render();
    });
});

loadOffers();