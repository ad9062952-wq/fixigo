# Fixora Backend System

This is the complete Node.js + Express + Supabase backend for the Fixora service marketplace.

## Folder Structure
```
fixora-backend/
├── database.sql       # PostgreSQL Schema & Functions for Supabase
├── server.js          # Express Server with all REST APIs
├── package.json       # Dependencies
├── .env.example       # Environment variables template
└── README.md          # Instructions
```

## Setup Instructions

### 1. Database Setup (Supabase)
1. Create a new project on [Supabase](https://supabase.com/).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of `database.sql` and run it to create all tables and the Haversine distance function.

### 2. Environment Variables
Create a `.env` file in this directory with the following variables:
```env
PORT=3001
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
JWT_SECRET=your_super_secret_jwt_key
```

### 3. Run the Server
Install dependencies and start the server:
```bash
cd fixora-backend
npm install
npm run dev
```

## API Routes Overview

### Auth
- `POST /register` - Register a new user (customer/provider/admin)
- `POST /login` - Login and get JWT token

### Provider
- `POST /provider/register` - Create provider profile (requires 'provider' role)
- `GET /providers/nearby?lat=...&lng=...&radius=10` - Get nearby providers (requires 'customer' role)
- `POST /provider/update-location` - Update live location (requires 'provider' role)

### Booking
- `POST /booking/create` - Create a booking (requires 'customer' role)
- `POST /booking/accept` - Accept a booking (requires 'provider' role)
- `POST /booking/complete` - Mark job as complete (requires 'provider' role)

### Payment
- `POST /payment/generate-qr` - Generate payment QR with 10% commission logic (requires 'provider' role)
- `POST /payment/confirm` - Confirm payment (requires 'customer' role)

### Admin
- `GET /admin/providers` - List all providers
- `POST /admin/approve-provider` - Approve a provider
- `POST /admin/reject-provider` - Reject a provider
