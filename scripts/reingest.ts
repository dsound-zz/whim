import "dotenv/config";
import { addEventbriteSourceAction } from "../src/app/admin/sources/actions";

async function main() {
  const urls = [
    "https://www.eventbrite.com/e/mahjong-night-at-kings-co-imperial-tickets-1989677042595",
    "https://www.eventbrite.com/e/plant-bingo-tickets-1989214506136",
    "https://www.eventbrite.com/e/nyc-wellness-workshop-from-gold-medal-to-inner-strength-tickets-1989103819068",
    "https://www.eventbrite.com/e/the-black-mans-health-festival-5-year-anniversary-tickets-1985989283408",
    "https://www.eventbrite.com/e/epic-fantasy-book-club-tickets-1986327040649",
    "https://www.eventbrite.com/e/scrap-n-yap-pride-eve-edition-tickets-1989270666112",
    "https://www.eventbrite.com/e/kintsugi-continuing-course-2-3-4-with-makomako-tickets-1988368221877",
    "https://www.eventbrite.com/e/dungeons-dragons-at-leroys-place-tickets-1985939035114",
    "https://www.eventbrite.com/e/cnc-embroidery-basics-tickets-1988935149573",
    "https://www.eventbrite.com/e/all-ages-weekend-stencil-class-tickets-1984075719888",
    "https://www.eventbrite.com/e/sage-crafting-fresh-herb-bundling-experience-indoor-air-quality-tickets-1968805262539",
    "https://www.eventbrite.com/e/mahjong-101-for-beginners-tickets-1986364037307",
    "https://www.eventbrite.com/e/general-literary-trivia-tickets-1989966182420",
    "https://www.eventbrite.com/e/wordsprouts-presents-lafayette-travels-through-time-tickets-1750725821059",
    "https://www.eventbrite.com/e/cupsnconvos-adult-gamenight-june-5th-21-event-tickets-1987373716284",
    "https://www.eventbrite.com/e/board-game-speed-dating-threes-brewing-gowanus-nyc-ages-25-39-tickets-1989106910314",
    "https://www.eventbrite.com/e/dungeons-drafthouse-house-of-wax-revenge-of-the-spider-queen-tickets-1985523627619"
  ];

  for (const url of urls) {
    console.log(`Processing ${url}...`);
    const res = await addEventbriteSourceAction({ url });
    console.log(res);
  }
}
main().catch(console.error);
