// Waffle shapes on the stage: world boxes, meshes for three.js, snapping.
import * as THREE from 'three';
import { meshArrays } from '../build';
import type { Manifold } from '../kernel';
import type { M4 } from '../xform';

export { worldBox, unionBox, type Box3 } from '../box';
import type { Box3 } from '../box';

/** three.js geometry of a kernel solid (the caller disposes it). */
export function toGeometry(m: Manifold): THREE.BufferGeometry {
  const a = meshArrays(m);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nrm, 3));
  g.setIndex(new THREE.BufferAttribute(a.idx, 1));
  g.computeBoundingSphere();
  return g;
}
export const toMatrix = (m: M4) => new THREE.Matrix4().fromArray(m);

/**
 * Snap a move of a box on the floor plane: its edges and centre to other boxes'
 * edges and centres (x and z apart), within `tol` mm. Returns the snapped move.
 */
export function snapMove(box: Box3, others: Box3[], du: number, dz: number, tol: number): { du: number; dz: number } {
  const best = (axis: 0 | 2, d: number) => {
    const mine = [box.min[axis] + d, box.max[axis] + d, (box.min[axis] + box.max[axis]) / 2 + d];
    let fix = 0, gap = tol;
    for (const o of others) for (const t of [o.min[axis], o.max[axis], (o.min[axis] + o.max[axis]) / 2]) for (const m of mine) if (Math.abs(t - m) < gap) (gap = Math.abs(t - m)), (fix = t - m);
    return d + fix;
  };
  return { du: best(0, du), dz: best(2, dz) };
}

/** Snap a lift: the box's bottom to the floor or to other boxes' tops (within tol). */
export function snapLift(box: Box3, others: Box3[], dy: number, tol: number): number {
  const bottom = box.min[1] + dy;
  let fix = 0, gap = tol;
  for (const t of [0, ...others.map((o) => o.max[1])]) if (Math.abs(t - bottom) < gap) (gap = Math.abs(t - bottom)), (fix = t - bottom);
  return dy + fix;
}

/** Colours of solid shapes, by their place among the top-level shapes. */
const COLORS = ['#e8a33d', '#4f9fd9', '#d9655b', '#5bb07a', '#a77bd1', '#e0c040', '#4fbdb5', '#d57ba8'];
export const shapeColor = (i: number) => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];

/** The see-through, striped look of a Hole (Tinkercad's grey). */
export function holeMaterial(dim = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { op: { value: dim ? 0.18 : 0.42 } },
    vertexShader: `varying vec3 vW; varying vec3 vN;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float op; varying vec3 vW; varying vec3 vN;
void main(){ float s = step(0.5, fract((vW.x + vW.y + vW.z) / 7.0)); float l = 0.6 + 0.4 * abs(dot(normalize(vN), normalize(vec3(0.3, 1.0, 0.5))));
vec3 c = mix(vec3(0.52, 0.55, 0.6), vec3(0.75, 0.77, 0.8), s) * l; gl_FragColor = vec4(c, op); }`,
  });
}
