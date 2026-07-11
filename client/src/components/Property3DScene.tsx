import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, PointerLockControls, Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { Project } from "@/types";
import { formatINR } from "@/lib/utils";

export interface SceneUnit {
  _id: string;
  unitNumber: string;
  type: string;
  areaSqft: number;
  price: number;
  status: string;
}

export interface PlotSelection {
  unit: SceneUnit;
  facing: string;
}

export type ScenePreset = "default" | "aerial" | "street";

/* ── Deterministic RNG so every property renders its own stable layout ────── */

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Baked canvas textures (cached) ───────────────────────────────────────── */

const texCache = new Map<string, THREE.CanvasTexture>();

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function facadeTexture(color: string, floors: number, night: boolean, seed: number): THREE.CanvasTexture {
  const key = `${color}-${floors}-${night}-${seed}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const rand = mulberry32(seed);
  const cols = 6;
  const rowH = 40;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = Math.min(18, floors) * rowH;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = night ? shade(color, 0.22) : color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rows = Math.min(18, floors);
  const winW = 26;
  const winH = 20;
  const gapX = canvas.width / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * gapX + (gapX - winW) / 2;
      const y = r * rowH + (rowH - winH) / 2;
      if (night) {
        ctx.fillStyle = rand() < 0.48 ? (rand() < 0.5 ? "#ffd684" : "#ffe9b8") : "#0b1320";
      } else {
        ctx.fillStyle = rand() < 0.2 ? "#33465f" : "#22314a";
      }
      ctx.fillRect(x, y, winW, winH);
      if (!night) {
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(x, y, winW, 4);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function signTexture(name: string): THREE.CanvasTexture {
  const key = `sign-${name}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#10233f";
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = "#d4af5f";
  ctx.fillRect(0, 0, 1024, 8);
  ctx.fillRect(0, 120, 1024, 8);
  ctx.fillStyle = "#f5f8ff";
  ctx.font = "bold 64px 'Inter Tight', Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let label = name.toUpperCase();
  while (ctx.measureText(label).width > 940 && label.length > 4) label = label.slice(0, -2) + "…";
  ctx.fillText(label, 512, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Premium plot card baked as one texture: rounded gradient tile with the
 * plot number and status caption, laid on the plot's top face.
 */
function plotCardTexture(label: string, available: boolean, night: boolean): THREE.CanvasTexture {
  const key = `plot-${label}-${available}-${night}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const W = 256;
  const H = 332;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Base matches the plot box so the rounded card reads as a raised tile.
  ctx.fillStyle = night ? "#161b26" : "#232a37";
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 14, 0, H - 14);
  if (available) {
    grad.addColorStop(0, night ? "#1e7c46" : "#3ed37e");
    grad.addColorStop(1, night ? "#11552f" : "#1d9e55");
  } else {
    grad.addColorStop(0, night ? "#8f3630" : "#ef6a5c");
    grad.addColorStop(1, night ? "#5e211d" : "#c23a33");
  }
  ctx.fillStyle = grad;
  roundedRect(ctx, 12, 12, W - 24, H - 24, 26);
  ctx.fill();

  // top gloss + hairline border
  const gloss = ctx.createLinearGradient(0, 12, 0, 96);
  gloss.addColorStop(0, "rgba(255,255,255,0.28)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  roundedRect(ctx, 12, 12, W - 24, 84, 26);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2.5;
  roundedRect(ctx, 12, 12, W - 24, H - 24, 26);
  ctx.stroke();

  // plot number
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;
  ctx.font = "bold 68px 'Inter Tight', Inter, sans-serif";
  let text = label;
  while (ctx.measureText(text).width > 200 && text.length > 3) text = text.slice(0, -2) + "…";
  ctx.fillText(text, W / 2, H / 2 - 14);

  // status caption
  ctx.shadowBlur = 0;
  ctx.font = "600 26px 'Inter Tight', Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const caption = available ? "A V A I L A B L E" : "B O O K E D";
  ctx.fillText(caption, W / 2, H / 2 + 52);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/** Subtle paver grid so the township base reads as laid concrete blocks. */
function paverTexture(night: boolean): THREE.CanvasTexture {
  const key = `paver-${night}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = night ? "#333b47" : "#aeb4bd";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = night ? "rgba(12,16,24,0.5)" : "rgba(88,96,108,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 18);
  texCache.set(key, tex);
  return tex;
}

/** Soft mottled lawn so the ground doesn't read as one flat green. */
function grassTexture(night: boolean): THREE.CanvasTexture {
  const key = `grass-${night}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const rand = mulberry32(97531);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = night ? "#141f16" : "#4a7040";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const r = 6 + rand() * 22;
    ctx.fillStyle = night
      ? `rgba(${18 + rand() * 14}, ${34 + rand() * 16}, ${20 + rand() * 10}, 0.5)`
      : `rgba(${58 + rand() * 26}, ${104 + rand() * 30}, ${52 + rand() * 22}, 0.5)`;
    ctx.beginPath();
    ctx.arc(rand() * 256, rand() * 256, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(46, 46);
  texCache.set(key, tex);
  return tex;
}

/* ── Master-plan layout: numbered plots along internal roads ──────────────── */

interface TowerSpec { x: number; z: number; w: number; d: number; floors: number; color: string; seed: number }
interface TreeSpec { x: number; z: number; s: number }
interface PlotSpec { unit: SceneUnit; x: number; z: number; w: number; d: number; facing: string }

const FACADES = ["#d8dee9", "#e6dcc8", "#cdd8e3", "#d9d3c4", "#c8d2cb"];
const FLOOR_H = 3;
const PLOT_W = 10;
const PLOT_D = 13;
const PITCH_X = 12;
const BAND_PITCH = 34; // cross road + two facing rows of plots
const COLS_PER_SIDE = 4;
const PER_ROW = COLS_PER_SIDE * 2;
const MAX_PLOTS = 64;

function buildLayout(project: Project, units: SceneUnit[]) {
  const rand = mulberry32(hashSeed(project._id));

  const shown = units.slice(0, MAX_PLOTS);
  const apartments = units.filter((u) => !u.type.toLowerCase().includes("plot")).length || (units.length === 0 ? 20 : 0);

  // Plot grid: bands of [cross road + row above + row below], split across a
  // central spine road that runs from the entrance gate.
  const plots: PlotSpec[] = [];
  const crossRoadZs: number[] = [];
  const rows = Math.ceil(shown.length / PER_ROW);
  const bands = Math.max(1, Math.ceil(rows / 2));
  for (let b = 0; b < bands; b++) crossRoadZs.push(30 - b * BAND_PITCH);

  shown.forEach((unit, i) => {
    const row = Math.floor(i / PER_ROW);
    const idxInRow = i % PER_ROW;
    const side = idxInRow < COLS_PER_SIDE ? -1 : 1;
    const col = idxInRow % COLS_PER_SIDE;
    const band = Math.floor(row / 2);
    const isFrontRow = row % 2 === 0;
    const roadZ = crossRoadZs[band];
    const z = isFrontRow ? roadZ + 9.5 : roadZ - 9.5;
    const x = side * (10 + PLOT_W / 2 + col * PITCH_X);
    const facing =
      col === COLS_PER_SIDE - 1 ? (side < 0 ? "West" : "East") : isFrontRow ? "South" : "North";
    plots.push({ unit, x, z, w: PLOT_W, d: PLOT_D, facing });
  });

  const plotsBackZ = plots.length ? Math.min(...plots.map((p) => p.z)) - PLOT_D / 2 : 30;

  // Towers (for apartment inventory) sit behind the plot sectors.
  const towers: TowerSpec[] = [];
  if (apartments > 0) {
    const towerCount = Math.min(7, Math.max(2, Math.ceil(apartments / 24)));
    const towersZ = plots.length ? plotsBackZ - 24 : -12;
    for (let i = 0; i < towerCount; i++) {
      const floors = Math.max(6, Math.min(18, Math.round(apartments / towerCount / 3) + Math.floor(rand() * 5)));
      towers.push({
        x: (i - (towerCount - 1) / 2) * 24 + (rand() - 0.5) * 4,
        z: towersZ - (i % 2) * 16 - rand() * 4,
        w: 9 + rand() * 4,
        d: 9 + rand() * 4,
        floors,
        color: FACADES[Math.floor(rand() * FACADES.length)],
        seed: Math.floor(rand() * 1e9),
      });
    }
  }

  const towersBackZ = towers.length ? Math.min(...towers.map((t) => t.z)) - 16 : plotsBackZ - 8;
  const backZ = Math.min(-50, towersBackZ);
  const baseDepth = 50 - backZ;
  const baseCenterZ = (50 + backZ) / 2;

  const trees: TreeSpec[] = [];
  for (let i = 0; i < 30; i++) {
    const alongX = rand() < 0.5;
    trees.push({
      x: alongX ? -60 + rand() * 120 : (rand() < 0.5 ? -61 : 61) + (rand() - 0.5) * 4,
      z: alongX ? (rand() < 0.5 ? backZ + 3 : 46) + (rand() - 0.5) * 4 : backZ + 6 + rand() * (baseDepth - 12),
      s: 0.8 + rand() * 0.8,
    });
  }

  return { plots, crossRoadZs, towers, trees, backZ, baseDepth, baseCenterZ };
}

/* ── Clickable plot ───────────────────────────────────────────────────────── */

const AVAILABLE_GREEN = "#2fbe63";
const BOOKED_RED = "#e14b44";
const GOLD = "#e8c877";

function Plot({
  spec,
  night,
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  spec: PlotSpec;
  night: boolean;
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (sel: PlotSelection) => void;
}) {
  const available = spec.unit.status === "AVAILABLE";
  const glow = available ? AVAILABLE_GREEN : BOOKED_RED;
  const cardTex = useMemo(
    () => plotCardTexture(spec.unit.unitNumber, available, night),
    [spec.unit.unitNumber, available, night],
  );
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.05;
    ringRef.current.scale.setScalar(s);
    (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
      0.75 + Math.sin(clock.elapsedTime * 3.2) * 0.2;
  });

  const lift = hovered || selected ? 0.6 : 0.35;

  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh
        position={[0, lift, 0]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ unit: spec.unit, facing: spec.facing });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(spec.unit._id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[spec.w, 0.7, spec.d]} />
        <meshStandardMaterial
          color={night ? "#161b26" : "#232a37"}
          roughness={0.65}
          emissive={glow}
          emissiveIntensity={selected ? 0.28 : hovered ? 0.2 : night ? 0.1 : 0}
        />
      </mesh>
      {/* premium card face with number + status */}
      <mesh position={[0, lift + 0.36, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[spec.w, spec.d]} />
        <meshStandardMaterial
          map={cardTex}
          emissiveMap={cardTex}
          emissive="#ffffff"
          emissiveIntensity={selected ? 0.5 : hovered ? 0.35 : night ? 0.4 : 0.12}
          roughness={0.6}
        />
      </mesh>
      {/* light kerb frame */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[spec.w + 1, spec.d + 1]} />
        <meshStandardMaterial color={night ? "#4b525e" : "#d7dce2"} roughness={1} />
      </mesh>
      {selected && (
        <mesh ref={ringRef} position={[0, 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(spec.w, spec.d) * 0.62, Math.max(spec.w, spec.d) * 0.72, 40]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* ── Towers / trees / lamps (visual context, unchanged behaviour) ─────────── */

function Tower({ spec, night }: { spec: TowerSpec; night: boolean }) {
  const h = spec.floors * FLOOR_H;
  const tex = useMemo(() => facadeTexture(spec.color, spec.floors, night, spec.seed), [spec, night]);
  const plain = night ? shade(spec.color, 0.25) : spec.color;
  const sideProps = {
    map: tex,
    emissiveMap: night ? tex : null,
    emissive: night ? ("#ffffff" as const) : ("#000000" as const),
    emissiveIntensity: night ? 0.65 : 0,
    roughness: 0.85,
  };

  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[spec.w, h, spec.d]} />
        <meshStandardMaterial attach="material-0" {...sideProps} />
        <meshStandardMaterial attach="material-1" {...sideProps} />
        <meshStandardMaterial attach="material-2" color={plain} roughness={0.95} />
        <meshStandardMaterial attach="material-3" color={plain} roughness={0.95} />
        <meshStandardMaterial attach="material-4" {...sideProps} />
        <meshStandardMaterial attach="material-5" {...sideProps} />
      </mesh>
      <mesh position={[0, h + 0.35, 0]} castShadow>
        <boxGeometry args={[spec.w * 1.04, 0.7, spec.d * 1.04]} />
        <meshStandardMaterial color={night ? "#3d4654" : "#94a3b8"} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Trees({ specs, night }: { specs: TreeSpec[]; night: boolean }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const lower = useRef<THREE.InstancedMesh>(null);
  const upper = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    specs.forEach((t, i) => {
      dummy.scale.setScalar(t.s);
      dummy.position.set(t.x, t.s * 1, t.z);
      dummy.updateMatrix();
      trunk.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.s * 2.8, t.z);
      dummy.updateMatrix();
      lower.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.s * 4.1, t.z);
      dummy.updateMatrix();
      upper.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const ref of [trunk, lower, upper]) {
      if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    }
  }, [specs]);

  const count = specs.length;
  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, count] as never} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 2, 6]} />
        <meshStandardMaterial color="#6b4f2e" />
      </instancedMesh>
      <instancedMesh ref={lower} args={[undefined, undefined, count] as never} castShadow>
        <coneGeometry args={[1.5, 2.6, 7]} />
        <meshStandardMaterial color={night ? "#1c3a24" : "#2f6b3a"} />
      </instancedMesh>
      <instancedMesh ref={upper} args={[undefined, undefined, count] as never} castShadow>
        <coneGeometry args={[1.05, 2, 7]} />
        <meshStandardMaterial color={night ? "#24482c" : "#3a7d45"} />
      </instancedMesh>
    </group>
  );
}

function Lamps({ night }: { night: boolean }) {
  const spots: Array<[number, number]> = [
    [-55, 51], [-33, 51], [-11, 51], [11, 51], [33, 51], [55, 51],
    [-6, 22], [6, -2], [-6, -26],
  ];
  return (
    <group>
      {spots.map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 2.6, 0]}>
            <cylinderGeometry args={[0.09, 0.12, 5.2, 6]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[0, 5.3, 0]}>
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshStandardMaterial color="#fde68a" emissive="#ffb84d" emissiveIntensity={night ? 3.2 : 0.8} />
          </mesh>
        </group>
      ))}
      {night && (
        <>
          <pointLight position={[-33, 6, 51]} color="#ffca7a" intensity={60} distance={42} decay={2} />
          <pointLight position={[33, 6, 51]} color="#ffca7a" intensity={60} distance={42} decay={2} />
          <pointLight position={[0, 8, 46]} color="#ffdca3" intensity={70} distance={55} decay={2} />
          <pointLight position={[0, 7, 0]} color="#ffca7a" intensity={55} distance={50} decay={2} />
        </>
      )}
    </group>
  );
}

/* ── Camera: orbit presets, fly-to-plot focus, walk mode ──────────────────── */

const PRESET_POS: Record<ScenePreset, [number, number, number]> = {
  default: [64, 44, 86],
  aerial: [2, 150, 2],
  street: [4, 3.2, 68],
};

function CameraRig({
  preset,
  trigger,
  focus,
}: {
  preset: ScenePreset;
  trigger: number;
  focus: { x: number; z: number } | null;
}) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  const goal = useRef(new THREE.Vector3(...PRESET_POS.default));
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const animating = useRef(false);

  useEffect(() => {
    if (focus) {
      goal.current.set(focus.x + 13, 12, focus.z + 16);
      look.current.set(focus.x, 0.8, focus.z);
    } else {
      goal.current.set(...PRESET_POS[preset]);
      look.current.set(0, preset === "street" ? 12 : 0, 0);
    }
    animating.current = true;
  }, [preset, trigger, focus]);

  useFrame(() => {
    if (!animating.current) return;
    camera.position.lerp(goal.current, 0.07);
    controls?.target.lerp(look.current, 0.07);
    controls?.update();
    if (camera.position.distanceTo(goal.current) < 0.35) animating.current = false;
  });
  return null;
}

const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

function WalkControls({ onExit, backZ }: { onExit: () => void; backZ: number }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    camera.position.set(0, 2.2, 62);
    camera.lookAt(0, 10, -10);
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera]);

  useFrame((_, dt) => {
    let mx = 0;
    let mz = 0;
    for (const [code, [dx, dz]] of Object.entries(KEY_DIRS)) {
      if (keys.current[code]) { mx += dx; mz += dz; }
    }
    if (mx === 0 && mz === 0) return;

    const speed = keys.current.ShiftLeft || keys.current.ShiftRight ? 26 : 12;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

    camera.position.addScaledVector(forward, mz * speed * dt);
    camera.position.addScaledVector(right, mx * speed * dt);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -78, 78);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, backZ - 4, 84);
    camera.position.y = 2.2;
  });

  return <PointerLockControls makeDefault onUnlock={onExit} />;
}

/* ── Public component ─────────────────────────────────────────────────────── */

export default function Property3DScene({
  project,
  units,
  preset,
  presetTrigger,
  autoRotate,
  night,
  walk,
  onExitWalk,
  selectedUnitId,
  onSelectPlot,
}: {
  project: Project;
  units: SceneUnit[];
  preset: ScenePreset;
  presetTrigger: number;
  autoRotate: boolean;
  night: boolean;
  walk: boolean;
  onExitWalk: () => void;
  selectedUnitId: string | null;
  onSelectPlot: (sel: PlotSelection | null) => void;
}) {
  const layout = useMemo(() => buildLayout(project, units), [project, units]);
  const sign = useMemo(() => signTexture(project.name), [project.name]);
  const grass = useMemo(() => grassTexture(night), [night]);
  const paver = useMemo(() => paverTexture(night), [night]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const hoveredSpec = useMemo(
    () => (hoveredId ? layout.plots.find((p) => p.unit._id === hoveredId) ?? null : null),
    [hoveredId, layout.plots],
  );

  const focusPlot = useMemo(() => {
    if (!selectedUnitId) return null;
    const spec = layout.plots.find((p) => p.unit._id === selectedUnitId);
    return spec ? { x: spec.x, z: spec.z } : null;
  }, [selectedUnitId, layout.plots]);

  const { backZ, baseDepth, baseCenterZ } = layout;
  const fogColor = night ? "#070d1d" : "#d4e0ec";
  const wall = night ? "#4c525e" : "#cfd3d9";
  const spineLen = 50 - (backZ + 6);

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: PRESET_POS.default, fov: 50, near: 0.5, far: 900 }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onPointerMissed={() => onSelectPlot(null)}
    >
      {night ? (
        <>
          <color attach="background" args={["#070d1d"]} />
          <Stars radius={320} depth={60} count={2400} factor={4.2} saturation={0} fade speed={0.6} />
          <ambientLight intensity={0.16} color="#9db4ff" />
          <directionalLight position={[-70, 90, 40]} intensity={0.35} color="#8fa8e8" />
        </>
      ) : (
        <>
          <Sky distance={4500} sunPosition={[110, 55, -60]} turbidity={4.5} rayleigh={1.6} />
          <hemisphereLight intensity={0.5} color="#eaf2ff" groundColor="#5c7350" />
          <ambientLight intensity={0.32} />
          <directionalLight
            position={[90, 110, -60]}
            intensity={1.7}
            color="#fff3dd"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-130}
            shadow-camera-right={130}
            shadow-camera-top={130}
            shadow-camera-bottom={-130}
          />
        </>
      )}
      <fog attach="fog" args={[fogColor, night ? 160 : 240, night ? 480 : 680]} />

      {/* Lawn */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial map={grass} roughness={1} />
      </mesh>

      {/* Township base — paved concrete blocks */}
      <mesh position={[0, 0.02, baseCenterZ]} receiveShadow>
        <boxGeometry args={[132, 0.08, baseDepth]} />
        <meshStandardMaterial map={paver} roughness={0.95} />
      </mesh>

      {/* Boundary walls */}
      {[-66, 66].map((x) => (
        <mesh key={`wx${x}`} position={[x, 1, baseCenterZ]} castShadow>
          <boxGeometry args={[0.6, 2, baseDepth]} />
          <meshStandardMaterial color={wall} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 1, backZ]} castShadow>
        <boxGeometry args={[132, 2, 0.6]} />
        <meshStandardMaterial color={wall} roughness={0.9} />
      </mesh>
      {[[-39.5, 53] as const, [39.5, 53] as const].map(([x, w], i) => (
        <mesh key={`fw${i}`} position={[x, 1, 50]} castShadow>
          <boxGeometry args={[w, 2, 0.6]} />
          <meshStandardMaterial color={wall} roughness={0.9} />
        </mesh>
      ))}

      {/* Entrance gate with project sign */}
      {[-13, 13].map((x) => (
        <mesh key={`gp${x}`} position={[x, 2.4, 50]} castShadow>
          <boxGeometry args={[1.6, 4.8, 1.6]} />
          <meshStandardMaterial color={night ? "#565c66" : "#8a8f98"} />
        </mesh>
      ))}
      <mesh position={[0, 5.1, 50]} castShadow>
        <boxGeometry args={[27.6, 2.6, 1.8]} />
        <meshStandardMaterial attach="material-0" color="#10233f" />
        <meshStandardMaterial attach="material-1" color="#10233f" />
        <meshStandardMaterial attach="material-2" color="#10233f" />
        <meshStandardMaterial attach="material-3" color="#10233f" />
        <meshStandardMaterial attach="material-4" map={sign} emissiveMap={night ? sign : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.8 : 0} />
        <meshStandardMaterial attach="material-5" map={sign} emissiveMap={night ? sign : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.8 : 0} />
      </mesh>

      {/* Front road with markings */}
      <mesh position={[0, 0.01, 56]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[180, 8]} />
        <meshStandardMaterial color={night ? "#1c2027" : "#31353c"} roughness={1} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => -72 + i * 9.5).map((x) => (
        <mesh key={x} position={[x, 0.05, 56]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, 0.5]} />
          <meshStandardMaterial color={night ? "#8b94a3" : "#e8edf3"} />
        </mesh>
      ))}

      {/* Central spine road from the gate */}
      <mesh position={[0, 0.05, 50 - spineLen / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, spineLen]} />
        <meshStandardMaterial color={night ? "#22262d" : "#3d424b"} roughness={1} />
      </mesh>
      {Array.from({ length: Math.floor(spineLen / 8) }, (_, i) => 46 - i * 8).map((z) => (
        <mesh key={`sd${z}`} position={[0, 0.08, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, 3.5]} />
          <meshStandardMaterial color={night ? "#8b94a3" : "#e8edf3"} />
        </mesh>
      ))}

      {/* Spine sidewalks */}
      {[-4.9, 4.9].map((x) => (
        <mesh key={`sw${x}`} position={[x, 0.055, 50 - spineLen / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1.4, spineLen]} />
          <meshStandardMaterial color={night ? "#454c58" : "#c6ccd4"} roughness={1} />
        </mesh>
      ))}

      {/* Cross roads between plot bands (with sidewalks) */}
      {layout.crossRoadZs.map((z) => (
        <group key={`cr${z}`}>
          <mesh position={[0, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[112, 6]} />
            <meshStandardMaterial color={night ? "#22262d" : "#3d424b"} roughness={1} />
          </mesh>
          {[-3.7, 3.7].map((dz) => (
            <mesh key={`crs${dz}`} position={[0, 0.045, z + dz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[112, 1.2]} />
              <meshStandardMaterial color={night ? "#454c58" : "#c6ccd4"} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Numbered plots — green available / red booked */}
      {layout.plots.map((p) => (
        <Plot
          key={p.unit._id}
          spec={p}
          night={night}
          hovered={hoveredId === p.unit._id}
          selected={selectedUnitId === p.unit._id}
          onHover={setHoveredId}
          onSelect={onSelectPlot}
        />
      ))}

      {layout.towers.map((t, i) => <Tower key={`${i}-${night}`} spec={t} night={night} />)}
      <Trees specs={layout.trees} night={night} />
      <Lamps night={night} />

      {/* Hover tooltip — glass chip with plot facts */}
      {hoveredSpec && !walk && hoveredSpec.unit._id !== selectedUnitId && (
        <Html
          position={[hoveredSpec.x, 3.2, hoveredSpec.z]}
          center
          distanceFactor={55}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              whiteSpace: "nowrap",
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(6,10,18,0.85)",
              border: "1px solid rgba(232,200,119,0.45)",
              color: "#fff",
              fontFamily: "'Inter Tight', Inter, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
              backdropFilter: "blur(6px)",
            }}
          >
            {hoveredSpec.unit.unitNumber} · {formatINR(hoveredSpec.unit.price)} · {hoveredSpec.unit.areaSqft.toLocaleString("en-IN")} sqft
          </div>
        </Html>
      )}

      {walk ? (
        <WalkControls onExit={onExitWalk} backZ={backZ} />
      ) : (
        <>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            autoRotate={autoRotate && !selectedUnitId}
            autoRotateSpeed={0.6}
            minDistance={6}
            maxDistance={280}
            maxPolarAngle={Math.PI / 2 - 0.04}
          />
          <CameraRig preset={preset} trigger={presetTrigger} focus={focusPlot} />
        </>
      )}
    </Canvas>
  );
}
