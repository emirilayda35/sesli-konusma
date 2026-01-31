import { useRef, useEffect } from 'react';
import {
    Clock,
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    SRGBColorSpace,
    MathUtils,
    Vector2,
    Vector3,
    MeshPhysicalMaterial,
    ShaderChunk,
    Color,
    Object3D,
    InstancedMesh,
    PMREMGenerator,
    SphereGeometry,
    AmbientLight,
    PointLight,
    ACESFilmicToneMapping,
    Raycaster,
    Plane
} from 'three';

class ThreeManager {
    config: any;
    canvas: any;
    camera: any;
    cameraMinAspect: any;
    cameraMaxAspect: any;
    cameraFov: any;
    maxPixelRatio: any;
    minPixelRatio: any;
    scene: any;
    renderer: any;
    postprocessing: any;
    size = { width: 0, height: 0, wWidth: 0, wHeight: 0, ratio: 0, pixelRatio: 0 };
    onBeforeRender = (data: any) => { };
    onAfterRender = (data: any) => { };
    onAfterResize = (size: any) => { };

    #isActive = false;
    #isIntersecting = false;
    isDisposed = false;

    #intersectionObserver: any;
    #resizeObserver: any;
    #resizeTimeout: any;
    #clock = new Clock();
    #time = { elapsed: 0, delta: 0 };
    #requestAnimationFrameId: any;

    constructor(config: any) {
        this.config = { ...config };
        this.#initCamera();
        this.#initScene();
        this.#initRenderer();
        this.resize();
        this.#initObservers();
    }

