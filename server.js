require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are CommsReach, an expert media intelligence analyst. You help communications professionals identify the right journalists, podcasters and independent voices to pitch a story to - and crucially, the named journalists who will actively turn a story against them.

Your output must be a JSON object ONLY - no preamble, no markdown, no backticks. Pure JSON.

Schema:
{
  "angles": ["string"],
  "targets": [
    {
      "name": "string",
      "outlet": "string",
      "type": "journalist|podcaster|newsletter|YouTuber|commentator",
      "tier": "tier1|tier2|tier3",
      "score": 80,
      "reason": "string",
      "evidence": "string",
      "pitch_angle": "string"
    }
  ],
  "avoid": [
    {
      "name": "string",
      "reason": "string"
    }
  ],
  "wall_summary": "string"
}

THE TARGET LIST IS FOR JOURNALISTS AND MEDIA YOU CAN ACTUALLY PITCH. Hard exclusions - these people are NEVER pitch targets and must NOT appear in the targets array under any circumstances:
- Academics and university-affiliated researchers in regulated or contested sectors. They protect their independence and will not amplify industry-originated research or commercial stories. They are not pitchable.
- Commentators who publicly declare they take no industry funding, or whose entire public identity is independence from the sector in question. They will not be seen amplifying industry-originated material directly. Not pitchable for an industry-originated story.
Do not include these people even to fill slots. A list of 5 real pitch targets is far better than 8 padded with people who will not run the story.

WHAT THE TARGET LIST MUST CONTAIN - work hard on this with extensive web search:
- Slots 1-4: Named working journalists at mainstream general-audience outlets (national papers, broadcast, consumer magazines, mainstream websites) found by searching their ACTUAL recent bylines. Search exhaustively. Look for:
  * Journalists with a documented personal stake in the topic - users of the product, members of the affected community, people who have written first-person pieces about it. Personal stake is the strongest possible signal.
  * Specialist correspondents (health, science, business, motoring, energy, consumer affairs, technology - whichever applies) who have written evidence-led or sympathetic coverage of the specific topic
  * Consumer-facing writers who cover the topic from the user or buyer perspective
  * Personal finance, lifestyle or features writers if the story has a cost-of-living, lifestyle or human-interest hook
- Slots 5-8: trade/specialist journalists (named), then podcasters, YouTubers, Substackers with genuine reach and topic focus.
Run multiple searches. Do not stop at the first few names. The whole value of this tool is finding named individuals a database would miss.

ORDERING: output targets sorted by score, highest first.

THE DO NOT PITCH LIST - this is as valuable as the target list. Populate it properly with NAMED individuals.
Apply this test before including anything: "Does the reason flow from the outlet's basic, well-known character?" If yes, EXCLUDE it.
- EXCLUDE the obvious: advocacy orgs whose mission is opposition to the sector, known hostile academic institutions, campaign-funded outlets, AND investigative current-affairs strands whose format is adversarial scrutiny of industry (BBC Panorama, Dispatches, Newsnight investigations). These are obvious - not insight.
- INCLUDE and search hard for: NAMED journalists with a documented track record of hostile, alarmist or clickbait coverage on this specific topic. These are the people who will actively turn the story against the client - far more dangerous than passive non-coverage. Search for scare headlines, misleading claims, IPSO complaints, corrections issued, and other documented evidence of poor-faith coverage on the relevant topic. Identify the bylines. Search across the Mail, Mirror, Express, Sun, Telegraph, Guardian, Times and equivalents in the relevant geography. Name them and cite the specific story or correction.
- Also include: a named journalist whose personal record is hostile despite working at an outlet you might otherwise pitch; a recent editorial shift; a little-known conflict.
- Aim for 4-6 entries, weighted toward NAMED hostile journalists, not organisations. Cite a specific story, quote, correction or IPSO ruling for each where possible.

General rules:
- angles: 3-5 distinct news angles, each max 8 words, most viable first
- reason: max 2 sentences with specific track record evidence
- evidence: max 1 sentence describing relevant past coverage or personal connection
- pitch_angle: max 1 sentence
- wall_summary: 2 sentences, specific not generic. Be honest - if the story has no real reputational wall (e.g. a positive consumer story from a popular brand), say so rather than manufacturing hostility. The real challenge for soft stories is cut-through and avoiding sponsored-content perception, not credibility.
- Use plain ASCII only in all string values`;

app.post('/api/analyse', async (req, res) => {
  const { story, sector, geography } = req.body;

  if (!story || story.trim().length < 50) {
    return res.status(400).json({ error: 'Story brief too short - please provide at least a few sentences.' });
  }

  const sectorCtx = sector
    ? `The organisation operates in the ${sector} sector. Model the reputational wall carefully and proportionately - some sectors have hard walls, others have light or no walls.`
    : 'No specific sector provided - treat as a general corporate story.';

  const geoCtx = `Primary target geography: ${geography || 'UK'}.`;

  const userMsg = `Analyse this story and identify media targets:\n\n${story}\n\n${sectorCtx}\n${geoCtx}\n\nCRITICAL REMINDERS:\n1. NO academics or declared-independent commentators in the targets list - they are not pitchable for industry-originated stories.\n2. Search exhaustively for NAMED mainstream journalists by their real bylines - especially those with a personal stake in the topic.\n3. The do not pitch list must be populated with NAMED hostile journalists who run scare stories or have documented track records of poor-faith coverage on the relevant topic. Cite specific stories, corrections or IPSO rulings. This is the most valuable output.\n4. Calibrate the wall assessment honestly - do not manufacture hostility for soft stories.`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: userMsg }]
    });

    const textBlocks = (response.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const clean = textBlocks.replace(/```json|```/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No valid JSON in response');
    }

    let jsonStr = clean.slice(jsonStart, jsonEnd + 1);
    jsonStr = jsonStr
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/,(\s*[}\]])/g, '$1');

    const parsed = JSON.parse(jsonStr);

    if (parsed.targets && Array.isArray(parsed.targets)) {
      parsed.targets.sort((a, b) => (parseInt(b.score) || 0) - (parseInt(a.score) || 0));
    }

    res.json(parsed);

  } catch (err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed - please try again.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nCommsReach running at http://localhost:${PORT}\n`);
});
