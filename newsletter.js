// newsletter.js
// Talks directly to your Google Apps Script Web App — no server of your own needed.
// Paste the Web app URL from the Apps Script deployment step here:
const NEWSLETTER_ENDPOINT = "https://script.google.com/macros/s/AKfycbyoMATQzhMACIgRdVJy49SJMaiLYH-z6RkC3I9H31Rf-5V3RInWiEYLWgKngiyWBllw/exec";

const nlForm = document.getElementById("newsletterForm");
const nlEmail = document.getElementById("newsletterEmail");
const nlFrequency = document.getElementById("newsletterFrequency");
const nlAllStores = document.getElementById("newsletterAllStores");
const nlStoreRow = document.getElementById("newsletterStoreRow");
const nlStoreChips = nlStoreRow ? Array.from(nlStoreRow.querySelectorAll("input[type=checkbox]")) : [];
const nlStatus = document.getElementById("newsletterStatus");

function setNlStatus(text, isError = false) {
  if (!nlStatus) return;
  nlStatus.textContent = text;
  nlStatus.style.color = isError ? "#ffb4b4" : "#b8ffcf";
}

function toggleStoreRow() {
  if (!nlStoreRow) return;
  nlStoreRow.hidden = nlAllStores.checked;
}

if (nlAllStores) {
  nlAllStores.addEventListener("change", toggleStoreRow);
  toggleStoreRow();
}

if (nlForm) {
  nlForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = nlEmail.value.trim();
    const frequency = nlFrequency.value;
    const stores = nlAllStores.checked
      ? []
      : nlStoreChips.filter((c) => c.checked).map((c) => c.value);

    if (!email) {
      setNlStatus("Enter an email address.", true);
      return;
    }
    if (!nlAllStores.checked && stores.length === 0) {
      setNlStatus("Pick at least one store, or check \"All stores.\"", true);
      return;
    }

    setNlStatus("Submitting…");

    try {
      // Apps Script web apps don't send CORS headers for simple requests,
      // so this is sent as a "no-cors" fire-and-forget POST. We can't read
      // the response, but the script still runs and stores/sends as normal.
      await fetch(NEWSLETTER_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" }, // avoids a CORS preflight
        body: JSON.stringify({ action: "subscribe", email, frequency, stores }),
      });
      setNlStatus("Subscribed! Check your inbox for a confirmation email.");
      nlForm.reset();
      toggleStoreRow();
    } catch (err) {
      console.error(err);
      setNlStatus("Something went wrong. Please try again.", true);
    }
  });
}
