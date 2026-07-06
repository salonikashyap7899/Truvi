import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Fixed, pointer-transparent 3D backdrop shared by every page except the
 * landing page (which renders the richer scroll-driven CityCanvas scene).
 *
 * A quiet night-time cityscape in the site's palette: instanced tower
 * blocks, small homes with pyramid roofs on the outskirts, and glowing
 * plot outlines on the ground — no starfield, no particle sparkles.
 * Deliberately light: instanced meshes, no shadows, few draw calls.
 */

const TOWER_COUNT = 110;
const HOME_COUNT = 34;

function Towers() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const data = useMemo(() => {
    const arr: { x: number; z: number; h: number; w: number; hue: number }[] = [];
    for (let i = 0; i < TOWER_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 8 + Math.random() * 48;
      arr.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        h: 2 + Math.random() * 14,
        w: 0.9 + Math.random() * 1.3,
        hue: Math.random(),
      });
    }
    return arr;
  }, []);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    data.forEach((d, i) => {
      dummy.position.set(d.x, d.h / 2, d.z);
      dummy.scale.set(d.w, d.h, d.w);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      // Same blue band as the landing CityCanvas
      color.setHSL(0.58 + d.hue * 0.08, 0.45, 0.16 + d.hue * 0.18);
      meshRef.current!.setColorAt(i, color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [data]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TOWER_COUNT]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial metalness={0.8} roughness={0.3} />
    </instancedMesh>
  );
}

/** Small homes — cube base + pyramid roof — scattered on the outskirts. */
function Homes() {
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);

  const data = useMemo(() => {
    const arr: { x: number; z: number; s: number; rot: number }[] = [];
    for (let i = 0; i < HOME_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 34;
      arr.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        s: 0.9 + Math.random() * 0.8,
        rot: Math.random() * Math.PI,
      });
    }
    return arr;
  }, []);

  useLayoutEffect(() => {
    if (!baseRef.current || !roofRef.current) return;
    const dummy = new THREE.Object3D();
    data.forEach((d, i) => {
      dummy.position.set(d.x, (d.s * 0.8) / 2, d.z);
      dummy.scale.set(d.s * 1.2, d.s * 0.8, d.s);
      dummy.rotation.set(0, d.rot, 0);
      dummy.updateMatrix();
      baseRef.current!.setMatrixAt(i, dummy.matrix);

      dummy.position.set(d.x, d.s * 0.8 + (d.s * 0.55) / 2, d.z);
      dummy.scale.set(d.s * 0.95, d.s * 0.55, d.s * 0.95);
      dummy.rotation.set(0, d.rot + Math.PI / 4, 0);
      dummy.updateMatrix();
      roofRef.current!.setMatrixAt(i, dummy.matrix);
    });
    baseRef.current.instanceMatrix.needsUpdate = true;
    roofRef.current.instanceMatrix.needsUpdate = true;
  }, [data]);

  return (
    <>
      <instancedMesh ref={baseRef} args={[undefined, undefined, HOME_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#233046" metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={roofRef} args={[undefined, undefined, HOME_COUNT]}>
        <coneGeometry args={[0.85, 1, 4]} />
        <meshStandardMaterial color="#3B82F6" metalness={0.6} roughness={0.35} emissive="#1d4ed8" emissiveIntensity={0.25} />
      </instancedMesh>
    </>
  );
}

/** Glowing plot outlines — surveyed land parcels on the ground plane. */
function Plots() {
  const plots = useMemo(() => {
    const arr: { x: number; z: number; w: number; d: number; rot: number; green: boolean }[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 14 + Math.random() * 42;
      arr.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        w: 3 + Math.random() * 5,
        d: 2.5 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        green: Math.random() > 0.5,
      });
    }
    return arr;
  }, []);

  return (
    <>
      {plots.map((p, i) => (
        <group key={i} position={[p.x, 0.03, p.z]} rotation={[0, p.rot, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.PlaneGeometry(p.w, p.d)]} />
            <lineBasicMaterial color={p.green ? "#10B981" : "#3B82F6"} transparent opacity={0.5} />
          </lineSegments>
        </group>
      ))}
    </>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[110, 48]} />
        <meshStandardMaterial color="#06080d" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Concentric rings, echoing the landing scene */}
      {[14, 28, 46, 66].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01 + i * 0.001, 0]}>
          <ringGeometry args={[r - 0.06, r, 96]} />
          <meshBasicMaterial color={i % 2 ? "#3B82F6" : "#10B981"} transparent opacity={0.12} />
        </mesh>
      ))}
    </>
  );
}

function SlowOrbit() {
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.02;
    const cam = state.camera;
    cam.position.x = Math.sin(t) * 34;
    cam.position.z = Math.cos(t) * 34;
    cam.position.y = 14 + Math.sin(t * 1.7) * 2;
    cam.lookAt(0, 3, 0);
  });
  return null;
}

export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 14, 34], fov: 55, near: 0.1, far: 300 }}
      >
        <color attach="background" args={["#050608"]} />
        <fog attach="fog" args={["#050608", 34, 130]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[20, 40, 10]} intensity={1} color="#9ec5ff" />
        <pointLight position={[0, 26, 0]} intensity={1.6} color="#3B82F6" distance={110} />
        <pointLight position={[24, 8, -18]} intensity={1.1} color="#10B981" distance={70} />
        <Ground />
        <Plots />
        <Towers />
        <Homes />
        <SlowOrbit />
      </Canvas>
      {/* Vignette so content stays readable */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, transparent 40%, oklch(0.06 0.005 240 / 0.78) 100%)",
        }}
      />
    </div>
  );
}
