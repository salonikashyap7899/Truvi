import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { Project } from "@/types";

export interface UnitSummary {
  total: number;
  available: number;
  byType: Record<string, number>;
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

/* ── Scene layout derived from the project's real unit mix ────────────────── */

interface TowerSpec {
  x: number; z: number; w: number; d: number;
  floors: number; color: string;
}
interface TreeSpec { x: number; z: number; s: number }
interface LampSpec { x: number; z: number }
interface ParcelSpec { x: number; z: number; w: number; d: number; hasHouse: boolean }

const FACADES = ["#d8dee9", "#e6dcc8", "#cdd8e3", "#d9d3c4", "#c8d2cb"];
const FLOOR_H = 3;

function buildLayout(project: Project, summary: UnitSummary | null) {
  const rand = mulberry32(hashSeed(project._id));

  const byType = summary?.byType ?? {};
  let apartments = 0;
  let plotUnits = 0;
  for (const [type, count] of Object.entries(byType)) {
    if (type.toLowerCase().includes("plot")) plotUnits += count;
    else apartments += count;
  }
  if (apartments === 0 && plotUnits === 0) apartments = 20; // sensible default

  const towers: TowerSpec[] = [];
  if (apartments > 0) {
    const towerCount = Math.min(9, Math.max(2, Math.ceil(apartments / 22)));
    const cols = Math.ceil(Math.sqrt(towerCount));
    const spacing = 26;
    for (let i = 0; i < towerCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const floors = Math.max(6, Math.min(18, Math.round(apartments / towerCount / 3) + Math.floor(rand() * 5)));
      towers.push({
        x: (col - (cols - 1) / 2) * spacing + (rand() - 0.5) * 5,
        z: (row - (Math.ceil(towerCount / cols) - 1) / 2) * spacing - 8 + (rand() - 0.5) * 4,
        w: 9 + rand() * 4,
        d: 9 + rand() * 4,
        floors,
        color: FACADES[Math.floor(rand() * FACADES.length)],
      });
    }
  }

  const parcels: ParcelSpec[] = [];
  if (plotUnits > 0) {
    const count = Math.min(12, plotUnits);
    for (let i = 0; i < count; i++) {
      parcels.push({
        x: -52 + (i % 4) * 11,
        z: 26 + Math.floor(i / 4) * 13,
        w: 9, d: 11,
        hasHouse: rand() > 0.6,
      });
    }
  }

  const trees: TreeSpec[] = [];
  for (let i = 0; i < 34; i++) {
    const edge = rand();
    trees.push({
      x: edge < 0.5 ? -62 + rand() * 124 : (rand() < 0.5 ? -62 : 62) + (rand() - 0.5) * 6,
      z: edge < 0.5 ? (rand() < 0.5 ? -46 : 46) + (rand() - 0.5) * 6 : -46 + rand() * 92,
      s: 0.8 + rand() * 0.8,
    });
  }

  const lamps: LampSpec[] = [];
  for (let i = 0; i < 6; i++) lamps.push({ x: -55 + i * 22, z: 51 });

  return { towers, parcels, trees, lamps };
}

/* ── Mesh pieces ───────────────────────────────────────────────────────────── */

function Tower({ spec }: { spec: TowerSpec }) {
  const h = spec.floors * FLOOR_H;
  const strips = useMemo(() => Array.from({ length: spec.floors }, (_, i) => i), [spec.floors]);
  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[spec.w, h, spec.d]} />
        <meshStandardMaterial color={spec.color} roughness={0.85} />
      </mesh>
      {/* window bands per floor */}
      {strips.map((i) => (
        <mesh key={i} position={[0, i * FLOOR_H + FLOOR_H * 0.55, 0]}>
          <boxGeometry args={[spec.w * 0.96, FLOOR_H * 0.42, spec.d + 0.06]} />
          <meshStandardMaterial color="#27364a" roughness={0.25} metalness={0.5} />
        </mesh>
      ))}
      {/* roof cabin + parapet */}
      <mesh position={[0, h + 0.35, 0]} castShadow>
        <boxGeometry args={[spec.w * 1.04, 0.7, spec.d * 1.04]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.9} />
      </mesh>
      <mesh position={[spec.w * 0.18, h + 1.6, spec.d * 0.12]} castShadow>
        <boxGeometry args={[3, 2.4, 3]} />
        <meshStandardMaterial color={spec.color} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Tree({ spec }: { spec: TreeSpec }) {
  return (
    <group position={[spec.x, 0, spec.z]} scale={spec.s}>
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 2, 6]} />
        <meshStandardMaterial color="#6b4f2e" />
      </mesh>
      <mesh position={[0, 2.8, 0]} castShadow>
        <coneGeometry args={[1.5, 2.6, 8]} />
        <meshStandardMaterial color="#2f6b3a" />
      </mesh>
      <mesh position={[0, 4.1, 0]} castShadow>
        <coneGeometry args={[1.05, 2, 8]} />
        <meshStandardMaterial color="#3a7d45" />
      </mesh>
    </group>
  );
}

function Lamp({ spec }: { spec: LampSpec }) {
  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 5.2, 6]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 5.3, 0]}>
        <sphereGeometry args={[0.35, 10, 10]} />
        <meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

