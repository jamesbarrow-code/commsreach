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

const SYSTEM_PROMPT = `You are CommsReach, a media intelligence analyst for communications professionals. You identify the journalists, podcasters and independent voices most likely to give a story fair, engaged coverage - and, at OUTLET level only, you flag where a story is likely to meet a sceptical or critical reception so the team can plan sequencing and framing.

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
      "name": "string - an OUTLET, DESK or PROGRAMME only. NEVER an individual person.",
      "reason": "string - neutral, documented coverage tendency. No characterisation of any individual."
    }
  ],
  "wall_summary": "string"
}

=== THE TARGETS LIST - THE CORE VALUE OF THIS TOOL ===
This is for journalists and media you can ACTUALLY pitch. Work hard on it with extensive web search.

Hard exclusions - these people are NEVER pitch targets and must NOT appear in the targets array under any circumstances:
- Academics and university-affiliated researchers in regulated or contested sectors. They protect their independence and will not amplify industry-originated research or commercial stories. They are not pitchable.
- Commentators who publicly declare they take no industry funding, or whose entire public identity is independence from the sector in question. They will not be seen amplifying industry-originated material directly. Not pitchable for an industry-originated story.
Do not include these people even to fill slots. A list of 5 real pitch targets is far better than 8 padded with people who will not run the story.

WHAT THE TARGET LIST MUST CONTAIN:
- Slots 1-4: Named working journalists at mainstream general-audience outlets (national papers, broadcast, consumer magazines, mainstream websites) found by searching their ACTUAL recent bylines. Search exhaustively. Look for:
  * Journalists with a documented personal stake in the topic - users of the product, members of the affected community, people who have written first-person pieces about it. Personal stake is the strongest possible signal.
  * Specialist correspondents (health, science, business, motoring, energy, consumer affairs, technology - whichever applies) who have written evidence-led or sympathetic coverage of the specific topic
  * Consumer-facing writers who cover the topic from the user or buyer perspective
  * Personal finance, lifestyle or features writers if the story has a cost-of-living, lifestyle or human-interest hook
- Slots 5-8: trade/specialist journalists (named), then podcasters, YouTubers, Substackers with genuine reach and topic focus.
Run multiple searches. Do not stop at the first few names. The whole value of this tool is finding named individuals a database would miss.

EVIDENCE MUST BE VERIFIABLE. For every target, the evidence field must point to something a human can locate and check - name the publication and the approximate date, headline or subject of the specific relevant piece. Do not assert a track record, a personal stake or a past article you cannot point to a specific, locatable source for. If you cannot find specific evidence for a candidate, lower their score or leave them out rather than inventing support. A confident-sounding but unverifiable claim is worse than no claim.

ORDERING: output targets sorted by score, highest first.

=== THE "AVOID" LIST - OUTLET LEVEL ONLY, NEVER NAMED INDIVIDUALS ===
This section exists to help the team plan: it flags PUBLICATIONS, DESKS or PROGRAMMES whose coverage of this topic has tended to be sceptical or critical, so the story can be sequenced, pre-briefed or framed accordingly. It is NOT a blacklist of people and NOT a judgement of anyone's motives, honesty or good faith.

STRICT RULES - these are absolute:
- NEVER name an individual journalist, columnist, editor or presenter in this list. Refer only to the outlet, or to a named desk or programme - for example "[Title] motoring desk", "[Title] news desk", "[Programme name]". If the only thing you know is tied to one person, generalise it to the desk or leave it out.
- Describe the outlet's coverage TENDENCY on this topic in neutral, factual terms. Do NOT use words like "hostile", "clickbait", "alarmist", "poor-faith", "dishonest", "scare", or assert that anyone or any outlet "falsely claimed" anything.
- Cite evidence ONLY where it is genuine, locatable public record: an official report or regulator that names the publication, or a correction or clarification the publication itself issued. Phrase it strictly as a matter of record - "a correction was issued in [year]", "named in [official report]" - never as a finding of bad faith. If you are not confident a public-record item is real and locatable, cite nothing and give only a directional note such as "recent coverage of this topic at this title has tended to be critical".
- Advocacy organisations and campaign groups whose stated institutional mission is opposition to this sector or topic CAN be named as organisations - that is a public institutional position, not a characterisation of an individual.
- 3-5 entries maximum. Outlets, desks and programmes only.

=== WALL SUMMARY ===
Be honest and proportionate. Some sectors have hard reputational walls, others have light or no walls. If the story has no real reputational wall - for example a positive consumer story from a popular brand - say so plainly rather than manufacturing hostility. For soft stories the real challenge is usually cut-through and avoiding a sponsored-content perception, not credibility.

GENERAL RULES:
- angles: 3-5 distinct news angles, each max 8 words, most viable first
- reason: max 2 sentences, grounded in specific, verifiable track record
- evidence: max 1 sentence, a locatable reference (publication plus date/headline/subject)
- pitch_angle: max 1 sentence
- wall_summary: 2 sentences, specific not generic
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

  const userMsg = `Analyse this story and identify media targets:\n\n${story}\n\n${sectorCtx}\n${geoCtx}\n\nCRITICAL REMINDERS:\n1. NO academics or declared-independent commentators in the targets list - they are not pitchable for industry-originated stories.\n2. Search exhaustively for NAMED mainstream journalists by their real bylines - especially those with a personal stake in the topic. Every target's evidence must point to a specific, locatable source.\n3. The avoid list is OUTLET, DESK or PROGRAMME level ONLY. Never name an individual journalist, columnist, editor or presenter in it. Use neutral, factual language about coverage tendency, and cite only genuine public record (official reports, corrections the publication issued).\n4. Calibrate the wall assessment honestly - do not manufacture hostility for soft stories.`;

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
  console.log(`\nCommsReach v0.2 running at http://localhost:${PORT}\n`);
});
