const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function upsertRoute(originId, destinationId, price) {
  return prisma.route.upsert({
    where: { originId_destinationId: { originId, destinationId } },
    update: { price },
    create: { originId, destinationId, price },
  });
}

async function upsertSchedule(routeId, dayOfWeek, time, busType) {
  return prisma.schedule.upsert({
    where: {
      routeId_dayOfWeek_time_busType: { routeId, dayOfWeek, time, busType },
    },
    update: {},
    create: { routeId, dayOfWeek, time, busType },
  });
}

async function main() {
  console.log("Seeding database...");

  const manila = await prisma.terminal.upsert({
    where: { name: "Manila" },
    update: { city: "Metro Manila" },
    create: { name: "Manila", city: "Metro Manila" },
  });

  const baguio = await prisma.terminal.upsert({
    where: { name: "Baguio" },
    update: { city: "Benguet" },
    create: { name: "Baguio", city: "Benguet" },
  });

  const cebu = await prisma.terminal.upsert({
    where: { name: "Cebu" },
    update: { city: "Cebu" },
    create: { name: "Cebu", city: "Cebu" },
  });

  const routes = [
    await upsertRoute(manila.id, baguio.id, 750),
    await upsertRoute(baguio.id, manila.id, 750),
    await upsertRoute(manila.id, cebu.id, 1450),
    await upsertRoute(cebu.id, manila.id, 1450),
    await upsertRoute(baguio.id, cebu.id, 1650),
    await upsertRoute(cebu.id, baguio.id, 1650),
  ];

  const departures = [
    { time: "08:00", busType: "DELUXE" },
    { time: "13:00", busType: "REGULAR" },
    { time: "21:00", busType: "DELUXE" },
  ];

  for (const route of routes) {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      for (const departure of departures) {
        await upsertSchedule(route.id, dayOfWeek, departure.time, departure.busType);
      }
    }
  }

  const password = await bcrypt.hash("adminpassword", 12);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: { password, role: "ADMIN", email: "admin@voyage.local" },
    create: {
      username: "admin",
      email: "admin@voyage.local",
      password,
      role: "ADMIN",
    },
  });

  console.log("Database seeded!");
  console.log("Admin login: admin / adminpassword");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
