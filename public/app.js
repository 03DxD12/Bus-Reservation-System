document.addEventListener("DOMContentLoaded", () => {
  const originSelect = document.getElementById("origin");
  const destinationSelect = document.getElementById("destination");
  const searchForm = document.getElementById("search-form");
  const resultsSection = document.getElementById("results-section");
  const resultsContainer = document.getElementById("results-container");
  const resultCount = document.getElementById("result-count");
  const bookingModal = document.getElementById("booking-modal");
  const bookingForm = document.getElementById("booking-form");
  const seatMap = document.getElementById("seat-map");
  const seatHelp = document.getElementById("seat-help");
  const modalTotal = document.getElementById("modal-total");
  const selectedSeatLabel = document.getElementById("selected-seat-label");
  const lookupResult = document.getElementById("lookup-result");
  const searchFeedback = document.getElementById("search-feedback");
  const modalFeedback = document.getElementById("modal-feedback");

  let currentTrip = null;
  let selectedSeats = [];
  let currentUser = null;
  let lastTriggerButton = null;

  init();

  async function init() {
    document.getElementById("date").min = new Date().toISOString().slice(0, 10);
    await loadCurrentUser();
    await fetchTerminals();
  }

  async function loadCurrentUser() {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    currentUser = data.user;
    const chip = document.getElementById("auth-chip");
    if (!currentUser) {
      chip.innerHTML = '<a class="btn ghost small" href="login.html">Login</a>';
      return;
    }
    chip.innerHTML = `
      <span>${escapeHtml(currentUser.username)}</span>
      <button class="btn ghost small" id="logout-btn" type="button">Logout</button>
    `;
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      location.reload();
    });
  }

  async function fetchTerminals() {
    try {
      const res = await fetch("/api/terminals");
      const terminals = await res.json();
      const options = terminals
        .map(
          (terminal) =>
            `<option value="${escapeHtml(terminal.id)}">${escapeHtml(terminal.name)} (${escapeHtml(terminal.city)})</option>`
        )
        .join("");
      originSelect.insertAdjacentHTML("beforeend", options);
      destinationSelect.insertAdjacentHTML("beforeend", options);
    } catch (error) {
      setFeedback(searchFeedback, "Failed to load terminals.");
    }
  }

  document.getElementById("swap-route").addEventListener("click", () => {
    const origin = originSelect.value;
    originSelect.value = destinationSelect.value;
    destinationSelect.value = origin;
  });

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(searchFeedback, "");
    const originId = originSelect.value;
    const destinationId = destinationSelect.value;
    const date = document.getElementById("date").value;

    if (originId === destinationId) {
      setFeedback(searchFeedback, "Origin and destination cannot be the same.");
      return;
    }

    resultsSection.classList.remove("hidden");
    resultCount.textContent = "";
    showInline(resultsContainer, "Searching trips...");

    try {
      const res = await fetch(`/api/trips?originId=${originId}&destinationId=${destinationId}&date=${date}`);
      const trips = await res.json();
      if (!res.ok) throw new Error(trips.error || "Unable to search trips");
      displayTrips(trips);
    } catch (error) {
      showInline(resultsContainer, error.message);
    }
  });

  function displayTrips(trips) {
    resultsContainer.innerHTML = "";
    resultCount.textContent = `${trips.length} trip${trips.length === 1 ? "" : "s"} found`;

    if (trips.length === 0) {
      showInline(resultsContainer, "No trips found for this route and date.");
      return;
    }

    for (const trip of trips) {
      const departure = new Date(trip.departureTime);
      const arrival = new Date(trip.arrivalTime);
      const duration = Math.abs(arrival - departure) / 36e5;
      const card = document.createElement("article");
      card.className = "trip-card";
      card.innerHTML = `
        <div class="trip-card-top">
          <span class="bus-pill">${escapeHtml(trip.busType)}</span>
          <strong>${formatCurrency(trip.price)}</strong>
        </div>
        <h3>${escapeHtml(trip.route.origin.name)} <i class="ri-arrow-right-line" aria-hidden="true"></i> ${escapeHtml(
        trip.route.destination.name
      )}</h3>
        <div class="trip-meta">
          <span><i class="ri-time-line" aria-hidden="true"></i> ${formatTime(departure)}</span>
          <span><i class="ri-route-line" aria-hidden="true"></i> ${duration}h</span>
          <span><i class="ri-armchair-fill" aria-hidden="true"></i> ${trip.seatsAvailable}/${trip.capacity}</span>
        </div>
        <button class="btn secondary full" type="button">Select Seats</button>
      `;
      const selectButton = card.querySelector("button");
      selectButton.addEventListener("click", () => openBookingModal(trip, selectButton));
      resultsContainer.appendChild(card);
    }

    resultsSection.scrollIntoView({ behavior: "smooth" });
  }

  async function openBookingModal(trip, triggerButton = null) {
    if (!currentUser) {
      location.href = "login.html";
      return;
    }

    lastTriggerButton = triggerButton;
    currentTrip = trip;
    selectedSeats = [];
    setFeedback(modalFeedback, "");
    document.getElementById("modal-trip-id").value = trip.id;
    document.getElementById("modal-route").textContent = `${trip.route.origin.name} to ${trip.route.destination.name}`;
    document.getElementById("modal-details").textContent = `${formatTime(
      new Date(trip.departureTime)
    )} • ${trip.busType} • ${formatCurrency(trip.price)} per seat`;
    document.getElementById("passenger-name").value = currentUser.username || "";
    document.getElementById("contact-email").value = currentUser.email || "";
    document.getElementById("contact-phone").value = currentUser.phone || "";
    bookingModal.classList.remove("hidden");
    document.querySelector(".close-modal").focus();
    await renderSeatMap(trip.id);
    updateTotal();
  }

  async function renderSeatMap(tripId) {
    seatMap.innerHTML = "";
    seatHelp.textContent = "Loading seat map...";
    try {
      const res = await fetch(`/api/trips/${tripId}/seats`);
      const data = await res.json();
      if (!res.ok) {
        seatHelp.textContent = data.error || "Unable to load seats";
        return;
      }

      const taken = new Set(data.takenSeats);
      for (let seat = 1; seat <= data.capacity; seat += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "seat";
        button.textContent = seat;
        button.disabled = taken.has(seat);
        button.setAttribute("aria-label", `Seat ${seat}${button.disabled ? " (taken)" : ""}`);
        button.setAttribute("aria-pressed", "false");
        if (button.disabled) button.classList.add("taken");
        button.addEventListener("click", () => toggleSeat(button, seat));
        seatMap.appendChild(button);
      }
      seatHelp.textContent = `${data.seatsAvailable} seats available`;
    } catch {
      seatHelp.textContent = "Unable to load seats";
    }
  }

  function toggleSeat(button, seat) {
    setFeedback(modalFeedback, "");
    if (selectedSeats.includes(seat)) {
      selectedSeats = selectedSeats.filter((item) => item !== seat);
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
    } else {
      if (selectedSeats.length >= 10) {
        setFeedback(modalFeedback, "You can reserve up to 10 seats per booking.");
        return;
      }
      selectedSeats.push(seat);
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
    }
    selectedSeats.sort((a, b) => a - b);
    updateTotal();
  }

  function updateTotal() {
    const total = (currentTrip?.price || 0) * selectedSeats.length;
    selectedSeatLabel.textContent =
      selectedSeats.length === 0 ? "No seats selected" : `Seats ${selectedSeats.join(", ")}`;
    modalTotal.textContent = formatCurrency(total);
  }

  document.querySelector(".close-modal").addEventListener("click", closeModal);
  bookingModal.addEventListener("click", (event) => {
    if (event.target === bookingModal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !bookingModal.classList.contains("hidden")) {
      closeModal();
    }
  });

  function closeModal() {
    bookingModal.classList.add("hidden");
    if (lastTriggerButton) {
      lastTriggerButton.focus();
      lastTriggerButton = null;
    }
  }

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(modalFeedback, "");
    if (selectedSeats.length === 0) {
      setFeedback(modalFeedback, "Select at least one seat.");
      return;
    }

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: document.getElementById("modal-trip-id").value,
          passengerName: document.getElementById("passenger-name").value,
          contactEmail: document.getElementById("contact-email").value,
          contactPhone: document.getElementById("contact-phone").value,
          paymentMethod: document.getElementById("payment-method").value,
          seatNumbers: selectedSeats,
        }),
      });
      const booking = await res.json();
      if (!res.ok) throw new Error(booking.error || "Booking failed");

      closeModal();
      searchForm.dispatchEvent(new Event("submit"));
      renderBookingResult(booking, true);
      lookupResult.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      setFeedback(modalFeedback, error.message);
    }
  });

  document.getElementById("lookup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const res = await fetch("/api/bookings/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: document.getElementById("lookup-reference").value,
          contact: document.getElementById("lookup-contact").value,
        }),
      });
      const booking = await res.json();
      if (!res.ok) throw new Error(booking.error || "Booking not found");
      renderBookingResult(booking);
    } catch (error) {
      lookupResult.classList.remove("hidden");
      lookupResult.innerHTML = `<div class="notice">${escapeHtml(error.message)}</div>`;
    }
  });

  function renderBookingResult(booking, isNew = false) {
    lookupResult.classList.remove("hidden");
    lookupResult.innerHTML = `
      <article class="ticket-card">
        <div>
          <p class="eyebrow">${isNew ? "Reservation confirmed" : "Booking details"}</p>
          <h2>${escapeHtml(booking.reference)}</h2>
          <p class="muted">${escapeHtml(booking.tripDetails.route)} • ${escapeHtml(booking.tripDetails.date)} ${escapeHtml(booking.tripDetails.time)}</p>
        </div>
        <div class="ticket-grid">
          <div><span>Passenger</span><strong>${escapeHtml(booking.passengerName)}</strong></div>
          <div><span>Seats</span><strong>${escapeHtml(booking.seatNumbers.join(", "))}</strong></div>
          <div><span>Total</span><strong>${formatCurrency(booking.totalPrice)}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(booking.status)}</strong></div>
          <div><span>Payment</span><strong>${escapeHtml(booking.paymentStatus)}</strong></div>
        </div>
        ${booking.ticketQrData ? `<img class="ticket-qr" src="${booking.ticketQrData}" alt="Ticket QR code" />` : ""}
        <div class="ticket-actions">
          <button class="btn ghost" type="button" onclick="window.print()">Print</button>
          ${
            booking.status !== "CANCELLED"
              ? '<button class="btn danger" id="cancel-booking" type="button">Cancel Booking</button>'
              : ""
          }
        </div>
      </article>
    `;

    const cancelButton = document.getElementById("cancel-booking");
    if (cancelButton) {
      const bookingContact = booking.contactEmail || booking.contactPhone || "";
      cancelButton.addEventListener("click", () => cancelBooking(booking.reference, bookingContact));
    }
  }

  async function cancelBooking(reference, fallbackContact = "") {
    const contact =
      document.getElementById("lookup-contact").value ||
      fallbackContact ||
      document.getElementById("contact-email").value ||
      document.getElementById("contact-phone").value;
    if (!confirm("Cancel this booking and release the selected seats?")) return;

    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(reference)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");
      renderBookingResult(data);
    } catch (error) {
      lookupResult.classList.remove("hidden");
      showInline(lookupResult, error.message);
    }
  }

  function setFeedback(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("hidden", !message);
  }

  function showInline(container, message) {
    container.innerHTML = `<div class="notice">${escapeHtml(message)}</div>`;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);
  }

  function formatTime(date) {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
      return map[char];
    });
  }
});
