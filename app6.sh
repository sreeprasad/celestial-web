mkdir -p app
cat > app/SolarSystemView.tsx <<'EOF'
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  BODY_ORDER,
  BodyName,
  positionKm,
  setVSOP87Data,
  VSOPJsonData,
} from '@/lib/ephemeris';
import {
  BODY_META,
  BoostOption,
  computeAllPositionsKm,
  dateToJulianDate,
  formatDateInputValue,
  formatDateTimeUTC,
  getDisplayedRadiusKm,
  KM_PER_UNIT,
} from './solar-data';

declare global {
  interface Window {
    __ready?: boolean;
  }
}

interface TestViewConfig {
  jd?: number;
  target?: BodyName;
  distanceKm?: number;
  azimuthDeg?: number;
  elevationDeg?: number;
  fovDeg?: number;
  boost?: number;
}

const PLANET_LIST: BodyName[] = [
  'Mercury',
  'Venus',
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
];

function createStarfield(): THREE.Points {
  const count = 4000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const radius = 500000; // 5e11 km in scene units

  // Fixed seed PRNG (mulberry32)
  let seed = 1337420;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const u = rand();
    const v = rand();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const shade = 0.65 + 0.35 * rand();
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = Math.min(1, shade + 0.08 * rand());
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.8,
    sizeAttenuation: false,
    vertexColors: true,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

export default function SolarSystemView() {
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');

  const testViewConfig = React.useMemo<TestViewConfig | null>(() => {
    if (!viewParam) return null;
    try {
      return JSON.parse(viewParam) as TestViewConfig;
    } catch {
      try {
        return JSON.parse(decodeURIComponent(viewParam)) as TestViewConfig;
      } catch {
        return null;
      }
    }
  }, [viewParam]);

  const isTestMode = testViewConfig !== null;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jd, setJd] = useState<number>(() =>
    testViewConfig?.jd !== undefined
      ? testViewConfig.jd
      : dateToJulianDate(new Date())
  );
  const [playing, setPlaying] = useState<boolean>(() => !isTestMode);
  // speedSlider in [0, 1], mapped logarithmically from 1 day/s to 3652.5 days/s (10 years/s)
  const [speedSlider, setSpeedSlider] = useState<number>(0);
  const [boost, setBoost] = useState<BoostOption>(() => {
    if (testViewConfig?.boost === 50 || testViewConfig?.boost === 500) {
      return testViewConfig.boost;
    }
    return 1;
  });
  const [selectedBody, setSelectedBody] = useState<BodyName>(() =>
    testViewConfig?.target && BODY_ORDER.includes(testViewConfig.target)
      ? testViewConfig.target
      : 'Earth'
  );
  const [showOrbits, setShowOrbits] = useState<boolean>(true);

  // Refs for mutable animation loop access
  const jdRef = useRef<number>(jd);
  const playingRef = useRef<boolean>(playing);
  const speedDaysPerSecRef = useRef<number>(1);
  const boostRef = useRef< number >(testViewConfig?.boost ?? boost);
  const selectedBodyRef = useRef<BodyName>(selectedBody);

  // Fly-to interpolation state
  const flyAnimRef = useRef<{
    active: boolean;
    startTime: number;
    durationMs: number;
    startOffset: THREE.Vector3;
    endOffset: THREE.Vector3;
  } | null>(null);

  const triggerFlyToRef = useRef<((body: BodyName, immediate?: boolean) => void) | null>(
    null
  );

  const daysPerSec = React.useMemo(() => {
    // 1 day/s to 3652.5 days/s (10 years/s)
    return Math.pow(3652.5, speedSlider);
  }, [speedSlider]);

  useEffect(() => {
    speedDaysPerSecRef.current = daysPerSec;
  }, [daysPerSec]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    if (!isTestMode) {
      boostRef.current = boost;
    }
  }, [boost, isTestMode]);

  useEffect(() => {
    selectedBodyRef.current = selectedBody;
  }, [selectedBody]);

  // Load VSOP87 JSON coefficients once on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/vsop87.json')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch /vsop87.json (${res.status})`);
        }
        return res.json();
      })
      .then((data: VSOPJsonData) => {
        if (cancelled) return;
        setVSOP87Data(data);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Set up Three.js scene once VSOP87 data is loaded
  useEffect(() => {
    if (!loaded || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const initialFov = testViewConfig?.fovDeg ?? 45;
    const camera = new THREE.PerspectiveCamera(
      initialFov,
      width / height,
      1e-6, // 1 km in scene units
      1e7   // 1e13 km in scene units
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isTestMode;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1e-5;
    controls.maxDistance = 5e5;

    // Starfield
    const starfield = createStarfield();
    scene.add(starfield);

    // Sun PointLight (only light in the scene; decay=0 so planets across the solar system are lit)
    const sunLight = new THREE.PointLight(0xffffff, 2.5, 0, 0);
    scene.add(sunLight);

    // Create meshes for all 10 bodies
    const meshes: Record<BodyName, THREE.Mesh> = {} as Record<
      BodyName,
      THREE.Mesh
    >;
    const materials: Record<
      BodyName,
      THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
    > = {} as Record<
      BodyName,
      THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
    >;

    const sphereGeo = new THREE.SphereGeometry(1, 64, 64);

    // Track pending texture loads for test mode readiness
    const texturePromises: Promise<void>[] = [];
    const textureLoader = new THREE.TextureLoader();

    for (const body of BODY_ORDER) {
      const meta = BODY_META[body];
      let material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;

      if (body === 'Sun') {
        material = new THREE.MeshBasicMaterial({
          color: meta.color,
        });
      } else {
        material = new THREE.MeshStandardMaterial({
          color: meta.color,
          roughness: 0.9,
          metalness: 0.0,
        });
      }

      materials[body] = material;

      const mesh = new THREE.Mesh(sphereGeo, material);
      mesh.name = body;
      mesh.userData = { body };
      scene.add(mesh);
      meshes[body] = mesh;

      const texUrl = `/textures/${body.toLowerCase()}.jpg`;
      const texPromise = new Promise<void>((resolve) => {
        textureLoader.load(
          texUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            material.map = tex;
            material.color.setHex(0xffffff);
            material.needsUpdate = true;
            resolve();
          },
          undefined,
          () => {
            // Silently fall back to plain color if texture is missing
            resolve();
          }
        );
      });
      texturePromises.push(texPromise);
    }

    // Create orbit lines for the 8 planets
    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);
    const orbitLines: Partial<Record<BodyName, THREE.LineLoop>> = {};

    const updateOrbits = (centerJd: number, sunPosUnits: THREE.Vector3) => {
      for (const planet of PLANET_LIST) {
        const period = BODY_META[planet].periodDays;
        const segments = 256;
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < segments; i++) {
          const t = centerJd + (i / segments) * period;
          const pos = positionKm(planet, t);
          points.push(
            new THREE.Vector3(
              pos.x / KM_PER_UNIT,
              pos.y / KM_PER_UNIT,
              pos.z / KM_PER_UNIT
            )
          );
        }

        let line = orbitLines[planet];
        if (!line) {
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          const mat = new THREE.LineBasicMaterial({
            color: BODY_META[planet].color,
            transparent: true,
            opacity: 0.45,
          });
          line = new THREE.LineLoop(geo, mat);
          orbitGroup.add(line);
          orbitLines[planet] = line;
        } else {
          line.geometry.setFromPoints(points);
        }
        line.position.copy(sunPosUnits);
      }
    };

    // Update body positions & scales for a given JD and boost
    const syncSceneToTime = (currentJd: number, currentBoost: number) => {
      const positionsKm = computeAllPositionsKm(currentJd, currentBoost);

      for (const body of BODY_ORDER) {
        const p = positionsKm[body];
        const mesh = meshes[body];
        mesh.position.set(
          p.x / KM_PER_UNIT,
          p.y / KM_PER_UNIT,
          p.z / KM_PER_UNIT
        );

        const rKm = getDisplayedRadiusKm(body, currentBoost);
        const rUnits = rKm / KM_PER_UNIT;
        mesh.scale.set(rUnits, rUnits, rUnits);
      }

      sunLight.position.copy(meshes.Sun.position);
      for (const planet of PLANET_LIST) {
        const line = orbitLines[planet];
        if (line) {
          line.position.copy(meshes.Sun.position);
        }
      }
    };

    // Initial scene sync
    const initialBoost = testViewConfig?.boost ?? boostRef.current;
    boostRef.current = initialBoost;
    syncSceneToTime(jdRef.current, initialBoost);
    updateOrbits(jdRef.current, meshes.Sun.position);

    // Helper to position camera relative to a target body
    const flyToBody = (body: BodyName, immediate = false) => {
      selectedBodyRef.current = body;
      setSelectedBody(body);

      const targetMesh = meshes[body];
      const rKm = getDisplayedRadiusKm(body, boostRef.current);
      const distKm = Math.max(rKm * 6, 20000);
      const distUnits = distKm / KM_PER_UNIT;

      const endOffset = new THREE.Vector3(
        distUnits * 0.7,
        distUnits * 0.4,
        distUnits * 0.7
      );

      if (immediate) {
        controls.target.copy(targetMesh.position);
        camera.position.copy(targetMesh.position).add(endOffset);
        controls.update();
        flyAnimRef.current = null;
      } else {
        const startOffset = camera.position
          .clone()
          .sub(targetMesh.position);
        flyAnimRef.current = {
          active: true,
          startTime: performance.now(),
          durationMs: 900,
          startOffset,
          endOffset,
        };
      }
    };

    triggerFlyToRef.current = flyToBody;

    // Configure initial camera placement
    if (isTestMode && testViewConfig) {
      const targetBody: BodyName =
        testViewConfig.target && BODY_ORDER.includes(testViewConfig.target)
          ? testViewConfig.target
          : 'Sun';
      selectedBodyRef.current = targetBody;

      const targetPos = meshes[targetBody].position.clone();
      const distKm =
        testViewConfig.distanceKm ??
        getDisplayedRadiusKm(targetBody, initialBoost) * 5;
      const distUnits = distKm / KM_PER_UNIT;

      const azRad = THREE.MathUtils.degToRad(testViewConfig.azimuthDeg ?? 0);
      const elRad = THREE.MathUtils.degToRad(testViewConfig.elevationDeg ?? 20);

      // Spherical coordinates with y-up (elevation from xz ecliptic plane, azimuth from +z towards +x)
      const offset = new THREE.Vector3(
        distUnits * Math.cos(elRad) * Math.sin(azRad),
        distUnits * Math.sin(elRad),
        distUnits * Math.cos(elRad) * Math.cos(azRad)
      );

      controls.target.copy(targetPos);
      camera.position.copy(targetPos).add(offset);
      if (testViewConfig.fovDeg) {
        camera.fov = testViewConfig.fovDeg;
        camera.updateProjectionMatrix();
      }
      controls.update();

      // Wait for textures to settle (or fallback), render final frame, and signal window.__ready = true
      Promise.all(texturePromises).then(() => {
        syncSceneToTime(jdRef.current, initialBoost);
        controls.target.copy(meshes[targetBody].position);
        camera.position.copy(meshes[targetBody].position).add(offset);
        controls.update();
        renderer.render(scene, camera);
        window.__ready = true;
      });
    } else {
      // Default interactive startup view: looking at Earth
      flyToBody(selectedBodyRef.current, true);
    }

    // Raycaster for clicking a body in the 3D viewport
    const raycaster = new THREE.Raycaster();
    const pointerDownPos = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos.set(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isTestMode) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 5) return; // Ignore drags

      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(ndc, camera);
      const meshList = BODY_ORDER.map((b) => meshes[b]);
      const intersects = raycaster.intersectObjects(meshList, false);
      if (intersects.length > 0) {
        const hitBody = intersects[0].object.userData?.body as
          | BodyName
          | undefined;
        if (hitBody) {
          flyToBody(hitBody, false);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Resize handler
    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth || window.innerWidth;
      const h = containerRef.current.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Main animation loop
    let animId = 0;
    let lastTime = performance.now();
    let lastUiSync = performance.now();
    const prevTargetPos = meshes[selectedBodyRef.current].position.clone();

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);

      const dtSec = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!isTestMode && playingRef.current) {
        jdRef.current += dtSec * speedDaysPerSecRef.current;
        if (now - lastUiSync > 60) {
          setJd(jdRef.current);
          lastUiSync = now;
        }
      }

      const activeTarget = selectedBodyRef.current;
      prevTargetPos.copy(meshes[activeTarget].position);

      syncSceneToTime(jdRef.current, boostRef.current);

      const newTargetPos = meshes[activeTarget].position;

      if (!isTestMode) {
        if (flyAnimRef.current && flyAnimRef.current.active) {
          const anim = flyAnimRef.current;
          const t = Math.min((now - anim.startTime) / anim.durationMs, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          const curOffset = new THREE.Vector3().lerpVectors(
            anim.startOffset,
            anim.endOffset,
            ease
          );
          controls.target.copy(newTargetPos);
          camera.position.copy(newTargetPos).add(curOffset);
          if (t >= 1) {
            anim.active = false;
          }
        } else {
          // Keep camera orbiting the moving target body
          const delta = new THREE.Vector3().subVectors(
            newTargetPos,
            prevTargetPos
          );
          camera.position.add(delta);
          controls.target.copy(newTargetPos);
        }
        controls.update();
      }

      orbitGroup.visible = isTestMode ? true : showOrbitsRef.current;
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, [loaded, isTestMode, testViewConfig]);

  const showOrbitsRef = useRef(showOrbits);
  useEffect(() => {
    showOrbitsRef.current = showOrbits;
  }, [showOrbits]);

  const handleSelectBody = (body: BodyName) => {
    if (triggerFlyToRef.current) {
      triggerFlyToRef.current(body, false);
    } else {
      setSelectedBody(body);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const parsed = new Date(val + 'Z');
    if (!isNaN(parsed.getTime())) {
      const newJd = dateToJulianDate(parsed);
      jdRef.current = newJd;
      setJd(newJd);
    }
  };

  const handleNowClick = () => {
    const nowJd = dateToJulianDate(new Date());
    jdRef.current = nowJd;
    setJd(nowJd);
  };

  const formatSpeedLabel = (dPerSec: number): string => {
    if (dPerSec < 30) {
      return `${dPerSec.toFixed(1)} days/s`;
    }
    const yearsPerSec = dPerSec / 365.25;
    return `${yearsPerSec.toFixed(2)} years/s`;
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {/* Error Banner */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(180, 30, 30, 0.9)',
            padding: '10px 20px',
            borderRadius: 6,
            zIndex: 20,
          }}
        >
          Error loading ephemeris: {error}
        </div>
      )}

      {/* Loading Indicator */}
      {!loaded && !error && !isTestMode && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)',
            zIndex: 15,
            fontSize: 18,
            letterSpacing: 1,
          }}
        >
          Loading VSOP87 Ephemeris...
        </div>
      )}

      {/* Interactive UI Overlay (hidden in ?view= test mode) */}
      {!isTestMode && loaded && (
        <>
          {/* Top-Left Body Selector & Boost Controls */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              background: 'rgba(15, 20, 30, 0.82)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: 8,
              padding: 14,
              width: 220,
              zIndex: 10,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 10,
                color: '#9ecbff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Solar System</span>
              <Link
                href="/verify"
                style={{
                  fontSize: 11,
                  color: '#88d4ab',
                  textDecoration: 'none',
                  border: '1px solid rgba(136,212,171,0.4)',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                Verify
              </Link>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                marginBottom: 14,
              }}
            >
              {BODY_ORDER.map((body) => {
                const active = selectedBody === body;
                return (
                  <button
                    key={body}
                    onClick={() => handleSelectBody(body)}
                    style={{
                      background: active
                        ? 'rgba(56, 139, 253, 0.35)'
                        : 'rgba(255, 255, 255, 0.06)',
                      border: active
                        ? '1px solid #58a6ff'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      color: active ? '#ffffff' : '#c9d1d9',
                      borderRadius: 5,
                      padding: '6px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: `#${BODY_META[body].color
                          .toString(16)
                          .padStart(6, '0')}`,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {body}
                  </button>
                );
              })}
            </div>

            {/* Size Boost Toggle */}
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#8b949e',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Planet Size Boost
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([1, 50, 500] as BoostOption[]).map((b) => {
                  const active = boost === b;
                  return (
                    <button
                      key={b}
                      onClick={() => setBoost(b)}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontSize: 12,
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: active
                          ? '#238636'
                          : 'rgba(255, 255, 255, 0.08)',
                        border: active
                          ? '1px solid #2ea043'
                          : '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#fff',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {b === 1 ? 'Off' : `${b}x`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orbit Lines Toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#c9d1d9',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={showOrbits}
                onChange={(e) => setShowOrbits(e.target.checked)}
              />
              Show Planet Orbits
            </label>
          </div>

          {/* Bottom Time Controls Bar */}
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 20, 30, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: 10,
              padding: '12px 20px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 16,
              zIndex: 10,
              maxWidth: '92vw',
            }}
          >
            {/* Play / Pause */}
            <button
              onClick={() => setPlaying((p) => !p)}
              style={{
                background: playing ? '#1f6feb' : '#238636',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                minWidth: 74,
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </button>

            {/* Speed Slider (1 day/s to 10 years/s) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 170,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: '#8b949e',
                  marginBottom: 3,
                }}
              >
                <span>Speed</span>
                <span style={{ color: '#e6edf3', fontWeight: 500 }}>
                  {formatSpeedLabel(daysPerSec)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.005}
                value={speedSlider}
                onChange={(e) => setSpeedSlider(parseFloat(e.target.value))}
                style={{ cursor: 'pointer' }}
              />
            </div>

            {/* Current Date & Time Readout */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 165,
              }}
            >
              <span style={{ fontSize: 10, color: '#8b949e' }}>
                Simulation Time (JD {jd.toFixed(2)})
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: 'monospace',
                  color: '#f0f6fc',
                  fontWeight: 600,
                }}
              >
                {formatDateTimeUTC(jd)}
              </span>
            </div>

            {/* Date Picker */}
            <input
              type="datetime-local"
              value={formatDateInputValue(jd)}
              onChange={handleDateChange}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                borderRadius: 5,
                padding: '5px 8px',
                fontSize: 12,
              }}
            />

            {/* "Now" Button */}
            <button
              onClick={handleNowClick}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
EOF
