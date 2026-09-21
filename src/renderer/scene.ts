import * as THREE from "three";
import type { SceneObject, Scheme, Vec3 } from "../models";
import { basis, rad } from "../simulation/math";
export function orient(group: THREE.Object3D, o: SceneObject) {
  group.position.set(...o.position);
  if (o.kind === "camera") {
    const axes = basis(o.rotation);
    group.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        ...(axes.map((v) => new THREE.Vector3(...v)) as [
          THREE.Vector3,
          THREE.Vector3,
          THREE.Vector3,
        ]),
      ),
    );
  } else
    group.rotation.set(rad(o.rotation[2]), rad(o.rotation[1]), rad(o.rotation[0]), "ZYX");
}
function material(color: string, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.18,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });
}
export function line(points: Vec3[], color: string, opacity = 1) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points.map((v) => new THREE.Vector3(...v))),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
}
export function label(text: string, color = "#536672", size = 0.22) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.font = '500 40px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(size * 5.33, size, 1);
  sprite.userData.noPick = true;
  return sprite;
}
function beam(a: Vec3, b: Vec3, r: number, color: string) {
  const delta = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, delta.length(), 6),
    material(color),
  );
  mesh.position.copy(
    new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5),
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}
export function makeSceneObject(
  o: SceneObject,
  selected: boolean,
  showFrustum: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.userData.id = o.id;
  orient(group, o);
  group.visible = o.visible;
  const accent = selected ? "#f4a83b" : "#16a58f";
  if (o.kind === "camera") {
    const stereo = o.camera_model_snapshot?.stereo;
    if (stereo) {
      const housing = o.camera_model_snapshot!.housing_mm ?? [
        stereo.baseline_mm + 44,
        56,
        38.5,
      ];
      const [width, height, depth] = housing.map((v) => v / 1000);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material(selected ? "#efa33b" : "#31474d"),
      );
      body.position.z = -depth / 2;
      group.add(body);
      for (const side of [-1, 1]) {
        const x = (side * stereo.baseline_mm) / 2000;
        const lens = new THREE.Mesh(
          new THREE.CircleGeometry(0.012, 24),
          material(accent),
        );
        lens.position.set(x, 0, 0.001);
        group.add(lens);
        const glass = new THREE.Mesh(
          new THREE.CircleGeometry(0.009, 24),
          material("#061e25"),
        );
        glass.position.set(x, 0, 0.002);
        group.add(glass);
        for (const dx of [-0.015, 0.015])
          for (const y of [-0.018, 0.018]) {
            const led = new THREE.Mesh(
              new THREE.CircleGeometry(0.003, 8),
              material("#a1dad0"),
            );
            led.position.set(x + dx, y, 0.001);
            group.add(led);
          }
      }
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.18, 0.19),
        material(selected ? "#efa33b" : "#31474d"),
      );
      body.position.z = -0.07;
      group.add(body);
      const face = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.19, 0.015),
        material("#19262a"),
      );
      face.position.z = 0.035;
      group.add(face);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.057, 0.057, 0.08, 20),
        material(accent),
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.z = 0.065;
      group.add(lens);
      const glass = new THREE.Mesh(
        new THREE.CircleGeometry(0.042, 20),
        material("#061e25"),
      );
      glass.position.z = 0.108;
      group.add(glass);
      for (const [x, y] of [
        [-0.09, -0.055],
        [0.09, -0.055],
        [-0.09, 0.055],
        [0.09, 0.055],
      ]) {
        const led = new THREE.Mesh(
          new THREE.SphereGeometry(0.013, 8, 6),
          material("#a1dad0"),
        );
        led.position.set(x, y, 0.047);
        group.add(led);
      }
    }
    if ((selected || showFrustum) && o.enabled && o.camera_model_snapshot) {
      for (const offset of stereo
        ? [-stereo.baseline_mm / 2000, stereo.baseline_mm / 2000]
        : [0]) {
        const frustum = new THREE.Group();
        frustum.userData.noPick = true;
        frustum.position.x = offset;
        group.add(frustum);
        const m = o.camera_model_snapshot,
          d = selected ? 3.4 : 1.35;
        const pts: Vec3[] = [
          [(-m.cx / m.fx) * d, (-m.cy / m.fy) * d, d],
          [((m.resolution_width - m.cx) / m.fx) * d, (-m.cy / m.fy) * d, d],
          [
            ((m.resolution_width - m.cx) / m.fx) * d,
            ((m.resolution_height - m.cy) / m.fy) * d,
            d,
          ],
          [(-m.cx / m.fx) * d, ((m.resolution_height - m.cy) / m.fy) * d, d],
        ];
        for (const p of pts)
          frustum.add(line([[0, 0, 0], p], accent, selected ? 0.55 : 0.24));
        frustum.add(line([...pts, pts[0]], accent, selected ? 0.65 : 0.3));
        if (selected) {
          const vertices = new Float32Array([
            0,
            0,
            0,
            ...pts[0],
            ...pts[1],
            0,
            0,
            0,
            ...pts[1],
            ...pts[2],
            0,
            0,
            0,
            ...pts[2],
            ...pts[3],
            0,
            0,
            0,
            ...pts[3],
            ...pts[0],
          ]);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
          frustum.add(
            new THREE.Mesh(
              geo,
              new THREE.MeshBasicMaterial({
                color: accent,
                transparent: true,
                opacity: 0.035,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
            ),
          );
        }
      }
    }
  } else if (o.kind === "marker" || o.kind === "rigidBody") {
    const points =
      o.kind === "marker"
        ? [{ position: [0, 0, 0] as Vec3, diameter: o.diameter || 12 }]
        : o.markers || [];
    for (const p of points) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(p.diameter / 2000, 24, 18),
        material(selected ? "#f4a83b" : "#f06e55"),
      );
      sphere.position.set(...p.position);
      group.add(sphere);
      if (o.kind === "rigidBody")
        group.add(
          beam([0, 0, 0], p.position, Math.min(0.003, p.diameter / 4000), "#586972"),
        );
    }
  } else if (o.kind === "truss") {
    const axis = o.size[0] >= o.size[1] ? 0 : 1;
    const len = o.size[axis];
    const map = (u: number, v: number, w: number): Vec3 =>
      axis === 0 ? [u, v, w] : [v, u, w];
    const h = 0.12;
    for (const a of [-h, h])
      for (const b of [-h, h])
        group.add(
          beam(
            map(-len / 2, a, b),
            map(len / 2, a, b),
            0.024,
            selected ? "#d9983d" : "#869499",
          ),
        );
    const n = Math.ceil(len / 0.6);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (i * len) / n,
        y = x + len / n;
      for (const side of [-h, h]) {
        group.add(beam(map(x, side, -h), map(y, side, h), 0.013, "#9ba7ac"));
        group.add(beam(map(x, -h, side), map(y, h, side), 0.013, "#9ba7ac"));
      }
    }
  } else {
    let geo: THREE.BufferGeometry;
    if (o.kind === "cylinder") {
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 40);
      geo.rotateX(Math.PI / 2);
      geo.scale(...o.size);
    } else geo = new THREE.BoxGeometry(...o.size);
    const mesh = new THREE.Mesh(
      geo,
      material(
        selected
          ? "#c39c65"
          : o.kind === "tube"
            ? "#b9c5ca"
            : o.kind === "surface"
              ? "#c1cdd0"
              : "#8b9fa8",
        o.kind === "tube" ? 1 : o.kind === "surface" ? 0.4 : 0.72,
      ),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({
          color: selected ? "#d98e30" : "#778e99",
          transparent: true,
          opacity: 0.65,
        }),
      ),
    );
  }
  if (!o.enabled)
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((m) => {
          m.transparent = true;
          m.opacity = 0.22;
        });
      }
    });
  return group;
}
export function createEnvironment(s: Scheme) {
  const group = new THREE.Group(),
    [x, y, z] = s.boundary;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(x, y),
    new THREE.MeshStandardMaterial({
      color: "#e0e8e9",
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  floor.position.z = -0.022;
  floor.receiveShadow = true;
  group.add(floor);
  const gridColor = "#bdcccf";
  for (let i = Math.ceil(-x / 2); i <= x / 2; i++)
    group.add(
      line(
        [
          [i, -y / 2, 0],
          [i, y / 2, 0],
        ],
        gridColor,
        0.5,
      ),
    );
  for (let i = Math.ceil(-y / 2); i <= y / 2; i++)
    group.add(
      line(
        [
          [-x / 2, i, 0],
          [x / 2, i, 0],
        ],
        gridColor,
        0.5,
      ),
    );
  const bound = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(x, y, z)),
    new THREE.LineBasicMaterial({
      color: "#a5b8bd",
      transparent: true,
      opacity: 0.6,
    }),
  );
  bound.position.z = z / 2;
  group.add(bound);
  const xLabel = label(`${x.toFixed(1)} m`),
    yLabel = label(`${y.toFixed(1)} m`),
    zLabel = label(`${z.toFixed(1)} m`);
  xLabel.position.set(0, -y / 2 - 0.65, 0);
  yLabel.position.set(x / 2 + 0.75, 0, 0);
  zLabel.position.set(-x / 2 - 0.4, y / 2, z / 2);
  group.add(xLabel, yLabel, zLabel);
  group.add(
    line(
      [
        [-x / 2, -y / 2, 0.02],
        [-x / 2 + 1.2, -y / 2, 0.02],
      ],
      "#d47878",
    ),
    line(
      [
        [-x / 2, -y / 2, 0.02],
        [-x / 2, -y / 2 + 1.2, 0.02],
      ],
      "#78ad8c",
    ),
    line(
      [
        [-x / 2, -y / 2, 0.02],
        [-x / 2, -y / 2, 1.2],
      ],
      "#729bbe",
    ),
  );
  for (const [txt, p, col] of [
    ["X", [-x / 2 + 1.4, -y / 2, 0], "#bd6d6d"],
    ["Y", [-x / 2, -y / 2 + 1.4, 0], "#65a17b"],
    ["Z", [-x / 2, -y / 2, 1.4], "#608bb2"],
  ] as [string, Vec3, string][]) {
    const l = label(txt, col, 0.19);
    l.position.set(...p);
    group.add(l);
  }
  return group;
}
export function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        const map = (m as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        m.dispose();
      });
    }
  });
}
export function heatColor(
  count: number,
  error: number,
  layer: string,
  maxCount: number,
  maxError: number,
) {
  if (layer === "accuracy") {
    if (!Number.isFinite(error)) return new THREE.Color("#c1cbd1");
    return new THREE.Color("#143f7c").lerp(
      new THREE.Color("#bbdef4"),
      Math.min(1, error / maxError),
    );
  }
  if (!count) return new THREE.Color("#a7b5bb");
  const t = Math.min(1, count / Math.max(1, maxCount));
  const colors = ["#3a68c7", "#26bacc", "#41c89c", "#b8d850", "#efb64b", "#e76c4e"];
  const i = t * (colors.length - 1);
  return new THREE.Color(colors[Math.floor(i)]).lerp(
    new THREE.Color(colors[Math.ceil(i)]),
    i % 1,
  );
}
