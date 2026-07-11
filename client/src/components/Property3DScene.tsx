import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr, Html, OrbitControls, PerformanceMonitor, PointerLockControls, Sky, Stars,
} from "@react-three/drei";
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

/* ── Baked canvas textures (cached — no per-frame cost) ───────────────────── */

const texCache = new Map<string, THREE.CanvasTexture>();

function makeTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
 * Manicured-lawn plot tile (available) or grey "SOLD" tile with a red corner
 * ribbon (booked) — the whole look is baked into one texture per plot.
 */
function plotCardTexture(label: string, available: boolean, night: boolean): THREE.CanvasTexture {
  return makeTex(`plot2-${label}-${available}-${night}`, 256, 332, (ctx) => {
    const W = 256;
    const H = 332;

    // Kerb frame
    ctx.fillStyle = night ? "#3c414b" : "#e9e6df";
    ctx.fillRect(0, 0, W, H);

    // Parcel fill
    roundedRect(ctx, 10, 10, W - 20, H - 20, 18);
    ctx.save();
    ctx.clip();
    const grad = ctx.createLinearGradient(0, 10, 0, H - 10);
    if (available) {
      grad.addColorStop(0, night ? "#2a5c39" : "#63b56f");
      grad.addColorStop(1, night ? "#1a3d26" : "#3c8c4d");
    } else {
      grad.addColorStop(0, night ? "#4a463f" : "#b8b0a3");
      grad.addColorStop(1, night ? "#37342e" : "#98907f");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Mowing stripes on lawn
    if (available) {
      ctx.fillStyle = "rgba(255,255,255,0.055)";
      for (let y = 10; y < H - 10; y += 40) ctx.fillRect(10, y, W - 20, 20);
    }

    // Inner hairline
    ctx.strokeStyle = available ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    roundedRect(ctx, 16, 16, W - 32, H - 32, 13);
    ctx.stroke();

    // Plot number
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = available ? "#ffffff" : night ? "#c9c2b4" : "#57503f";
    ctx.font = "bold 62px 'Inter Tight', Inter, sans-serif";
    let text = label;
    while (ctx.measureText(text).width > 190 && text.length > 3) text = text.slice(0, -2) + "…";
    ctx.fillText(text, W / 2, H / 2 + (available ? 0 : 14));
    ctx.shadowBlur = 0;

    if (available) {
      // status pill
      const pw = 168;
      ctx.fillStyle = "rgba(8,32,16,0.55)";
      roundedRect(ctx, (W - pw) / 2, H / 2 + 44, pw, 40, 20);
      ctx.fill();
      ctx.fillStyle = "#b8f5c9";
      ctx.font = "600 22px 'Inter Tight', Inter, sans-serif";
      ctx.fillText("A V A I L A B L E", W / 2, H / 2 + 65);
    }
    ctx.restore();

    if (!available) {
      // red SOLD ribbon across the top-left corner
      ctx.save();
      ctx.translate(58, 58);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = night ? "#8f2f2a" : "#d64541";
      ctx.fillRect(-110, -19, 220, 38);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(-110, -19, 220, 3);
      ctx.fillRect(-110, 16, 220, 3);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px 'Inter Tight', Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("S O L D", 0, 1);
      ctx.restore();
    }
  });
}

/** Modern glass curtain-wall facade with mullions and floor slabs. */
function glassTexture(floors: number, night: boolean, seed: number): THREE.CanvasTexture {
  return makeTex(`glass-${floors}-${night}-${seed}`, 256, Math.min(18, floors) * 40, (ctx) => {
    const rand = mulberry32(seed);
    const W = 256;
    const H = Math.min(18, floors) * 40;

    const grad = ctx.createLinearGradient(0, 0, W, H);
    if (night) {
      grad.addColorStop(0, "#0d1524");
      grad.addColorStop(1, "#0a1019");
    } else {
      grad.addColorStop(0, "#b9d0e2");
      grad.addColorStop(0.5, "#8fadc6");
      grad.addColorStop(1, "#6d8ba6");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // sky reflection streak
    if (!night) {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.moveTo(30, 0);
      ctx.lineTo(110, 0);
      ctx.lineTo(10, H);
      ctx.lineTo(-40, H);
      ctx.closePath();
      ctx.fill();
    }

    // lit windows at night
    const rows = Math.min(18, floors);
    if (night) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 6; c++) {
          if (rand() < 0.4) {
            ctx.fillStyle = rand() < 0.5 ? "rgba(255,214,132,0.9)" : "rgba(255,233,184,0.75)";
            ctx.fillRect(c * 42 + 6, r * 40 + 8, 32, 24);
          }
        }
      }
    }

    // floor slabs
    ctx.fillStyle = night ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.35)";
    for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * 40 - 1.5, W, 3);
    // mullions
    ctx.fillStyle = night ? "rgba(255,255,255,0.05)" : "rgba(70,90,110,0.35)";
    for (let c = 0; c <= 6; c++) ctx.fillRect(c * 42 - 1, 0, 2, H);
  });
}

