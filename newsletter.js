// newsletter.js
// Talks directly to your Google Apps Script Web App — no server of your own needed.
// Paste the Web app URL from the Apps Script deployment step here:
const NEWSLETTER_ENDPOINT = "https://script.google.com/macros/s/AKfycbyoMATQzhMACIgRdVJy49SJMaiLYH-z6RkC3I9H31Rf-5V3RInWiEYLWgKngiyWBllw/exec";

const nlForm = document.getElementById("newsletterForm");
const nlEmail = document.getElementById("newsletterEmail");
const nlFrequency = document.getElementById("newsletterFrequency");
const nlWebsite = document.getElementById("newsletterWebsite"); // honeypot — see index.html for why
const nlStoreFilter = document.getElementById("newsletterStoreFilter");
const nlStoreChips = nlStoreFilter ? Array.from(nlStoreFilter.querySelectorAll(".chip")) : [];
const nlAllChip = nlStoreChips.find((c) => c.dataset.store === "all");
const nlSpecificChips = nlStoreChips.filter((c) => c.dataset.store !== "all");
const nlStatus = document.getElementById("newsletterStatus");

// Starts in "all stores" mode, same as the checked boxes used to default to.
let nlSelectedStores = new Set(nlSpecificChips.map((c) => c.dataset.store));

function setNlStatus(text, isError = false) {
  if (!nlStatus) return;
  nlStatus.textContent = text;
  nlStatus.style.color = isError ? "#ffb4b4" : "#b8ffcf";
}

function syncNlChips() {
  const allSelected = nlSelectedStores.size === nlSpecificChips.length;
  if (nlAllChip) nlAllChip.classList.toggle("active", allSelected);
  nlSpecificChips.forEach((chip) => {
    chip.classList.toggle("active", nlSelectedStores.has(chip.dataset.store));
  });
}

nlStoreChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const store = chip.dataset.store;

    if (store === "all") {
      nlSelectedStores = new Set(nlSpecificChips.map((c) => c.dataset.store));
    } else if (nlSelectedStores.size === nlSpecificChips.length) {
      // Was in "all" mode — clicking one store narrows down to just that one.
      nlSelectedStores = new Set([store]);
    } else if (nlSelectedStores.has(store)) {
      // Never allow zero stores selected — last one standing can't be removed.
      if (nlSelectedStores.size > 1) nlSelectedStores.delete(store);
    } else {
      nlSelectedStores.add(store);
    }
    syncNlChips();
  });
});

syncNlChips();

if (nlForm) {
  nlForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = nlEmail.value.trim();
    const frequency = nlFrequency.value;
    const allSelected = nlSelectedStores.size === nlSpecificChips.length;
    const stores = allSelected ? [] : [...nlSelectedStores];

    if (!email) {
      setNlStatus("Enter an email address.", true);
      return;
    }

    setNlStatus("Submitting…");

    try {
      await fetch(NEWSLETTER_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" }, // avoids a CORS preflight
        body: JSON.stringify({
          action: "subscribe",
          email,
          frequency,
          stores,

          website: nlWebsite ? nlWebsite.value : "",
        }),
      });

      setNlStatus("Almost done! Check your inbox for a confirmation email and click the link inside it.");
      nlForm.reset();
      nlSelectedStores = new Set(nlSpecificChips.map((c) => c.dataset.store));
      syncNlChips();
    } catch (err) {
      console.error(err);
      setNlStatus("Something went wrong. Please try again.", true);
    }
  });
}
