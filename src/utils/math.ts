export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function angle(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Does a line segment from p1→p2 intersect a circle at center with given radius? */
export function lineSegmentIntersectsCircle(
  p1: Vec2, p2: Vec2, center: Vec2, radius: number,
): boolean {
  const d = sub(p2, p1);
  const f = sub(p1, center);
  const lenSq = dot(d, d);
  if (lenSq === 0) return length(f) <= radius; // degenerate segment

  // Project circle center onto line, find closest point parameter t
  const t = clamp(-dot(f, d) / lenSq, 0, 1);
  const closest = { x: p1.x + t * d.x, y: p1.y + t * d.y };
  return distance(closest, center) <= radius;
}

/** Is `to` within the field-of-view cone of an entity at `from` facing `facing`? */
export function isInFieldOfView(
  facing: Vec2, from: Vec2, to: Vec2, fovDegrees: number,
): boolean {
  const dir = sub(to, from);
  const len = length(dir);
  if (len === 0) return true; // on top of each other
  const normalized = { x: dir.x / len, y: dir.y / len };
  const halfFovCos = Math.cos((fovDegrees / 2) * Math.PI / 180);
  return dot(facing, normalized) >= halfFovCos;
}

/** Can `from` see `to` without any obstacle circle blocking the line? */
export function hasLineOfSight(
  from: Vec2, to: Vec2,
  obstacles: Array<{ position: Vec2; radius: number }>,
): boolean {
  return !obstacles.some(o => lineSegmentIntersectsCircle(from, to, o.position, o.radius));
}
