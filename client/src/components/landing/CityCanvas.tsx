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

type Plot = {
  x: number;
  z: number;
  home?: boolean;
};

const PLOT_X = [-12, -7, -2, 3, 8];
const PLOT_Z = [2.5, 8.5, 14.5];

// Most parcels remain visibly vacant, while a few contain villas: this makes
// the scene read as a mixed real-estate masterplan, not a villa-only estate.
const PLOTS: Plot[] = PLOT_Z.flatMap((z, row) =>
  PLOT_X.map((x, column) => ({
    x,
    z,
    home:
      (row === 0 && column === 3) ||
      (row === 1 && column === 1) ||
      (row === 2 && column === 4),
  })),
);

function Tree({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.19, 1.45, 7]} />
        <meshStandardMaterial color="#49392f" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <icosahedronGeometry args={[0.92, 1]} />
        <meshStandardMaterial color="#1b493c" roughness={0.96} />
      </mesh>
      <mesh position={[-0.4, 1.55, 0.08]} castShadow>
        <icosahedronGeometry args={[0.58, 1]} />
        <meshStandardMaterial color="#285844" roughness={0.96} />
      </mesh>
      <mesh position={[0.42, 1.62, -0.08]} castShadow>
        <icosahedronGeometry args={[0.62, 1]} />
        <meshStandardMaterial color="#214d3e" roughness={0.96} />
      </mesh>
    </group>
  );
}

function VillaModel({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {/* Plinth and lower storey */}
      <mesh position={[0, 0.23, 0]} castShadow>
        <boxGeometry args={[3.25, 0.36, 3.35]} />
        <meshStandardMaterial color="#89949a" roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.02, -0.05]} castShadow>
        <boxGeometry args={[2.85, 1.45, 2.85]} />
        <meshStandardMaterial color="#9da7a8" roughness={0.58} />
      </mesh>
      {/* Glazed facade facing the main road */}
      <mesh position={[0, 1.02, 1.405]}>
        <boxGeometry args={[2.35, 1.12, 0.035]} />
        <meshPhysicalMaterial
          color="#8fc5df"
          transparent
          opacity={0.72}
          roughness={0.12}
          metalness={0.28}
        />
      </mesh>
      {[-0.78, 0.78].map((x) => (
        <mesh key={x} position={[x, 1.02, 1.45]}>
          <boxGeometry args={[0.075, 1.2, 0.07]} />
          <meshStandardMaterial color="#d3d0c4" metalness={0.55} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0.93, 0.96, 1.49]}>
        <boxGeometry args={[0.36, 0.9, 0.035]} />
        <meshBasicMaterial color="#f5bb7c" />
      </mesh>
      {/* Upper level and flat architectural roof */}
      <mesh position={[0.18, 2.13, -0.36]} castShadow>
        <boxGeometry args={[2.25, 0.92, 2.05]} />
        <meshStandardMaterial color="#6d7d83" roughness={0.55} />
      </mesh>
      <mesh position={[0.18, 2.14, 0.68]}>
        <boxGeometry args={[1.82, 0.68, 0.035]} />
        <meshPhysicalMaterial color="#a5d3e5" transparent opacity={0.66} roughness={0.1} />
      </mesh>
      <mesh position={[0.18, 2.64, -0.36]} castShadow>
        <boxGeometry args={[2.55, 0.16, 2.35]} />
        <meshStandardMaterial color="#263746" metalness={0.65} roughness={0.3} />
      </mesh>
      {/* Small planted terrace */}
      <mesh position={[-1.13, 0.47, -1.0]}>
        <boxGeometry args={[0.62, 0.1, 1.1]} />
        <meshStandardMaterial color="#315a45" roughness={0.95} />
      </mesh>
      <pointLight position={[0.25, 1.5, 2.1]} color="#ffbf83" intensity={0.36} distance={5} />
    </group>
  );
}

