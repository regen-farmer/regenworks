// ETRS89 lon/lat <-> ETRS89 / UTM zone 32N (EPSG:25832), the Danish grid.
//
// Transverse Mercator with Krüger's series to 6th order (as used by
// PROJ's "etmerc"): accurate to well under a millimetre inside the zone,
// which is what RTK stake-out needs. No dependencies so it runs in the
// browser, on the server and in tests alike.

const A = 6378137; // GRS80 semi-major axis
const F = 1 / 298.257222101; // GRS80 flattening
const K0 = 0.9996;
const FALSE_EASTING = 500000;
const LON0 = (9 * Math.PI) / 180; // zone 32 central meridian

const N = F / (2 - F);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;
const N5 = N4 * N;
const N6 = N5 * N;
const A_HAT = (A / (1 + N)) * (1 + N2 / 4 + N4 / 64 + N6 / 256);

const ALPHA = [
  (1 / 2) * N - (2 / 3) * N2 + (5 / 16) * N3 + (41 / 180) * N4 - (127 / 288) * N5 + (7891 / 37800) * N6,
  (13 / 48) * N2 - (3 / 5) * N3 + (557 / 1440) * N4 + (281 / 630) * N5 - (1983433 / 1935360) * N6,
  (61 / 240) * N3 - (103 / 140) * N4 + (15061 / 26880) * N5 + (167603 / 181440) * N6,
  (49561 / 161280) * N4 - (179 / 168) * N5 + (6601661 / 7257600) * N6,
  (34729 / 80640) * N5 - (3418889 / 1995840) * N6,
  (212378941 / 319334400) * N6,
];

const BETA = [
  (1 / 2) * N - (2 / 3) * N2 + (37 / 96) * N3 - (1 / 360) * N4 - (81 / 512) * N5 + (96199 / 604800) * N6,
  (1 / 48) * N2 + (1 / 15) * N3 - (437 / 1440) * N4 + (46 / 105) * N5 - (1118711 / 3870720) * N6,
  (17 / 480) * N3 - (37 / 840) * N4 - (209 / 4480) * N5 + (5569 / 90720) * N6,
  (4397 / 161280) * N4 - (11 / 504) * N5 - (830251 / 7257600) * N6,
  (4583 / 161280) * N5 - (108847 / 3991680) * N6,
  (20648693 / 638668800) * N6,
];

const E = Math.sqrt(F * (2 - F)); // first eccentricity

/** ETRS89 longitude/latitude (degrees) to UTM 32N easting/northing (metres). */
export function toUtm32(lon: number, lat: number): { e: number; n: number } {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180 - LON0;
  // conformal latitude
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - E * Math.atanh(E * Math.sin(phi)));
  const xiP = Math.atan2(t, Math.cos(lambda));
  const etaP = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));
  let xi = xiP;
  let eta = etaP;
  for (let j = 1; j <= 6; j++) {
    xi += ALPHA[j - 1] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
    eta += ALPHA[j - 1] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
  }
  return { e: FALSE_EASTING + K0 * A_HAT * eta, n: K0 * A_HAT * xi };
}

/** UTM 32N easting/northing (metres) back to ETRS89 longitude/latitude (degrees). */
export function fromUtm32(e: number, n: number): { lon: number; lat: number } {
  const xi = n / (K0 * A_HAT);
  const eta = (e - FALSE_EASTING) / (K0 * A_HAT);
  let xiP = xi;
  let etaP = eta;
  for (let j = 1; j <= 6; j++) {
    xiP -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaP -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const lambda = Math.atan2(Math.sinh(etaP), Math.cos(xiP));
  const tau0 = Math.sin(xiP) / Math.sqrt(Math.sinh(etaP) ** 2 + Math.cos(xiP) ** 2);
  // Newton iteration for tan(phi) from the conformal latitude
  let tau = tau0;
  for (let i = 0; i < 6; i++) {
    const sigma = Math.sinh(E * Math.atanh((E * tau) / Math.sqrt(1 + tau * tau)));
    const tauP = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
    const dTau =
      ((tau0 - tauP) / Math.sqrt(1 + tauP * tauP)) *
      ((1 + (1 - E * E) * tau * tau) / ((1 - E * E) * Math.sqrt(1 + tau * tau)));
    tau += dTau;
    if (Math.abs(dTau) < 1e-14) break;
  }
  return {
    lon: ((lambda + LON0) * 180) / Math.PI,
    lat: (Math.atan(tau) * 180) / Math.PI,
  };
}
