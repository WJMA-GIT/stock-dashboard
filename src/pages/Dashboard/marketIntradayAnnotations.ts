export interface IntradayPoint {
  time: string;
  price: number | null;
}

export interface IndustryIntradayCandidate {
  code: string;
  name: string;
  points: IntradayPoint[];
}

export interface MarketIntradayAnnotation {
  time: string;
  price: number;
  code: string;
  name: string;
  type: 'rise' | 'fall';
  indexChangePercent: number;
  industryChangePercent: number;
}

const WINDOW_SIZE = 15;
const MIN_INDEX_CHANGE_PERCENT = 0.08;
const MAX_ANNOTATIONS = 8;

function percentChange(start: number, end: number) {
  return start > 0 ? ((end - start) / start) * 100 : 0;
}

export function buildMarketIntradayAnnotations(
  indexPoints: IntradayPoint[],
  candidates: IndustryIntradayCandidate[]
): MarketIntradayAnnotation[] {
  const validIndexPoints = indexPoints.filter(
    (point): point is IntradayPoint & { price: number } =>
      point.price !== null && Number.isFinite(point.price) && point.price > 0
  );
  const sessions = [
    validIndexPoints.filter((point) => point.time.slice(-5) < '12:00'),
    validIndexPoints.filter((point) => point.time.slice(-5) >= '12:00'),
  ];
  const annotations: MarketIntradayAnnotation[] = [];

  for (const session of sessions) {
    for (let offset = 0; offset + 1 < session.length; offset += WINDOW_SIZE) {
      const window = session.slice(offset, offset + WINDOW_SIZE);
      if (window.length < 2) break;

      const first = window[0];
      const last = window.at(-1)!;
      const indexChangePercent = percentChange(first.price, last.price);
      if (Math.abs(indexChangePercent) < MIN_INDEX_CHANGE_PERCENT) continue;

      const type = indexChangePercent > 0 ? 'rise' : 'fall';
      const windowTimes = new Set(window.map((point) => point.time.slice(-5)));
      const matches = candidates.flatMap((candidate) => {
        const points = candidate.points.filter(
          (point): point is IntradayPoint & { price: number } =>
            point.price !== null &&
            Number.isFinite(point.price) &&
            point.price > 0 &&
            windowTimes.has(point.time.slice(-5))
        );
        if (points.length < 2) return [];

        const industryChangePercent = percentChange(points[0].price, points.at(-1)!.price);
        if (type === 'rise' ? industryChangePercent <= 0 : industryChangePercent >= 0) return [];
        return [{ candidate, industryChangePercent }];
      });

      matches.sort((left, right) =>
        type === 'rise'
          ? right.industryChangePercent - left.industryChangePercent
          : left.industryChangePercent - right.industryChangePercent
      );
      const best = matches[0];
      if (!best) continue;

      const annotation: MarketIntradayAnnotation = {
        time: last.time,
        price: last.price,
        code: best.candidate.code,
        name: best.candidate.name,
        type,
        indexChangePercent,
        industryChangePercent: best.industryChangePercent,
      };
      const previous = annotations.at(-1);
      if (previous?.code === annotation.code) {
        if (Math.abs(annotation.indexChangePercent) > Math.abs(previous.indexChangePercent)) {
          annotations[annotations.length - 1] = annotation;
        }
      } else {
        annotations.push(annotation);
      }
    }
  }

  return annotations
    .sort((left, right) => Math.abs(right.indexChangePercent) - Math.abs(left.indexChangePercent))
    .slice(0, MAX_ANNOTATIONS)
    .sort((left, right) => left.time.localeCompare(right.time));
}
