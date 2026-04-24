export {}

interface ThreeJSXElements {
  // Containers
  group: any
  scene: any
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
