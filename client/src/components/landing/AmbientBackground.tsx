import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import * as THREE from "three";

function DriftingParticles() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 160;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 90;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    return arr;
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.015;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.04;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.09} color="#9ec5ff" sizeAttenuation transparent opacity={0.65} />
    </points>
  );
}

function GlowOrbs() {
  const orbs = [
    { color: "#3B82F6", pos: [-22, 8, -30] as const },
    { color: "#8B5CF6", pos: [26, -6, -40] as const },
    { color: "#10B981", pos: [0, 16, -55] as const },
  ];
  return (
    <>
      {orbs.map((o, i) => (
        <Float key={i} speed={0.8 + i * 0.3} floatIntensity={2} rotationIntensity={0}>
          <mesh position={[o.pos[0], o.pos[1], o.pos[2]]}>
            <sphereGeometry args={[1.6, 24, 24]} />
            <meshBasicMaterial color={o.color} transparent opacity={0.16} />
          </mesh>
        </Float>
      ))}
    </>
  );
}

function SlowCamera() {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    state.camera.position.x = Math.sin(t * 0.04) * 3;
    state.camera.position.y = Math.cos(t * 0.03) * 2;
    state.camera.lookAt(0, 0, -30);
  });
  return null;
}

/**
 * Fixed, pointer-transparent 3D backdrop shared by every page except
 * the landing page (which renders the richer CityCanvas scene).
 * Deliberately light: no shadows, no HDR environment, few draw calls.
 */
export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 20], fov: 60, near: 0.1, far: 300 }}
      >
        <Stars radius={110} depth={50} count={2200} factor={3.5} fade speed={0.5} />
        <DriftingParticles />
        <GlowOrbs />
        <SlowCamera />
      </Canvas>
      {/* Vignette so content stays readable */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, transparent 45%, oklch(0.06 0.005 240 / 0.7) 100%)",
        }}
      />
    </div>
  );
}
