import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { SilentErrorBoundary } from "@/components/SilentErrorBoundary";

const IS_MOBILE =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(pointer: coarse)").matches;

type Vec3 = [number, number, number];

function Tree({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 1.8, 8]} />
        <meshStandardMaterial color="#4a3529" roughness={0.92} />
      </mesh>
      <mesh position={[0, 2.15, 0]} castShadow>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial color="#183c36" roughness={0.95} />
      </mesh>
      <mesh position={[-0.48, 1.85, 0.08]} castShadow>
        <icosahedronGeometry args={[0.68, 1]} />
        <meshStandardMaterial color="#214b3d" roughness={0.95} />
      </mesh>
      <mesh position={[0.48, 1.92, -0.08]} castShadow>
        <icosahedronGeometry args={[0.72, 1]} />
        <meshStandardMaterial color="#285541" roughness={0.95} />
      </mesh>
    </group>
  );
}

function PathLight({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.055, 0.075, 0.72, 8]} />
        <meshStandardMaterial color="#25384a" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.76, 0]}>
        <boxGeometry args={[0.2, 0.18, 0.2]} />
        <meshBasicMaterial color="#ffd49a" />
      </mesh>
      <pointLight position={[0, 0.82, 0]} color="#ffbb78" intensity={0.42} distance={4} />
    </group>
  );
}

function Tower({
  position,
  height,
  width,
  depth,
}: {
  position: Vec3;
  height: number;
  width: number;
  depth: number;
}) {
  const floors = Math.max(3, Math.floor(height / 2.25));
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#172b40" metalness={0.62} roughness={0.34} />
      </mesh>
      <mesh position={[0, height / 2, depth / 2 + 0.025]}>
        <boxGeometry args={[width * 0.9, height * 0.91, 0.06]} />
        <meshStandardMaterial color="#29475d" metalness={0.7} roughness={0.22} />
      </mesh>
      {Array.from({ length: floors }, (_, floor) =>
        Array.from({ length: 3 }, (_, column) => (
          <mesh
            key={floor + "-" + column}
            position={[
              (column - 1) * (width * 0.27),
              1.05 + floor * 2.15,
              depth / 2 + 0.075,
            ]}
          >
            <boxGeometry args={[width * 0.17, 0.92, 0.045]} />
            <meshBasicMaterial
              color={(floor + column) % 4 === 0 ? "#f3bd82" : "#8ebbd8"}
              transparent
              opacity={(floor + column) % 4 === 0 ? 0.94 : 0.48}
            />
          </mesh>
        )),
      )}
      <mesh position={[0, height + 0.08, 0]}>
        <boxGeometry args={[width + 0.4, 0.18, depth + 0.4]} />
        <meshStandardMaterial color="#30475a" metalness={0.72} roughness={0.3} />
      </mesh>
    </group>
  );
}

