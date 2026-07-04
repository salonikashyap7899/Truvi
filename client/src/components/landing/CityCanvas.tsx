import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars, Environment } from "@react-three/drei";
import * as THREE from "three";

type ProgressRef = { current: number };

function useScrollProgress(): ProgressRef {
  const ref = useRef(0);
  useFrame(() => {
    if (typeof window === "undefined") return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    ref.current = max > 0 ? window.scrollY / max : 0;
  });
  return ref;
}

function City({ progress }: { progress: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 220;

  const data = useMemo(() => {
    const arr: { x: number; z: number; h: number; hue: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 6 + Math.random() * 60;
      arr.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        h: 1 + Math.random() * 18,
        hue: Math.random(),
      });
    }
    return arr;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const p = progress.current;
    const t = state.clock.elapsedTime;
    if (!meshRef.current) return;
    data.forEach((d, i) => {
      const grow = THREE.MathUtils.clamp((p - 0.02) * 4 - (d.x + d.z) * 0.005, 0, 1);
      const h = d.h * grow;
      dummy.position.set(d.x, h / 2, d.z);
      dummy.scale.set(0.8, Math.max(0.001, h), 0.8);
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      const lit = 0.15 + 0.55 * Math.max(0, Math.sin(t * 0.7 + i) * 0.5 + 0.5) * grow;
      color.setHSL(0.58 + d.hue * 0.08, 0.4, lit * 0.55);
      meshRef.current!.setColorAt(i, color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial metalness={0.85} roughness={0.25} emissiveIntensity={0.6} />
      </instancedMesh>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[120, 64]} />
        <meshStandardMaterial color="#06080d" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Concentric trust rings */}
      {[10, 20, 32, 48, 68].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01 + i * 0.001, 0]}>
          <ringGeometry args={[r - 0.05, r, 128]} />
          <meshBasicMaterial color={i % 2 ? "#3B82F6" : "#10B981"} transparent opacity={0.18} />
        </mesh>
      ))}
    </group>
  );
}

function Pillars({ progress }: { progress: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const colors = ["#3B82F6", "#10B981", "#C0CBD8", "#60A5FA", "#8B5CF6"];
  useFrame((state) => {
    if (!group.current) return;
    const p = progress.current;
    const reveal = THREE.MathUtils.smoothstep(p, 0.32, 0.5);
    group.current.position.y = THREE.MathUtils.lerp(-30, 0, reveal);
    group.current.rotation.y = state.clock.elapsedTime * 0.1;
  });
  return (
    <group ref={group}>
      {colors.map((c, i) => {
        const angle = (i / colors.length) * Math.PI * 2;
        const r = 4;
        return (
          <Float key={i} speed={1.2} floatIntensity={0.6} rotationIntensity={0.3}>
            <mesh position={[Math.cos(angle) * r, 6, Math.sin(angle) * r]}>
              <cylinderGeometry args={[0.4, 0.4, 10, 8]} />
              <meshStandardMaterial
                color={c}
                emissive={c}
                emissiveIntensity={1.2}
                metalness={0.9}
                roughness={0.15}
              />
            </mesh>
          </Float>
        );
      })}
    </group>
  );
}

function Particles() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 200;
      arr[i * 3 + 1] = Math.random() * 60;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    return arr;
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#9ec5ff" sizeAttenuation transparent opacity={0.8} />
    </points>
  );
}

function CameraRig({ progress }: { progress: ProgressRef }) {
  useFrame((state) => {
    const p = progress.current;
    const cam = state.camera;
    // Path: pull back, then orbit higher, then climb out to "earth view"
    const angle = p * Math.PI * 2.2;
    const radius = THREE.MathUtils.lerp(28, 80, Math.min(1, p * 1.2));
    const height = THREE.MathUtils.lerp(6, 70, p);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    cam.position.x += (tx - cam.position.x) * 0.05;
    cam.position.z += (tz - cam.position.z) * 0.05;
    cam.position.y += (height - cam.position.y) * 0.05;
    cam.lookAt(0, THREE.MathUtils.lerp(4, 0, p), 0);
  });
  return null;
}

function Scene() {
  const progress = useScrollProgress();
  return (
    <>
      <color attach="background" args={["#050608"]} />
      <fog attach="fog" args={["#050608", 40, 160]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[20, 40, 10]} intensity={1.2} color="#9ec5ff" />
      <pointLight position={[0, 30, 0]} intensity={2} color="#3B82F6" distance={120} />
      <pointLight position={[20, 8, -20]} intensity={1.5} color="#10B981" distance={80} />
      <Stars radius={120} depth={60} count={2500} factor={4} fade speed={0.6} />
      <Particles />
      <City progress={progress} />
      <Pillars progress={progress} />
      <CameraRig progress={progress} />
      <Environment preset="night" />
    </>
  );
}

export function CityCanvas() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <Canvas
        shadows={false}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [28, 6, 28], fov: 55, near: 0.1, far: 400 }}
      >
        <Scene />
      </Canvas>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 100%, transparent 40%, oklch(0.06 0.005 240 / 0.85) 90%)",
        }}
      />
    </div>
  );
}
