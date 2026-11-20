// The Shapes card's tiles, drawn by the real renderer from the real kernel
// shapes (WAFFLE_MODE.md §5.2), once per shape kind.
import * as THREE from 'three';
import { buildShape } from '../build';
import { kernelNow } from '../kernel';
import { addShape, createWaffleDesign, primitiveShape, type Primitive } from '../ops';
import { toGeometry } from './geom';

let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, string | null>();

export function shapeTile(kind: Primitive, color: string): string | null {
  const key = `${kind}:${color}`;
  if (cache.has(key)) return cache.get(key)!;
  const k = kernelNow();
  if (!k) return null;
  let url: string | null = null;
  try {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(96, 72, false);
    renderer.setClearColor(0x000000, 0);
    const d = createWaffleDesign();
    const id = addShape(d, primitiveShape(kind, { x: 0, z: 0, w: 40, d: 40 }, kind === 'torus' ? 10 : kind === 'halfsphere' ? 20 : 40));
    const geo = toGeometry(buildShape(k, d.sculpt!, id));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9dee6, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(200, 400, 300);
    scene.add(light);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    scene.add(new THREE.Mesh(geo, mat));
    const cam = new THREE.PerspectiveCamera(30, 96 / 72, 1, 2000);
    cam.position.set(70, 75, 110);
    cam.lookAt(0, 14, 0);
    renderer.render(scene, cam);
    url = renderer.domElement.toDataURL('image/png');
    geo.dispose();
    mat.dispose();
  } catch {
    url = null;
  }
  cache.set(key, url);
  return url;
}