function Parcel({ spec }: { spec: ParcelSpec }) {
  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[spec.w, 0.06, spec.d]} />
        <meshStandardMaterial color="#7a9c68" roughness={1} />
      </mesh>
      {/* fence posts */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * spec.w) / 2, 0.45, (sz * spec.d) / 2]}>
            <boxGeometry args={[0.18, 0.9, 0.18]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        )),
      )}
      {spec.hasHouse && (
        <group>
          <mesh position={[0, 1.1, 0]} castShadow>
            <boxGeometry args={[4.4, 2.2, 5]} />
            <meshStandardMaterial color="#e6dcc8" />
          </mesh>
          <mesh position={[0, 2.85, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[3.6, 1.6, 4]} />
            <meshStandardMaterial color="#9a4a32" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function RoadMarkings() {
  const dashes = useMemo(() => Array.from({ length: 16 }, (_, i) => -72 + i * 9.5), []);
  return (
    <group>
      {dashes.map((x) => (
        <mesh key={x} position={[x, 0.05, 56]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, 0.5]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
      ))}
    </group>
  );
}

/* ── Camera presets with smooth fly-to animation ──────────────────────────── */

const PRESET_POS: Record<ScenePreset, [number, number, number]> = {
  default: [70, 48, 92],
  aerial: [2, 165, 2],
  street: [4, 3.2, 68],
};

function CameraRig({ preset, trigger }: { preset: ScenePreset; trigger: number }) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  const goal = useRef(new THREE.Vector3(...PRESET_POS.default));
  const animating = useRef(false);

  useEffect(() => {
    goal.current.set(...PRESET_POS[preset]);
    animating.current = true;
  }, [preset, trigger]);

  useFrame(() => {
    if (!animating.current) return;
    camera.position.lerp(goal.current, 0.06);
    controls?.target.lerp(new THREE.Vector3(0, preset === "street" ? 12 : 0, 0), 0.06);
    controls?.update();
    if (camera.position.distanceTo(goal.current) < 0.4) animating.current = false;
  });
  return null;
}

/* ── Public component ─────────────────────────────────────────────────────── */

export default function Property3DScene({
  project,
  unitSummary,
  preset,
  presetTrigger,
  autoRotate,
}: {
  project: Project;
  unitSummary: UnitSummary | null;
  preset: ScenePreset;
  presetTrigger: number;
  autoRotate: boolean;
}) {
  const layout = useMemo(() => buildLayout(project, unitSummary), [project, unitSummary]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: PRESET_POS.default, fov: 50, near: 0.5, far: 900 }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <Sky distance={4500} sunPosition={[120, 65, -80]} turbidity={6} rayleigh={2.2} />
      <fog attach="fog" args={["#cfd9e4", 220, 620]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[90, 110, -60]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
      />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color="#4c7a45" roughness={1} />
      </mesh>

      {/* Township plot base */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[132, 0.08, 100]} />
        <meshStandardMaterial color="#8d9aa8" roughness={0.95} />
      </mesh>

      {/* Boundary wall */}
      {([[-66, 0, 0.6, 100] as const, [66, 0, 0.6, 100] as const]).map(([x, z, w, d], i) => (
        <mesh key={`wx${i}`} position={[x, 1, z]} castShadow>
          <boxGeometry args={[w, 2, d]} />
          <meshStandardMaterial color="#c9ccd2" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 1, -50]} castShadow>
        <boxGeometry args={[132, 2, 0.6]} />
        <meshStandardMaterial color="#c9ccd2" roughness={0.9} />
      </mesh>
      {/* Front wall with a gate opening */}
      {[[-39.5, 53] as const, [39.5, 53] as const].map(([x, w], i) => (
        <mesh key={`fw${i}`} position={[x, 1, 50]} castShadow>
          <boxGeometry args={[w, 2, 0.6]} />
          <meshStandardMaterial color="#c9ccd2" roughness={0.9} />
        </mesh>
      ))}
      {/* Gate pillars + arch */}
      {[-13, 13].map((x) => (
        <mesh key={`gp${x}`} position={[x, 2.4, 50]} castShadow>
          <boxGeometry args={[1.6, 4.8, 1.6]} />
          <meshStandardMaterial color="#8a8f98" />
        </mesh>
      ))}
      <mesh position={[0, 5.1, 50]} castShadow>
        <boxGeometry args={[27.6, 1.4, 1.8]} />
        <meshStandardMaterial color="#1e3a5f" />
      </mesh>

      {/* Main road in front */}
      <mesh position={[0, 0.01, 56]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[180, 8]} />
        <meshStandardMaterial color="#3b4048" roughness={1} />
      </mesh>
      <RoadMarkings />
      {/* Internal driveway from the gate */}
      <mesh position={[0, 0.06, 24]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[7, 52]} />
        <meshStandardMaterial color="#4a505a" roughness={1} />
      </mesh>

      {/* Clubhouse + pool */}
      <group position={[42, 0, 30]}>
        <mesh position={[0, 2, 0]} castShadow>
          <boxGeometry args={[14, 4, 9]} />
          <meshStandardMaterial color="#dbcfb6" />
        </mesh>
        <mesh position={[0, 4.4, 0]} castShadow>
          <boxGeometry args={[15, 0.8, 10]} />
          <meshStandardMaterial color="#7c8794" />
        </mesh>
        <mesh position={[0, 0.08, 11]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[11, 6]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.15} metalness={0.2} />
        </mesh>
      </group>

      {layout.towers.map((t, i) => <Tower key={i} spec={t} />)}
      {layout.parcels.map((p, i) => <Parcel key={i} spec={p} />)}
      {layout.trees.map((t, i) => <Tree key={i} spec={t} />)}
      {layout.lamps.map((l, i) => <Lamp key={i} spec={l} />)}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        minDistance={6}
        maxDistance={300}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
      <CameraRig preset={preset} trigger={presetTrigger} />
    </Canvas>
  );
}