    #initCamera() {
        this.camera = new PerspectiveCamera();
        this.cameraFov = this.camera.fov;
    }

    #initScene() {
        this.scene = new Scene();
    }

    #initRenderer() {
        if (this.config.canvas) {
            this.canvas = this.config.canvas;
        } else if (this.config.id) {
            this.canvas = document.getElementById(this.config.id);
        } else {
            console.error('Three: Missing canvas or id parameter');
        }
        this.canvas.style.display = 'block';
        const rendererOptions = {
            canvas: this.canvas,
            powerPreference: 'high-performance',
            ...(this.config.rendererOptions ?? {})
        };
        this.renderer = new WebGLRenderer(rendererOptions as any);
        this.renderer.outputColorSpace = SRGBColorSpace;
    }

    #initObservers() {
        if (!(this.config.size instanceof Object)) {
            window.addEventListener('resize', this.#handleResize.bind(this));
            if (this.config.size === 'parent' && this.canvas.parentNode) {
                this.#resizeObserver = new ResizeObserver(this.#handleResize.bind(this));
                this.#resizeObserver.observe(this.canvas.parentNode);
            }
        }
        this.#intersectionObserver = new IntersectionObserver(this.#handleIntersection.bind(this), {
            root: null,
            rootMargin: '0px',
            threshold: 0
        });
        this.#intersectionObserver.observe(this.canvas);
        document.addEventListener('visibilitychange', this.#handleVisibilityChange.bind(this));
    }

    #removeObservers() {
        window.removeEventListener('resize', this.#handleResize.bind(this));
        this.#resizeObserver?.disconnect();
        this.#intersectionObserver?.disconnect();
        document.removeEventListener('visibilitychange', this.#handleVisibilityChange.bind(this));
    }

    #handleIntersection(entries: any) {
        this.#isIntersecting = entries[0].isIntersecting;
        this.#isIntersecting ? this.#startAnimation() : this.#stopAnimation();
    }

    #handleVisibilityChange() {
        if (this.#isIntersecting) {
            document.hidden ? this.#stopAnimation() : this.#startAnimation();
        }
    }

    #handleResize() {
        if (this.#resizeTimeout) clearTimeout(this.#resizeTimeout);
        this.#resizeTimeout = setTimeout(this.resize.bind(this), 100);
    }

    resize() {
        let width, height;
        if (this.config.size instanceof Object) {
            width = this.config.size.width;
            height = this.config.size.height;
        } else if (this.config.size === 'parent' && this.canvas.parentNode) {
            width = this.canvas.parentNode.offsetWidth;
            height = this.canvas.parentNode.offsetHeight;
        } else {
            width = window.innerWidth;
            height = window.innerHeight;
        }
        this.size.width = width;
        this.size.height = height;
        this.size.ratio = width / height;
        this.#updateCamera();
        this.#updateRenderer();
        this.onAfterResize(this.size);
    }

    #updateCamera() {
        this.camera.aspect = this.size.width / this.size.height;
        if (this.camera.isPerspectiveCamera && this.cameraFov) {
            if (this.cameraMinAspect && this.camera.aspect < this.cameraMinAspect) {
                this.#adjustFov(this.cameraMinAspect);
            } else if (this.cameraMaxAspect && this.camera.aspect > this.cameraMaxAspect) {
                this.#adjustFov(this.cameraMaxAspect);
            } else {
                this.camera.fov = this.cameraFov;
            }
        }
        this.camera.updateProjectionMatrix();
        this.updateWorldSize();
    }

    #adjustFov(aspect: any) {
        const tan = Math.tan(MathUtils.degToRad(this.cameraFov / 2)) / (this.camera.aspect / aspect);
        this.camera.fov = 2 * MathUtils.radToDeg(Math.atan(tan));
    }

    updateWorldSize() {
        if (this.camera.isPerspectiveCamera) {
            const fovRad = (this.camera.fov * Math.PI) / 180;
            this.size.wHeight = 2 * Math.tan(fovRad / 2) * this.camera.position.length();
            this.size.wWidth = this.size.wHeight * this.camera.aspect;
        } else if (this.camera.isOrthographicCamera) {
            this.size.wHeight = this.camera.top - this.camera.bottom;
            this.size.wWidth = this.camera.right - this.camera.left;
        }
    }

    #updateRenderer() {
        this.renderer.setSize(this.size.width, this.size.height);
        this.postprocessing?.setSize(this.size.width, this.size.height);
        let pixelRatio = window.devicePixelRatio;
        if (this.maxPixelRatio && pixelRatio > this.maxPixelRatio) {
            pixelRatio = this.maxPixelRatio;
        } else if (this.minPixelRatio && pixelRatio < this.minPixelRatio) {
            pixelRatio = this.minPixelRatio;
        }
        this.renderer.setPixelRatio(pixelRatio);
        this.size.pixelRatio = pixelRatio;
    }

    #startAnimation() {
        if (this.#isActive) return;
        const animate = () => {
            this.#requestAnimationFrameId = requestAnimationFrame(animate);
            this.#time.delta = this.#clock.getDelta();
            this.#time.elapsed += this.#time.delta;
            this.onBeforeRender(this.#time);
            this.renderer.render(this.scene, this.camera);
            this.onAfterRender(this.#time);
        };
        this.#isActive = true;
        this.#clock.start();
        animate();
    }

    #stopAnimation() {
        if (this.#isActive) {
            cancelAnimationFrame(this.#requestAnimationFrameId);
            this.#isActive = false;
            this.#clock.stop();
        }
    }

    clear() {
        this.scene.traverse((obj: any) => {
            if (obj.isMesh && typeof obj.material === 'object' && obj.material !== null) {
                Object.keys(obj.material).forEach(key => {
                    const prop = obj.material[key];
                    if (prop !== null && typeof prop === 'object' && typeof prop.dispose === 'function') {
                        prop.dispose();
                    }
                });
                obj.material.dispose();
                obj.geometry.dispose();
            }
        });
        this.scene.clear();
    }

    dispose() {
        this.#removeObservers();
        this.#stopAnimation();
        this.clear();
        this.postprocessing?.dispose();
        this.renderer.dispose();
        this.isDisposed = true;
    }
}

const interactionSessions = new Map();
const currentPointer = new Vector2();
let interactionInitialized = false;

function initInteraction(config: any) {
    const session = {
        position: new Vector2(),
        nPosition: new Vector2(),
        hover: false,
        touching: false,
        onEnter(_s: any) { },
        onMove(_s: any) { },
        onClick(_s: any) { },
        onLeave(_s: any) { },
        ...config
    };

    if (!interactionSessions.has(config.domElement)) {
        interactionSessions.set(config.domElement, session);
        if (!interactionInitialized) {
            document.body.addEventListener('pointermove', handlePointerMove);
            document.body.addEventListener('pointerleave', handlePointerLeave);
            document.body.addEventListener('click', handlePointerClick);
            (document.body as any).addEventListener('touchstart', handleTouchStart, { passive: false });
            (document.body as any).addEventListener('touchmove', handleTouchMove, { passive: false });
            (document.body as any).addEventListener('touchend', handleTouchEnd, { passive: false });
            (document.body as any).addEventListener('touchcancel', handleTouchEnd, { passive: false });
            interactionInitialized = true;
        }
    }

    session.dispose = () => {
        interactionSessions.delete(config.domElement);
        if (interactionSessions.size === 0) {
            document.body.removeEventListener('pointermove', handlePointerMove);
            document.body.removeEventListener('pointerleave', handlePointerLeave);
            document.body.removeEventListener('click', handlePointerClick);
            (document.body as any).removeEventListener('touchstart', handleTouchStart);
            (document.body as any).removeEventListener('touchmove', handleTouchMove);
            (document.body as any).removeEventListener('touchend', handleTouchEnd);
            (document.body as any).removeEventListener('touchcancel', handleTouchEnd);
            interactionInitialized = false;
        }
    };
    return session;
}

function handlePointerMove(e: any) {
    currentPointer.x = e.clientX;
    currentPointer.y = e.clientY;
    interactionSessions.forEach((sess, dom) => {
        const rect = dom.getBoundingClientRect();
        if (isPointerInRect(rect)) {
            updateSessPositions(sess, rect);
            if (!sess.hover) {
                sess.hover = true;
                sess.onEnter(sess);
            }
            sess.onMove(sess);
        } else if (sess.hover && !sess.touching) {
            sess.hover = false;
            sess.onLeave(sess);
        }
    });
}

function handlePointerClick(e: any) {
    currentPointer.x = e.clientX;
    currentPointer.y = e.clientY;
    interactionSessions.forEach((sess, dom) => {
        const rect = dom.getBoundingClientRect();
        if (isPointerInRect(rect)) {
            updateSessPositions(sess, rect);
            sess.onClick(sess);
        }
    });
}

function handlePointerLeave() {
    interactionSessions.forEach(sess => {
        if (sess.hover) {
            sess.hover = false;
            sess.onLeave(sess);
        }
    });
}

function handleTouchStart(e: any) {
    // Determine if the user is touching a UI element
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, select, [role="button"]');

    if (isInteractive) {
        // Let the event bubble naturally for UI elements
        return;
    }

    if (e.touches.length > 0) {
        // Prevent default only for non-interactive areas (canvas background)
        e.preventDefault();
        currentPointer.x = e.touches[0].clientX;
        currentPointer.y = e.touches[0].clientY;
        interactionSessions.forEach((sess, dom) => {
            const rect = dom.getBoundingClientRect();
            if (isPointerInRect(rect)) {
                sess.touching = true;
                updateSessPositions(sess, rect);
                if (!sess.hover) {
                    sess.hover = true;
                    sess.onEnter(sess);
                }
                sess.onMove(sess);
            }
        });
    }
}

function handleTouchMove(e: any) {
    // Determine if the user is touching a UI element
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, select, [role="button"], .sidebar-scrollable, .user-panel, .messages-list');

    if (isInteractive) {
        return;
    }

    if (e.touches.length > 0) {
        e.preventDefault();
        currentPointer.x = e.touches[0].clientX;
        currentPointer.y = e.touches[0].clientY;
        interactionSessions.forEach((sess, dom) => {
            const rect = dom.getBoundingClientRect();
            updateSessPositions(sess, rect);
            if (isPointerInRect(rect)) {
                if (!sess.hover) {
                    sess.hover = true;
                    sess.touching = true;
                    sess.onEnter(sess);
                }
                sess.onMove(sess);
            } else if (sess.hover && sess.touching) {
                sess.onMove(sess);
            }
        });
    }
}

function handleTouchEnd() {
    interactionSessions.forEach(sess => {
        if (sess.touching) {
            sess.touching = false;
            if (sess.hover) {
                sess.hover = false;
                sess.onLeave(sess);
            }
        }
    });
}

function updateSessPositions(sess: any, rect: any) {
    sess.position.x = currentPointer.x - rect.left;
    sess.position.y = currentPointer.y - rect.top;
    sess.nPosition.x = (sess.position.x / rect.width) * 2 - 1;
    sess.nPosition.y = (-sess.position.y / rect.height) * 2 + 1;
}

function isPointerInRect(rect: any) {
    return currentPointer.x >= rect.left && currentPointer.x <= rect.left + rect.width && currentPointer.y >= rect.top && currentPointer.y <= rect.top + rect.height;
}

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const v4 = new Vector3();
const v5 = new Vector3();
const v6 = new Vector3();
const v7 = new Vector3();
const v8 = new Vector3();
const v9 = new Vector3();
const v10 = new Vector3();

class PhysicsEngine {
    config: any;
    positionData: Float32Array;
    velocityData: Float32Array;
    sizeData: Float32Array;
    center = new Vector3();

    constructor(config: any) {
        this.config = config;
        this.positionData = new Float32Array(3 * config.count).fill(0);
        this.velocityData = new Float32Array(3 * config.count).fill(0);
        this.sizeData = new Float32Array(config.count).fill(1);
        this.reset();
    }

    reset() {
        const { config, positionData } = this;
        this.center.toArray(positionData, 0);
        for (let i = 1; i < config.count; i++) {
            const base = 3 * i;
            positionData[base] = MathUtils.randFloatSpread(2 * config.maxX);
            positionData[base + 1] = MathUtils.randFloatSpread(2 * config.maxY);
            positionData[base + 2] = MathUtils.randFloatSpread(2 * config.maxZ);
        }
        this.sizeData[0] = config.size0;
        for (let i = 1; i < config.count; i++) {
            this.sizeData[i] = MathUtils.randFloat(config.minSize, config.maxSize);
        }
    }

    update(dt: number) {
        const { config, center, positionData, sizeData, velocityData } = this;
        let start = 0;
        if (config.controlSphere0) {
            start = 1;
            v1.fromArray(positionData, 0).lerp(center, 0.1).toArray(positionData, 0);
            v4.set(0, 0, 0).toArray(velocityData, 0);
        }

        for (let idx = start; idx < config.count; idx++) {
            const base = 3 * idx;
            v2.fromArray(positionData, base);
            v5.fromArray(velocityData, base);
            v5.y -= dt * config.gravity * sizeData[idx];
            v5.multiplyScalar(config.friction).clampLength(0, config.maxVelocity);
            v2.add(v5).toArray(positionData, base);
            v5.toArray(velocityData, base);
        }

        for (let idx = start; idx < config.count; idx++) {
            const base = 3 * idx;
            v2.fromArray(positionData, base);
            v5.fromArray(velocityData, base);
            const r1 = sizeData[idx];

            for (let jdx = idx + 1; jdx < config.count; jdx++) {
                const b2 = 3 * jdx;
                v3.fromArray(positionData, b2);
                v6.fromArray(velocityData, b2);
                const r2 = sizeData[jdx];
                v7.copy(v3).sub(v2);
                const dist = v7.length();
                if (dist < r1 + r2) {
                    const overlap = (r1 + r2 - dist) * 0.5;
                    v8.copy(v7).normalize().multiplyScalar(overlap);
                    v9.copy(v8).multiplyScalar(Math.max(v5.length(), 1));
                    v10.copy(v8).multiplyScalar(Math.max(v6.length(), 1));
                    v2.sub(v8).toArray(positionData, base);
                    v5.sub(v9).toArray(velocityData, base);
                    v3.add(v8).toArray(positionData, b2);
                    v6.add(v10).toArray(velocityData, b2);
                }
            }
            if (config.controlSphere0) {
                v1.fromArray(positionData, 0);
                v7.copy(v1).sub(v2);
                const dist = v7.length();
                const r0 = sizeData[0];
                if (dist < r1 + r0) {
                    v8.copy(v7.normalize()).multiplyScalar(r1 + r0 - dist);
                    v2.sub(v8).toArray(positionData, base);
                    v5.sub(v9.copy(v8).multiplyScalar(Math.max(v5.length(), 2))).toArray(velocityData, base);
                }
            }
            if (Math.abs(v2.x) + r1 > config.maxX) {
                v2.x = Math.sign(v2.x) * (config.maxX - r1);
                v5.x = -v5.x * config.wallBounce;
            }
            if (config.gravity === 0) {
                if (Math.abs(v2.y) + r1 > config.maxY) {
                    v2.y = Math.sign(v2.y) * (config.maxY - r1);
                    v5.y = -v5.y * config.wallBounce;
                }
            } else if (v2.y - r1 < -config.maxY) {
                v2.y = -config.maxY + r1;
                v5.y = -v5.y * config.wallBounce;
            }
            const maxZ = Math.max(config.maxZ, config.maxSize);
            if (Math.abs(v2.z) + r1 > maxZ) {
                v2.z = Math.sign(v2.z) * (config.maxZ - r1);
                v5.z = -v5.z * config.wallBounce;
            }
            v2.toArray(positionData, base);
            v5.toArray(velocityData, base);
        }
    }
}

class CustomMaterial extends MeshPhysicalMaterial {
    customUniforms: any;
    onBeforeCompile2: any;
    constructor(params: any) {
        super(params);
        this.customUniforms = {
            thicknessDistortion: { value: 0.1 },
            thicknessAmbient: { value: 0 },
            thicknessAttenuation: { value: 0.1 },
            thicknessPower: { value: 2 },
            thicknessScale: { value: 10 }
        };
        (this as any).defines = { USE_UV: '' };
        this.onBeforeCompile = (shader: any) => {
            Object.assign(shader.uniforms, this.customUniforms);
            shader.fragmentShader = '\nuniform float thicknessPower;\nuniform float thicknessScale;\nuniform float thicknessDistortion;\nuniform float thicknessAmbient;\nuniform float thicknessAttenuation;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', '\nvoid RE_Direct_Scattering(const in IncidentLight directLight, const in vec2 uv, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, inout ReflectedLight reflectedLight) {\n  vec3 scatteringHalf = normalize(directLight.direction + (geometryNormal * thicknessDistortion));\n  float scatteringDot = pow(saturate(dot(geometryViewDir, -scatteringHalf)), thicknessPower) * thicknessScale;\n  #ifdef USE_COLOR\n    vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * vColor;\n  #else\n    vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * diffuse;\n  #endif\n  reflectedLight.directDiffuse += scatteringIllu * thicknessAttenuation * directLight.color;\n}\nvoid main() {');
            const chunk = ShaderChunk.lights_fragment_begin.replaceAll('RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );', '\nRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\nRE_Direct_Scattering(directLight, vUv, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, reflectedLight);\n');
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
            if (this.onBeforeCompile2) this.onBeforeCompile2(shader);
        };
    }
}

