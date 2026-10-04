# 🎓 Apna Sathee — AI-Powered JEE & JoSAA Counselling Copilot

[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688.svg)](https://fastapi.tiangolo.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%26%20Firestore-FFCA28.svg)](https://firebase.google.com/)

> **Apna Sathee** is an AI-powered web application built to assist Indian engineering aspirants during JEE & JoSAA/CSAB counselling. It features an in-memory rank predictor over historical cutoff datasets, a context-aware AI chat copilot trained on official JoSAA rulebooks, and live web-scraped college placement comparisons.

---

## 📁 Repository Architecture

```text
apna-sathee/
├── 🌐 frontend/                      # Client-Side SPA (Deployed on Vercel)
│   ├── public/                       # Historical Cutoff Datasets (JSON)
│   │   ├── main_cutoffs.json         # JEE Main cutoffs across NITs/IIITs/GFTIs
│   │   ├── iit_cutoffs.json          # JEE Advanced cutoffs across IITs
│   │   ├── josaa_real_cutoffs.json   # Multi-year historical cutoff database
│   │   └── institutes_master.json    # Institute metadata & state mappings
│   ├── index.html                    # Dashboard, Rank Predictor & AI Chat UI
│   ├── script.js                     # In-memory recommendation engine & Firebase logic
│   ├── styles.css                    # Responsive glassmorphism styling
│   └── vercel.json                   # Vercel deployment & routing config
│
├── ⚙️ backend/                       # Python AI REST API (Deployed on Render)
│   ├── server.py                     # FastAPI server, rule matching & LLM routes
│   ├── josaa_official_rules.json      # Rulebook database for AI context search
│   ├── counselling_process.json      # Structured counselling process rules
│   └── requirements.txt              # Python server dependencies
│
└── 📄 README.md                      # Project documentation
```

---

## ✨ Key Technical Features

- **⚡ Client-Side Rank Predictor:** Loads historical JSON cutoff datasets (~30MB) into browser memory, enabling sub-10ms filter responses (by Rank, Category, Quota, Gender, State) without server overhead.
- **🤖 Context-Aware AI Copilot (`/api/chat`):** Built a FastAPI backend endpoint that scans official JoSAA text chunks for keyword matches to student questions, appending relevant rule snippets into the **DeepSeek API** prompt to generate accurate answers.
- **📊 Live Web Comparison Matrix (`/api/compare-verdict`):** Leverages **Tavily Search API** to fetch real-time placement stats (average CTC, highest package) and fee structures for side-by-side college decision verdicts.
- **🔐 Auth & Tiered Monetization:** Integrated **Firebase Auth** for Google Sign-In, **Cloud Firestore** for user profile & message tracking, and **Razorpay API** for Pro tier upgrades with custom coupon codes.

---

## 🛠️ Tech Stack

| Domain | Technologies Used |
| :--- | :--- |
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 (Glassmorphism design), Web Storage APIs |
| **Backend** | Python 3.10+, FastAPI, Uvicorn, AsyncOpenAI (DeepSeek API), Tavily API |
| **Database & Auth** | Firebase Authentication, Cloud Firestore |
| **Payments** | Razorpay Payment Gateway API |
| **Hosting & Infra** | Vercel (Frontend SPA), Render (Python FastAPI Server) |

---

## 🚀 Quick Start & Local Setup

### 1. Backend Setup (Python FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set Environment Variables in .env
# DEEPSEEK_API_KEY=your_deepseek_key
# TAVILY_API_KEY=your_tavily_key

uvicorn server:app --reload --port 8000
```

### 2. Frontend Setup
Open `frontend/index.html` directly in your browser, or serve it using any static server:
```bash
cd frontend
npx serve .
```