function PlotParcel({ plot }: { plot: Plot }) {
  const { x, z, home } = plot;
  const border = "#8db9cf";
  return (
    <group position={[x, 0, z]}>
      {/* Clearly divided individual parcel */}
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[4.28, 0.1, 4.72]} />
        <meshStandardMaterial
          color={home ? "#2b3c35" : "#34483b"}
          roughness={0.92}
        />
      </mesh>
      {/* Thin raised survey boundary around each plot */}
      <mesh position={[0, 0.105, -2.31]}>
        <boxGeometry args={[4.34, 0.09, 0.075]} />
        <meshStandardMaterial color={border} metalness={0.5} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.105, 2.31]}>
        <boxGeometry args={[4.34, 0.09, 0.075]} />
        <meshStandardMaterial color={border} metalness={0.5} roughness={0.42} />
      </mesh>
      <mesh position={[-2.13, 0.105, 0]}>
        <boxGeometry args={[0.075, 0.09, 4.55]} />
        <meshStandardMaterial color={border} metalness={0.5} roughness={0.42} />
      </mesh>
      <mesh position={[2.13, 0.105, 0]}>
        <boxGeometry args={[0.075, 0.09, 4.55]} />
        <meshStandardMaterial color={border} metalness={0.5} roughness={0.42} />
      </mesh>
      {/* Survey pegs make the vacant parcels read as registered plots */}
      {[
        [-1.94, -2.08],
        [1.94, -2.08],
        [-1.94, 2.08],
        [1.94, 2.08],
      ].map(([px, pz], index) => (
        <mesh key={index} position={[px, 0.19, pz]}>
          <boxGeometry args={[0.12, 0.24, 0.12]} />
          <meshStandardMaterial color="#d7c7a0" metalness={0.35} roughness={0.52} />
        </mesh>
      ))}
      {home && <VillaModel position={[0, 0.18, -0.08]} />}
    </group>
  );
}

function ApartmentTower({
  position,
  height,
  width,
}: {
  position: Vec3;
  height: number;
  width: number;
}) {
  const floors = Math.max(5, Math.floor(height / 2));
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[width, height, 4.2]} />
        <meshStandardMaterial color="#1a2e42" metalness={0.58} roughness={0.34} />
      </mesh>
      <mesh position={[0, height / 2, 2.12]}>
        <boxGeometry args={[width * 0.94, height * 0.94, 0.055]} />
        <meshStandardMaterial color="#2a465b" metalness={0.72} roughness={0.2} />
      </mesh>
      {Array.from({ length: floors }, (_, floor) =>
        Array.from({ length: 3 }, (_, column) => (
          <mesh
            key={floor + "-" + column}
            position={[
              (column - 1) * (width * 0.29),
              1 + floor * 1.9,
              2.17,
            ]}
          >
            <boxGeometry args={[width * 0.17, 0.78, 0.045]} />
            <meshBasicMaterial
              color={(floor + column) % 4 === 0 ? "#f4c58f" : "#8bbad6"}
              transparent
              opacity={(floor + column) % 4 === 0 ? 0.9 : 0.5}
            />
          </mesh>
        )),
      )}
      <mesh position={[0, height + 0.1, 0]}>
        <boxGeometry args={[width + 0.38, 0.2, 4.5]} />
        <meshStandardMaterial color="#344a5e" metalness={0.72} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Road({ position, size }: { position: Vec3; size: Vec3 }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#202d39" roughness={0.88} metalness={0.08} />
      </mesh>
      <mesh position={[0, size[1] / 2 + 0.012, 0]}>
        <boxGeometry args={[size[0] * 0.92, 0.018, 0.035]} />
        <meshBasicMaterial color="#a8c0ce" transparent opacity={0.38} />
      </mesh>
    </group>
  );
}

function StreetLamp({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.045, 0.07, 1.16, 7]} />
        <meshStandardMaterial color="#657b89" metalness={0.78} roughness={0.28} />
      </mesh>
      <mesh position={[0, 1.18, 0]}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshBasicMaterial color="#f6ca91" />
      </mesh>
      <pointLight position={[0, 1.18, 0]} color="#ffca8c" intensity={0.34} distance={4.5} />
    </group>
  );
}

