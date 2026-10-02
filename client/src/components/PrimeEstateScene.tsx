import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import * as THREE from "three";

/**
 * Faithful 3D recreation of the "Prime Estate, Kasmandi" master plan —
 * the same sector structure as the official brochure layout:
 *
 *   NORTH (top of the plan, -Z)
 *   ┌ Sector B plot strips + premium villa column   ┐  ┌ farmhouse arc  ┐
 *   │ central park + water bodies │ 7 apartment blocks │ with backyard park
 *   ├──────────── main cross road (-Z 44) ─────────────┤
 *   │ Sector A plot blocks, parks, commercial hub   │ clubhouse + lawn/pool
 *   │                                               │ cricket ground/courts
 *   └──────── Dubagga–Nabihpanah road (south) ──────┘
 *
 * A cinematic tour flies through every zone one by one with captions,
 * then hands over to free orbit / zoom / pan.
 */

export interface PlotHoverInfo {
  label: string;
  category: string;
  size: string;
}

export interface PrimeSceneProps {
  playTour: boolean;
  tourNonce: number;
  onCaption: (caption: string | null) => void;
  onTourEnd: () => void;
  onHoverPlot: (info: PlotHoverInfo | null) => void;
}

/* ── Legend palette (matches the brochure) ────────────────────────────────── */

const C = {
  yellow: "#f1e992",   // 20'x50', 25'x40' plots / regal farmhouse
  orange: "#f0a04b",   // premium villas
  blue: "#8ab4e8",     // 40'x60'
  blueLight: "#b3d0f2",// 40'x50'
  tan: "#c9a86a",      // 50'x60'
  grey: "#c9ccd2",     // 32'x60', 30'x40'
  purple: "#b9a8cf",   // 40'x40'
  pinkPur: "#d9bede",  // 35'x40'
  olive: "#aab060",    // 20'x40'
  varGreen: "#b8cc8a", // variables
  commercial: "#f2a0b0",
  park: "#5f9e4d",
  parkDark: "#4c8340",
  water: "#67b7e8",
  road: "#a7abb2",
  roadDark: "#3a3f46",
  base: "#d8d3c8",
  white: "#f2f4f6",
};

interface PlotSpec {
  x: number; z: number; w: number; d: number;
  rot?: number;
  color: string;
  label: string;
  category: string;
  size: string;
}

/* ── Baked plot-top textures (color + label), cached ──────────────────────── */

