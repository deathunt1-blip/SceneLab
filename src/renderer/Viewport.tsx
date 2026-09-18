import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { activeScheme, useStore } from "../store";
import {
  createEnvironment,
  disposeGroup,
  heatColor,
  label,
  line,
  makeSceneObject,
} from "./scene";
import { basis, dot, rad } from "../simulation/math";
import type { SceneObject, Vec3 } from "../models";
import { analyzePoint, worldMarkers } from "../simulation/engine";
import { pointInVolume } from "../simulation/volume";
type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls;
  transform: TransformControls;
  content: THREE.Group;
  objects: Map<string, THREE.Group>;
  draw: () => void;
  resize: () => void;
  focus: () => void;
};
let runtime: Runtime | null = null;
function readPose(group: THREE.Object3D, source: SceneObject): Partial<SceneObject> {
  const position = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  group.updateWorldMatrix(true, false);
  group.matrixWorld.decompose(position, quaternion, scale);
  let rotation: Vec3;
  if (source.kind === "camera") {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
      right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const yaw = (Math.atan2(forward.x, forward.y) * 180) / Math.PI,
      pitch = (Math.atan2(forward.z, Math.hypot(forward.x, forward.y)) * 180) / Math.PI;
    const b = basis([yaw, pitch, 0]);
    rotation = [
      yaw,
      pitch,
      (Math.atan2(
        dot(right.toArray() as Vec3, b[1]),
        dot(right.toArray() as Vec3, b[0]),
      ) *
        180) /
        Math.PI,
    ];
  } else {
    const e = new THREE.Euler().setFromQuaternion(quaternion, "ZYX");
    rotation = [e.z, e.y, e.x].map((v) => (v * 180) / Math.PI) as Vec3;
  }
  return {
    position: position.toArray() as Vec3,
    rotation,
    size: source.size.map((v, i) => Math.max(0.01, v * scale.getComponent(i))) as Vec3,
    mount: undefined,
  };
}
export function captureViewport() {
  if (!runtime) return "";
  const h = runtime.transform.getHelper(),
    v = h.visible;
  h.visible = false;
  runtime.draw();
  const result = runtime.renderer.domElement.toDataURL("image/png");
  h.visible = v;
  return result;
}
export function Viewport() {
  const host = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  if (runtimeRef.current) runtime = runtimeRef.current;
  const state = useStore(),
    scheme = activeScheme(state);
  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#eaf0f1");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#798c94", 2.6));
    const light = new THREE.DirectionalLight("#fff7e9", 3);
    light.position.set(6, -3, 12);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 2000);
    camera.up.set(0, 0, 1);
    camera.position.set(13, -17, 13);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 1.6);
    controls.enableDamping = true;
    controls.mouseButtons = {
      LEFT: undefined as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.update();
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.8);
    scene.add(transform.getHelper());
    const content = new THREE.Group();
    scene.add(content);
    const rt: Runtime = {
      renderer,
      scene,
      camera,
      controls,
      transform,
      content,
      objects: new Map(),
      draw: () => renderer.render(scene, rt.camera),
      resize: () => {
        const w = el.clientWidth,
          h = el.clientHeight;
        renderer.setSize(w, h);
        const aspect = w / h;
        if (rt.camera instanceof THREE.PerspectiveCamera) rt.camera.aspect = aspect;
        else {
          const sz = Math.max(...activeScheme(useStore.getState()).boundary) * 0.72;
          rt.camera.left = -sz * aspect;
          rt.camera.right = sz * aspect;
          rt.camera.top = sz;
          rt.camera.bottom = -sz;
        }
        rt.camera.updateProjectionMatrix();
      },
      focus: () => {
        const st = useStore.getState(),
          s = activeScheme(st);
        const obj = s.objects.find((o) => o.id === st.selected[0]);
        const target = obj
          ? new THREE.Vector3(...obj.position)
          : new THREE.Vector3(0, 0, s.boundary[2] * 0.3);
        const extent =
          obj?.kind === "marker"
            ? (obj.diameter || 12) / 1000
            : obj?.kind === "rigidBody"
              ? Math.max(
                  0.05,
                  ...(obj.markers || []).map(
                    (m) => Math.hypot(...m.position) * 2 + m.diameter / 1000,
                  ),
                )
              : obj?.kind === "camera"
                ? 0.8
                : obj
                  ? Math.max(...obj.size)
                  : Math.max(...s.boundary);
        const delta = rt.camera.position
          .clone()
          .sub(rt.controls.target)
          .normalize()
          .multiplyScalar(obj ? Math.max(0.05, extent * 3) : extent * 2.1);
        if (rt.camera instanceof THREE.OrthographicCamera) {
          rt.camera.zoom = obj ? (rt.camera.top - rt.camera.bottom) / (extent * 2.2) : 1;
          rt.camera.updateProjectionMatrix();
        }
        rt.controls.target.copy(target);
        rt.camera.position.copy(target).add(delta);
        rt.controls.update();
      },
    };
    runtime = rt;
    runtimeRef.current = rt;
    const observer = new ResizeObserver(rt.resize);
    observer.observe(el);
    rt.resize();
    let changing = false,
      dragged = false;
    transform.addEventListener("dragging-changed", (e) => {
      controls.enabled = !e.value;
      changing = Boolean(e.value);
      if (e.value) dragged = true;
    });
    const transformed = () => {
      const st = useStore.getState(),
        obj = transform.object;
      if (!obj) return {};
      const ids: string[] = obj.userData.ids || [obj.userData.id];
      return Object.fromEntries(
        activeScheme(st)
          .objects.filter((o) => ids.includes(o.id) && !o.locked)
          .map((o) => [o.id, readPose(rt.objects.get(o.id)!, o)]),
      );
    };
    transform.addEventListener("objectChange", () => {
      if (transform.dragging) useStore.getState().set({ livePose: transformed() });
    });
    transform.addEventListener("mouseUp", () => {
      const poses = transformed(),
        st = useStore.getState();
      if (Object.keys(poses).length)
        st.edit((s) => {
          s.objects = s.objects.map((o) => (poses[o.id] ? { ...o, ...poses[o.id] } : o));
        });
      st.set({ livePose: null });
    });
    const pointer = new THREE.Vector2(),
      ray = new THREE.Raycaster();
    let start = [0, 0];
    const down = (e: PointerEvent) => {
      el.focus({ preventScroll: true });
      start = [e.clientX, e.clientY];
      dragged = false;
    };
    const click = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        changing ||
        dragged ||
        Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5 ||
        transform.axis
      )
        return;
      const rect = el.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, rt.camera);
      const st = useStore.getState();
      const hits = ray
        .intersectObjects(
          [...rt.objects.values()].filter((o) => o.visible),
          true,
        )
        .filter(
          (h) => h.object instanceof THREE.Mesh || h.object instanceof THREE.LineSegments,
        );
      if (hits.length) {
        let o = hits[0].object;
        while (o.parent && !o.userData.id) o = o.parent;
        if (o.userData.id) {
          st.select(o.userData.id, e.shiftKey || e.ctrlKey || e.metaKey);
          return;
        }
      }
      // Keep millimetre-sized markers selectable without enlarging their geometry.
      const nearby = activeScheme(st)
        .objects.filter((o) => o.visible && ["marker", "rigidBody"].includes(o.kind))
        .flatMap((o) =>
          worldMarkers(o).map((m) => {
            const p = new THREE.Vector3(...m.position).project(rt.camera);
            return {
              id: o.id,
              z: p.z,
              distance: Math.hypot(
                ((p.x - pointer.x) * rect.width) / 2,
                ((p.y - pointer.y) * rect.height) / 2,
              ),
            };
          }),
        )
        .filter((p) => p.z >= -1 && p.z <= 1 && p.distance <= 8)
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearby) {
        st.select(nearby.id, e.shiftKey || e.ctrlKey || e.metaKey);
        return;
      }
      if (st.mode === "analysis") {
        const target = new THREE.Vector3();
        const s = activeScheme(st);
        if (
          ray.ray.intersectPlane(
            st.view === "front"
              ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
              : st.view === "side"
                ? new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
                : new THREE.Plane(
                    new THREE.Vector3(0, 0, 1),
                    -Math.min(st.clip, s.boundary[2]),
                  ),
            target,
          ) &&
          pointInVolume(target.toArray() as Vec3, s.boundary)
        )
          st.set({ point: target.toArray() as Vec3, selected: [] });
      } else st.set({ selected: [] });
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", click);
    const context = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", context);
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      rt.draw();
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", click);
      el.removeEventListener("contextmenu", context);
      transform.dispose();
      controls.dispose();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
      runtime = null;
    };
  }, []);
  useEffect(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    rt.transform.detach();
    disposeGroup(rt.content);
    rt.content.clear();
    rt.objects.clear();
    rt.content.add(createEnvironment(scheme));
    for (const o of scheme.objects) {
      const g = makeSceneObject(o, state.selected.includes(o.id), state.frustums);
      rt.content.add(g);
      rt.objects.set(o.id, g);
      if (
        o.visible &&
        (o.kind === "camera" || o.kind === "marker" || o.kind === "rigidBody")
      ) {
        const l = label(
          o.name,
          state.selected.includes(o.id) ? "#b77828" : "#496069",
          o.kind === "camera" ? 0.19 : 0.18,
        );
        l.position.set(o.position[0], o.position[1], o.position[2] + 0.32);
        rt.content.add(l);
      }
    }
    const editable = scheme.objects.filter(
      (o) => state.selected.includes(o.id) && !o.locked && o.visible,
    );
    const selected = editable[0];
    if (selected && !selected.locked && selected.visible && state.mode === "design") {
      rt.transform.setMode(
        state.tool === "scale" &&
          (editable.length > 1 ||
            ["camera", "marker", "rigidBody"].includes(selected.kind))
          ? "translate"
          : state.tool,
      );
      if (editable.length === 1) rt.transform.attach(rt.objects.get(selected.id)!);
      else {
        const pivot = new THREE.Group();
        pivot.userData.ids = editable.map((o) => o.id);
        editable.forEach((o) => pivot.position.add(new THREE.Vector3(...o.position)));
        pivot.position.multiplyScalar(1 / editable.length);
        rt.content.add(pivot);
        pivot.updateWorldMatrix(true, false);
        editable.forEach((o) => pivot.attach(rt.objects.get(o.id)!));
        rt.transform.attach(pivot);
      }
    }
    if (state.result && state.result.schemeId === scheme.id && state.layer !== "none") {
      const result = state.result,
        indices: number[] = [];
      const stride = Math.max(1, Math.ceil(result.counts.length / 60000));
      for (let i = 0; i < result.counts.length; i += stride)
        if (result.positions[i * 3 + 2] <= state.clip) indices.push(i);
      // Fill the sampled cell equally on every axis, including in side views.
      const voxelSize =
        result.voxelSize ??
        scheme.boundary.map(
          (length) => length / Math.ceil(length / scheme.settings.voxel),
        );
      const fill = 0.98;
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(
          voxelSize[0] * fill,
          voxelSize[1] * fill,
          voxelSize[2] * fill,
        ),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: state.opacity * 0.53,
          depthWrite: false,
        }),
        indices.length,
      );
      const matrix = new THREE.Matrix4();
      const maximum = Math.max(
        5,
        ...scheme.objects
          .filter((o) => o.kind === "camera" && o.enabled)
          .map((_, i) => i + 1),
      );
      indices.forEach((i, j) => {
        matrix.makeTranslation(
          result.positions[i * 3],
          result.positions[i * 3 + 1],
          result.positions[i * 3 + 2],
        );
        mesh.setMatrixAt(j, matrix);
        mesh.setColorAt(
          j,
          heatColor(
            result.counts[i],
            result.errors[i],
            state.layer,
            maximum,
            scheme.settings.errorThreshold * 2,
          ),
        );
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      rt.content.add(mesh);
    }
    if (
      state.point &&
      state.mode === "analysis" &&
      pointInVolume(state.point, scheme.boundary)
    ) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(scheme.settings.markerDiameter / 2000, 24, 18),
        new THREE.MeshBasicMaterial({ color: "#ef8c2f", depthTest: false }),
      );
      sphere.position.set(...state.point);
      sphere.renderOrder = 10;
      rt.content.add(sphere);
      const results = analyzePoint(state.point, scheme.settings.markerDiameter, scheme);
      for (const o of results.observations) {
        const c = scheme.objects.find((c) => c.id === o.cameraId)!;
        rt.content.add(
          line(
            [c.position, state.point],
            o.valid ? "#0e9d80" : "#d67862",
            o.valid ? 0.55 : 0.16,
          ),
        );
      }
    }
  }, [
    scheme,
    state.selected,
    state.frustums,
    state.layer,
    state.result,
    state.clip,
    state.opacity,
    state.tool,
    state.mode,
    state.point,
  ]);
  useEffect(() => {
    const rt = runtime;
    if (!rt) return;
    rt.transform.setSpace(state.space);
    rt.transform.setTranslationSnap(state.snap || null);
    rt.transform.setRotationSnap(state.angleSnap ? rad(state.angleSnap) : null);
  }, [state.space, state.snap, state.angleSnap]);
  useEffect(() => {
    const rt = runtime;
    if (!rt) return;
    const s = activeScheme(useStore.getState()),
      size = Math.max(...s.boundary),
      aspect = host.current!.clientWidth / host.current!.clientHeight,
      target = new THREE.Vector3(0, 0, s.boundary[2] * 0.35);
    const camera =
      state.view === "perspective"
        ? new THREE.PerspectiveCamera(42, aspect, 0.02, 2000)
        : new THREE.OrthographicCamera(
            -size * aspect * 0.72,
            size * aspect * 0.72,
            size * 0.72,
            -size * 0.72,
            0.02,
            2000,
          );
    camera.up.set(0, 0, 1);
    if (state.view === "top") {
      camera.position.set(0, 0, size * 2.2);
      camera.up.set(0, 1, 0);
      target.set(0, 0, 0);
    } else if (state.view === "front") {
      camera.position.set(0, -size * 2.2, s.boundary[2] / 2);
      target.z = s.boundary[2] / 2;
    } else if (state.view === "side") {
      camera.position.set(size * 2.2, 0, s.boundary[2] / 2);
      target.z = s.boundary[2] / 2;
    } else camera.position.set(size * 1.1, -size * 1.4, size * 1.1);
    rt.camera = camera;
    rt.controls.object = camera;
    rt.controls.target.copy(target);
    rt.controls.enableRotate =
      state.view === "perspective" || state.view === "orthographic";
    rt.controls.update();
    rt.transform.camera = camera;
    rt.resize();
  }, [state.view, scheme.id]);
  useEffect(() => {
    if (state.focusTick) runtime?.focus();
  }, [state.focusTick]);
  return <div className="three-host" ref={host} tabIndex={0} data-testid="viewport" />;
}