function MasterplanScene() {
  const trees = useMemo<{ position: Vec3; scale: number }[]>(
    () => [
      { position: [-19, 0, -8], scale: 1.0 },
      { position: [-17, 0, 4], scale: 0.84 },
      { position: [-18, 0, 18], scale: 1.08 },
      { position: [14, 0, -7], scale: 0.9 },
      { position: [16, 0, 4], scale: 1.0 },
      { position: [17, 0, 18], scale: 1.05 },
      { position: [21, 0, 10], scale: 0.85 },
      { position: [-5, 0, -9], scale: 0.78 },
      { position: [5, 0, -10], scale: 0.86 },
    ],
    [],
  );

  return (
    <>
      <color attach="background" args={["#071321"]} />
      <fog attach="fog" args={["#071321", 42, 112]} />
      <ambientLight intensity={0.72} color="#a8c1d8" />
      <directionalLight position={[18, 30, 14]} intensity={1.8} color="#ffd6ad" />
      <directionalLight position={[-18, 18, -18]} intensity={0.72} color="#6da4dc" />
      <pointLight position={[8, 10, 8]} intensity={0.8} color="#eab987" distance={45} />

      {/* Continuous landscaped ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 1]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#0e211e" roughness={0.98} />
      </mesh>

      {/* Planned road grid between clearly outlined saleable parcels */}
      {[-9.5, -4.5, 0.5, 5.5].map((x) => (
        <Road key={"vertical-" + x} position={[x, -0.015, 8.5]} size={[0.82, 0.07, 21.8]} />
      ))}
      {[5.5, 11.5].map((z) => (
        <Road key={"horizontal-" + z} position={[-2, -0.015, z]} size={[25.2, 0.07, 0.82]} />
      ))}
      <Road position={[-2, -0.015, 18.5]} size={[27, 0.08, 1.5]} />
      <Road position={[-2, -0.015, -2.1]} size={[27, 0.08, 1.25]} />

      {/* Residential plot inventory: vacant parcels + a few developed villas */}
      {PLOTS.map((plot) => (
        <PlotParcel key={plot.x + "-" + plot.z} plot={plot} />
      ))}

      {/* A small landscaped amenity park beside the plot layout */}
      <mesh position={[15.5, 0.02, 7.6]}>
        <boxGeometry args={[5.8, 0.16, 11.5]} />
        <meshStandardMaterial color="#1b4938" roughness={0.95} />
      </mesh>
      <mesh position={[15.5, 0.12, 7.6]}>
        <boxGeometry args={[2.3, 0.06, 6.4]} />
        <meshStandardMaterial color="#27617a" roughness={0.25} metalness={0.2} />
      </mesh>
      {[
        [13.4, 0, 3.3],
        [17.6, 0, 3.3],
        [13.4, 0, 11.8],
        [17.6, 0, 11.8],
        [15.5, 0, 14.2],
      ].map((position, index) => (
        <Tree key={"park-" + index} position={position as Vec3} scale={0.64} />
      ))}

      {/* Mid- and high-rise projects at the edge of the same masterplan */}
      <ApartmentTower position={[-17, 0, -17]} height={16} width={5.2} />
      <ApartmentTower position={[-9, 0, -20]} height={22} width={5.7} />
      <ApartmentTower position={[1, 0, -18]} height={18} width={5.0} />
      <ApartmentTower position={[11, 0, -20]} height={24} width={5.9} />
      <ApartmentTower position={[20, 0, -17]} height={16} width={5.0} />

      {trees.map((tree, index) => (
        <Tree key={"tree-" + index} position={tree.position} scale={tree.scale} />
      ))}
      {[
        [-14.5, 0, 5.4],
        [-7, 0, 11.4],
        [1.5, 0, 5.4],
        [7.5, 0, 17.9],
        [-15, 0, 18.1],
        [12.5, 0, -1.4],
      ].map((position, index) => (
        <StreetLamp key={"lamp-" + index} position={position as Vec3} />
      ))}
    </>
  );
}

function CameraRig() {
  useFrame((state, delta) => {
    const camera = state.camera;
    const targetX = (IS_MOBILE ? 4 : 18) + state.pointer.x * (IS_MOBILE ? 0.45 : 1.35);
    const targetY = (IS_MOBILE ? 29 : 24) + state.pointer.y * 0.7;
    const targetZ = IS_MOBILE ? 45 : 38;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 1.05, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 1.05, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, 1.05, delta);
    camera.lookAt(0, 0.4, 2);
  });
  return null;
}

/** Decorative rendering is capped and pauses while the browser tab is hidden. */
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

/**
 * Premium mixed-use 3D masterplan for Truvi: individual vacant plots,
 * developed villas, landscaped avenues and apartment projects in one view.
 */
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
          dpr={IS_MOBILE ? 1 : [1, 1.35]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          camera={{
            position: IS_MOBILE ? [4, 29, 45] : [18, 24, 38],
            fov: IS_MOBILE ? 52 : 44,
            near: 0.1,
            far: 180,
          }}
        >
          <ThrottledFrames fps={IS_MOBILE ? 20 : 28} />
          <MasterplanScene />
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
      {/* Keep the text and live intelligence card readable over the 3D scene. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(4, 12, 23, 0.70) 0%, rgba(5, 14, 25, 0.42) 43%, rgba(5, 14, 25, 0.18) 100%), linear-gradient(180deg, rgba(4, 10, 18, 0.32) 0%, rgba(4, 10, 18, 0.08) 38%, rgba(4, 10, 18, 0.62) 100%), radial-gradient(ellipse at 58% 45%, rgba(38, 91, 125, 0.12), transparent 70%)",
        }}
      />
    </div>
  );
}