function signTexture(name: string): THREE.CanvasTexture {
  return makeTex(`sign-${name}`, 1024, 128, (ctx) => {
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
  });
}

function grassTexture(night: boolean): THREE.CanvasTexture {
  const tex = makeTex(`grass-${night}`, 256, 256, (ctx) => {
    const rand = mulberry32(97531);
    ctx.fillStyle = night ? "#131d14" : "#476d3e";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const r = 6 + rand() * 22;
      ctx.fillStyle = night
        ? `rgba(${16 + rand() * 14}, ${32 + rand() * 16}, ${18 + rand() * 10}, 0.5)`
        : `rgba(${56 + rand() * 26}, ${100 + rand() * 30}, ${50 + rand() * 22}, 0.5)`;
      ctx.beginPath();
      ctx.arc(rand() * 256, rand() * 256, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(46, 46);
  return tex;
}

function paverTexture(night: boolean): THREE.CanvasTexture {
  const tex = makeTex(`paver-${night}`, 128, 128, (ctx) => {
    ctx.fillStyle = night ? "#333b47" : "#b3b6bc";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = night ? "rgba(12,16,24,0.5)" : "rgba(96,102,112,0.3)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 128; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 18);
  return tex;
}

/** Soft radial blob used as a cheap fake shadow (real shadows are disabled). */
function blobTexture(): THREE.CanvasTexture {
  return makeTex("blob", 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, "rgba(0,0,0,0.42)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/* ── Master-plan layout ───────────────────────────────────────────────────── */

interface TowerSpec { x: number; z: number; w: number; d: number; floors: number; seed: number }
interface TreeSpec { x: number; z: number; s: number }
interface PlotSpec { unit: SceneUnit; x: number; z: number; w: number; d: number; facing: string }

const FLOOR_H = 3;
const PLOT_W = 10;
const PLOT_D = 13;
const PITCH_X = 12;
const BAND_PITCH = 34;
const COLS_PER_SIDE = 4;
const PER_ROW = COLS_PER_SIDE * 2;
const MAX_PLOTS = 64;

function buildLayout(project: Project, units: SceneUnit[]) {
  const rand = mulberry32(hashSeed(project._id));

  const shown = units.slice(0, MAX_PLOTS);
  const apartments = units.filter((u) => !u.type.toLowerCase().includes("plot")).length || (units.length === 0 ? 20 : 0);

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

  const towers: TowerSpec[] = [];
  if (apartments > 0) {
    const towerCount = Math.min(6, Math.max(2, Math.ceil(apartments / 24)));
    const towersZ = plots.length ? plotsBackZ - 26 : -12;
    for (let i = 0; i < towerCount; i++) {
      const floors = Math.max(8, Math.min(18, Math.round(apartments / towerCount / 3) + 4 + Math.floor(rand() * 5)));
      towers.push({
        x: (i - (towerCount - 1) / 2) * 27 + (rand() - 0.5) * 4,
        z: towersZ - (i % 2) * 15 - rand() * 4,
        w: 10 + rand() * 3,
        d: 10 + rand() * 3,
        floors,
        seed: Math.floor(rand() * 1e9),
      });
    }
  }

  const towersBackZ = towers.length ? Math.min(...towers.map((t) => t.z)) - 16 : plotsBackZ - 8;
  const backZ = Math.min(-50, towersBackZ);
  const baseDepth = 50 - backZ;
  const baseCenterZ = (50 + backZ) / 2;

  const trees: TreeSpec[] = [];
  for (let i = 0; i < 26; i++) {
    const alongX = rand() < 0.5;
    trees.push({
      x: alongX ? -60 + rand() * 120 : (rand() < 0.5 ? -61 : 61) + (rand() - 0.5) * 4,
      z: alongX ? (rand() < 0.5 ? backZ + 3 : 46) + (rand() - 0.5) * 4 : backZ + 6 + rand() * (baseDepth - 12),
      s: 0.8 + rand() * 0.8,
    });
  }

  return { plots, crossRoadZs, towers, trees, backZ, baseDepth, baseCenterZ };
}

/* ── Clickable plot (single tile + optional gold ring) ────────────────────── */

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

  const lift = hovered || selected ? 0.55 : 0.3;

  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh
        position={[0, lift, 0]}
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
        <boxGeometry args={[spec.w, 0.6, spec.d]} />
        <meshStandardMaterial attach="material-0" color={night ? "#3c414b" : "#d9d6cf"} roughness={0.9} />
        <meshStandardMaterial attach="material-1" color={night ? "#3c414b" : "#d9d6cf"} roughness={0.9} />
        <meshStandardMaterial
          attach="material-2"
          map={cardTex}
          emissiveMap={cardTex}
          emissive="#ffffff"
          emissiveIntensity={selected ? 0.5 : hovered ? 0.32 : night ? 0.35 : 0.1}
          roughness={0.7}
        />
        <meshStandardMaterial attach="material-3" color={night ? "#2b2f37" : "#b6b3ac"} roughness={0.9} />
        <meshStandardMaterial attach="material-4" color={night ? "#3c414b" : "#d9d6cf"} roughness={0.9} />
        <meshStandardMaterial attach="material-5" color={night ? "#3c414b" : "#d9d6cf"} roughness={0.9} />
      </mesh>
      {selected && (
        <mesh ref={ringRef} position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(spec.w, spec.d) * 0.62, Math.max(spec.w, spec.d) * 0.72, 40]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* ── Architectural tower: podium + glass shaft + fins + navy crown ────────── */

function Tower({ spec, night, blob }: { spec: TowerSpec; night: boolean; blob: THREE.CanvasTexture }) {
  const h = spec.floors * FLOOR_H;
  const glass = useMemo(() => glassTexture(spec.floors, night, spec.seed), [spec, night]);
  const glassProps = {
    map: glass,
    emissiveMap: night ? glass : null,
    emissive: night ? ("#ffffff" as const) : ("#000000" as const),
    emissiveIntensity: night ? 0.7 : 0,
    roughness: 0.35,
    metalness: 0.25,
  };
  const finColor = night ? "#3a4150" : "#e8ebef";
  const podium = night ? "#3d4654" : "#c9cdd4";

  return (
    <group position={[spec.x, 0, spec.z]}>
      {/* fake soft shadow */}
      <mesh position={[1.2, 0.045, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[spec.w * 2.5, spec.d * 2.5]} />
        <meshBasicMaterial map={blob} transparent opacity={night ? 0.3 : 0.5} depthWrite={false} />
      </mesh>

      {/* podium */}
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[spec.w * 1.5, 4, spec.d * 1.5]} />
        <meshStandardMaterial color={podium} roughness={0.85} />
      </mesh>
      <mesh position={[0, 4.15, 0]}>
        <boxGeometry args={[spec.w * 1.56, 0.3, spec.d * 1.56]} />
        <meshStandardMaterial color={night ? "#2b3140" : "#9aa0aa"} roughness={0.9} />
      </mesh>

      {/* glass shaft */}
      <mesh position={[0, 4 + h / 2, 0]}>
        <boxGeometry args={[spec.w, h, spec.d]} />
        <meshStandardMaterial attach="material-0" {...glassProps} />
        <meshStandardMaterial attach="material-1" {...glassProps} />
        <meshStandardMaterial attach="material-2" color={night ? "#222834" : "#7e8994"} roughness={0.9} />
        <meshStandardMaterial attach="material-3" color={night ? "#222834" : "#7e8994"} roughness={0.9} />
        <meshStandardMaterial attach="material-4" {...glassProps} />
        <meshStandardMaterial attach="material-5" {...glassProps} />
      </mesh>

      {/* corner fins */}
      {([[-1, -1], [-1, 1], [1, -1], [1, 1]] as const).map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[(sx * spec.w) / 2, 4 + h / 2, (sz * spec.d) / 2]}>
          <boxGeometry args={[0.55, h + 0.6, 0.55]} />
          <meshStandardMaterial color={finColor} roughness={0.7} />
        </mesh>
      ))}

      {/* navy crown with gold trim */}
      <mesh position={[0, 4 + h + 0.9, 0]}>
        <boxGeometry args={[spec.w * 1.06, 1.8, spec.d * 1.06]} />
        <meshStandardMaterial color="#12263f" roughness={0.6} />
      </mesh>
      <mesh position={[0, 4 + h - 0.05, 0]}>
        <boxGeometry args={[spec.w * 1.08, 0.22, spec.d * 1.08]} />
        <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.5} emissive={GOLD} emissiveIntensity={night ? 0.7 : 0.1} />
      </mesh>
      {/* rooftop mechanical + mast */}
      <mesh position={[spec.w * 0.16, 4 + h + 2.6, spec.d * 0.1]}>
        <boxGeometry args={[2.6, 1.6, 2.6]} />
        <meshStandardMaterial color={night ? "#39404d" : "#aab1ba"} roughness={0.9} />
      </mesh>
      <mesh position={[-spec.w * 0.2, 4 + h + 3.6, -spec.d * 0.15]}>
        <cylinderGeometry args={[0.07, 0.07, 3.6, 5]} />
        <meshStandardMaterial color={night ? "#4a5261" : "#8d949e"} />
      </mesh>
    </group>
  );
}

/* ── Instanced greenery + lighting ────────────────────────────────────────── */

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
      <instancedMesh ref={trunk} args={[undefined, undefined, count] as never}>
        <cylinderGeometry args={[0.22, 0.32, 2, 6]} />
        <meshStandardMaterial color="#6b4f2e" />
      </instancedMesh>
      <instancedMesh ref={lower} args={[undefined, undefined, count] as never}>
        <coneGeometry args={[1.5, 2.6, 7]} />
        <meshStandardMaterial color={night ? "#1c3a24" : "#2f6b3a"} />
      </instancedMesh>
      <instancedMesh ref={upper} args={[undefined, undefined, count] as never}>
        <coneGeometry args={[1.05, 2, 7]} />
        <meshStandardMaterial color={night ? "#24482c" : "#3a7d45"} />
      </instancedMesh>
    </group>
  );
}

const LAMP_SPOTS: Array<[number, number]> = [
  [-55, 51], [-33, 51], [-11, 51], [11, 51], [33, 51], [55, 51],
  [-6, 22], [6, -2], [-6, -26],
];

function Lamps({ night }: { night: boolean }) {
  const poles = useRef<THREE.InstancedMesh>(null);
  const bulbs = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    LAMP_SPOTS.forEach(([x, z], i) => {
      dummy.position.set(x, 2.6, z);
      dummy.updateMatrix();
      poles.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 5.3, z);
      dummy.updateMatrix();
      bulbs.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const ref of [poles, bulbs]) {
      if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    }
  }, []);

  return (
    <group>
      <instancedMesh ref={poles} args={[undefined, undefined, LAMP_SPOTS.length] as never}>
        <cylinderGeometry args={[0.09, 0.12, 5.2, 6]} />
        <meshStandardMaterial color="#334155" />
      </instancedMesh>
      <instancedMesh ref={bulbs} args={[undefined, undefined, LAMP_SPOTS.length] as never}>
        <sphereGeometry args={[0.35, 8, 8]} />
        <meshStandardMaterial color="#fde68a" emissive="#ffb84d" emissiveIntensity={night ? 3.2 : 0.8} />
      </instancedMesh>
      {night && (
        <>
          <pointLight position={[-33, 6, 51]} color="#ffca7a" intensity={60} distance={42} decay={2} />
          <pointLight position={[33, 6, 51]} color="#ffca7a" intensity={60} distance={42} decay={2} />
          <pointLight position={[0, 8, 44]} color="#ffdca3" intensity={70} distance={55} decay={2} />
          <pointLight position={[0, 7, 0]} color="#ffca7a" intensity={55} distance={50} decay={2} />
        </>
      )}
    </group>
  );
}

