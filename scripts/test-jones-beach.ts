import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const queries = [
    "Northwell at Jones Beach Theater",
    "Northwell at Jones Beach Theater, Wantagh, NY",
    "Jones Beach Theater",
    "Jones Beach Theater, Wantagh, NY"
  ];
  
  for (const q of queries) {
    const encoded = encodeURIComponent(q);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&limit=1&proximity=-74.0060,40.7128`;
    
    const res = await fetch(url);
    const data = await res.json();
    const f = data.features?.[0];
    if (f) {
      console.log(`"${q}" => ${f.place_name} [${f.center[1]}, ${f.center[0]}] (Type: ${f.place_type})`);
    } else {
      console.log(`"${q}" => NOT FOUND`);
    }
  }
}
run();
