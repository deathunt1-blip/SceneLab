import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Scheme } from "../models";
import type { Constraints, Recommendation } from "../autoDeploy/types";
import { candidateScheme } from "../autoDeploy/candidateGenerator";
import {
  createEnvironment,
  disposeGroup,
  heatColor,
  makeSceneObject,
} from "../renderer/scene";
import { buildHeatmapCells } from "../renderer/heatmap";
import { viewCount } from "../simulation/engine";
import { useT } from "../i18n";

export function AutoDeployPreview({
  source,
  constraints,
  plan,
}: {
  source: Scheme;
  constraints: Constraints;
  plan: Recommendation;
}) {
  const host = useRef<HTMLDivElement>(null),
    t = useT();
  const pose = useRef<{
    id: string;
    view: string;
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const [layer, setLayer] = useState<"none" | "coverage" | "accuracy">("none"),
    [view, setView] = useState("perspective"),
    [clip, setClip] = useState(constraints.boundary[2]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#eaf0f1");
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      content = new THREE.Group();
    scene.add(content, new THREE.HemisphereLight("#ffffff", "#78939b", 3));
    const light = new THREE.DirectionalLight("#ffffff", 3);
    light.position.set(4, -5, 10);
    scene.add(light);
    const s = candidateScheme(source, constraints, plan.candidate),
      [x, y, z] = s.boundary,
      extent = Math.max(x, y, z),
      target = new THREE.Vector3(0, 0, z / 2);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.02, Math.max(2000, extent * 10));
    camera.up.set(0, 0, 1);
    camera.position
      .copy(target)
      .add(
        new THREE.Vector3(
          ...(view === "top"
            ? [0, 0.0001, extent * 1.8]
            : view === "front"
              ? [0, -extent * 1.8, 0]
              : [extent * 0.85, -extent * 1.1, extent * 0.85]),
        ),
      );
    const controls = new OrbitControls(camera, el);
    controls.target.copy(target);
    if (pose.current?.id === plan.candidate.id && pose.current.view === view) {
      camera.position.copy(pose.current.position);
      controls.target.copy(pose.current.target);
    }
    controls.update();
    content.add(createEnvironment(s));
    for (const o of s.objects) {
      const g = makeSceneObject(o, false, false);
      if (o.kind === "camera")
        g.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh)
            for (const material of Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material]) {
              if ("color" in material)
                (material as THREE.MeshStandardMaterial).color.set("#288e7b");
              material.transparent = true;
              material.opacity = 0.68;
            }
        });
      content.add(g);
    }
    if (layer !== "none") {
      const cells = buildHeatmapCells(plan.result, Math.min(clip, z));
      const mesh = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
          }),
          cells.length,
        ),
        matrix = new THREE.Matrix4();
      cells.forEach((cell, i) => {
        matrix.makeScale(...cell.size);
        matrix.setPosition(...cell.position);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(
          i,
          heatColor(
            cell.count,
            cell.error,
            layer,
            Math.max(5, viewCount(s)),
            constraints.errorThreshold * 2,
          ),
        );
      });
      content.add(mesh);
    }
    const draw = () => renderer.render(scene, camera),
      resize = () => {
        const { width, height } = el.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        draw();
      };
    controls.addEventListener("change", draw);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => {
      pose.current = {
        id: plan.candidate.id,
        view,
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      observer.disconnect();
      controls.dispose();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [source, constraints, plan, layer, view, clip]);
  return (
    <div className="ad-preview">
      <div className="ad-preview-bar">
        <span>{t("adPreviewOnly")}</span>
        <select
          aria-label={t("perspective")}
          value={view}
          onChange={(e) => setView(e.target.value)}
        >
          {["perspective", "top", "front"].map((v) => (
            <option key={v} value={v}>
              {t(v)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("adPreviewLayer")}
          value={layer}
          onChange={(e) => setLayer(e.target.value as typeof layer)}
        >
          {["none", "coverage", "accuracy"].map((v) => (
            <option key={v} value={v}>
              {t(v === "none" ? "normal" : v)}
            </option>
          ))}
        </select>
      </div>
      <div className="ad-preview-canvas" ref={host} />
      {layer !== "none" && (
        <label className="ad-clip">
          {t("clip")} {clip.toFixed(1)} m{" "}
          <input
            type="range"
            min="0"
            max={constraints.boundary[2]}
            step="0.1"
            value={clip}
            onChange={(e) => setClip(Number(e.target.value))}
          />
        </label>
      )}
    </div>
  );
}
