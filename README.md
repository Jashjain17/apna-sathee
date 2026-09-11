# Apna Sathee — Full-Stack Monorepo

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Monorepo-blue.svg)](#repository-architecture)

> **Apna Sathee** is a full-stack web application built to connect users seamlessly. This repository is structured as a unified monorepo containing both the frontend client and backend REST API services with complete commit histories.

---

##  Repository Architecture

```text
apna-sathee/
├── 🌐 frontend/       # Client-side web application
│   ├── public/        # Static assets
│   ├── src/           # Components, pages, and state management
│   └── package.json   # Frontend dependencies & scripts
│
├── ⚙️ backend/        # Server-side REST API & database service
│   ├── controllers/   # Route handler logic
│   ├── models/        # Database schemas
│   ├── routes/        # API Endpoints
│   └── package.json   # Backend dependencies & scripts
│
└── 📄 README.md       # Root monorepo documentation
```

---

##  Key Features

- **Full-Stack Integration:** Modular frontend connected to a RESTful backend.
- **Unified Monorepo:** Clean directory structure isolating client and server dependencies.
- **Secure Authentication:** User signup, login, and token-based session handling.
- **Scalable Architecture:** Designed for modular feature growth and independent deployment.

---

##  Tech Stack

| Domain | Technologies Used |
| :--- | :--- |
| **Frontend** | JavaScript (ES6+), HTML5, CSS3, React / Web APIs |
| **Backend** | Node.js, Express.js, REST API Architecture |
| **Database** | MongoDB / SQL |
| **Tools & Version Control** | Git, Monorepo Architecture (Git Subtree), npm |

---

##  Quick Start & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)

### 1. Clone the Repository
```bash
git clone https://github.com/jash-cyber/apna-sathee.git
cd apna-sathee
```

### 2. Setup & Run Frontend
```bash
cd frontend
npm install
npm run dev # or npm start
```

### 3. Setup & Run Backend
```bash
cd ../backend
npm install
npm start
```

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
