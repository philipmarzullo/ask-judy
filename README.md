# Ask Judy — Meal Planning Assistant for Leslie

A simple web chat app powered by Claude that helps with meal planning, grocery lists, recipes, and school lunches.

## Deploy to Render

### 1. Push to GitHub
Create a new repo and push this project:
```bash
git init
git add .
git commit -m "Ask Judy v1"
git remote add origin https://github.com/YOUR_USERNAME/ask-judy.git
git push -u origin main
```

### 2. Create a Web Service on Render
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Name**: `ask-judy`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click **Create Web Service**

### 3. Add Your API Key
1. In your Render service, go to **Environment**
2. Add a new environment variable:
   - **Key**: `ANTHROPIC_API_KEY`
   - **Value**: your Anthropic API key (starts with `sk-ant-`)
3. Click **Save Changes** — the service will redeploy

### 4. Share with Leslie
Your app will be live at: `https://ask-judy.onrender.com` (or whatever name you chose)

Leslie can bookmark this on her phone and use it anytime!

## Local Development
```bash
npm install
ANTHROPIC_API_KEY=sk-ant-your-key-here npm start
```
Then open http://localhost:3000

## Project Structure
```
ask-judy/
├── server.js          # Express server + Anthropic API proxy
├── public/
│   └── index.html     # The entire frontend (self-contained)
├── package.json
├── render.yaml        # Render deployment config
└── README.md
```

## Cost Notes
- Uses Claude Sonnet 4 — roughly $3/million input tokens, $15/million output tokens
- Typical meal planning conversation costs fractions of a cent
- Set a monthly spend limit in your Anthropic dashboard if you want guardrails