function LuxuryVilla() {
  const windowXs = [-4.8, -2.4, 0, 2.4, 4.8];
  return (
    <group position={[8, 0, -3]}>
      {/* Ground floor and floating upper volume */}
      <mesh position={[0, 1.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[14, 3.1, 8.4]} />
        <meshStandardMaterial color="#263646" roughness={0.56} metalness={0.2} />
      </mesh>
      <mesh position={[0.65, 4.25, -0.45]} castShadow>
        <boxGeometry args={[9.7, 2.35, 7.3]} />
        <meshStandardMaterial color="#1b2a3a" roughness={0.48} metalness={0.24} />
      </mesh>
      {/* Broad cantilevered rooflines */}
      <mesh position={[0.65, 5.48, -0.45]} castShadow>
        <boxGeometry args={[11.1, 0.3, 8.2]} />
        <meshStandardMaterial color="#101c2a" metalness={0.78} roughness={0.28} />
      </mesh>
      <mesh position={[-0.1, 3.22, 0.1]}>
        <boxGeometry args={[14.5, 0.22, 8.9]} />
        <meshStandardMaterial color="#75818a" metalness={0.6} roughness={0.35} />
      </mesh>
      {/* Glazed front elevation */}
      <mesh position={[0, 1.7, 4.24]}>
        <boxGeometry args={[12.8, 2.35, 0.06]} />
        <meshPhysicalMaterial color="#8db6ca" transparent opacity={0.42} roughness={0.12} metalness={0.35} />
      </mesh>
      {windowXs.map((x) => (
        <mesh key={"ground-window-" + x} position={[x, 1.72, 4.31]}>
          <boxGeometry args={[0.12, 2.4, 0.09]} />
          <meshStandardMaterial color="#b4c3ce" metalness={0.82} roughness={0.24} />
        </mesh>
      ))}
      {[-3.7, -1.25, 1.25, 3.7].map((x) => (
        <mesh key={"interior-" + x} position={[x, 1.72, 4.17]}>
          <boxGeometry args={[1.45, 1.72, 0.025]} />
          <meshBasicMaterial color="#f5b875" transparent opacity={0.72} />
        </mesh>
      ))}
      {/* Upper floor glass and balcony */}
      <mesh position={[0.65, 4.25, 3.22]}>
        <boxGeometry args={[8.9, 1.72, 0.06]} />
        <meshPhysicalMaterial color="#84acc2" transparent opacity={0.48} roughness={0.1} metalness={0.3} />
      </mesh>
      {[-2.35, 0, 2.35].map((x) => (
        <mesh key={"upper-window-" + x} position={[x + 0.65, 4.25, 3.29]}>
          <boxGeometry args={[0.12, 1.85, 0.09]} />
          <meshStandardMaterial color="#c2d0d8" metalness={0.8} roughness={0.22} />
        </mesh>
      ))}
      <mesh position={[0.65, 3.35, 3.55]}>
        <boxGeometry args={[9.4, 0.12, 1.25]} />
        <meshStandardMaterial color="#394a58" metalness={0.7} roughness={0.32} />
      </mesh>
      <mesh position={[0.65, 3.82, 4.14]}>
        <boxGeometry args={[9.25, 0.72, 0.045]} />
        <meshPhysicalMaterial color="#9dc6d7" transparent opacity={0.28} roughness={0.08} />
      </mesh>
      {/* Warm architectural fins and recessed lights */}
      {[-5.3, -4.7, 5.1, 5.55].map((x) => (
        <mesh key={"fin-" + x} position={[x, 1.75, 4.34]}>
          <boxGeometry args={[0.16, 2.9, 0.18]} />
          <meshStandardMaterial color="#946d4f" roughness={0.56} />
        </mesh>
      ))}
      <mesh position={[0.65, 5.31, 3.58]}>
        <boxGeometry args={[8.6, 0.045, 0.045]} />
        <meshBasicMaterial color="#ffd29b" />
      </mesh>
      <pointLight position={[0, 3.3, 2.5]} color="#f8b979" intensity={1.15} distance={18} />
      <pointLight position={[5, 2.3, 1.5]} color="#ffca8b" intensity={0.65} distance={12} />
    </group>
  );
}

function Scene() {
  const trees: { position: Vec3; scale: number }[] = useMemo(
    () => [
      { position: [-23, 0, -7], scale: 1.25 },
      { position: [-17, 0, 5], scale: 1.08 },
      { position: [-12, 0, -12], scale: 0.92 },
      { position: [-9, 0, 13], scale: 0.84 },
      { position: [0, 0, 14], scale: 0.9 },
      { position: [17, 0, 12], scale: 1.05 },
      { position: [22, 0, 3], scale: 1.2 },
      { position: [19, 0, -10], scale: 0.9 },
      { position: [-27, 0, 14], scale: 1.1 },
      { position: [-30, 0, -4], scale: 0.9 },
      { position: [29, 0, -3], scale: 1.05 },
      { position: [30, 0, 13], scale: 0.9 },
    ],
    [],
  );

  return (
    <>
      <color attach="background" args={["#071321"]} />
      <fog attach="fog" args={["#071321", 48, 125]} />
      <ambientLight intensity={0.8} color="#9eb8d4" />
      <directionalLight position={[18, 32, 16]} intensity={2.1} color="#ffd5ad" />
      <directionalLight position={[-20, 18, -18]} intensity={0.72} color="#6b9bd5" />
      <pointLight position={[8, 10, 7]} intensity={1.6} color="#f6bb80" distance={40} />

      {/* A landscaped masterplan instead of the old abstract block field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color="#0b1b20" roughness={0.96} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, -20]}>
        <planeGeometry args={[150, 5.8]} />
        <meshStandardMaterial color="#172431" roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, -20]}>
        <planeGeometry args={[150, 0.055]} />
        <meshBasicMaterial color="#bdc9d4" transparent opacity={0.24} />
      </mesh>

      {/* Distant premium residential skyline */}
      <Tower position={[-25, 0, -31]} height={18} width={5.4} depth={4.2} />
      <Tower position={[-16, 0, -34]} height={23} width={6.2} depth={4.5} />
      <Tower position={[-6, 0, -32]} height={15} width={4.8} depth={4} />
      <Tower position={[5, 0, -35]} height={21} width={5.4} depth={4.3} />
      <Tower position={[18, 0, -32]} height={17} width={5.2} depth={4.2} />
      <Tower position={[28, 0, -35]} height={24} width={6} depth={4.5} />

      <LuxuryVilla />

      {/* Infinity pool, stone deck and illuminated garden edge */}
      <mesh position={[8, 0.02, 8.3]} receiveShadow>
        <boxGeometry args={[15.6, 0.22, 7.2]} />
        <meshStandardMaterial color="#8a9697" roughness={0.58} />
      </mesh>
      <mesh position={[8, 0.16, 8.3]}>
        <boxGeometry args={[14.9, 0.12, 6.55]} />
        <meshPhysicalMaterial color="#0b4863" metalness={0.38} roughness={0.13} clearcoat={1} clearcoatRoughness={0.08} />
      </mesh>
      <mesh position={[8, 0.235, 5.0]}>
        <boxGeometry args={[14.6, 0.035, 0.045]} />
        <meshBasicMaterial color="#8bd5f2" transparent opacity={0.82} />
      </mesh>
      <mesh position={[8, 0.035, 13.2]}>
        <boxGeometry args={[17.5, 0.09, 4.2]} />
        <meshStandardMaterial color="#34404a" roughness={0.52} />
      </mesh>

      {/* Entry lane and discreet landscape lighting */}
      <mesh position={[7, 0.015, 16.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[22, 3.2]} />
        <meshStandardMaterial color="#1b2937" roughness={0.84} />
      </mesh>
      {[-1, 1].map((side) =>
        [-1, 0, 1].map((step) => (
          <mesh key={side + "-" + step} position={[7 + side * 8.3, 0.1, 8 + step * 2.25]}>
            <boxGeometry args={[0.28, 0.09, 0.28]} />
            <meshBasicMaterial color="#ffd09a" />
          </mesh>
        )),
      )}

      {trees.map((tree, index) => (
        <Tree key={index} position={tree.position} scale={tree.scale} />
      ))}
      {[
        [-2, 0, 5],
        [3, 0, 13],
        [15, 0, 14],
        [20, 0, -2],
        [-16, 0, -1],
        [-21, 0, 9],
      ].map((position, index) => (
        <PathLight key={index} position={position as Vec3} />
      ))}

      <mesh position={[-8, 0.18, 8]}>
        <boxGeometry args={[7, 0.34, 4]} />
        <meshStandardMaterial color="#243b37" roughness={0.92} />
      </mesh>
    </>
  );
}

function CameraRig() {
  useFrame((state, delta) => {
    const camera = state.camera;
    const targetX = 20 + state.pointer.x * 1.8;
    const targetY = 15.5 + state.pointer.y * 1.1;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 1.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 1.2, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, 36, 1.2, delta);
    camera.lookAt(5, 2.2, -4);
  });
  return null;
}

/** Decorative rendering is capped at 24–30fps and pauses in hidden tabs. */
function ThrottledFrames({ fps = 30 }: { fps?: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const interval = 1000 / fps;

    const loop = (time: number) => {
      raf = 0;
      if (document.hidden) return;
      if (time - last >= interval) {
        last = time;
        invalidate();
      }
      raf = window.requestAnimationFrame(loop);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (raf) window.cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      invalidate();
      if (!raf) raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [invalidate, fps]);

  return null;
}

export function CityCanvas() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-1/2 z-0 w-screen -translate-x-1/2 overflow-hidden"
      aria-hidden="true"
    >
      <SilentErrorBoundary>
        <Canvas
          frameloop="demand"
          shadows={false}
          dpr={IS_MOBILE ? 1 : [1, 1.5]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          camera={{ position: [20, 15.5, 36], fov: 43, near: 0.1, far: 240 }}
        >
          <ThrottledFrames fps={IS_MOBILE ? 24 : 30} />
          <Scene />
          <CameraRig />
          {!IS_MOBILE && (
            <SilentErrorBoundary>
              <Suspense fallback={null}>
                <Environment preset="night" />
              </Suspense>
            </SilentErrorBoundary>
          )}
        </Canvas>
      </SilentErrorBoundary>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(4, 12, 23, 0.66) 0%, rgba(5, 14, 25, 0.26) 48%, rgba(5, 14, 25, 0.10) 100%), radial-gradient(ellipse at 50% 48%, rgba(5, 12, 22, 0.42), transparent 72%), linear-gradient(180deg, rgba(4, 10, 18, 0.22), transparent 35%, rgba(4, 10, 18, 0.70))",
        }}
      />
    </div>
  );
}
