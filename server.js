require("dotenv").config();

const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const express = require("express");
const jwt = require("jsonwebtoken");
const path = require("path");
const QRCode = require("qrcode");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const COOKIE_NAME = "voyage_token";

app.use(express.json());
app.use((req, res, next) => {
  res.charset = "utf-8";
  next();
});

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

async function authOptional(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token =
    authHeader.startsWith("Bearer ") ? authHeader.slice(7) : parseCookies(req)[COOKIE_NAME];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = await prisma.user.findUnique({ where: { id: payload.id } });
  } catch (error) {
    req.user = null;
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Login required" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function requireAdminPage(req, res, next) {
  authOptional(req, res, () => {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.redirect("/login.html?admin=1");
    }
    next();
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function makeReference() {
  return `VOY-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

async function createTripsFromSchedules(route, searchDate) {
  const schedules = await prisma.schedule.findMany({
    where: { routeId: route.id, dayOfWeek: searchDate.day() },
    orderBy: { time: "asc" },
  });

  for (const schedule of schedules) {
    const [hour, minute] = schedule.time.split(":").map(Number);
    const departure = searchDate.hour(hour).minute(minute).second(0).millisecond(0);
    const capacity = schedule.busType === "DELUXE" ? 20 : 40;

    await prisma.trip.upsert({
      where: {
        routeId_departureTime_busType: {
          routeId: route.id,
          departureTime: departure.toDate(),
          busType: schedule.busType,
        },
      },
      update: {},
      create: {
        routeId: route.id,
        departureTime: departure.toDate(),
        arrivalTime: departure.add(4, "hour").toDate(),
        busType: schedule.busType,
        capacity,
        seatsAvailable: capacity,
        price: route.price + (schedule.busType === "DELUXE" ? 250 : 0),
        status: "SCHEDULED",
      },
    });
  }
}

function bookingInclude() {
  return {
    bookingSeats: { orderBy: { seatNumber: "asc" } },
    trip: {
      include: {
        route: {
          include: { origin: true, destination: true },
        },
      },
    },
  };
}

function formatBooking(booking) {
  return {
    id: booking.id,
    reference: booking.reference,
    passengerName: booking.passengerName,
    contactEmail: booking.contactEmail,
    contactPhone: booking.contactPhone,
    seats: booking.seats,
    seatNumbers: booking.bookingSeats.map((seat) => seat.seatNumber),
    totalPrice: booking.totalPrice,
    status: booking.status,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus,
    bookingTime: booking.bookingTime,
    ticketQrData: booking.ticketQrData,
    tripDetails: {
      route: `${booking.trip.route.origin.name} -> ${booking.trip.route.destination.name}`,
      origin: booking.trip.route.origin.name,
      destination: booking.trip.route.destination.name,
      date: dayjs(booking.trip.departureTime).format("YYYY-MM-DD"),
      time: dayjs(booking.trip.departureTime).format("hh:mm A"),
      busType: booking.trip.busType,
    },
  };
}

app.get("/admin.html", requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders: (res, filePath) => {
      if (/\.(html|css|js)$/i.test(filePath)) {
        const currentType = res.getHeader("Content-Type");
        if (currentType && !String(currentType).includes("charset")) {
          res.setHeader("Content-Type", `${currentType}; charset=utf-8`);
        }
      }
    },
  })
);

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase() || null;
    const phone = String(req.body.phone || "").trim() || null;
    const password = String(req.body.password || "");

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: "Username and password are too short" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, email, phone, password: passwordHash, role: "PASSENGER" },
    });
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ user: publicUser(user), token });
  } catch (error) {
    res.status(400).json({ error: "Username or email is already used" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: publicUser(user), token });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/api/auth/me", authOptional, (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

app.get("/api/trips", async (req, res) => {
  try {
    const origin = Number.parseInt(req.query.originId, 10);
    const destination = Number.parseInt(req.query.destinationId, 10);
    const searchDate = dayjs(req.query.date).startOf("day");

    if (!origin || !destination || !searchDate.isValid() || origin === destination) {
      return res.status(400).json({ error: "Choose a valid route and date" });
    }

    const route = await prisma.route.findFirst({
      where: { originId: origin, destinationId: destination },
    });

    if (!route) {
      return res.json([]);
    }

    const nextDay = searchDate.add(1, "day");
    let trips = await prisma.trip.findMany({
      where: {
        routeId: route.id,
        departureTime: { gte: searchDate.toDate(), lt: nextDay.toDate() },
      },
      orderBy: { departureTime: "asc" },
      include: { route: { include: { origin: true, destination: true } } },
    });

    if (trips.length === 0) {
      await createTripsFromSchedules(route, searchDate);
      trips = await prisma.trip.findMany({
        where: {
          routeId: route.id,
          departureTime: { gte: searchDate.toDate(), lt: nextDay.toDate() },
        },
        orderBy: { departureTime: "asc" },
        include: { route: { include: { origin: true, destination: true } } },
      });
    }

    res.json(trips);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/trips/:id/seats", async (req, res) => {
  const tripId = Number.parseInt(req.params.id, 10);
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) {
    return res.status(404).json({ error: "Trip not found" });
  }

  const takenSeats = await prisma.bookingSeat.findMany({
    where: { tripId },
    orderBy: { seatNumber: "asc" },
    select: { seatNumber: true },
  });

  res.json({
    capacity: trip.capacity,
    seatsAvailable: trip.seatsAvailable,
    takenSeats: takenSeats.map((seat) => seat.seatNumber),
  });
});

app.get("/api/terminals", async (req, res) => {
  try {
    const routeTerminals = await prisma.terminal.findMany({
      where: {
        OR: [{ routesFrom: { some: {} } }, { routesTo: { some: {} } }],
      },
      orderBy: { name: "asc" },
    });
    res.json(routeTerminals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch terminals" });
  }
});

app.get("/api/bookings", authOptional, requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();
    const from = req.query.from ? dayjs(req.query.from).startOf("day") : null;
    const to = req.query.to ? dayjs(req.query.to).add(1, "day").startOf("day") : null;

    const bookings = await prisma.booking.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { reference: { contains: search } },
                { passengerName: { contains: search } },
                { contactEmail: { contains: search } },
                { contactPhone: { contains: search } },
              ],
            }
          : {}),
        ...(from || to
          ? {
              bookingTime: {
                ...(from && from.isValid() ? { gte: from.toDate() } : {}),
                ...(to && to.isValid() ? { lt: to.toDate() } : {}),
              },
            }
          : {}),
      },
      orderBy: { bookingTime: "desc" },
      include: bookingInclude(),
    });

    res.json(bookings.map(formatBooking));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/stats", authOptional, requireAdmin, async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { status: { not: "CANCELLED" } },
    include: bookingInclude(),
  });
  const trips = await prisma.trip.count({ where: { status: "SCHEDULED" } });

  const byRoute = {};
  for (const booking of bookings) {
    const route = `${booking.trip.route.origin.name} -> ${booking.trip.route.destination.name}`;
    byRoute[route] ||= { route, bookings: 0, revenue: 0 };
    byRoute[route].bookings += 1;
    byRoute[route].revenue += booking.totalPrice;
  }

  res.json({
    totalBookings: bookings.length,
    activeTrips: trips,
    revenue: bookings.reduce((sum, booking) => sum + booking.totalPrice, 0),
    byRoute: Object.values(byRoute),
  });
});

app.post("/api/bookings", authOptional, requireAuth, async (req, res) => {
  try {
    const tripId = Number.parseInt(req.body.tripId, 10);
    const passengerName = String(req.body.passengerName || "").trim();
    const contactEmail = String(req.body.contactEmail || req.user.email || "").trim().toLowerCase();
    const contactPhone = String(req.body.contactPhone || req.user.phone || "").trim();
    const selectedSeats = Array.isArray(req.body.seatNumbers)
      ? req.body.seatNumbers.map((seat) => Number.parseInt(seat, 10))
      : [];
    const paymentMethod = String(req.body.paymentMethod || "PAY_ON_BOARD");

    if (!tripId || passengerName.length < 2 || selectedSeats.length === 0) {
      return res.status(400).json({ error: "Passenger and seat selection are required" });
    }
    if (!contactEmail && !contactPhone) {
      return res.status(400).json({ error: "Email or phone is required for lookup" });
    }

    const uniqueSeats = [...new Set(selectedSeats)].sort((a, b) => a - b);
    if (uniqueSeats.length !== selectedSeats.length || uniqueSeats.length > 10) {
      return res.status(400).json({ error: "Choose 1 to 10 unique seats" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip || trip.status !== "SCHEDULED") {
        throw new Error("Trip is not available");
      }
      if (uniqueSeats.some((seat) => seat < 1 || seat > trip.capacity)) {
        throw new Error("Seat selection is outside bus capacity");
      }
      if (trip.seatsAvailable < uniqueSeats.length) {
        throw new Error("Not enough seats");
      }

      const occupied = await tx.bookingSeat.findMany({
        where: { tripId, seatNumber: { in: uniqueSeats } },
        select: { seatNumber: true },
      });
      if (occupied.length > 0) {
        throw new Error(`Seat ${occupied.map((seat) => seat.seatNumber).join(", ")} is already taken`);
      }

      const reference = makeReference();
      const booking = await tx.booking.create({
        data: {
          reference,
          tripId,
          userId: req.user.id,
          passengerName,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
          seats: uniqueSeats.length,
          totalPrice: trip.price * uniqueSeats.length,
          paymentMethod,
          paymentStatus: paymentMethod === "PAY_ON_BOARD" ? "PENDING" : "PAID",
        },
      });

      await tx.bookingSeat.createMany({
        data: uniqueSeats.map((seatNumber) => ({
          tripId,
          bookingId: booking.id,
          seatNumber,
        })),
      });

      await tx.trip.update({
        where: { id: trip.id },
        data: { seatsAvailable: trip.seatsAvailable - uniqueSeats.length },
      });

      return booking;
    });

    const ticketUrl = `${req.protocol}://${req.get("host")}/ticket.html?ref=${result.reference}`;
    const ticketQrData = await QRCode.toDataURL(ticketUrl);
    const booking = await prisma.booking.update({
      where: { id: result.id },
      data: { ticketQrData },
      include: bookingInclude(),
    });

    res.json(formatBooking(booking));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/bookings/lookup", async (req, res) => {
  const reference = String(req.body.reference || "").trim().toUpperCase();
  const contact = String(req.body.contact || "").trim().toLowerCase();

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: bookingInclude(),
  });

  if (
    !booking ||
    !contact ||
    (![booking.contactEmail?.toLowerCase(), booking.contactPhone].includes(contact))
  ) {
    return res.status(404).json({ error: "Booking not found" });
  }

  res.json(formatBooking(booking));
});

app.post("/api/bookings/:reference/cancel", async (req, res) => {
  try {
    const reference = String(req.params.reference || "").trim().toUpperCase();
    const contact = String(req.body.contact || "").trim().toLowerCase();

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { reference },
        include: { bookingSeats: true },
      });
      if (
        !booking ||
        !contact ||
        (![booking.contactEmail?.toLowerCase(), booking.contactPhone].includes(contact))
      ) {
        throw new Error("Booking not found");
      }
      if (booking.status === "CANCELLED") {
        throw new Error("Booking is already cancelled");
      }

      await tx.bookingSeat.deleteMany({ where: { bookingId: booking.id } });
      await tx.trip.update({
        where: { id: booking.tripId },
        data: { seatsAvailable: { increment: booking.seats } },
      });

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          paymentStatus: booking.paymentStatus === "PAID" ? "REFUND_PENDING" : "VOID",
          cancelledAt: new Date(),
        },
        include: bookingInclude(),
      });
    });

    res.json(formatBooking(result));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log("Connected to MySQL via Prisma");
});
