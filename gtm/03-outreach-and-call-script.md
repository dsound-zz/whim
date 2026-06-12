# Whim — Outreach & Demand-Validation Call Script

> **The single most important rule:** these calls are to **learn whether anyone will pay**, not to close a sale. Do not pitch and then ask "would you buy this?" — people lie to be nice. Ask about what they *already do* and *already spend.* (This is *The Mom Test* — talk about their life, not your idea.)
>
> **What you must walk away from each call knowing:**
> 1. Do they have this pain *today*, and what does it cost them now (hours/money/who owns it)?
> 2. Have they tried to solve it? What happened?
> 3. The one thing they'd need before they'd pay.
> 4. A real reaction to a real price (anchor high).

---

## Part 1 — Cold outreach templates

### Email (Tier 1, e.g. proptech / concierge)
**Subject:** how do you handle "things to do nearby" for [Product]?

> Hi [Name] — I'm building Whim, a normalized local-events API for NYC (one feed across Ticketmaster, Dice, RA, Meetup, city data, venue calendars — geocoded and deduped).
>
> Not pitching you yet — I'm trying to learn. For [Product]'s "[neighborhood / things-to-do]" experience, how are you sourcing live event data today? Building it in-house, a vendor, or not really solving it yet?
>
> 15 minutes this week? Genuinely just want to understand how teams like yours handle this.
>
> — Demian

### LinkedIn DM (shorter)
> Hi [Name] — building a normalized NYC events API and trying to learn how product teams handle "what's happening nearby." How does [Product] source event data today? Would love 15 min — purely to understand, not to sell.

**Send ~15 to land 5–8 calls.** Personalize line 1 with the specific stale/manual thing you noticed in their product.

---

## Part 2 — The 15-minute call script

### Open (30 sec)
"Thanks for the time. I'm not going to pitch you — I'm trying to understand how teams handle local event data before I build more. Mind if I ask how *you* do it today?"

### Discovery — past & present behavior (the real signal, ~8 min)
Ask these. Shut up and listen. Follow the pain.
1. "Walk me through how 'things to do nearby' works in [Product] today — where does that data come from?"
2. "Who owns keeping it fresh? How much of their time does it eat?"
3. "Last time it broke or went stale — what happened? What did that cost you?"
4. "Have you ever tried to build or buy a fix? How'd that go?"  ← *if they've spent time/money here, that's your buyer.*
5. "If you could wave a wand, what would 'solved' look like?"

🚩 **Bad signal:** "Yeah it'd be nice to have" with no current effort/spend. That's politeness, not demand.
✅ **Good signal:** they describe a named person, recurring hours, a past failed attempt, or a line-item cost.

### Only now — show the thing (~3 min)
"Here's what I have." Show the feed/`/feed` or the one-pager. Then:
- "Does this map to the problem you just described?"
- "What's missing before this is usable for you?"  ← **write the answer down verbatim. This is your roadmap.**

### The price probe (~2 min — don't skip, don't soften)
"We're testing pricing at **$299/month** for the NYC feed. Reaction?"
- Watch the face. "That's fine" vs "oof, for what?" tells you everything.
- Then: "What would have to be true for that to be an easy yes?"
- Then the commitment test: "If I had [the one thing they named] ready in a few weeks, would you be a paid design partner at that price?" — and *ask for a follow-up date.* A real yes books a next step; a fake yes stays vague.

### Close
"This was incredibly helpful. Can I come back when I've built [their thing]? And — who else do you know who fights this same problem?" (referral → next 3 calls)

---

## Part 3 — Objection prep (rehearse these)

**"Why not just use Ticketmaster's / each platform's own API?"**
→ "You'd integrate ~10 of them, three have no API, and you'd still geocode + dedup + miss the hyperlocal long tail yourself. We're the single integration." (If they push and it's a dealbreaker for them — note it; it's data.)

**"Where does the data come from / is it licensed?"** ← *the most important objection to track honestly.*
→ Be straight. Note whether legal provenance is a *blocker* for them or a non-issue. **If serious buyers repeatedly flag this as a dealbreaker, that's not an objection to overcome — it's the audit's #1 risk confirmed, and it reorders the whole roadmap.** Record it every time it comes up.

**"We'll just build it ourselves."**
→ "Totally fair — how many engineer-weeks, and who maintains it when Eventbrite changes their page next month?" Listen for whether they actually have the appetite.

**"Come back when you cover [my city]."**
→ Note the city. Multi-city demand is a real signal worth logging.

---

## Part 4 — Log every call immediately
Fill in `04-validation-tracker.md` within 10 minutes of hanging up, while it's fresh. The pattern across 5–8 calls is the decision — not any single conversation.
