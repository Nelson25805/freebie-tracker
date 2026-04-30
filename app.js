let allItems = [];

// Load data from JSON file
async function loadData() {
    const res = await fetch("data/freebies.json");
    allItems = await res.json();
    render(allItems);
}

// Render items to the page
function render(items) {
    const list = document.getElementById("list");

    if (!items.length) {
        list.innerHTML = "<p>No current freebies detected right now.</p>";
        return;
    }

    list.innerHTML = items.map(item => {
        return `
      <div class="card">
        <h2>${item.title}</h2>
        <p><strong>Platform:</strong> ${item.platform}</p>
        <p><strong>Type:</strong> ${item.type}</p>
        ${item.endsAt ? `<p><strong>Ends:</strong> ${new Date(item.endsAt).toLocaleString()}</p>` : ""}
        <p><a href="${item.claimUrl}" target="_blank">Claim</a></p>
      </div>
    `;
    }).join("");
}

// Filter items based on type
function filterItems(type) {
    if (type === "all") {
        render(allItems);
        return;
    }

    if (type === "expiring") {
        const now = Date.now();
        const soon = now + (24 * 60 * 60 * 1000);

        const filtered = allItems.filter(item => {
            if (!item.endsAt) return false;
            const end = new Date(item.endsAt).getTime();
            return end <= soon && end > now;
        });

        render(filtered);
        return;
    }

    const filtered = allItems.filter(item => item.type === type);
    render(filtered);
}

loadData();