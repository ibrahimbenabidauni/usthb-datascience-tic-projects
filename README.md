TIC Projects Platform

A student project management platform to organize projects, groups, and reviews.

📌 Table of Contents

About

Features

Getting Started

Project Structure

Technologies

Contributing

🔹 About

TIC Projects Platform is a web application built for students to:

Register and login securely

Create and join project groups

Post and review projects

Manage projects in a collaborative environment

This README documents the Day 0 scaffolding, including the initial server setup, basic authentication skeleton, and placeholder UI.

🔹 Features (Day 0)

Express server running ✅

Basic authentication skeleton (login/register) ✅

Minimal frontend pages (static placeholders) ✅

CORS and JSON parsing enabled ✅

Replit deployment ready ✅

Future features (Day 1 → 14):

Final database schema

Full CRUD for projects and groups

Reviews system

Frontend integration

Admin features

Security & testing

🔹 Getting Started
Prerequisites

Node.js >= v18

npm (comes with Node)

Installation
# Clone the repo
git clone <your-repo-url>
cd tic-projects-platform

# Install dependencies
npm install

# Run the server
npm start

Usage

Open http://localhost:3000/ in your browser

Visit /auth/register and /auth/login endpoints (currently placeholders)

🔹 Project Structure
tic-projects-platform/
│
├─ index.js          # Main server entry
├─ package.json      # Project metadata & dependencies
├─ routes/
│  └─ auth.js        # Authentication skeleton
├─ public/           # Minimal frontend files
└─ README.md         # Project documentation

🔹 Technologies

Node.js

Express.js

CORS

bcrypt (for password hashing)

JSON Web Tokens (JWT) for auth

Vercel deployment

🔹 Contributing

Fork the repository

Create a new branch: git checkout -b feature/your-feature

Commit your changes: git commit -m "feat: your message"

Push to the branch: git push origin feature/your-feature

Open a Pull Request
