# CommsReach

AI-powered journalist intelligence for communications professionals.

Finds the right journalists, podcasters, newsletters and independent voices for any story — with evidence-based reasoning and likelihood scores, not just beat categories.

## Setup

### 1. Clone or copy this folder

Place it somewhere on your machine, e.g.:
```
C:\Users\UserPC\Documents\commsreach
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

### 4. Run

```bash
node server.js
```

Open your browser at **http://localhost:3001**

## How it works

1. Paste a press release or story brief into the left panel
2. Optionally select sector context and target geography
3. Hit "Run intelligence"
4. CommsReach calls the Claude API with web search enabled, extracts news angles, researches the journalist landscape, and returns:
   - Ranked journalist/creator targets with reasoning and likelihood scores
   - A pitch angle for each target
   - A "do not pitch" list with specific explanations
   - A wall assessment for the story and sector

## Notes

- Runs on port 3001 by default (avoids conflict with CommsPulse on 3000)
- Requires an Anthropic API key with web search access
- Each analysis uses Claude claude-opus-4-5 with web search — costs approximately $0.05–0.15 per run
- Results take 15–45 seconds depending on search depth

## Built by

James Barrow — senior communications professional and AI builder.
