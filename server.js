const { Pool } = require("pg");
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- CORS ---------- */
// In production, restrict this to your real frontend domain(s).
// Example: ALLOWED_ORIGINS=https://groundsofttech.com,https://www.groundsofttech.com
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["*"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (
        allowedOrigins.includes("*") ||
        !origin ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);

app.use(express.json());

/* ---------- Database ---------- */
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  // Many hosted Postgres providers (Render, Railway, Neon, Supabase) require SSL.
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

/* ---------- Email ---------- */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ---------- Resume Upload Setup ---------- */
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

/* ---------- Health Check ---------- */
app.get("/", (req, res) => {
  res.send("Ground Soft Backend Running");
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (error) {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});

/* ---------- Contact Form ---------- */
app.post("/contact", async (req, res) => {
  try {
    const { name, phone, email, service, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required",
      });
    }

    await pool.query(
      `
      INSERT INTO contacts
      (name, phone, email, service, message)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [name, phone, email, service, message],
    );

    // Email is sent best-effort — if it fails, the lead is still saved in DB.
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "New Lead - Ground Soft Technology",
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Phone:</strong> ${phone || "-"}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Service:</strong> ${service || "-"}</p>
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        `,
      });
    } catch (emailError) {
      console.error(
        "Email send failed (lead still saved):",
        emailError.message,
      );
    }

    res.json({
      success: true,
      message: "Form submitted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
});

/* ---------- Resume Apply ---------- */
app.post("/apply", upload.single("resume"), async (req, res) => {
  try {
    const { fullname, email, phone, role } = req.body;

    if (!fullname || !email) {
      return res.status(400).json({
        success: false,
        message: "Full name and email are required",
      });
    }

    await pool.query(
      `
      INSERT INTO job_applications
      (fullname, email, phone, role, resume_file)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [fullname, email, phone, role, req.file ? req.file.filename : null],
    );

    res.json({
      success: true,
      message: "Application Submitted Successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Application Failed",
    });
  }
});

/* ---------- Admin Auth (Basic Auth) ---------- */
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Ground Soft Admin"');
    return res.status(401).send("Authentication required");
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "utf-8",
  );
  const [username, password] = credentials.split(":");

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASSWORD &&
    process.env.ADMIN_USER &&
    process.env.ADMIN_PASSWORD
  ) {
    return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Ground Soft Admin"');
  return res.status(401).send("Invalid credentials");
}

app.use("/admin", requireAdminAuth);

// Serve the admin dashboard page itself (protected by the middleware above)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// List all contact form leads, newest first
app.get("/admin/contacts", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM contacts ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load contacts" });
  }
});

// List all job applications, newest first
app.get("/admin/applications", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM job_applications ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load applications" });
  }
});

// Download a specific resume file by filename (as stored in the DB)
app.get("/admin/resume/:filename", (req, res) => {
  // path.basename strips any "../" tricks so this can only ever
  // point inside the uploads folder.
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Resume file not found");
  }

  res.download(filePath);
});

/* ---------- Start Server ---------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
