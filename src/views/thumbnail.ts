// Renders a design to a PNG data URL with the stage's look (start-screen
// template cards). Uses one shared offscreen renderer.
import * as THREE from 'three';
import type { Design } from '../model/types';
import { frameMatrix, panelGeometry } from './three-geom';
import { boardColors } from './palette';
import { foldDisplay } from './foldView';
import { bandGeometry } from './bandMesh';

let renderer: THREE.WebGLRenderer | null = null;

export function renderThumbnail(d: Design, w: number, h: number): string | null {
  try {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9dee6, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(250, 500, 350);
  scene.add(key);
  const disposables: { dispose(): void }[] = [];
  const box = new THREE.Box3();
  // as the stage shows it (milestone 106): folds at rest, bent walls drawn as their bands
  const shown = foldDisplay(d, 1);
  const IDM = new THREE.Matrix4();
  d.order.forEach((id, i) => {
    const p = d.panels[id];
    if (!p) return;
    const g = panelGeometry(d, p);
    const c = boardColors(d, id, i);
    const mats = [new THREE.MeshStandardMaterial({ color: c.face, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: c.edge, roughness: 0.9 })];
    const mesh = new THREE.Mesh(g, mats);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy((shown.xf.get(id) ?? IDM).clone().multiply(frameMatrix(p.frame)));
    const eg = new THREE.EdgesGeometry(g, 25);
    const lm = new THREE.LineBasicMaterial({ color: 0x3a3530, transparent: true, opacity: 0.5 });
    const lines = new THREE.LineSegments(eg, lm);
    lines.matrixAutoUpdate = false;
    lines.matrix.copy(mesh.matrix);
    scene.add(mesh, lines);
    mesh.updateMatrixWorld(true);
    box.expandByObject(mesh);
    disposables.push(g, eg, lm, ...mats);
  });
  for (const b of shown.bands) {
    const g = bandGeometry(b);
    const mat = new THREE.MeshStandardMaterial({ color: boardColors(d, b.band.parent, Math.max(0, d.order.indexOf(b.band.parent))).face, roughness: 0.9, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    mesh.matrixAutoUpdate = false;
    const m = shown.xf.get(b.band.parent) ?? IDM;
    mesh.matrix.copy(b.pre ? m.clone().multiply(b.pre) : m);
    scene.add(mesh);
    mesh.updateMatrixWorld(true);
    box.expandByObject(mesh);
    disposables.push(g, mat);
  }
  if (box.isEmpty()) return null;
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const cam = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
  const dir = new THREE.Vector3(0.75, 0.85, 1).normalize();
  cam.position.copy(center).addScaledVector(dir, (radius * 1.08) / Math.tan((15 * Math.PI) / 180));
  cam.lookAt(center);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  disposables.forEach((x) => x.dispose());
  return url;
}