const BALLPIT_DEFAULTS = {
    count: 200,
    colors: [0x5865F2, 0x4752c4, 0x3b448f],
    ambientColor: 0xffffff,
    ambientIntensity: 1,
    lightIntensity: 200,
    materialParams: { metalness: 0.5, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.15 },
    minSize: 0.5, maxSize: 1, size0: 1, gravity: 0.5, friction: 0.9975, wallBounce: 0.95, maxVelocity: 0.15,
    maxX: 5, maxY: 5, maxZ: 2, controlSphere0: false, followCursor: true
};

const DUMMY = new Object3D();

class BallpitGroup extends Object3D {
    mesh: any;
    physics: PhysicsEngine;
    ambient: any;
    light: any;
    config: any;

    constructor(renderer: any, config = {}) {
        super();
        this.config = { ...BALLPIT_DEFAULTS, ...config };
        this.physics = new PhysicsEngine(this.config);

        const pmrem = new PMREMGenerator(renderer);
        const envTexture = pmrem.fromScene(new Scene()).texture;
        const geometry = new SphereGeometry();
        const material = new CustomMaterial({ envMap: envTexture, ...this.config.materialParams });
        (material as any).envMapRotation.x = -Math.PI / 2;

        this.mesh = new InstancedMesh(geometry, material, this.config.count);
        this.add(this.mesh);

        this.ambient = new AmbientLight(this.config.ambientColor, this.config.ambientIntensity);
        this.add(this.ambient);

        this.light = new PointLight(this.config.colors[0], this.config.lightIntensity);
        this.add(this.light);

        this.updateColors();
    }

