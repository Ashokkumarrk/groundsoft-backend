-- Ground Soft Technology — Database Schema
-- Run this once against your Postgres database before starting the backend.
-- Local:    psql -U postgres -d Groundsoft -f schema.sql
-- Hosted:   psql "<your-connection-string>" -f schema.sql

CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(150) NOT NULL,
    service VARCHAR(100),
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applications (
    id SERIAL PRIMARY KEY,
    fullname VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(100),
    resume_file VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Helpful indexes for quick lookups later
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts (created_at);
CREATE INDEX IF NOT EXISTS idx_job_applications_created_at ON job_applications (created_at);