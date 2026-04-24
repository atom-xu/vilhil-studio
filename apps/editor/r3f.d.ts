/**
 * R3F JSX intrinsic element declarations for three.js primitives.
 *
 * @react-three/fiber augments JSX.IntrinsicElements globally via module
 * augmentation, but the augmentation doesn't reliably propagate during
 * composite tsc --build in CI because bun resolves @react-three/fiber's
 * peer deps into variant directories where @types/three is unreachable.
 *
 * This file replicates the module augmentation pattern R3F uses, declaring
 * the subset of three.js elements we actually use.
 *
 * The empty export makes this file a module, which is required for
 * `declare module` to augment existing modules rather than replace them.
 *
 * Keep this file in sync across:
 *   packages/viewer/src/r3f.d.ts
 *   packages/editor/src/r3f.d.ts
 *   apps/editor/r3f.d.ts
 */

export {}

interface ThreeJSXElements {
  // Containers
  group: any
  scene: any
  object3D: any
  // Geometries
  boxGeometry: any
  planeGeometry: any
  circleGeometry: any
  cylinderGeometry: any
  sphereGeometry: any
  extrudeGeometry: any
  shapeGeometry: any
  bufferGeometry: any
  edgesGeometry: any
  ringGeometry: any
  torusGeometry: any
  tubeGeometry: any
  latheGeometry: any
  // Meshes & lines
  mesh: any
  instancedMesh: any
  line: any
  lineSegments: any
  lineLoop: any
  points: any
  // Materials
  meshStandardMaterial: any
  meshBasicMaterial: any
  meshPhongMaterial: any
  meshLambertMaterial: any
  meshPhysicalMaterial: any
  meshNormalMaterial: any
  meshDepthMaterial: any
  shadowMaterial: any
  lineBasicMaterial: any
  lineBasicNodeMaterial: any
  lineDashedMaterial: any
  pointsMaterial: any
  shaderMaterial: any
  rawShaderMaterial: any
  spriteMaterial: any
  // Lights
  ambientLight: any
  directionalLight: any
  pointLight: any
  spotLight: any
  hemisphereLight: any
  rectAreaLight: any
  // Cameras
  perspectiveCamera: any
  orthographicCamera: any
  // Helpers
  gridHelper: any
  axesHelper: any
  arrowHelper: any
  // Misc
  sprite: any
  lOD: any
  fog: any
  color: any
  // Buffer attributes
  bufferAttribute: any
  instancedBufferAttribute: any
  // Primitive (R3F-specific)
  primitive: any
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeJSXElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeJSXElements {}
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeJSXElements {}
  }
}