    updateColors() {
        const colors = this.config.colors.map((c: any) => new Color(c));
        const count = this.mesh.count;
        for (let i = 0; i < count; i++) {
            const ratio = i / count;
            const scaled = ratio * (colors.length - 1);
            const idx = Math.floor(scaled);
            const start = colors[idx];
            const end = colors[Math.min(idx + 1, colors.length - 1)];
            const alpha = scaled - idx;
            const col = new Color().copy(start).lerp(end, alpha);
            this.mesh.setColorAt(i, col);
            if (i === 0) this.light.color.copy(col);
        }
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    update(dt: number) {
        this.physics.update(dt);
        const count = this.mesh.count;
        for (let i = 0; i < count; i++) {
            DUMMY.position.fromArray(this.physics.positionData, 3 * i);

            // Sphere 0 is the interactive cursor sphere. 
            // We set its scale to 0 to make it invisible while preserving its physics interaction.
            if (i === 0) {
                DUMMY.scale.setScalar(0);
            } else {
                DUMMY.scale.setScalar(this.physics.sizeData[i]);
            }

            DUMMY.updateMatrix();
            this.mesh.setMatrixAt(i, DUMMY.matrix);
            if (i === 0) this.light.position.copy(DUMMY.position);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

function createBallpit(canvas: any, config = {}) {
    const manager = new ThreeManager({ canvas, size: 'parent', rendererOptions: { antialias: true, alpha: true } });
    manager.renderer.toneMapping = ACESFilmicToneMapping;
    manager.camera.position.set(0, 0, 20);
    manager.camera.lookAt(0, 0, 0);
    manager.cameraMaxAspect = 1.5;
    manager.resize();

    const ballpit = new BallpitGroup(manager.renderer, config);
    manager.scene.add(ballpit);

    const raycaster = new Raycaster();
    const plane = new Plane(new Vector3(0, 0, 1), 0);
    const intersect = new Vector3();
    const interaction = initInteraction({
        domElement: canvas,
        onMove() {
            raycaster.setFromCamera(interaction.nPosition, manager.camera);
            manager.camera.getWorldDirection(plane.normal);
            raycaster.ray.intersectPlane(plane, intersect);
            ballpit.physics.center.copy(intersect);
            ballpit.config.controlSphere0 = true;
        },
        onLeave() { ballpit.config.controlSphere0 = false; }
    });

    manager.onBeforeRender = (time: any) => ballpit.update(time.delta);
    manager.onAfterResize = (size: any) => {
        ballpit.config.maxX = size.wWidth / 2;
        ballpit.config.maxY = size.wHeight / 2;
    };

    return { dispose: () => { interaction.dispose(); manager.dispose(); } };
}

const Ballpit = ({
    count = 100, gravity = 0.5, friction = 0.9975, wallBounce = 0.95, followCursor = true,
    colors = [0x5865F2, 0x4752c4, 0x3b448f]
}: {
    count?: number, gravity?: number, friction?: number, wallBounce?: number,
    followCursor?: boolean, colors?: (string | number)[]
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!canvasRef.current) return;
        const instance = createBallpit(canvasRef.current, { count, gravity, friction, wallBounce, followCursor, colors });
        return () => instance.dispose();
    }, [count, gravity, friction, wallBounce, followCursor, colors]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

export default Ballpit;
