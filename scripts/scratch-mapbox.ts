import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const tests = [
    "Terminal 5, New York",
    "Terminal 5, Manhattan",
    "Bowery Ballroom, New York",
    "Gramercy Theatre, New York",
    "David Geffen Hall, New York",
    "Beacon Theatre, New York",
    "Northwell at Jones Beach Theater, Wantagh",
    "Sultan Room, Brooklyn"
  ];
  
  for (const t of tests) {
    const q = encodeURIComponent(t);
    // added types=poi
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${mapboxToken}&limit=1&proximity=-74.0060,40.7128`;
    const urlPoi = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${mapboxToken}&limit=1&proximity=-74.0060,40.7128&types=poi`;

    const res = await fetch(url);
    const data = await res.json();
    const poiRes = await fetch(urlPoi);
    const poiData = await poiRes.json();

    const f = data.features?.[0];
    const fp = poiData.features?.[0];
    console.log(`"${t}":`);
    console.log(`  ALL: ${f ? f.place_name : 'NOT FOUND'} [${f?.center[1]}, ${f?.center[0]}]`);
    console.log(`  POI: ${fp ? fp.place_name : 'NOT FOUND'} [${fp?.center[1]}, ${fp?.center[0]}]`);
  }
}
run();
