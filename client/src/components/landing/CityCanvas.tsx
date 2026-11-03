import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { SilentErrorBoundary } from "@/components/SilentErrorBoundary";

type TowerSpec = { x: number; z: number; width: number; depth: number; height: number };
type HomeSpec = { x: number; z: number; width: number; depth: number; height: number };
type InstanceSpec = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string };

const TOWERS: TowerSpec[] = [
  { x: 14, z: -59, width: 8, depth: 7, height: 18 },
  { x: 27, z: -65, width: 8, depth: 7, height: 29 },
  { x: 40, z: -59, width: 8, depth: 7, height: 32 },
  { x: 53, z: -63, width: 8, depth: 7, height: 25 },
  { x: 65, z: -54, width: 7, depth: 6, height: 17 },
  { x: 29, z: -39, width: 8, depth: 7, height: 13 },
  { x: 51, z: -38, width: 7, depth: 6, height: 12 },
];

const HOME_COORDINATES = [-34, -13, 13, 34];
const HOME_ROWS = [-13, 7, 29];
const HOMES: HomeSpec[] = HOME_ROWS.flatMap((z, row) =>
  HOME_COORDINATES.map((x, column) => ({
    x,
    z,
    width: 4.1 + ((row + column) % 3) * 0.12,
    depth: 3.8,
    height: 2.4 + ((row * 3 + column) % 2) * 0.25,
  })),
);

const HORIZONTAL_ROADS = [-44, -22, 0, 22, 44];
const VERTICAL_ROADS = [-42, -21, 0, 21, 42];
const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const IS_MOBILE =
  typeof window !== "undefined" &&
  (window.innerWidth < 768 || window.matchMedia?.("(pointer: coarse)").matches === true);

function seeded(x: number, z = 0): number {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function makeTowerWindows(): InstanceSpec[] {
  const windows: InstanceSpec[] = [];
  TOWERS.forEach((tower, towerIndex) => {
    let floorIndex = 0;
    for (let y = 1.25; y < tower.height - 0.7; y += 1.5) {
      for (const column of [-0.29, 0, 0.29]) {
        const noise = seeded(towerIndex * 31 + floorIndex * 7, column * 100);
        if (noise > 0.31) {
          windows.push({
            x: tower.x + tower.width * column,
            y,
            z: tower.z + tower.depth / 2 + 0.06,
            sx: 0.58,
            sy: 0.25,
            sz: 0.07,
            color: noise > 0.78 ? "#ffd18a" : "#84bfff",
          });
        }
      }
      floorIndex += 1;
    }
  });
  return windows;
}

function makeHomeWindows(): InstanceSpec[] {
  return HOMES.flatMap((home, index) =>
    [-0.72, 0.72].map((offset) => ({
      x: home.x + offset,
      y: 1.18,
      z: home.z + home.depth / 2 + 0.055,
      sx: 0.72,
      sy: 0.72,
      sz: 0.08,
      color: seeded(index, offset * 10) > 0.23 ? "#ffc982" : "#9cc8ed",
    })),
  );
}

function makeTreePositions(): { x: number; z: number; scale: number }[] {
  const trees: { x: number; z: number; scale: number }[] = [];
  for (let z = -54; z <= 50; z += 7.5) {
    for (let x = -72; x <= 72; x += 7.5) {
      const onRoad =
        HORIZONTAL_ROADS.some((road) => Math.abs(z - road) < 4.3) ||
        VERTICAL_ROADS.some((road) => Math.abs(x - road) < 4.1);
      const nearHome = HOMES.some((home) => Math.abs(x - home.x) < 4.7 && Math.abs(z - home.z) < 4.2);
      if (onRoad || nearHome || seeded(x, z) < 0.8) continue;
      trees.push({
        x: x + (seeded(z, x) - 0.5) * 1.4,
        z: z + (seeded(x + 11, z) - 0.5) * 1.4,
        scale: 0.82 + seeded(x, z + 19) * 0.72,
      });
    }
  }
  return trees;
}

const TOWER_WINDOWS = makeTowerWindows().filter((_, index) => !IS_MOBILE || index % 2 === 0);
const HOME_WINDOWS = makeHomeWindows().filter((_, index) => !IS_MOBILE || index % 2 === 0);
const TREES = makeTreePositions().filter((_, index) => !IS_MOBILE || index % 2 === 0);
const STREETLIGHTS = [
  ...HORIZONTAL_ROADS.flatMap((z) =>
    [-72, -48, -24, 24, 48, 72].flatMap((x) => [
      { x, z: z - 3.6 },
      { x, z: z + 3.6 },
    ]),
  ),
  ...VERTICAL_ROADS.flatMap((x) =>
    [-34, -12, 12, 34].flatMap((z) => [
      { x: x - 3.4, z },
      { x: x + 3.4, z },
    ]),
  ),
].filter((_, index) => !IS_MOBILE || index % 2 === 0);

function GroundAndRoads() {
  const marks = useMemo(() => {
    const items: { x: number; z: number; rotation: number }[] = [];
    HORIZONTAL_ROADS.forEach((z) => {
      for (let x = -72; x <= 72; x += 8) items.push({ x, z, rotation: 0 });
    });
    VERTICAL_ROADS.forEach((x) => {
      for (let z = -52; z <= 52; z += 8) items.push({ x, z, rotation: Math.PI / 2 });
    });
    return items;
  }, []);
  const markRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!markRef.current) return;
    const object = new THREE.Object3D();
    marks.forEach((mark, index) => {
      object.position.set(mark.x, -0.02, mark.z);
      object.rotation.set(-Math.PI / 2, 0, mark.rotation);
      object.updateMatrix();
      markRef.current?.setMatrixAt(index, object.matrix);
    });
    markRef.current.instanceMatrix.needsUpdate = true;
  }, [marks]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]}>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#091522" roughness={0.98} metalness={0.02} />
      </mesh>
      {HORIZONTAL_ROADS.map((z) => (
        <mesh key={`h-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.105, z]}>
          <planeGeometry args={[220, 5.8]} />
          <meshStandardMaterial color="#111b2a" roughness={0.92} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
      {VERTICAL_ROADS.map((x) => (
        <mesh key={`v-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.103, 0]}>
          <planeGeometry args={[5.8, 220]} />
          <meshStandardMaterial color="#111b2a" roughness={0.92} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
      <instancedMesh ref={markRef} args={[undefined, undefined, marks.length]}>
        <boxGeometry args={[2.4, 0.025, 0.075]} />
        <meshBasicMaterial color="#d6c28d" transparent opacity={0.62} />
      </instancedMesh>
    </group>
  );
}