/** Landscaped roundabout with a fountain where the spine meets the entry. */
function Roundabout({ night }: { night: boolean }) {
  const water = night ? "#0e5f86" : "#38bdf8";
  return (
    <group position={[0, 0, 41]}>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5, 8.6, 36]} />
        <meshStandardMaterial color={night ? "#22262d" : "#3d424b"} roughness={1} />
      </mesh>
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5, 32]} />
        <meshStandardMaterial color={night ? "#1c3222" : "#3f7d48"} roughness={1} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.4, 28]} />
        <meshStandardMaterial color={water} roughness={0.1} metalness={0.3} emissive={night ? "#0ea5e9" : "#000000"} emissiveIntensity={night ? 0.35 : 0} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.5, 0.75, 1.3, 10]} />
        <meshStandardMaterial color={night ? "#8b93a0" : "#e5e8ec"} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.34, 10, 10]} />
        <meshStandardMaterial color={water} roughness={0.2} emissive={night ? "#38bdf8" : "#000000"} emissiveIntensity={night ? 0.5 : 0} />
      </mesh>
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
  const blob = useMemo(() => blobTexture(), []);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // PerformanceMonitor drops resolution on weak GPUs instead of stuttering.
  const [dprMax, setDprMax] = useState(1.35);

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
      dpr={[0.75, dprMax]}
      camera={{ position: PRESET_POS.default, fov: 50, near: 0.5, far: 900 }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onPointerMissed={() => onSelectPlot(null)}
    >
      <PerformanceMonitor onDecline={() => setDprMax(1)} onIncline={() => setDprMax(1.5)}>
        <AdaptiveDpr pixelated />
        {night ? (
          <>
            <color attach="background" args={["#070d1d"]} />
            <Stars radius={320} depth={60} count={2200} factor={4.2} saturation={0} fade speed={0.6} />
            <ambientLight intensity={0.18} color="#9db4ff" />
            <directionalLight position={[-70, 90, 40]} intensity={0.35} color="#8fa8e8" />
          </>
        ) : (
          <>
            <Sky distance={4500} sunPosition={[110, 55, -60]} turbidity={4.5} rayleigh={1.6} />
            <hemisphereLight intensity={0.55} color="#eaf2ff" groundColor="#5c7350" />
            <ambientLight intensity={0.35} />
            <directionalLight position={[90, 110, -60]} intensity={1.7} color="#fff3dd" />
          </>
        )}
        <fog attach="fog" args={[fogColor, night ? 160 : 240, night ? 480 : 680]} />

        {/* Lawn */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[900, 900]} />
          <meshStandardMaterial map={grass} roughness={1} />
        </mesh>

        {/* Township base — paved blocks */}
        <mesh position={[0, 0.02, baseCenterZ]}>
          <boxGeometry args={[132, 0.08, baseDepth]} />
          <meshStandardMaterial map={paver} roughness={0.95} />
        </mesh>

        {/* Boundary walls */}
        {[-66, 66].map((x) => (
          <mesh key={`wx${x}`} position={[x, 1, baseCenterZ]}>
            <boxGeometry args={[0.6, 2, baseDepth]} />
            <meshStandardMaterial color={wall} roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 1, backZ]}>
          <boxGeometry args={[132, 2, 0.6]} />
          <meshStandardMaterial color={wall} roughness={0.9} />
        </mesh>
        {[[-39.5, 53] as const, [39.5, 53] as const].map(([x, w], i) => (
          <mesh key={`fw${i}`} position={[x, 1, 50]}>
            <boxGeometry args={[w, 2, 0.6]} />
            <meshStandardMaterial color={wall} roughness={0.9} />
          </mesh>
        ))}

        {/* Entrance gate with project sign */}
        {[-13, 13].map((x) => (
          <mesh key={`gp${x}`} position={[x, 2.4, 50]}>
            <boxGeometry args={[1.6, 4.8, 1.6]} />
            <meshStandardMaterial color={night ? "#565c66" : "#8a8f98"} />
          </mesh>
        ))}
        <mesh position={[0, 5.1, 50]}>
          <boxGeometry args={[27.6, 2.6, 1.8]} />
          <meshStandardMaterial attach="material-0" color="#10233f" />
          <meshStandardMaterial attach="material-1" color="#10233f" />
          <meshStandardMaterial attach="material-2" color="#10233f" />
          <meshStandardMaterial attach="material-3" color="#10233f" />
          <meshStandardMaterial attach="material-4" map={sign} emissiveMap={night ? sign : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.8 : 0} />
          <meshStandardMaterial attach="material-5" map={sign} emissiveMap={night ? sign : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.8 : 0} />
        </mesh>

        {/* Front road with markings */}
        <mesh position={[0, 0.01, 56]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[180, 8]} />
          <meshStandardMaterial color={night ? "#1c2027" : "#31353c"} roughness={1} />
        </mesh>
        {Array.from({ length: 16 }, (_, i) => -72 + i * 9.5).map((x) => (
          <mesh key={x} position={[x, 0.05, 56]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[4, 0.5]} />
            <meshStandardMaterial color={night ? "#8b94a3" : "#e8edf3"} />
          </mesh>
        ))}

        {/* Central spine road + sidewalks */}
        <mesh position={[0, 0.05, 50 - spineLen / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, spineLen]} />
          <meshStandardMaterial color={night ? "#22262d" : "#3d424b"} roughness={1} />
        </mesh>
        {[-4.9, 4.9].map((x) => (
          <mesh key={`sw${x}`} position={[x, 0.055, 50 - spineLen / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.4, spineLen]} />
            <meshStandardMaterial color={night ? "#454c58" : "#c6ccd4"} roughness={1} />
          </mesh>
        ))}

        {/* Cross roads with sidewalks */}
        {layout.crossRoadZs.map((z) => (
          <group key={`cr${z}`}>
            <mesh position={[0, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[112, 6]} />
              <meshStandardMaterial color={night ? "#22262d" : "#3d424b"} roughness={1} />
            </mesh>
            {[-3.7, 3.7].map((dz) => (
              <mesh key={`crs${dz}`} position={[0, 0.045, z + dz]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[112, 1.2]} />
                <meshStandardMaterial color={night ? "#454c58" : "#c6ccd4"} roughness={1} />
              </mesh>
            ))}
          </group>
        ))}

        <Roundabout night={night} />

        {/* Numbered plots — lawn tiles / SOLD tiles */}
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

        {layout.towers.map((t, i) => <Tower key={`${i}-${night}`} spec={t} night={night} blob={blob} />)}
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
              regress
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
      </PerformanceMonitor>
    </Canvas>
  );
}
