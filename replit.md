# TIC Projects Platform

## Overview
A complete student project management platform built with Node.js, Express, and SQLite. Students can register, login, submit projects with section/group info, rate projects with stars, edit profiles with avatars, and search for other users.

## Project Structure
```
├── index.js              # Main Express server
├── package.json          # Dependencies and scripts
├── db/
│   └── database.js       # SQLite database setup with migrations
├── routes/
│   ├── auth.js          # Authentication routes (register/login)
│   ├── projects.js      # Project CRUD + reviews routes
│   └── users.js         # User profile and search routes
├── middleware/
│   └── auth.js          # JWT authentication middleware
├── public/
│   ├── css/
│   │   └── styles.css   # Shared modern CSS with animations
│   ├── uploads/         # Uploaded project files
│   │   └── avatars/     # User profile pictures
│   ├── index.html       # Homepage with hero and features
│   ├── login.html       # Login page
│   ├── register.html    # Registration page
│   ├── projects.html    # Projects listing with filters and reviews
│   └── profile.html     # User profile with edit functionality
└── replit.md            # This file
```

## Tech Stack
- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Authentication**: bcrypt (password hashing) + JWT (tokens)
- **File Uploads**: Multer
- **Frontend**: Vanilla HTML/CSS/JavaScript with modern animations

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user (username, email, password)
- `POST /auth/login` - Login user (email/username + password)
- `GET /auth/me` - Get current user info (requires token)

### Projects
- `GET /projects` - List all projects (supports ?section=A&group=1 filtering)
- `GET /projects/:id` - Get single project with ratings
- `POST /projects` - Create project with section, group, full_name, matricule (requires auth)
- `PUT /projects/:id` - Update project (owner only)
- `DELETE /projects/:id` - Delete project (owner only)
- `POST /projects/:id/reviews` - Add/update star rating (1-5) for project
- `GET /projects/:id/reviews` - Get all reviews for a project
- `GET /projects/:id/my-review` - Get current user's review for a project

### Users
- `GET /users/search?q=query` - Search users by username or full name
- `GET /users/me` - Get current user's profile (requires auth)
- `PUT /users/me` - Update profile (username, full_name, bio, profile_picture)
- `GET /users/:id` - Get user profile and their projects

## Database Schema
- **users**: id, username, email, password (hashed), full_name, profile_picture, bio, created_at
- **projects**: id, title, description, author_id, section, group_number, full_name, matricule, created_at
- **reviews**: id, project_id, reviewer_id, rating (1-5), comment, created_at (unique per user/project)
- **project_files**: id, project_id, file_path, uploaded_at

## Features
- **Project Creation**: Submit projects with Section (A/B/C), Group (1-4), Full Name, Matricule
- **Star Reviews**: Rate projects 1-5 stars, one review per user per project
- **User Profiles**: Edit username, profile picture, bio
- **User Search**: Find users by username or name
- **Filtering**: Filter projects by section and group
- **Modern Design**: Responsive UI with animations, badges, and gradients
- **File Uploads**: Attach files to projects

## Environment Variables
- `JWT_SECRET` - Secret key for JWT tokens (set in Secrets)
- `PORT` - Server port (defaults to 5000)

## Running the App
```bash
npm start
```
Server runs on port 5000.

## Recent Changes
- Dec 18, 2025: Major feature update
  - Added section, group, full_name, matricule to project form
  - Implemented star rating system (1-5 stars) per project
  - Added user profile editing with profile picture upload
  - Implemented user search functionality
  - Added project filtering by section and group
  - Complete UI redesign with modern animations and responsive layout
  - New shared CSS file with design system
  - Created profile page with edit modal