function TowerDistrict() {
  const buildingsRef = useRef<THREE.InstancedMesh>(null);
  const windowsRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const buildings = buildingsRef.current;
    const windows = windowsRef.current;
    if (!buildings || !windows) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    TOWERS.forEach((tower, index) => {
      object.position.set(tower.x, tower.height / 2, tower.z);
      object.scale.set(tower.width, tower.height, tower.depth);
      object.updateMatrix();
      buildings.setMatrixAt(index, object.matrix);
      color.setHSL(0.57 + seeded(index, 4) * 0.04, 0.26, 0.25 + seeded(index, 8) * 0.12);
      buildings.setColorAt(index, color);
    });
    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    TOWER_WINDOWS.forEach((item, index) => {
      object.position.set(item.x, item.y, item.z);
      object.scale.set(item.sx, item.sy, item.sz);
      object.updateMatrix();
      windows.setMatrixAt(index, object.matrix);
      color.set(item.color);
      windows.setColorAt(index, color);
    });
    windows.instanceMatrix.needsUpdate = true;
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    buildings.computeBoundingSphere();
    windows.computeBoundingSphere();
    invalidate();
  }, [invalidate]);

  return (
    <group>
      <instancedMesh ref={buildingsRef} args={[undefined, undefined, TOWERS.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#48617f" metalness={0.58} roughness={0.34} transparent opacity={0.9} />
      </instancedMesh>
      <instancedMesh ref={windowsRef} args={[undefined, undefined, TOWER_WINDOWS.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      {TOWERS.map((tower, index) => (
        <mesh key={`crown-${index}`} position={[tower.x, tower.height + 0.16, tower.z]}>
          <boxGeometry args={[tower.width + 0.55, 0.32, tower.depth + 0.55]} />
          <meshStandardMaterial color="#526c8b" metalness={0.48} roughness={0.38} transparent opacity={0.76} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function ResidentialDistrict() {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const windowRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const bodies = bodyRef.current;
    const roofs = roofRef.current;
    const windows = windowRef.current;
    if (!bodies || !roofs || !windows) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    HOMES.forEach((home, index) => {
      object.position.set(home.x, home.height / 2, home.z);
      object.scale.set(home.width, home.height, home.depth);
      object.updateMatrix();
      bodies.setMatrixAt(index, object.matrix);
      color.setHSL(0.57 + seeded(index, 2) * 0.05, 0.13, 0.68 + seeded(index, 3) * 0.12);
      bodies.setColorAt(index, color);
      object.position.set(home.x, home.height + 0.18, home.z);
      object.scale.set(home.width + 0.42, 0.36, home.depth + 0.42);
      object.updateMatrix();
      roofs.setMatrixAt(index, object.matrix);
      color.setHSL(0.59 + seeded(index, 7) * 0.04, 0.42, 0.23 + seeded(index, 9) * 0.1);
      roofs.setColorAt(index, color);
    });
    bodies.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    HOME_WINDOWS.forEach((item, index) => {
      object.position.set(item.x, item.y, item.z);
      object.scale.set(item.sx, item.sy, item.sz);
      object.updateMatrix();
      windows.setMatrixAt(index, object.matrix);
      color.set(item.color);
      windows.setColorAt(index, color);
    });
    windows.instanceMatrix.needsUpdate = true;
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    bodies.computeBoundingSphere();
    roofs.computeBoundingSphere();
    windows.computeBoundingSphere();
    invalidate();
  }, [invalidate]);

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, HOMES.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.74} metalness={0.08} transparent opacity={0.72} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={roofRef} args={[undefined, undefined, HOMES.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.56} metalness={0.2} transparent opacity={0.7} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={windowRef} args={[undefined, undefined, HOME_WINDOWS.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Greenery() {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const trunks = trunkRef.current;
    const canopies = canopyRef.current;
    if (!trunks || !canopies) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    TREES.forEach((tree, index) => {
      object.position.set(tree.x, 0.95 * tree.scale, tree.z);
      object.scale.set(0.18 * tree.scale, 1.9 * tree.scale, 0.18 * tree.scale);
      object.updateMatrix();
      trunks.setMatrixAt(index, object.matrix);
      object.position.set(tree.x, 2.15 * tree.scale, tree.z);
      object.scale.set(1.02 * tree.scale, 1.24 * tree.scale, 0.96 * tree.scale);
      object.rotation.set(0, seeded(index, 20) * Math.PI, 0);
      object.updateMatrix();
      canopies.setMatrixAt(index, object.matrix);
      color.setHSL(0.39 + seeded(index, 4) * 0.08, 0.48, 0.23 + seeded(index, 5) * 0.12);
      canopies.setColorAt(index, color);
    });
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    invalidate();
  }, [invalidate]);

  if (!TREES.length) return null;
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, TREES.length]}>
        <cylinderGeometry args={[0.13, 0.2, 1, 6]} />
        <meshStandardMaterial color="#564539" roughness={0.92} transparent opacity={0.58} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, TREES.length]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#ffffff" roughness={0.94} transparent opacity={0.4} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

function StreetLighting() {
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const bulbRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const poles = poleRef.current;
    const arms = armRef.current;
    const bulbs = bulbRef.current;
    if (!poles || !arms || !bulbs) return;
    const object = new THREE.Object3D();
    STREETLIGHTS.forEach((light, index) => {
      object.position.set(light.x, 1.95, light.z);
      object.scale.set(1, 1, 1);
      object.rotation.set(0, 0, 0);
      object.updateMatrix();
      poles.setMatrixAt(index, object.matrix);
      object.position.set(light.x + 0.42, 3.76, light.z);
      object.scale.set(1, 1, 1);
      object.rotation.set(0, 0, 0);
      object.updateMatrix();
      arms.setMatrixAt(index, object.matrix);
      object.position.set(light.x + 0.86, 3.75, light.z);
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      bulbs.setMatrixAt(index, object.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [invalidate]);

  return (
    <group>
      <instancedMesh ref={poleRef} args={[undefined, undefined, STREETLIGHTS.length]}>
        <cylinderGeometry args={[0.055, 0.075, 3.9, 6]} />
        <meshStandardMaterial color="#526071" metalness={0.58} roughness={0.48} />
      </instancedMesh>
      <instancedMesh ref={armRef} args={[undefined, undefined, STREETLIGHTS.length]}>
        <boxGeometry args={[0.9, 0.1, 0.1]} />
        <meshStandardMaterial color="#526071" metalness={0.58} roughness={0.48} />
      </instancedMesh>
      <instancedMesh ref={bulbRef} args={[undefined, undefined, STREETLIGHTS.length]}>
        <sphereGeometry args={[0.13, 8, 8]} />
        <meshBasicMaterial color="#ffd18b" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

type LightingProfile = {
  phase: "dawn" | "day" | "dusk" | "night";
  background: string;
  fog: string;
  sky: string;
  ground: string;
  sun: string;
  sunIntensity: number;
  ambientIntensity: number;
  blueIntensity: number;
  tealIntensity: number;
};

function getLightingProfile(date: Date): LightingProfile {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 5 && hour < 8) {
    return {
      phase: "dawn",
      background: "#17243b",
      fog: "#17243b",
      sky: "#a8b7d2",
      ground: "#171d2d",
      sun: "#ffc27d",
      sunIntensity: 1.45,
      ambientIntensity: 0.44,
      blueIntensity: 18,
      tealIntensity: 8,
    };
  }
  if (hour >= 8 && hour < 17) {
    return {
      phase: "day",
      background: "#173555",
      fog: "#173555",
      sky: "#d7e7ff",
      ground: "#344457",
      sun: "#fff0ca",
      sunIntensity: 2.15,
      ambientIntensity: 0.72,
      blueIntensity: 8,
      tealIntensity: 4,
    };
  }
  if (hour >= 17 && hour < 20) {
    return {
      phase: "dusk",
      background: "#241c34",
      fog: "#241c34",
      sky: "#e6a17f",
      ground: "#1a1527",
      sun: "#ff956d",
      sunIntensity: 1.3,
      ambientIntensity: 0.38,
      blueIntensity: 22,
      tealIntensity: 12,
    };
  }
  return {
    phase: "night",
    background: "#050a16",
    fog: "#050a16",
    sky: "#5f75a0",
    ground: "#070c18",
    sun: "#6f8fff",
    sunIntensity: 0.62,
    ambientIntensity: 0.22,
    blueIntensity: 28,
    tealIntensity: 10,
  };
}

function TimeAwareLighting() {
  const [profile, setProfile] = useState<LightingProfile>(() => getLightingProfile(new Date()));

  useEffect(() => {
    const update = () => setProfile(getLightingProfile(new Date()));
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <color attach="background" args={[profile.background]} />
      <fog attach="fog" args={[profile.fog, 78, 190]} />
      <hemisphereLight args={[profile.sky, profile.ground, profile.ambientIntensity + 0.42]} />
      <ambientLight intensity={profile.ambientIntensity} />
      <directionalLight position={[-24, 36, 16]} intensity={profile.sunIntensity} color={profile.sun} />
      <pointLight position={[0, 16, 8]} intensity={profile.blueIntensity} color="#496fbb" distance={120} decay={2} />
      <pointLight position={[-36, 7, -40]} intensity={profile.tealIntensity} color="#14b8a6" distance={90} decay={2} />
    </>
  );
}

function Scene() {
  const sceneRef = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    camera.position.set(0, 23, 54);
    camera.lookAt(0, 7.5, -16);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate]);

  useEffect(() => {
    if (REDUCED_MOTION) return;

    const syncScrollRotation = () => {
      const scene = sceneRef.current;
      if (!scene) return;
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
      scene.rotation.y = progress * 0.42;
      scene.rotation.x = progress * 0.045;
      invalidate();
    };

    syncScrollRotation();
    window.addEventListener("scroll", syncScrollRotation, { passive: true });
    window.addEventListener("resize", syncScrollRotation, { passive: true });
    return () => {
      window.removeEventListener("scroll", syncScrollRotation);
      window.removeEventListener("resize", syncScrollRotation);
    };
  }, [invalidate]);

  return (
    <>
      <TimeAwareLighting />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        minAzimuthAngle={-0.62}
        maxAzimuthAngle={0.62}
        minPolarAngle={Math.PI * 0.36}
        maxPolarAngle={Math.PI * 0.55}
        target={[0, 7.5, -16]}
      />
      <group ref={sceneRef}>
        <GroundAndRoads />
        <TowerDistrict />
        <ResidentialDistrict />
        <Greenery />
        <StreetLighting />
      </group>
    </>
  );
}

function ThrottledFrames({ fps = 30 }: { fps?: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (REDUCED_MOTION) return;
    let frame = 0;
    let last = 0;
    const interval = 1000 / fps;
    const tick = (time: number) => {
      frame = 0;
      if (document.hidden) return;
      if (time - last >= interval) {
        last = time;
        invalidate();
      }
      frame = window.requestAnimationFrame(tick);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      invalidate();
      if (!frame) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fps, invalidate]);
  return null;
}

export function CityCanvas() {
  return (
    <div className="city-canvas-layer absolute inset-0 z-0" aria-hidden="true">
      <SilentErrorBoundary
        fallback={null}
      >
        <Canvas
          frameloop="demand"
          shadows={false}
          dpr={IS_MOBILE ? [0.75, 1] : [1, 1.35]}
          gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
          onCreated={({ gl }) => gl.setClearColor("#000000", 0)}
          camera={{ position: [0, 23, 54], fov: IS_MOBILE ? 48 : 43, near: 0.1, far: 340 }}
        >
          {!REDUCED_MOTION && <ThrottledFrames fps={IS_MOBILE ? 18 : 30} />}
          <Scene />
        </Canvas>
      </SilentErrorBoundary>
    </div>
  );
}