const texCache = new Map<string, THREE.CanvasTexture>();

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function plotTex(label: string, color: string): THREE.CanvasTexture {
  const key = `pe-${label}-${color}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  // kerb frame
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 122, 122);
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, 110, 110);
  // label
  ctx.fillStyle = "#2b2b2b";
  ctx.font = "bold 30px 'Inter Tight', Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let text = label;
  while (ctx.measureText(text).width > 106 && text.length > 3) text = text.slice(0, -2) + "…";
  ctx.fillText(text, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function signTex(): THREE.CanvasTexture {
  const key = "pe-sign";
  const hit = texCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#10233f";
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = "#d4af5f";
  ctx.fillRect(0, 0, 512, 6);
  ctx.fillRect(0, 90, 512, 6);
  ctx.fillStyle = "#f5f8ff";
  ctx.font = "bold 44px 'Inter Tight', Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PRIME ESTATE", 256, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

/* ── Layout generation (mirrors the brochure's plotting structure) ────────── */

function stackCol(
  out: PlotSpec[],
  prefix: string,
  start: number,
  x: number,
  z0: number,
  rows: number,
  w: number,
  d: number,
  gap: number,
  color: string,
  category: string,
  size: string,
  skip: number[] = [],
) {
  let n = start;
  for (let i = 0; i < rows; i++) {
    if (skip.includes(i)) continue;
    out.push({
      x, z: z0 + i * (d + gap), w, d,
      color, label: `${prefix}-${String(n).padStart(2, "0")}`,
      category, size,
    });
    n++;
  }
  return n;
}

function buildPlots(): PlotSpec[] {
  const P: PlotSpec[] = [];

  // ── Sector B: far-left edge column ──
  stackCol(P, "B", 1, -136, -148, 12, 8, 7.2, 1, C.varGreen, "Variable plot", "Variable");

  // ── Sector B strips (three double columns) + Park 01 gap in strip one ──
  const bCols: Array<[number, string, number[]]> = [
    [-122, C.yellow, [4, 5, 6]], [-112, C.yellow, [4, 5, 6]],
    [-92, C.yellow, []], [-82, C.tan, []],
    [-62, C.yellow, []], [-52, C.grey, []],
  ];
  let bn = 13;
  for (const [x, color, skip] of bCols) {
    bn = stackCol(P, "B", bn, x, -150, 12, 9, 7.4, 1.1, color, "Residential plot", "1000–3000 sqft", skip);
  }

  // ── Premium villa column (V) beside sector B ──
  stackCol(P, "V", 7, -34, -148, 11, 10, 8.6, 0.9, C.orange, "Premium villa", "40'×62'-6\"");

  // ── Sector A blocks (middle band) ──
  const aCols: Array<[number, string]> = [
    [-128, C.tan], [-118, C.grey],
    [-96, C.blue], [-86, C.yellow],
    [-64, C.purple], [-54, C.grey],
    [-32, C.yellow], [-22, C.pinkPur],
    [0, C.blueLight], [10, C.yellow],
    [28, C.grey], [38, C.olive],
  ];
  let an = 1;
  for (const [x, color] of aCols) {
    const skip = x === -96 || x === -86 ? [2, 3] : []; // Park 02 gap
    an = stackCol(P, "A", an, x, -4, 6, 9, 8.6, 1, color, "Residential plot", "800–2400 sqft", skip);
  }

  // ── Villa column V-01..V-06 on the right of Sector A ──
  stackCol(P, "V", 1, 52, -4, 6, 10, 8.8, 1, C.orange, "Premium villa", "32'×64'");

  // ── Commercial plots ──
  P.push({ x: -122, z: 68, w: 22, d: 14, color: C.commercial, label: "C-03", category: "Commercial plot", size: "Commercial" });
  P.push({ x: -96, z: 68, w: 18, d: 14, color: C.commercial, label: "C-02", category: "Commercial plot", size: "Commercial" });
  P.push({ x: -122, z: 86, w: 22, d: 14, color: C.commercial, label: "C-04", category: "Commercial plot", size: "Commercial" });
  P.push({ x: 0, z: 84, w: 66, d: 20, color: C.commercial, label: "COMMERCIAL", category: "Commercial building", size: "Commercial hub" });

  // ── Lower Sector A rows (between commercial strips) ──
  const lowCols: Array<[number, string]> = [[-66, C.yellow], [-56, C.grey], [-38, C.yellow], [-28, C.tan]];
  for (const [x, color] of lowCols) {
    an = stackCol(P, "A", an, x, 66, 3, 9, 8.4, 1, color, "Residential plot", "800–1500 sqft");
  }

  // ── Farmhouse arc (top-right) around the backyard park ──
  const fc = { x: 104, z: -98 };
  const arcN = 11;
  for (let i = 0; i < arcN; i++) {
    const a = Math.PI * 1.15 - (i / (arcN - 1)) * Math.PI * 1.3;
    const r = 34;
    P.push({
      x: fc.x + Math.cos(a) * r,
      z: fc.z + Math.sin(a) * r,
      w: 15, d: 11,
      rot: -a + Math.PI / 2,
      color: C.yellow,
      label: "FARMHOUSE",
      category: "Regal farmhouse",
      size: "5745 sqft",
    });
  }
  P.push({ x: 78, z: -60, w: 18, d: 13, color: C.blue, label: "FARMHOUSE", category: "Emerald farmhouse", size: "10375 sqft" });
  P.push({ x: 128, z: -64, w: 15, d: 12, rot: -0.5, color: C.blue, label: "FARMHOUSE", category: "Emerald farmhouse", size: "10375 sqft" });

  return P;
}

/* ── Plot mesh with hover ─────────────────────────────────────────────────── */

function Plot({ spec, onHover }: { spec: PlotSpec; onHover: (i: PlotHoverInfo | null) => void }) {
  const tex = useMemo(() => plotTex(spec.label, spec.color), [spec.label, spec.color]);
  const side = useMemo(() => shade(spec.color, 0.72), [spec.color]);
  const [hover, setHover] = useState(false);
  const { gl } = useThree();

  return (
    <mesh
      position={[spec.x, hover ? 0.9 : 0.5, spec.z]}
      rotation={[0, spec.rot ?? 0, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        gl.domElement.style.cursor = "pointer";
        onHover({ label: spec.label, category: spec.category, size: spec.size });
      }}
      onPointerOut={() => {
        setHover(false);
        gl.domElement.style.cursor = "";
        onHover(null);
      }}
    >
      <boxGeometry args={[spec.w, 1, spec.d]} />
      <meshStandardMaterial attach="material-0" color={side} roughness={0.9} />
      <meshStandardMaterial attach="material-1" color={side} roughness={0.9} />
      <meshStandardMaterial
        attach="material-2"
        map={tex}
        emissiveMap={tex}
        emissive="#ffffff"
        emissiveIntensity={hover ? 0.35 : 0}
        roughness={0.85}
      />
      <meshStandardMaterial attach="material-3" color={side} roughness={0.9} />
      <meshStandardMaterial attach="material-4" color={side} roughness={0.9} />
      <meshStandardMaterial attach="material-5" color={side} roughness={0.9} />
    </mesh>
  );
}

/* ── Static scenery pieces ────────────────────────────────────────────────── */

function Road({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <mesh position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={C.road} roughness={1} />
    </mesh>
  );
}

function Pond({ x, z, rx, rz }: { x: number; z: number; rx: number; rz: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.12 + Math.sin(clock.elapsedTime * 1.6) * 0.06;
    }
  });
  return (
    <mesh ref={ref} position={[x, 0.14, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[rx, rz, 1]}>
      <circleGeometry args={[1, 28]} />
      <meshStandardMaterial color={C.water} roughness={0.15} metalness={0.2} emissive="#9fd8ff" emissiveIntensity={0.12} />
    </mesh>
  );
}

function Park({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <mesh position={[x, 0.1, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={C.park} roughness={1} />
    </mesh>
  );
}

/** Octagonal apartment block, like the brochure's Block 01–07. */
function ApartmentBlock({ x, z, label }: { x: number; z: number; label: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[10.5, 10.5, 0.6, 8]} />
        <meshStandardMaterial color={C.white} roughness={0.9} />
      </mesh>
      <mesh position={[0, 13, 0]}>
        <cylinderGeometry args={[8, 8, 26, 8]} />
        <meshStandardMaterial color="#e8eaee" roughness={0.7} />
      </mesh>
      {[5, 11, 17, 23].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[8.15, 8.15, 1, 8]} />
          <meshStandardMaterial color="#8fa3b8" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 26.6, 0]}>
        <cylinderGeometry args={[8.6, 8.6, 1.2, 8]} />
        <meshStandardMaterial color="#12263f" roughness={0.6} />
      </mesh>
      {/* rooftop label ring omitted; hover not needed for towers */}
      <mesh position={[0, 27.6, 0]}>
        <cylinderGeometry args={[2.2, 2.2, 1, 8]} />
        <meshStandardMaterial color={C.white} />
      </mesh>
      <group name={label} />
    </group>
  );
}

function Trees({ positions }: { positions: Array<[number, number, number]> }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const foliage = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    positions.forEach(([x, z, s], i) => {
      dummy.scale.setScalar(s);
      dummy.position.set(x, s * 1, z);
      dummy.updateMatrix();
      trunk.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, s * 3, z);
      dummy.updateMatrix();
      foliage.current?.setMatrixAt(i, dummy.matrix);
    });
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true;
    if (foliage.current) foliage.current.instanceMatrix.needsUpdate = true;
  }, [positions]);
  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, positions.length] as never}>
        <cylinderGeometry args={[0.25, 0.35, 2, 6]} />
        <meshStandardMaterial color="#6b4f2e" />
      </instancedMesh>
      <instancedMesh ref={foliage} args={[undefined, undefined, positions.length] as never}>
        <sphereGeometry args={[1.8, 8, 8]} />
        <meshStandardMaterial color={C.parkDark} roughness={1} />
      </instancedMesh>
    </group>
  );
}

/* ── Cinematic guided tour ────────────────────────────────────────────────── */

interface Waypoint { p: [number, number, number]; l: [number, number, number]; c: string }

const TOUR: Waypoint[] = [
  { p: [62, 24, 200], l: [62, 6, 140], c: "Grand entrance on the Dubagga–Nabihpanah road" },
  { p: [62, 34, 110], l: [62, 0, 20], c: "Wide internal main road through the township" },
  { p: [-90, 62, 10], l: [-90, 0, -100], c: "Sector B — residential plots with Park 01" },
  { p: [-36, 42, -100], l: [-34, 0, -110], c: "Premium villas (40'×62'-6\" and 32'×64')" },
  { p: [-10, 40, -55], l: [-12, 0, -105], c: "Central Park with landscaped water bodies" },
  { p: [32, 46, -20], l: [30, 14, -100], c: "Seven premium apartment blocks" },
  { p: [104, 58, -40], l: [104, 0, -98], c: "Regal & Emerald farmhouses around Backyard Park" },
  { p: [-45, 60, 105], l: [-45, 0, 35], c: "Sector A — plots, Park 02 & the commercial hub" },
  { p: [108, 36, 42], l: [108, 0, 2], c: "Clubhouse with party lawn & swimming pool" },
  { p: [118, 42, 112], l: [118, 0, 60], c: "Multipurpose cricket ground & sports courts" },
  { p: [10, 230, 140], l: [0, 0, -10], c: "Prime Estate, Kasmandi — the complete master plan" },
];

const SEG_SECONDS = 4.4;

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function TourRig({
  active,
  nonce,
  onCaption,
  onEnd,
}: {
  active: boolean;
  nonce: number;
  onCaption: (c: string | null) => void;
  onEnd: () => void;
}) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  const t0 = useRef<number | null>(null);
  const lastSeg = useRef(-1);

  useEffect(() => {
    t0.current = null;
    lastSeg.current = -1;
  }, [nonce]);

  useFrame(({ clock }) => {
    if (!active) return;
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    const segF = t / SEG_SECONDS;
    const seg = Math.floor(segF);

    if (seg >= TOUR.length - 1) {
      const last = TOUR[TOUR.length - 1];
      camera.position.set(...last.p);
      controls?.target.set(...last.l);
      controls?.update();
      onCaption(null);
      onEnd();
      return;
    }

    if (seg !== lastSeg.current) {
      lastSeg.current = seg;
      onCaption(TOUR[seg].c);
    }

    const a = TOUR[seg];
    const b = TOUR[seg + 1];
    const k = smoothstep(segF - seg);
    camera.position.set(
      a.p[0] + (b.p[0] - a.p[0]) * k,
      a.p[1] + (b.p[1] - a.p[1]) * k,
      a.p[2] + (b.p[2] - a.p[2]) * k,
    );
    const look = new THREE.Vector3(
      a.l[0] + (b.l[0] - a.l[0]) * k,
      a.l[1] + (b.l[1] - a.l[1]) * k,
      a.l[2] + (b.l[2] - a.l[2]) * k,
    );
    controls?.target.copy(look);
    controls?.update();
  });

  return null;
}

/* ── Main scene ───────────────────────────────────────────────────────────── */

export default function PrimeEstateScene({
  playTour,
  tourNonce,
  onCaption,
  onTourEnd,
  onHoverPlot,
}: PrimeSceneProps) {
  const plots = useMemo(buildPlots, []);
  const sign = useMemo(signTex, []);

  const trees = useMemo(() => {
    const rand = (() => {
      let s = 987654321;
      return () => ((s = Math.imul(s ^ (s >>> 15), s | 1)), ((s >>> 16) & 0xffff) / 0xffff);
    })();
    const list: Array<[number, number, number]> = [];
    // along the main vertical road
    for (let z = -150; z <= 130; z += 14) {
      list.push([56.5, z + rand() * 4, 0.8 + rand() * 0.5]);
      list.push([67.5, z + 7 + rand() * 4, 0.8 + rand() * 0.5]);
    }
    // central park + backyard park + park strips
    for (let i = 0; i < 16; i++) list.push([-24 + rand() * 30, -145 + rand() * 95, 0.9 + rand() * 0.7]);
    for (let i = 0; i < 8; i++) list.push([96 + rand() * 18, -108 + rand() * 22, 0.8 + rand() * 0.5]);
    for (let i = 0; i < 6; i++) list.push([-124 + rand() * 16, -104 + rand() * 20, 0.8 + rand() * 0.4]);
    // southern boundary green
    for (let x = -140; x <= 140; x += 12) list.push([x + rand() * 5, 158, 0.9 + rand() * 0.6]);
    return list;
  }, []);

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [62, 24, 200], fov: 52, near: 0.5, far: 1500 }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <Sky distance={4500} sunPosition={[120, 80, 40]} turbidity={4} rayleigh={1.4} />
      <hemisphereLight intensity={0.65} color="#eaf2ff" groundColor="#8a9a78" />
      <ambientLight intensity={0.4} />
      <directionalLight position={[120, 140, 60]} intensity={1.6} color="#fff4de" />
      <fog attach="fog" args={["#dfe9f3", 320, 900]} />

      {/* Countryside ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial color="#7ba05f" roughness={1} />
      </mesh>

      {/* Township base */}
      <mesh position={[0, 0.02, -2]}>
        <boxGeometry args={[290, 0.1, 316]} />
        <meshStandardMaterial color={C.base} roughness={1} />
      </mesh>

      {/* Boundary wall */}
      {[[-145, -2, 0.8, 316] as const, [145, -2, 0.8, 316] as const].map(([x, z, w, d], i) => (
        <mesh key={`bw${i}`} position={[x, 1, z]}>
          <boxGeometry args={[w, 2, d]} />
          <meshStandardMaterial color="#d9dbdf" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 1, -160]}>
        <boxGeometry args={[290, 2, 0.8]} />
        <meshStandardMaterial color="#d9dbdf" roughness={0.9} />
      </mesh>

      {/* ── Roads (same skeleton as the plan) ── */}
      {/* southern highway */}
      <mesh position={[0, 0.05, 148]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[340, 16]} />
        <meshStandardMaterial color={C.roadDark} roughness={1} />
      </mesh>
      {Array.from({ length: 22 }, (_, i) => -160 + i * 15).map((x) => (
        <mesh key={`hd${x}`} position={[x, 0.09, 148]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6, 0.7]} />
          <meshStandardMaterial color="#e8edf3" />
        </mesh>
      ))}
      {/* main vertical spine */}
      <Road x={62} z={-8} w={10} d={296} />
      {Array.from({ length: 18 }, (_, i) => -148 + i * 16).map((z) => (
        <mesh key={`vd${z}`} position={[62, 0.09, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, 6]} />
          <meshStandardMaterial color="#f2f4f6" />
        </mesh>
      ))}
      {/* horizontal cross roads */}
      <Road x={0} z={-44} w={290} d={8} />
      <Road x={-39} z={-155} w={212} d={7} />
      <Road x={-39} z={-8} w={212} d={7} />
      <Road x={-39} z={56} w={212} d={7} />
      <Road x={-39} z={100} w={212} d={7} />
      <Road x={103} z={-60} w={84} d={6} />
      <Road x={103} z={30} w={84} d={6} />
      {/* vertical roads between sector strips */}
      {[-102, -72, -43].map((x) => <Road key={`tv${x}`} x={x} z={-99} w={6} d={104} />)}
      {[-106, -74, -42, -10, 22].map((x) => <Road key={`mv${x}`} x={x} z={46} w={6} d={100} />)}

      {/* ── Parks & water ── */}
      <Park x={-117} z={-95} w={22} d={26} /> {/* Park 01 */}
      <Park x={-91} z={16} w={22} d={22} />   {/* Park 02 */}
      {/* Central park */}
      <Park x={-11} z={-99} w={28} d={104} />
      <Pond x={-14} z={-124} rx={7} rz={12} />
      <Pond x={-8} z={-78} rx={6} rz={9} />
      {/* Backyard park in the farmhouse arc */}
      <mesh position={[104, 0.1, -98]} rotation={[-Math.PI / 2, 0, 0]} scale={[19, 13, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color={C.park} roughness={1} />
      </mesh>
      <Pond x={106} z={-98} rx={8} rz={4} />
      {/* southern verge */}
      <mesh position={[0, 0.04, 158]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[340, 5]} />
        <meshStandardMaterial color={C.parkDark} roughness={1} />
      </mesh>

      {/* ── Apartment zone: 7 octagonal blocks like the plan ── */}
      <mesh position={[33, 0.08, -99]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[52, 104]} />
        <meshStandardMaterial color="#cfe0c2" roughness={1} />
      </mesh>
      {(
        [
          [20, -135, "Block 06"], [46, -138, "Block 07"],
          [18, -108, "Block 05"], [44, -106, "Block 04"],
          [31, -84, "Block 03"],
          [18, -60, "Block 01"], [44, -58, "Block 02"],
        ] as Array<[number, number, string]>
      ).map(([x, z, label]) => (
        <ApartmentBlock key={label} x={x} z={z} label={label} />
      ))}

      {/* ── Clubhouse zone ── */}
      <mesh position={[106, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[66, 52]} />
        <meshStandardMaterial color="#cfe0c2" roughness={1} />
      </mesh>
      <Park x={104} z={-10} w={26} d={16} /> {/* party lawn */}
      <Pond x={104} z={8} rx={9} rz={4} />   {/* pool */}
      {[[84, 0, "ADM"], [128, 0, "BANQUET"]].map(([x, , label]) => (
        <mesh key={String(label)} position={[Number(x), 2.4, 0]}>
          <boxGeometry args={[11, 4.8, 24]} />
          <meshStandardMaterial color={C.white} roughness={0.85} />
        </mesh>
      ))}

      {/* ── Sports zone ── */}
      <mesh position={[112, 0.08, 62]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[66, 56]} />
        <meshStandardMaterial color="#cfe0c2" roughness={1} />
      </mesh>
      {/* cricket ground */}
      <mesh position={[120, 0.12, 62]} rotation={[-Math.PI / 2, 0, 0]} scale={[21, 17, 1]}>
        <circleGeometry args={[1, 36]} />
        <meshStandardMaterial color={C.park} roughness={1} />
      </mesh>
      <mesh position={[120, 0.11, 62]} rotation={[-Math.PI / 2, 0, 0]} scale={[23, 19, 1]}>
        <circleGeometry args={[1, 36]} />
        <meshStandardMaterial color="#b48a5a" roughness={1} />
      </mesh>
      <mesh position={[120, 0.16, 62]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3, 12]} />
        <meshStandardMaterial color="#d9c9a3" roughness={1} />
      </mesh>
      {/* courts */}
      <mesh position={[88, 0.12, 48]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11, 17]} />
        <meshStandardMaterial color="#3f74c9" roughness={0.9} />
      </mesh>
      <mesh position={[88, 0.12, 72]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11, 15]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.9} />
      </mesh>

      {/* ── Entrance gate on the southern highway ── */}
      <group position={[62, 0, 139]}>
        {[-8, 8].map((x) => (
          <mesh key={`gp${x}`} position={[x, 3, 0]}>
            <boxGeometry args={[1.8, 6, 1.8]} />
            <meshStandardMaterial color="#c9ccd2" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 6.4, 0]}>
          <boxGeometry args={[18, 2.4, 1.6]} />
          <meshStandardMaterial attach="material-0" color="#10233f" />
          <meshStandardMaterial attach="material-1" color="#10233f" />
          <meshStandardMaterial attach="material-2" color="#10233f" />
          <meshStandardMaterial attach="material-3" color="#10233f" />
          <meshStandardMaterial attach="material-4" map={sign} />
          <meshStandardMaterial attach="material-5" map={sign} />
        </mesh>
      </group>

      {/* ── All plots (same sector structure as the brochure) ── */}
      {plots.map((p, i) => (
        <Plot key={`${p.label}-${i}`} spec={p} onHover={onHoverPlot} />
      ))}

      <Trees positions={trees} />

      <OrbitControls
        makeDefault
        enabled={!playTour}
        enableDamping
        dampingFactor={0.08}
        minDistance={12}
        maxDistance={420}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
      <TourRig active={playTour} nonce={tourNonce} onCaption={onCaption} onEnd={onTourEnd} />
    </Canvas>
  );
}
