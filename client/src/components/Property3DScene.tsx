import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PointerLockControls, Sky, Stars } from "@react-three/drei";
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

/* ── Baked textures (one canvas per facade — replaces hundreds of meshes) ─── */

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

/* ── Scene layout derived from the project's real unit mix ────────────────── */

interface TowerSpec { x: number; z: number; w: number; d: number; floors: number; color: string; seed: number }
interface TreeSpec { x: number; z: number; s: number }
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
  if (apartments === 0 && plotUnits === 0) apartments = 20;

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
        seed: Math.floor(rand() * 1e9),
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
  for (let i = 0; i < 30; i++) {
    const edge = rand();
    trees.push({
      x: edge < 0.5 ? -62 + rand() * 124 : (rand() < 0.5 ? -62 : 62) + (rand() - 0.5) * 6,
      z: edge < 0.5 ? (rand() < 0.5 ? -46 : 46) + (rand() - 0.5) * 6 : -46 + rand() * 92,
      s: 0.8 + rand() * 0.8,
    });
  }

  return { towers, parcels, trees };
}

/* ── Mesh pieces ───────────────────────────────────────────────────────────── */

function Tower({ spec, night }: { spec: TowerSpec; night: boolean }) {
  const h = spec.floors * FLOOR_H;
  const tex = useMemo(() => facadeTexture(spec.color, spec.floors, night, spec.seed), [spec, night]);
  const plain = night ? shade(spec.color, 0.25) : spec.color;

  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[spec.w, h, spec.d]} />
        {/* +x, -x sides */}
        <meshStandardMaterial attach="material-0" map={tex} emissiveMap={night ? tex : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.65 : 0} roughness={0.85} />
        <meshStandardMaterial attach="material-1" map={tex} emissiveMap={night ? tex : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.65 : 0} roughness={0.85} />
        {/* roof / base */}
        <meshStandardMaterial attach="material-2" color={plain} roughness={0.95} />
        <meshStandardMaterial attach="material-3" color={plain} roughness={0.95} />
        {/* +z, -z sides */}
        <meshStandardMaterial attach="material-4" map={tex} emissiveMap={night ? tex : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.65 : 0} roughness={0.85} />
        <meshStandardMaterial attach="material-5" map={tex} emissiveMap={night ? tex : null} emissive={night ? "#ffffff" : "#000000"} emissiveIntensity={night ? 0.65 : 0} roughness={0.85} />
      </mesh>
      <mesh position={[0, h + 0.35, 0]} castShadow>
        <boxGeometry args={[spec.w * 1.04, 0.7, spec.d * 1.04]} />
        <meshStandardMaterial color={night ? "#3d4654" : "#94a3b8"} roughness={0.9} />
      </mesh>
      <mesh position={[spec.w * 0.18, h + 1.6, spec.d * 0.12]} castShadow>
        <boxGeometry args={[3, 2.4, 3]} />
        <meshStandardMaterial color={plain} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** All trees drawn as 3 instanced meshes (trunks + two foliage cones). */
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
  const xs = [-55, -33, -11, 11, 33, 55];
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, 0, 51]}>
          <mesh position={[0, 2.6, 0]}>
            <cylinderGeometry args={[0.09, 0.12, 5.2, 6]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[0, 5.3, 0]}>
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshStandardMaterial
              color="#fde68a"
              emissive="#ffb84d"
              emissiveIntensity={night ? 3.2 : 0.8}
            />
          </mesh>
        </group>
      ))}
      {/* Real light pools at night — kept to a handful for performance */}
      {night && (
        <>
          <pointLight position={[-33, 6, 51]} color="#ffca7a" intensity={60} distance={42} decay={2} />
          <pointLight position={[33, 6, 51]} color="#ffca7a" intensity={60} distance={42} decay={2} />
          <pointLight position={[0, 8, 46]} color="#ffdca3" intensity={70} distance={55} decay={2} />
        </>
      )}
    </group>
  );
}

function Parcel({ spec, night }: { spec: ParcelSpec; night: boolean }) {
  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[spec.w, 0.06, spec.d]} />
        <meshStandardMaterial color={night ? "#33482c" : "#7a9c68"} roughness={1} />
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * spec.w) / 2, 0.45, (sz * spec.d) / 2]}>
            <boxGeometry args={[0.18, 0.9, 0.18]} />
            <meshStandardMaterial color={night ? "#7c8494" : "#e2e8f0"} />
          </mesh>
        )),
      )}
      {spec.hasHouse && (
        <group>
          <mesh position={[0, 1.1, 0]} castShadow>
            <boxGeometry args={[4.4, 2.2, 5]} />
            <meshStandardMaterial
              color={night ? "#4d463a" : "#e6dcc8"}
              emissive={night ? "#ffca7a" : "#000000"}
              emissiveIntensity={night ? 0.18 : 0}
            />
          </mesh>
          <mesh position={[0, 2.85, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[3.6, 1.6, 4]} />
            <meshStandardMaterial color={night ? "#4a2a20" : "#9a4a32"} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ── Camera: orbit presets + first-person walk mode ───────────────────────── */

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

const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/** First-person WASD exploration with pointer-lock mouse look. */
function WalkControls({ onExit }: { onExit: () => void }) {
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
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -56, 84);
    camera.position.y = 2.2; // eye height — stay on the ground like a game
  });

  return <PointerLockControls makeDefault onUnlock={onExit} />;
}

