-- Enable PostGIS for advanced location queries if needed, or use Haversine function
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) CHECK (role IN ('admin', 'customer', 'provider')) DEFAULT 'customer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Providers Table
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    service_type VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status VARCHAR(50) CHECK (status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookings Table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES users(id),
    provider_id UUID REFERENCES providers(id),
    service_details TEXT,
    status VARCHAR(50) CHECK (status IN ('pending', 'accepted', 'completed', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments Table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id),
    amount DECIMAL(10, 2) NOT NULL,
    commission_amount DECIMAL(10, 2) NOT NULL,
    provider_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
    qr_code_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Haversine Function for Distance Calculation (in kilometers)
CREATE OR REPLACE FUNCTION get_nearby_providers(
    user_lat DOUBLE PRECISION,
    user_lon DOUBLE PRECISION,
    radius_km DOUBLE PRECISION
)
RETURNS TABLE (
    provider_id UUID,
    user_id UUID,
    name VARCHAR,
    phone VARCHAR,
    service_type VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.user_id,
        u.name,
        u.phone,
        p.service_type,
        p.latitude,
        p.longitude,
        (6371 * acos(cos(radians(user_lat)) * cos(radians(p.latitude)) *
        cos(radians(p.longitude) - radians(user_lon)) +
        sin(radians(user_lat)) * sin(radians(p.latitude)))) AS distance
    FROM providers p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'Approved'
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND (6371 * acos(cos(radians(user_lat)) * cos(radians(p.latitude)) *
        cos(radians(p.longitude) - radians(user_lon)) +
        sin(radians(user_lat)) * sin(radians(p.latitude)))) <= radius_km
    ORDER BY distance ASC;
END;
$$ LANGUAGE plpgsql;
