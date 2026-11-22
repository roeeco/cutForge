// A design on the editor's stage, read only (the sentence's picture): the same boards, flaps, bends and bands, light,
// floor and grid as the 3D view, with an orthographic camera that starts isometric and always looks at the design's
// middle. The viewer can only turn it (drag); a double click turns it back. A new design (a changed word) is framed
// again from the angle it was turned to.
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Design } from '../model/types';
import { STAGE } from './palette';
import { foldDisplay } from './foldView';
import { applyLidPoses } from './lidPose';
import { openWrapOnStage, shownBox } from './pose';
import { allFoldOvers } from '../model/foldover';
import { FoldOverObject } from './foldOver3d';
import { BandObject } from './bandMesh';
import { BendBead, Flaps, PanelObject } from './View3D';

const IDM = new THREE.Matrix4();
const NOOP = () => {};
const NO_SHUT: Record<string, boolean> = {};
const ISO = new THREE.Vector3(1, 1, 1).normalize();

function Model({ d }: { d: Design }) {
  // as the stage shows a design at rest: folds closed, lids beside their box or opened back, a wrap's lid open
  const display = useMemo(() => {
    const r = foldDisplay(d, 1);
    applyLidPoses(d, r, { shut: NO_SHUT, selected: [], foldT: 1, assembling: false });
    openWrapOnStage(d, r, { shut: NO_SHUT, selected: [], foldT: 1 });
    return r;
  }, [d]);
  const foldOvers = useMemo(() => allFoldOvers(d), [d]);
  return (
    <>
      {d.order.map((id, index) => {
        const p = d.panels[id];
        if (!p) return null;
        return (
          <PanelObject
            key={id}
            d={d}
            p={p}
            index={index}
            m={display.xf.get(id) ?? IDM}
            selected={false}
            emphasis={0}
            hover={false}
            outlines
            showEdges={false}
            edges={false}
            selDetails={[]}
            selEdge={null}
            tool="view"
            folded={false}
            onPanelDown={NOOP}
            onDetailDown={() => NOOP}
            onDouble={NOOP}
            inert
          />
        );
      })}
      <Flaps d={d} xf={display.xf} foldT={1} shut={NO_SHUT} selected="" />
      {foldOvers.map((fo) => (
        <FoldOverObject key={fo.f.id} d={d} p={d.panels[fo.panelId]} g={fo.g} m={display.xf.get(fo.panelId) ?? IDM} foldT={1} index={d.order.indexOf(fo.panelId)} />
      ))}
      {display.bends.map((b) => (
        <BendBead key={b.id} b={b} d={d} index={d.order.indexOf(b.panelId)} outlines />
      ))}
      {display.bands.map((s) => (
        <BandObject key={s.band.id} s={s} d={d} m={s.pre ? (display.xf.get(s.band.parent) ?? IDM).clone().multiply(s.pre) : (display.xf.get(s.band.parent) ?? IDM)} index={d.order.indexOf(s.band.parent)} outlines />
      ))}
    </>
  );
}

type Controls = { target: THREE.Vector3; update(): void; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void } | null;

/** Frames the design: the camera on its middle, the whole of it in view from any angle it is turned to. */
function Rig({ box, home }: { box: THREE.Box3; home: number }) {
  const { camera, size, controls, invalidate } = useThree() as unknown as { camera: THREE.OrthographicCamera; size: { width: number; height: number }; controls: Controls; invalidate: () => void };
  const dir = useRef(ISO.clone());
  const frame = () => {
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    // the bounding sphere, so turning it never takes a corner out of the picture
    const radius = box.isEmpty() ? 100 : Math.max(20, box.getSize(new THREE.Vector3()).length() / 2);
    controls?.target.copy(center);
    camera.position.copy(center).addScaledVector(dir.current, 1000 + radius * 2);
    camera.zoom = Math.min(size.width, size.height) / (radius * 2.05);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls?.update();
    invalidate();
  };
  // keep the angle it was turned to
  useEffect(() => {
    if (!controls) return;
    const keep = () => dir.current.subVectors(camera.position, controls.target).normalize();
    controls.addEventListener('change', keep);
    return () => controls.removeEventListener('change', keep);
  }, [controls, camera]);
  useEffect(frame, [box, size.width, size.height, controls, camera]);
  // back to isometric
  useEffect(() => {
    if (!home) return;
    dir.current.copy(ISO);
    frame();
  }, [home]);
  return null;
}

/** The welcome screen draws the old picture where there is no WebGL. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Preview3D({ design, fallback }: { design: Design | null; fallback?: ReactNode }) {
  const box = useMemo(() => (design ? shownBox(design) : new THREE.Box3()), [design]);
  const [home, setHome] = useState(0);
  return (
    <Fallback fallback={fallback ?? null}>
      <Canvas
        className="preview3d"
        onDoubleClick={() => setHome((h) => h + 1)}
        orthographic
        frameloop="demand"
        camera={{ position: ISO.clone().multiplyScalar(1200).toArray(), zoom: 1, near: 1, far: 40000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        fallback={fallback}
        data-testid="preview3d"
      >
        <color attach="background" args={[STAGE.bg]} />
        <hemisphereLight args={['#ffffff', '#cfd6e0', 1.35]} />
        <directionalLight position={[300, 600, 400]} intensity={1.5} />
        <directionalLight position={[-400, 250, -300]} intensity={0.45} />
        <Grid
          position={[0, -0.08, 0]}
          args={[2, 2]}
          cellSize={10}
          cellThickness={0.6}
          cellColor={STAGE.gridMinor}
          sectionSize={50}
          sectionThickness={1}
          sectionColor={STAGE.gridMajor}
          fadeDistance={2600}
          fadeStrength={1.4}
          infiniteGrid
          raycast={() => null}
        />
        {design && <Model d={design} />}
        {/* turned like a turntable: from above down to level with the floor, never from under it */}
        <OrbitControls makeDefault enableDamping={false} enablePan={false} enableZoom={false} minPolarAngle={0.05} maxPolarAngle={Math.PI / 2 - 0.02} />
        <Rig box={box} home={home} />
      </Canvas>
    </Fallback>
  );
}
