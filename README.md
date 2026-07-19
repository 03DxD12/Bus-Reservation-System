# Voyage Bus Reservation System

Voyage is a bus reservation system built with Node.js, Express, Prisma, MySQL, and a vanilla HTML/CSS/JavaScript frontend. Passengers can search routes, choose seats, create bookings, look up tickets, and cancel reservations. Admin users can view bookings, revenue, active trips, and route-level sales.

## Features

- Passenger signup and login
- Admin-protected dashboard
- Terminal, route, schedule, trip, booking, user, and seat tracking models
- Lazy trip generation from weekly schedules when passengers search a route/date
- Route search by origin, destination, and date
- Seat map selection with taken-seat protection
- Booking reference generation
- Booking lookup by reference plus email or phone
- Booking cancellation with seat restoration
- Mock payment status support
- QR ticket generation
- Admin booking filters and route revenue breakdown
- Responsive Voyage-themed interface

## Tech Stack

- Node.js
- Express
- Prisma ORM
- MySQL
- Vanilla HTML, CSS, and JavaScript
- bcryptjs for password hashing
- JSON Web Tokens for authentication
- qrcode for ticket QR generation

## Project Structure

```text
.
|-- prisma/
|   |-- schema.prisma
|   `-- seed_db.js
|-- public/
|   |-- admin.html
|   |-- app.js
|   |-- index.html
|   |-- login.html
|   |-- style.css
|   `-- ticket.html
|-- server.js
|-- package.json
`-- .env.example
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a MySQL database:

```sql
CREATE DATABASE bus_reservation;
```

3. Create `.env` from `.env.example` and update your database credentials:

```env
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/bus_reservation"
JWT_SECRET="change-this-before-deploying"
PORT=3000
```

4. Push the Prisma schema to MySQL:

```bash
npm run prisma:push
```

5. Seed sample terminals, routes, schedules, and admin user:

```bash
npm run seed
```

6. Start the server:

```bash
npm start
```

Open the app at:

```text
http://localhost:3000
```

## Seeded Admin Account

```text
Username: admin
Password: adminpassword
```

Change the seeded password before using this project outside local development.

## API Overview

- `POST /api/auth/register` - create passenger account
- `POST /api/auth/login` - login and set auth cookie
- `POST /api/auth/logout` - logout
- `GET /api/auth/me` - current authenticated user
- `GET /api/terminals` - terminals with available routes
- `GET /api/trips` - search trips by origin, destination, and date
- `GET /api/trips/:id/seats` - get taken seats for a trip
- `POST /api/bookings` - create a booking
- `POST /api/bookings/lookup` - find a booking by reference and contact
- `POST /api/bookings/:reference/cancel` - cancel a booking
- `GET /api/bookings` - admin booking list
- `GET /api/admin/stats` - admin dashboard stats

## Notes for Deployment

For Vercel or another hosting provider, configure these environment variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT` if required by the platform

The project uses MySQL, so use a hosted MySQL database for production. Do not commit `.env`.