/* ── Public component ─────────────────────────────────────────────────────── */

export default function Property3DScene({
  project,
  unitSummary,
  preset,
  presetTrigger,
  autoRotate,
  night,
  walk,
  onExitWalk,
}: {
  project: Project;
  unitSummary: UnitSummary | null;
  preset: ScenePreset;
  presetTrigger: number;
  autoRotate: boolean;
  night: boolean;
  walk: boolean;
  onExitWalk: () => void;
}) {
  const layout = useMemo(() => buildLayout(project, unitSummary), [project, unitSummary]);
  const sign = useMemo(() => signTexture(project.name), [project.name]);

  const fogColor = night ? "#070d1d" : "#cfd9e4";

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: PRESET_POS.default, fov: 50, near: 0.5, far: 900 }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
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
          <Sky distance={4500} sunPosition={[120, 65, -80]} turbidity={6} rayleigh={2.2} />
          <ambientLight intensity={0.55} />
          <directionalLight
            position={[90, 110, -60]}
            intensity={1.6}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-120}
            shadow-camera-right={120}
            shadow-camera-top={120}
            shadow-camera-bottom={-120}
          />
        </>
      )}
      <fog attach="fog" args={[fogColor, night ? 160 : 220, night ? 480 : 620]} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color={night ? "#16241a" : "#4c7a45"} roughness={1} />
      </mesh>

      {/* Township plot base */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[132, 0.08, 100]} />
        <meshStandardMaterial color={night ? "#333b47" : "#8d9aa8"} roughness={0.95} />
      </mesh>

      {/* Boundary walls */}
      {([[-66, 0, 0.6, 100] as const, [66, 0, 0.6, 100] as const]).map(([x, z, w, d], i) => (
        <mesh key={`wx${i}`} position={[x, 1, z]} castShadow>
          <boxGeometry args={[w, 2, d]} />
          <meshStandardMaterial color={night ? "#4c525e" : "#c9ccd2"} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 1, -50]} castShadow>
        <boxGeometry args={[132, 2, 0.6]} />
        <meshStandardMaterial color={night ? "#4c525e" : "#c9ccd2"} roughness={0.9} />
      </mesh>
      {[[-39.5, 53] as const, [39.5, 53] as const].map(([x, w], i) => (
        <mesh key={`fw${i}`} position={[x, 1, 50]} castShadow>
          <boxGeometry args={[w, 2, 0.6]} />
          <meshStandardMaterial color={night ? "#4c525e" : "#c9ccd2"} roughness={0.9} />
        </mesh>
      ))}

      {/* Gate: pillars + arch carrying the project name */}
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

      {/* Roads */}
      <mesh position={[0, 0.01, 56]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[180, 8]} />
        <meshStandardMaterial color={night ? "#1c2027" : "#3b4048"} roughness={1} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => -72 + i * 9.5).map((x) => (
        <mesh key={x} position={[x, 0.05, 56]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, 0.5]} />
          <meshStandardMaterial color={night ? "#8b94a3" : "#e2e8f0"} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 24]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[7, 52]} />
        <meshStandardMaterial color={night ? "#262b33" : "#4a505a"} roughness={1} />
      </mesh>

      {/* Clubhouse + pool */}
      <group position={[42, 0, 30]}>
        <mesh position={[0, 2, 0]} castShadow>
          <boxGeometry args={[14, 4, 9]} />
          <meshStandardMaterial
            color={night ? "#4d4639" : "#dbcfb6"}
            emissive={night ? "#ffca7a" : "#000000"}
            emissiveIntensity={night ? 0.22 : 0}
          />
        </mesh>
        <mesh position={[0, 4.4, 0]} castShadow>
          <boxGeometry args={[15, 0.8, 10]} />
          <meshStandardMaterial color={night ? "#3a414c" : "#7c8794"} />
        </mesh>
        <mesh position={[0, 0.08, 11]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[11, 6]} />
          <meshStandardMaterial
            color={night ? "#0e5f86" : "#38bdf8"}
            roughness={0.12}
            metalness={0.3}
            emissive={night ? "#0ea5e9" : "#000000"}
            emissiveIntensity={night ? 0.35 : 0}
          />
        </mesh>
      </group>

      {layout.towers.map((t, i) => <Tower key={`${i}-${night}`} spec={t} night={night} />)}
      {layout.parcels.map((p, i) => <Parcel key={i} spec={p} night={night} />)}
      <Trees specs={layout.trees} night={night} />
      <Lamps night={night} />

      {walk ? (
        <WalkControls onExit={onExitWalk} />
      ) : (
        <>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            autoRotate={autoRotate}
            autoRotateSpeed={0.6}
            minDistance={6}
            maxDistance={280}
            maxPolarAngle={Math.PI / 2 - 0.04}
          />
          <CameraRig preset={preset} trigger={presetTrigger} />
        </>
      )}
    </Canvas>
  );
}
