export function calculateDistanceMiles(
  userLat: number,
  userLng: number,
  eventLat: number,
  eventLng: number
): number {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(eventLat - userLat);
  const dLng = toRadians(eventLng - userLng);
  
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(userLat)) *
      Math.cos(toRadians(eventLat)) *
      Math.sin(dLng / 2) ** 2;
      
  return earthRadiusMiles * 2 * Math.asin(Math.sqrt(a));
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
