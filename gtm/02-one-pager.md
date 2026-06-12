# Whim — One-Pager (B2B)

> External-facing. Adapt into a Notion page / PDF / simple landing page. Written for the *buyer's* pain, not Whim's features. Keep it to one screen.

---

## The local events data problem

Your users want to know **what's happening near them right now.** Delivering that means pulling events from a dozen platforms — Ticketmaster, Dice, Resident Advisor, Eventbrite, Meetup, city open-data, venue calendars — each with a different format, half with no API, all geocoded differently, and the same show listed five times across sources.

Building that in-house is a treadmill: brittle scrapers, constant breakage, dedup headaches, geocoding bills. It's not your core product, but it eats your roadmap.

## What Whim is

**One normalized, geocoded, deduplicated API for local events.** We aggregate every major source plus the long-tail venues the big platforms miss, clean it, merge duplicate listings across platforms, and hand you a single clean feed.

You query by **location + radius + date + category** and get back structured events: title, time, venue, lat/lng, price, image, ticket link. That's it.

## What you get

- **Coverage:** NYC today — concerts, nightlife, community events, farmers markets, parades, museums, parks, food & drink. Thousands of live events, refreshed daily.
- **Normalized schema:** one shape for every source. No per-platform parsing on your side.
- **Geocoded + deduplicated:** every event has clean coordinates; the same show from multiple platforms is merged, with all ticket links combined.
- **Two ways to consume:**
  1. **REST API** — `GET /events?lat=&lng=&radius=&from=&to=&category=` with API-key auth.
  2. **Embeddable widget** *(in pilot)* — a drop-in "what's happening near you" component if you'd rather not build UI.

## Pricing (NYC, single-city)

| Tier | For | Price (test anchor) |
|---|---|---|
| **Starter** | Small apps, one surface | $99/mo |
| **Growth** | Production app, higher volume | $299/mo |
| **Pro** | High volume + priority freshness | $799/mo |

*City coverage, call volume, and refresh frequency scale by tier. Multi-city as we expand.*

## Why not just hit each platform's own API?

Because you'd hit ~10 of them, three have no API at all, you'd geocode and dedup yourself, and you'd still miss the hyperlocal long tail. Whim is the meta-layer — Kayak for local events. You integrate once.

## Where we are

NYC live today, in production. Looking for **3–5 design-partner customers** to shape the API and lock in early pricing. If "what's happening near me" matters to your product, let's talk.

**Contact:** demiansims@gmail.com
