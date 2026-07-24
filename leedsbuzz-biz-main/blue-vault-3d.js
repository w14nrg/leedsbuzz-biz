import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLUE_VAULT_DATABASE } from './data/blue-vault-database.js?v=28.1.0';
import { CURRENT_PLAYER_METADATA } from './data/current-player-metadata.js?v=22.0.0';
import { BLUE_DNA_OVERRIDES, BLUE_DNA_VERSION } from './data/blue-dna-ratings.js?v=22.0.0';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let players = {};
let orderedPlayers = [];
let filteredPlayers = [];
let leaders = [];
let catalogueMeta = { trueBlueMinimumAppearances: 50, currentPlayersAlwaysEligible: true };
let selectedKey = null;
let compareKey = null;
let detailCache = new Map();
let fanSummaries = new Map();
let fanDetails = new Map();
let memberFan = { authenticated:false, ratings:new Map(), favourites:new Set() };
let fanLeaderboards = { topRated:[], mostFavourited:[], mostSelected:[], trending:[] };
let activeFanBoard = 'topRated';
let scene, camera, renderer, controls, playerRoot, bodyRoot, faceRoot, hologramMaterial, wireMaterial, detailMaterial, numberMaterial;
let clock = new THREE.Clock();
let autoRotate = true;
let chamberRings = [];
let particleField;
let modelParts = {};
let cardPage = 1;
const CARDS_PER_PAGE = 24;
const OUTFIELD_TRAITS = [
  { key:'pace', label:'PACE' }, { key:'shooting', label:'SHOOTING' }, { key:'passing', label:'PASSING' },
  { key:'dribbling', label:'DRIBBLING' }, { key:'defending', label:'DEFENDING' }, { key:'physical', label:'PHYSICAL' }
];
const GOALKEEPER_TRAITS = [
  { key:'shotStopping', label:'SHOT STOPPING' }, { key:'handling', label:'HANDLING' }, { key:'command', label:'COMMAND' },
  { key:'distribution', label:'DISTRIBUTION' }, { key:'oneOnOnes', label:'1 v 1' }, { key:'sweeping', label:'SWEEPING' }
];
const UNIVERSAL_COMPARE_TRAITS = [
  { key:'athleticism', label:'ATHLETICISM' }, { key:'goalThreat', label:'GOAL THREAT' }, { key:'ballUse', label:'BALL USE' },
  { key:'technique', label:'TECHNIQUE' }, { key:'defensiveValue', label:'DEFENSIVE VALUE' }, { key:'authority', label:'AUTHORITY' }
];
const ROLE_BASE = {
  GK:[72,70,70,66,72,62], CB:[62,38,65,53,80,80], FB:[75,48,69,68,74,72],
  DM:[66,53,76,68,79,77], CM:[69,66,79,76,66,72], AM:[74,77,82,84,48,67],
  WINGER:[83,75,73,85,43,66], ST:[76,83,64,74,38,79], LBUZZ:[68,64,70,69,64,71]
};
const ROLE_WEIGHTS = {
  GK:[.27,.17,.18,.14,.14,.10], CB:[.08,.04,.14,.06,.40,.28], FB:[.18,.05,.17,.15,.28,.17],
  DM:[.10,.07,.23,.13,.27,.20], CM:[.12,.14,.26,.20,.13,.15], AM:[.14,.22,.22,.25,.05,.12],
  WINGER:[.23,.22,.17,.25,.03,.10], ST:[.17,.32,.11,.18,.04,.18], LBUZZ:[.16,.16,.18,.18,.16,.16]
};
const WIKI_CACHE_KEY = 'leedsbuzz-biz-blue-vault-rich-metadata-v281';
const WIKI_SUMMARY_CACHE_KEY = 'leedsbuzz-biz-blue-vault-profile-summaries-v281';
let wikiSummaryCache = null;
function initThree() {
  const canvas = $('#vaultCanvas');
  const stage = $('#vault3dStage');
  if (!canvas || !stage) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020a1c, 0.095);
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 1.15, 7.2);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 4.6;
  controls.maxDistance = 9.5;
  controls.minPolarAngle = Math.PI * 0.28;
  controls.maxPolarAngle = Math.PI * 0.66;
  controls.target.set(0, 0.15, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;

  buildChamber();
  buildPlayer();
  if (!selectedKey) selectedKey = Object.keys(players)[0] || null;
  if (selectedKey) applyPlayer(selectedKey, false, 'preserve');
  resizeRenderer();
  window.addEventListener('resize', resizeRenderer, { passive: true });
  setTimeout(() => $('#stageLoading')?.classList.add('done'), 500);
  animate();
}

function makeHologramMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffcd00) },
      uBright: { value: new THREE.Color(0xffffff) }
    },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vViewPosition; varying vec3 vWorldPosition;
      void main(){
        vec4 worldPosition = modelMatrix * vec4(position,1.0); vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position,1.0); vViewPosition = -mvPosition.xyz;
        vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform vec3 uBright;
      varying vec3 vNormal; varying vec3 vViewPosition; varying vec3 vWorldPosition;
      void main(){
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.0);
        float scan = 0.5 + 0.5 * sin((vWorldPosition.y * 42.0) - (uTime * 6.0));
        float glitch = step(0.92, 0.5 + 0.5 * sin(uTime * 1.7 + vWorldPosition.y * 9.0));
        float alpha = 0.16 + fresnel * 0.52 + scan * 0.12 + glitch * 0.035;
        vec3 colour = mix(uColor, uBright, fresnel + scan * 0.18);
        gl_FragColor = vec4(colour, alpha);
      }
    `
  });
}

function mesh(geometry, material = hologramMaterial) {
  const object = new THREE.Mesh(geometry, material);
  const wire = new THREE.Mesh(geometry.clone(), wireMaterial);
  object.add(wire);
  return object;
}

function detailMesh(geometry, opacity = 0.28) {
  const mat = detailMaterial.clone();
  mat.opacity = opacity;
  return new THREE.Mesh(geometry, mat);
}

function buildPlayer() {
  hologramMaterial = makeHologramMaterial();
  wireMaterial = new THREE.MeshBasicMaterial({ color: 0x7ddfff, wireframe: true, transparent: true, opacity: 0.055, depthWrite: false, blending: THREE.AdditiveBlending });
  detailMaterial = new THREE.MeshBasicMaterial({ color: 0x78ddff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });

  playerRoot = new THREE.Group();
  bodyRoot = new THREE.Group();
  faceRoot = new THREE.Group();
  playerRoot.add(bodyRoot);
  scene.add(playerRoot);

  const torso = mesh(new THREE.CylinderGeometry(0.62, 0.48, 1.55, 20, 1, false));
  torso.position.y = 0.82; torso.scale.z = 0.58; bodyRoot.add(torso); modelParts.torso = torso;
  const chest = mesh(new THREE.SphereGeometry(0.62, 22, 14)); chest.scale.set(1, 0.48, 0.62); chest.position.y = 1.36; bodyRoot.add(chest); modelParts.chest = chest;
  const head = mesh(new THREE.SphereGeometry(0.39, 24, 18)); head.scale.set(0.88, 1.08, 0.92); head.position.y = 2.17; bodyRoot.add(head); modelParts.head = head;
  const neck = mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.28, 14)); neck.position.y = 1.78; bodyRoot.add(neck);

  const shoulderL = mesh(new THREE.SphereGeometry(0.24, 16, 12)); shoulderL.position.set(-0.67, 1.43, 0); bodyRoot.add(shoulderL);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = 0.67; bodyRoot.add(shoulderR);
  const armGeo = new THREE.CylinderGeometry(0.12, 0.095, 1.15, 14);
  const armL = mesh(armGeo); armL.position.set(-0.78, 0.86, 0); armL.rotation.z = -0.10; bodyRoot.add(armL);
  const armR = mesh(armGeo); armR.position.set(0.78, 0.86, 0); armR.rotation.z = 0.10; bodyRoot.add(armR); modelParts.armL = armL; modelParts.armR = armR;
  const handGeo = new THREE.SphereGeometry(0.12, 14, 10);
  const handL = mesh(handGeo); handL.position.set(-0.84, 0.27, 0); bodyRoot.add(handL);
  const handR = mesh(handGeo); handR.position.set(0.84, 0.27, 0); bodyRoot.add(handR); modelParts.handL = handL; modelParts.handR = handR;
  const hip = mesh(new THREE.CylinderGeometry(0.43, 0.46, 0.42, 18)); hip.position.y = -0.09; hip.scale.z = 0.67; bodyRoot.add(hip);
  const legGeo = new THREE.CylinderGeometry(0.16, 0.12, 1.55, 14);
  const legL = mesh(legGeo); legL.position.set(-0.26, -0.98, 0); bodyRoot.add(legL);
  const legR = mesh(legGeo); legR.position.set(0.26, -0.98, 0); bodyRoot.add(legR); modelParts.legL = legL; modelParts.legR = legR;
  const bootGeo = new THREE.BoxGeometry(0.28, 0.17, 0.58);
  const bootL = mesh(bootGeo); bootL.position.set(-0.26, -1.78, 0.14); bodyRoot.add(bootL);
  const bootR = mesh(bootGeo); bootR.position.set(0.26, -1.78, 0.14); bodyRoot.add(bootR);

  numberMaterial = new THREE.MeshBasicMaterial({ map: makeNumberTexture('08'), transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
  const numberPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), numberMaterial);
  numberPlate.position.set(0, 1.08, 0.365); bodyRoot.add(numberPlate); modelParts.numberPlate = numberPlate;

  bodyRoot.add(faceRoot);

  const pedestal = new THREE.Group();
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.018, 8, 100), new THREE.MeshBasicMaterial({ color: 0x35b9ff, transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending }));
  ring1.rotation.x = Math.PI / 2; ring1.position.y = -1.9; pedestal.add(ring1);
  const ring2 = ring1.clone(); ring2.scale.set(0.72,0.72,0.72); ring2.material = ring1.material.clone(); ring2.material.opacity = 0.28; pedestal.add(ring2);
  playerRoot.add(pedestal); modelParts.pedestal = pedestal;
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose?.();
    if (child.material && child.material !== hologramMaterial && child.material !== wireMaterial) child.material.dispose?.();
  }
}

function buildFace(player) {
  clearGroup(faceRoot);
  const look = player.look;
  faceRoot.position.set(0, 2.17, 0);

  const eyeGeo = new THREE.SphereGeometry(0.035, 10, 8);
  const eyeL = detailMesh(eyeGeo, 0.72); eyeL.position.set(-0.125, 0.055, 0.338); faceRoot.add(eyeL);
  const eyeR = detailMesh(eyeGeo, 0.72); eyeR.position.set(0.125, 0.055, 0.338); faceRoot.add(eyeR);

  const nose = detailMesh(new THREE.ConeGeometry(0.055, 0.17, 8), 0.34); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.015, 0.39); faceRoot.add(nose);
  const jaw = detailMesh(new THREE.SphereGeometry(0.29 * look.jaw, 16, 10, 0, Math.PI * 2, Math.PI * 0.38, Math.PI * 0.36), 0.12); jaw.position.set(0, -0.19, 0.015); faceRoot.add(jaw);
  const earGeo = new THREE.SphereGeometry(0.07, 10, 8);
  const earL = detailMesh(earGeo, 0.22); earL.scale.set(0.55,1,0.45); earL.position.set(-0.36,0,0); faceRoot.add(earL);
  const earR = detailMesh(earGeo, 0.22); earR.scale.set(0.55,1,0.45); earR.position.set(0.36,0,0); faceRoot.add(earR);

  // Brows help the silhouettes read differently even in the blue hologram treatment.
  const browGeo = new THREE.BoxGeometry(0.12, 0.018, 0.018);
  const browTilt = look.brow === 'strong' ? 0.10 : look.brow === 'soft' ? -0.04 : 0;
  const browL = detailMesh(browGeo, 0.55); browL.position.set(-0.13,0.14,0.362); browL.rotation.z = browTilt; faceRoot.add(browL);
  const browR = detailMesh(browGeo, 0.55); browR.position.set(0.13,0.14,0.362); browR.rotation.z = -browTilt; faceRoot.add(browR);

  if (look.beard) {
    const beard = detailMesh(new THREE.SphereGeometry(0.30, 18, 10, 0, Math.PI * 2, Math.PI * 0.46, Math.PI * 0.30), 0.22);
    beard.scale.set(0.95,0.72,0.92); beard.position.set(0,-0.16,0.035); faceRoot.add(beard);
  }

  buildHair(look.hair);
}

function buildHair(style) {
  if (style === 'helmet') {
    const shell = detailMesh(new THREE.SphereGeometry(0.425, 22, 14, 0, Math.PI*2, 0, Math.PI*0.62), 0.50);
    shell.scale.set(0.98,1.08,1.0); shell.position.y=0.03; faceRoot.add(shell);
    const strapL = detailMesh(new THREE.BoxGeometry(0.035,0.42,0.035),0.45); strapL.position.set(-0.29,-0.10,0.08); strapL.rotation.z=-0.14; faceRoot.add(strapL);
    const strapR = strapL.clone(); strapR.material = strapL.material.clone(); strapR.position.x=0.29; strapR.rotation.z=0.14; faceRoot.add(strapR);
    return;
  }
  if (style === 'dreads') {
    const cap = detailMesh(new THREE.SphereGeometry(0.405,20,12,0,Math.PI*2,0,Math.PI*0.53),0.32); cap.position.y=0.08; faceRoot.add(cap);
    for(let i=0;i<10;i++){
      const a=(i/10)*Math.PI*1.55+Math.PI*0.72;
      const strand=detailMesh(new THREE.CylinderGeometry(0.018,0.024,0.55,7),0.34);
      strand.position.set(Math.cos(a)*0.30,-0.12,Math.sin(a)*0.22-0.12);
      strand.rotation.z=Math.cos(a)*0.18; strand.rotation.x=Math.sin(a)*0.10;
      faceRoot.add(strand);
    }
    const tie=detailMesh(new THREE.SphereGeometry(0.10,10,8),0.42); tie.position.set(0,-0.04,-0.34); faceRoot.add(tie);
    return;
  }
  if (style === 'fringe') {
    const cap=detailMesh(new THREE.SphereGeometry(0.405,20,12,0,Math.PI*2,0,Math.PI*0.50),0.31); cap.position.y=0.09; faceRoot.add(cap);
    [-0.18,-0.06,0.06,0.18].forEach((x,i)=>{const f=detailMesh(new THREE.BoxGeometry(0.10,0.14+0.02*(i%2),0.07),0.38);f.position.set(x,0.22,0.32);f.rotation.z=(i-1.5)*0.08;faceRoot.add(f)});
    return;
  }
  if (style === 'sidepart') {
    const cap=detailMesh(new THREE.SphereGeometry(0.405,20,12,0,Math.PI*2,0,Math.PI*0.48),0.32);cap.position.y=0.10;faceRoot.add(cap);
    const part=detailMesh(new THREE.BoxGeometry(0.32,0.06,0.08),0.42);part.position.set(-0.08,0.29,0.24);part.rotation.z=-0.12;faceRoot.add(part);
    return;
  }
  if (style === 'crop') {
    const cap=detailMesh(new THREE.SphereGeometry(0.397,20,12,0,Math.PI*2,0,Math.PI*0.43),0.22);cap.position.y=0.12;faceRoot.add(cap);return;
  }
  // default short
  const cap=detailMesh(new THREE.SphereGeometry(0.405,20,12,0,Math.PI*2,0,Math.PI*0.46),0.30);cap.position.y=0.11;faceRoot.add(cap);
  const front=detailMesh(new THREE.BoxGeometry(0.34,0.08,0.08),0.34);front.position.set(0,0.27,0.25);front.rotation.z=-0.04;faceRoot.add(front);
}

function makeNumberTexture(number) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,256,256); ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font=`900 ${String(number).length > 2 ? 92 : 148}px Arial`; ctx.shadowColor='#47cfff'; ctx.shadowBlur=24; ctx.fillStyle='#b7f1ff'; ctx.fillText(number,128,132);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function updateNumberTexture(number) {
  const fresh = makeNumberTexture(number); numberMaterial.map?.dispose(); numberMaterial.map = fresh; numberMaterial.needsUpdate = true;
}

function buildChamber() {
  const grid = new THREE.GridHelper(13, 42, 0x1266aa, 0x08284d); grid.material.transparent=true; grid.material.opacity=.24; grid.position.y=-1.9; scene.add(grid);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.55,1.9,.12,64,1,true), new THREE.MeshBasicMaterial({color:0x0756a9,transparent:true,opacity:.12,wireframe:true})); platform.position.y=-1.95; scene.add(platform);
  [1.9,2.55,3.35].forEach((radius,index)=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.012,8,140),new THREE.MeshBasicMaterial({color:index===0?0x54cfff:0x176dc5,transparent:true,opacity:.16-index*.025,blending:THREE.AdditiveBlending}));ring.rotation.x=Math.PI/2;ring.position.y=-1.86+index*.2;ring.userData.speed=index%2?-.08:.1;scene.add(ring);chamberRings.push(ring)});
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(1.32,.78,7,48,1,true),new THREE.MeshBasicMaterial({color:0x158bff,transparent:true,opacity:.026,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));beam.position.y=.75;scene.add(beam);
  const particleCount=650,positions=new Float32Array(particleCount*3);for(let i=0;i<particleCount;i++){const r=1.1+Math.random()*3.4,a=Math.random()*Math.PI*2;positions[i*3]=Math.cos(a)*r;positions[i*3+1]=-1.7+Math.random()*6.4;positions[i*3+2]=Math.sin(a)*r}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:0x5acfff,size:.024,transparent:true,opacity:.42,blending:THREE.AdditiveBlending,depthWrite:false});particleField=new THREE.Points(geometry,material);scene.add(particleField);
}

function applyPose(pose) {
  const { armL, armR, handL, handR, legL, legR } = modelParts;
  armL.rotation.set(0,0,-.10); armR.rotation.set(0,0,.10); armL.position.set(-.78,.86,0); armR.position.set(.78,.86,0); handL.position.set(-.84,.27,0); handR.position.set(.84,.27,0); legL.rotation.z=0; legR.rotation.z=0;
  if(pose==='power'){armL.rotation.z=-.24;armR.rotation.z=.24;legL.rotation.z=-.025;legR.rotation.z=.025}
  if(pose==='captain'){armL.rotation.z=-.44;armR.rotation.z=.44;handL.position.x=-1.03;handR.position.x=1.03}
  if(pose==='keeper'){armL.rotation.z=-.82;armR.rotation.z=.82;armL.position.y=1.02;armR.position.y=1.02;handL.position.set(-1.22,.82,0);handR.position.set(1.22,.82,0)}
  if(pose==='agile'){armL.rotation.z=-.20;armR.rotation.z=.34;legL.rotation.z=-.04;legR.rotation.z=.05}
  if(pose==='leader'){armL.rotation.z=-.14;armR.rotation.z=.16}
  if(pose==='relaxed'){armL.rotation.z=-.32;armR.rotation.z=.12;handL.position.set(-.94,.42,.12);handR.position.set(.86,.30,0)}
}


function isTrueBlue(player) {
  if (!player) return false;
  if (catalogueMeta.currentPlayersAlwaysEligible && player.isCurrent) return true;
  return Number(player.appearances || 0) >= Number(catalogueMeta.trueBlueMinimumAppearances || 50) || Boolean(player.trueBlueEligible);
}

function eligibleEntries() {
  return orderedPlayers.filter(isTrueBlue).map(player => [player.id, player]);
}

function safeWebUrl(value) {
  try {
    const url = new URL(String(value || ''), location.origin);
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
  } catch { return ''; }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function clampScore(value, min = 20, max = 99) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}
function inferBlueRole(player) {
  const override = BLUE_DNA_OVERRIDES[player.slug];
  if (override?.role) return override.role;
  const raw = `${player.role || ''} ${player.positionLabel || ''}`.toLowerCase();
  if (player.positionCode === 'GK') return 'GK';
  if (player.positionCode === 'DEF') return /full|wing.?back|\bfb\b/.test(raw) ? 'FB' : 'CB';
  if (player.positionCode === 'MID') {
    if (/attacking|wing|forward|\bam\b/.test(raw)) return 'AM';
    if (/holding|defensive|half back|\bdm\b|\bhb\b/.test(raw)) return 'DM';
    return 'CM';
  }
  if (player.positionCode === 'FWD') return /wing|wide|mf\/fw/.test(raw) ? 'WINGER' : 'ST';
  return 'LBUZZ';
}
function ratingTraitsForRole(role) { return role === 'GK' ? GOALKEEPER_TRAITS : OUTFIELD_TRAITS; }
function ratingArrayToScores(role, values) {
  const traits=ratingTraitsForRole(role); return Object.fromEntries(traits.map((trait,index)=>[trait.key,clampScore(values[index])]));
}
function sourceDerivedRating(player, role) {
  const base=[...(ROLE_BASE[role] || ROLE_BASE.LBUZZ)];
  const apps=Math.max(0,Number(player.appearances)||0);
  const goalsKnown=player.goals!==null&&player.goals!==undefined&&Number.isFinite(Number(player.goals));
  const goals=goalsKnown?Math.max(0,Number(player.goals)):0;
  const goalRate=apps>0&&goalsKnown?goals/apps:null;
  const appLevel=Math.min(1,Math.log1p(apps)/Math.log1p(800));
  const startsKnown=Number.isFinite(Number(player.starts));
  const startRatio=startsKnown&&apps?Math.min(1,Number(player.starts)/apps):.82;
  const qualityLift=(appLevel-.38)*13 + (startRatio-.72)*5;
  const v=base.map((x,index)=>x+qualityLift*(index===5?.65:index===4?.45:.32));
  if(role==='GK') {
    v[0]+=appLevel*8; v[1]+=appLevel*6; v[2]+=appLevel*7; v[4]+=appLevel*5;
  } else if(goalRate!==null) {
    const expected={CB:.035,FB:.055,DM:.07,CM:.16,AM:.25,WINGER:.28,ST:.45,LBUZZ:.18}[role]||.18;
    const delta=Math.max(-1,Math.min(1,(goalRate-expected)/Math.max(expected,.08)));
    v[1]+=delta*14; if(['AM','WINGER','ST'].includes(role)) v[3]+=delta*4;
  }
  if(role==='CB'){v[4]+=appLevel*7;v[5]+=appLevel*7;}
  if(role==='FB'){v[0]+=appLevel*4;v[4]+=appLevel*5;}
  if(role==='DM'){v[2]+=appLevel*4;v[4]+=appLevel*6;}
  if(role==='CM'){v[2]+=appLevel*5;v[3]+=appLevel*3;}
  if(role==='AM'){v[2]+=appLevel*4;v[3]+=appLevel*5;}
  if(role==='WINGER'){v[0]+=appLevel*4;v[3]+=appLevel*5;}
  if(role==='ST'){v[1]+=appLevel*5;v[5]+=appLevel*4;}
  return v.map(x=>clampScore(x));
}
function impactStatus(score) {
  if(score>=97) return 'IMMORTAL'; if(score>=93) return 'CLUB ICON'; if(score>=87) return 'LEEDS UNITED LEGEND';
  if(score>=78) return 'CULT BLUE'; if(score>=66) return 'ESTABLISHED BLUE'; return 'FIRST-TEAM BLUE';
}
function calculateImpact(player, override) {
  if(override?.impact) return override.impact;
  const apps=Math.max(0,Number(player.appearances)||0), goals=Math.max(0,Number(player.goals)||0);
  const appIndex=Math.min(1,Math.log1p(apps)/Math.log1p(800));
  const role=inferBlueRole(player); const goalFactor=role==='ST'||role==='WINGER'||role==='AM'?Math.min(1,goals/200):Math.min(1,goals/70);
  return clampScore(45+appIndex*45+goalFactor*8+(player.isCurrent?1:0),45,99);
}
function buildPlayerRatings(player) {
  const override=BLUE_DNA_OVERRIDES[player.slug];
  const role=inferBlueRole(player);
  const values=override?.scores ? override.scores : sourceDerivedRating(player,role);
  const scores=ratingArrayToScores(role,values);
  const weights=ROLE_WEIGHTS[role]||ROLE_WEIGHTS.LBUZZ;
  const overall=clampScore(values.reduce((sum,value,index)=>sum+value*weights[index],0),35,99);
  const traits=ratingTraitsForRole(role);
  const strongest=traits.reduce((best,trait)=>scores[trait.key]>scores[best.key]?trait:best,traits[0]);
  const positionKnown=player.positionCode&&player.positionCode!=='LBUZZ';
  const statsKnown=positionKnown&&(player.goals!==null&&player.goals!==undefined||role==='GK');
  const model=override?'CURATED WHITE DNA':statsKnown?'ARCHIVE MODEL':'PROVISIONAL MODEL';
  const confidence=override?'HIGH CONFIDENCE':statsKnown?'MEDIUM CONFIDENCE':'PROVISIONAL';
  const impact=calculateImpact(player,override);
  return {scores,values,traits,role,overall,strongest:strongest.label,model,confidence,impact,impactStatus:impactStatus(impact),note:override?.note||'Position-aware archive model using verified Leeds United appearances, goals, starts, role and career data. No random variation.'};
}
function universalScores(rating) {
  const s=rating.scores;
  if(rating.role==='GK') return {athleticism:(s.oneOnOnes+s.sweeping)/2,goalThreat:24,ballUse:s.distribution,technique:(s.handling+s.distribution)/2,defensiveValue:(s.shotStopping+s.command)/2,authority:(s.command+s.handling)/2};
  return {athleticism:(s.pace+s.physical)/2,goalThreat:s.shooting,ballUse:s.passing,technique:s.dribbling,defensiveValue:s.defending,authority:(s.physical+s.defending)/2};
}
function radarPoint(index,value,count,radius=112,centre=150){const angle=-Math.PI/2+(Math.PI*2*index/count),scale=Math.max(0,Math.min(100,Number(value)||0))/100;return[centre+Math.cos(angle)*radius*scale,centre+Math.sin(angle)*radius*scale]}
function radarPoints(values,traits,radius=112,centre=150){return traits.map((trait,index)=>radarPoint(index,values[trait.key],traits.length,radius,centre).map(n=>n.toFixed(1)).join(',')).join(' ')}
function renderRadarSvg(series,mode='profile') {
  const sameRole=series.length<2||series.every(entry=>entry.ratings.role===series[0].ratings.role);
  const traits=series.length>1&&!sameRole?UNIVERSAL_COMPARE_TRAITS:series[0].ratings.traits;
  const scoreSets=series.map(entry=>series.length>1&&!sameRole?universalScores(entry.ratings):entry.ratings.scores);
  const centre=150,radius=mode==='compare'?105:108;
  const rings=[20,40,60,80,100].map(level=>{const values=Object.fromEntries(traits.map(t=>[t.key,level]));return`<polygon class="radar-grid-ring level-${level}" points="${radarPoints(values,traits,radius,centre)}"></polygon>`}).join('');
  const axes=traits.map((trait,index)=>{const[x,y]=radarPoint(index,100,traits.length,radius,centre),[lx,ly]=radarPoint(index,122,traits.length,radius,centre);const anchor=lx<centre-12?'end':lx>centre+12?'start':'middle';const dy=ly<centre-radius?-2:ly>centre+radius?8:3;const value=mode==='profile'?`<tspan class="radar-label-value" x="${lx.toFixed(1)}" dy="12">${Math.round(scoreSets[0][trait.key])}</tspan>`:'';return`<line class="radar-axis" x1="${centre}" y1="${centre}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="radar-label" x="${lx.toFixed(1)}" y="${(ly+dy).toFixed(1)}" text-anchor="${anchor}">${trait.label}${value}</text>`}).join('');
  const polygons=series.map((entry,index)=>{const cls=index===0?'radar-series-a':'radar-series-b',scores=scoreSets[index],points=radarPoints(scores,traits,radius,centre);const dots=traits.map((trait,axisIndex)=>{const[x,y]=radarPoint(axisIndex,scores[trait.key],traits.length,radius,centre);return`<circle class="radar-dot ${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2"></circle>`}).join('');return`<polygon class="radar-player-shape ${cls}" points="${points}"></polygon>${dots}`}).join('');
  const label=series.map(entry=>`${entry.player.label}, rating ${entry.ratings.overall}`).join(' compared with ');
  return `<svg class="vault-radar-svg ${mode}" viewBox="0 0 300 300" role="img" aria-label="${esc(label)}"><g>${rings}${axes}${polygons}</g><circle class="radar-core" cx="150" cy="150" r="4"></circle></svg>`;
}
function renderProfileRadar(player){const ratings=buildPlayerRatings(player);player.ratings=ratings;const chart=$('#profileRadarChart');if(chart)chart.innerHTML=renderRadarSvg([{player,ratings}],'profile');$('#profileRadarRating').textContent=ratings.overall;$('#profileRadarStrength').textContent=ratings.strongest;$('#profileRadarModel').textContent=ratings.model;$('#profileRadarConfidence').textContent=ratings.confidence;$('#profileRadarNote').textContent=ratings.note;$('#profileImpactScore').textContent=ratings.impact;$('#profileImpactStatus').textContent=ratings.impactStatus;}
function renderCompareRadar(a,b){a.ratings=buildPlayerRatings(a);b.ratings=buildPlayerRatings(b);const sameRole=a.ratings.role===b.ratings.role;const traits=sameRole?a.ratings.traits:UNIVERSAL_COMPARE_TRAITS;const as=sameRole?a.ratings.scores:universalScores(a.ratings),bs=sameRole?b.ratings.scores:universalScores(b.ratings);const chart=$('#compareRadarChart');if(chart)chart.innerHTML=renderRadarSvg([{player:a,ratings:a.ratings},{player:b,ratings:b.ratings}],'compare');$('#compareLegendA').textContent=a.label;$('#compareLegendB').textContent=b.label;$('#compareRadarNote').textContent=sameRole?'Direct role-for-role comparison on the same six football attributes. Leeds United impact remains separate.':'Different positions selected: the overlay switches to universal role-normalised football traits. Leeds United impact remains separate.';const holder=$('#compareTraitWinners');if(holder)holder.innerHTML=traits.map(trait=>{const av=Math.round(as[trait.key]),bv=Math.round(bs[trait.key]),winner=av===bv?'LEVEL':av>bv?a.label:b.label;return`<div><span>${trait.label}</span><strong>${esc(winner)}</strong><em>${av}–${bv}</em></div>`}).join('');}

function normalisePosition(value) {
  const raw = String(value || 'Leeds United player').replace(/\s+/g,' ').trim();
  const low = raw.toLowerCase();
  if (/^(gk|goal)/.test(low)) return { code: 'GK', label: 'Goalkeeper' };
  if (/^(fb|df)$|def|back|sweeper/.test(low)) return { code: 'DEF', label: /mid|wing/.test(low) ? 'Defender / Midfielder' : 'Defender' };
  if (/^(hb|mf)$|mid|half back/.test(low)) return { code: 'MID', label: /forward|wing|fw/.test(low) ? 'Midfielder / Forward' : 'Midfielder' };
  if (/^(fw)$|wing|forward|strik|attack/.test(low)) return { code: 'FWD', label: /def|back/.test(low) ? 'Forward / Wing-back' : 'Forward' };
  return { code: 'LBUZZ', label: raw || 'Leeds United player' };
}

function hashText(value) {
  let h = 2166136261;
  for (const ch of String(value || 'blue')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededVisualProfile(player) {
  if (player.modelProfile?.body && player.modelProfile?.look) return player.modelProfile;
  const h = hashText(player.slug || player.fullName);
  const hairs = ['short','crop','sidepart','fringe'];
  const brows = ['straight','soft','strong'];
  const poseMap = { GK:'keeper', DEF:'captain', MID:'leader', FWD:'agile', LBUZZ:'relaxed' };
  return {
    body: {
      height: 0.95 + ((h & 15) / 150),
      width: 0.92 + (((h >> 4) & 15) / 140),
      head: 0.96 + (((h >> 8) & 7) / 120),
      pose: poseMap[player.positionCode] || 'relaxed'
    },
    look: {
      face: [0.91 + (((h >> 3) & 7) / 100), 1.01 + (((h >> 7) & 7) / 80), 0.91 + (((h >> 11) & 7) / 100)],
      hair: hairs[(h >> 14) % hairs.length],
      beard: Boolean((h >> 18) & 1),
      brow: brows[(h >> 19) % brows.length],
      jaw: 0.94 + (((h >> 22) & 7) / 70)
    }
  };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0,10);
  return date.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'Europe/London' });
}

function mapApiPlayer(row) {
  const currentMeta = CURRENT_PLAYER_METADATA[row.slug] || {};
  const position = normalisePosition(row.position || currentMeta.position);
  const player = {
    id: row.slug,
    dbId: row.id,
    slug: row.slug,
    name: String(row.displayName || row.fullName || '').toUpperCase(),
    label: row.displayName || row.fullName,
    fullName: row.fullName,
    number: row.shirtNumber || currentMeta.shirtNumber || 'LBUZZ',
    role: row.position || currentMeta.position || 'Leeds United player',
    position: position.code,
    positionCode: position.code,
    positionLabel: position.label,
    era: row.isCurrent ? 'present' : 'past',
    eraLabel: row.era || (row.isCurrent ? 'CURRENT' : 'LEEDS UNITED ERA'),
    status: row.isCurrent ? 'CURRENT SQUAD' : 'VAULT STANDARD',
    isCurrent: Boolean(row.isCurrent),
    trueBlueEligible: Boolean(row.trueBlueEligible),
    eligibility: row.eligibility,
    appearances: row.appearances,
    goals: row.goals,
    cleanSheets: row.cleanSheets,
    firstTeamDebut: row.firstTeamDebut,
    lastAppearance: row.lastAppearance,
    nationality: row.nationality || currentMeta.nationality || null,
    clubCareer: row.clubCareer || currentMeta.clubCareer || null,
    starts: row.starts ?? null,
    substituteAppearances: row.substituteAppearances ?? row.subs ?? null,
    leedsSeasons: row.leedsSeasons ?? null,
    majorHonours: row.majorHonours ?? null,
    sourceCount: Number(row.sourceCount || 0),
    imageUrl: row.imageUrl,
    imageCredit: row.imageCredit,
    bio: row.bio,
    honours: Array.isArray(row.honours) ? row.honours : [],
    modelProfile: row.modelProfile,
    featured: Boolean(row.featured),
  };
  const visual = seededVisualProfile(player);
  player.body = visual.body;
  player.look = visual.look;
  player.career = buildCareerGridRows(player);
  player.likeness = 'Original procedural archive hologram generated locally for this profile. It is not a photographic likeness.';
  player.ratings = null;
  return player;
}

function playerInitials(player) {
  return String(player?.label || 'LBUZZ').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase();
}

function renderCardAvatar(player) {
  const initials = playerInitials(player);
  const position = player.position && player.position !== 'LBUZZ' ? player.position : 'LBUZZ';
  return `<span class="vault-card-avatar" aria-hidden="true">
    <span class="vault-card-holo">
      <span class="vault-card-holo-head"></span>
      <span class="vault-card-holo-body"></span>
      <b>${esc(initials)}</b>
    </span>
    <span class="vault-card-holo-label">PROCEDURAL HOLOGRAM</span>
    <em>${esc(position)}</em>
  </span>`;
}


function rememberViewedPlayer(player) {
  if (!player?.slug) return;
  try {
    const key='leedsBuzzRecentPlayersV1';
    const rows=JSON.parse(localStorage.getItem(key)||'[]').filter(row=>row.slug!==player.slug);
    rows.unshift({slug:player.slug,name:player.label||player.name||player.slug,position:player.positionLabel||player.position||'',viewedAt:new Date().toISOString()});
    localStorage.setItem(key,JSON.stringify(rows.slice(0,20)));
  } catch {}
}

function rememberComparison(a,b) {
  if (!a?.slug || !b?.slug || a.slug===b.slug) return;
  try {
    const key='leedsBuzzRecentComparisonsV1';
    const pair=[a.slug,b.slug].sort().join('|');
    const rows=JSON.parse(localStorage.getItem(key)||'[]').filter(row=>row.pair!==pair);
    rows.unshift({pair,a:{slug:a.slug,name:a.label||a.name},b:{slug:b.slug,name:b.label||b.name},viewedAt:new Date().toISOString()});
    localStorage.setItem(key,JSON.stringify(rows.slice(0,15)));
  } catch {}
}

function setPlayerQuery(player) {
  if (!player?.slug) return;
  const url = new URL(location.href);
  url.searchParams.set('player', player.slug);
  history.replaceState({}, '', url);
}

function clearPlayerQuery() {
  const url = new URL(location.href);
  url.searchParams.delete('player');
  history.replaceState({}, '', url);
}

function queuePlayerForXI(player) {
  if (!player?.slug) return;
  try { sessionStorage.setItem('leedsBuzzXIAddPlayer', player.slug); } catch {}
  location.href = `/build-your-xi?add=${encodeURIComponent(player.slug)}`;
}

function populateFilterOptions(meta) {
  const addOptions = (selector, values) => {
    const select = $(selector);
    if (!select) return;
    const first = select.options[0]?.outerHTML || '';
    select.innerHTML = first + (values || []).map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  };
  addOptions('#positionFilter', meta?.positions);
  addOptions('#eraFilter', meta?.eras);
  addOptions('#nationalityFilter', meta?.nationalities);
}

function buildRoster() {
  const roster = $('#vaultRoster');
  if (!roster) return;
  roster.innerHTML = filteredPlayers.map(player => `
    <button class="vault3d-player${player.id === selectedKey ? ' active' : ''}" data-player="${esc(player.id)}">
      <span class="number">${esc(player.number === 'LBUZZ' ? playerInitials(player) : player.number)}</span>
      <span class="player-copy"><b>${esc(player.label)}</b><small>${esc(player.positionLabel)} • ${esc(player.eraLabel)}</small></span>
      <span class="player-arrow">›</span>
    </button>`).join('') || `<div class="roster-error"><b>No players found</b><span>Clear a filter or try another name.</span></div>`;
  roster.querySelectorAll('.vault3d-player').forEach(button => button.addEventListener('click', () => applyPlayer(button.dataset.player)));
}

function renderCardGrid() {
  const grid = $('#vaultCardGrid');
  if (!grid) return;
  const pageCount = Math.max(1, Math.ceil(filteredPlayers.length / CARDS_PER_PAGE));
  cardPage = Math.min(Math.max(1, cardPage), pageCount);
  const startIndex = (cardPage - 1) * CARDS_PER_PAGE;
  const pagePlayers = filteredPlayers.slice(startIndex, startIndex + CARDS_PER_PAGE);
  grid.innerHTML = pagePlayers.map(player => `
    <article class="vault-player-card${player.id === selectedKey ? ' active' : ''}" data-player="${esc(player.id)}">
      <span class="vault-card-glow"></span>
      ${renderCardAvatar(player)}
      <span class="vault-card-copy"><small>${esc(player.status)} • ${esc(player.eraLabel)}</small><strong>${esc(player.label)}</strong><span>${esc(player.positionLabel || 'Leeds United player')}${player.nationality ? ` • ${esc(player.nationality)}` : ''}</span></span>
      <button class="vault-card-heart${memberFan.favourites.has(player.slug)?' active':''}" type="button" data-favourite-player="${esc(player.id)}" aria-label="${memberFan.favourites.has(player.slug)?'Remove from favourites':'Add to favourites'}">${memberFan.favourites.has(player.slug)?'♥':'♡'}</button>
      <span class="vault-card-stats"><b>${player.appearances ?? '—'}<small>apps</small></b><b>${player.goals ?? '—'}<small>goals</small></b><b class="fan-card-score">${fanSummaries.get(player.slug)?.fanScore ?? '—'}<small>fan</small></b></span>
      <span class="vault-card-actions"><button class="vault-card-open" type="button" data-player="${esc(player.id)}">OPEN 3D PROFILE →</button><button class="vault-card-compare" type="button" data-player="${esc(player.id)}">⇄ COMPARE</button><button class="vault-card-xi" type="button" data-player="${esc(player.id)}">＋ XI</button></span>
    </article>`).join('');
  grid.querySelectorAll('.vault-card-open').forEach(button => button.addEventListener('click', () => {
    applyPlayer(button.dataset.player);
    $('#vaultChamber')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }));
  grid.querySelectorAll('.vault-card-compare').forEach(button => button.addEventListener('click', () => openComparisonWith(button.dataset.player)));
  grid.querySelectorAll('.vault-card-xi').forEach(button => button.addEventListener('click', () => queuePlayerForXI(players[button.dataset.player])));
  grid.querySelectorAll('[data-favourite-player]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); toggleFavourite(players[button.dataset.favouritePlayer]); }));
  $('#vaultResultCount').textContent = String(filteredPlayers.length);
  $('#vaultEmpty').hidden = filteredPlayers.length > 0;
  renderPagination(pageCount);
}

function renderPagination(pageCount) {
  const holder = $('#vaultPagination');
  if (!holder) return;
  if (filteredPlayers.length <= CARDS_PER_PAGE) { holder.innerHTML=''; return; }
  const pages = new Set([1,pageCount,cardPage-2,cardPage-1,cardPage,cardPage+1,cardPage+2]);
  const visible = [...pages].filter(p => p >= 1 && p <= pageCount).sort((a,b)=>a-b);
  let last = 0;
  const parts = [`<button type="button" data-page="${cardPage-1}" ${cardPage===1?'disabled':''}>‹</button>`];
  for (const page of visible) {
    if (page - last > 1) parts.push('<span>…</span>');
    parts.push(`<button type="button" data-page="${page}" class="${page===cardPage?'active':''}">${page}</button>`);
    last = page;
  }
  parts.push(`<button type="button" data-page="${cardPage+1}" ${cardPage===pageCount?'disabled':''}>›</button>`);
  holder.innerHTML = parts.join('');
  holder.querySelectorAll('button[data-page]').forEach(button => button.addEventListener('click', () => {
    const next = Number(button.dataset.page);
    if (!Number.isFinite(next) || next < 1 || next > pageCount) return;
    cardPage = next;
    renderCardGrid();
    $('.vault-all')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

function renderLeaders() {
  const holder = $('#vaultLeaders');
  if (!holder) return;
  holder.innerHTML = leaders.slice(0,6).map((player,index) => `
    <button type="button" class="vault-leader" data-player="${esc(player.id)}">
      <span>${String(index+1).padStart(2,'0')}</span><div><small>APPEARANCE LEADER</small><strong>${esc(player.label)}</strong><em>${player.appearances ?? '—'} Leeds United appearances</em></div><b>›</b>
    </button>`).join('');
  holder.querySelectorAll('.vault-leader').forEach(button => button.addEventListener('click', () => {
    applyPlayer(button.dataset.player);
    $('#vaultChamber')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }));
}

function playerSortValue(player, sort) {
  if (sort === 'goals') return -(Number(player.goals) || -1);
  if (sort === 'name') return player.label;
  if (sort === 'debut') return player.firstTeamDebut || '9999';
  if (sort === 'recent') return player.isCurrent ? '0000' : String(player.lastAppearance || player.firstTeamDebut || '0001').split('').map(c=>c).join('');
  return -(Number(player.appearances) || -1);
}

function applyRosterFilter(preservePage = false) {
  if (!preservePage) cardPage = 1;
  const term = String($('#vaultSearch')?.value || '').trim().toLowerCase();
  const position = $('#positionFilter')?.value || 'all';
  const era = $('#eraFilter')?.value || 'all';
  const nationality = $('#nationalityFilter')?.value || 'all';
  const status = $('#statusFilter')?.value || 'all';
  const sort = $('#sortFilter')?.value || 'appearances';
  filteredPlayers = orderedPlayers.filter(player => {
    const haystack = [player.label,player.fullName,player.positionLabel,player.nationality,player.eraLabel].filter(Boolean).join(' ').toLowerCase();
    if (term && !haystack.includes(term)) return false;
    if (position !== 'all' && player.positionLabel !== position) return false;
    if (era !== 'all' && player.eraLabel !== era) return false;
    if (nationality !== 'all' && player.nationality !== nationality) return false;
    if (status === 'current' && !player.isCurrent) return false;
    if (status === 'true-blue' && Number(player.appearances || 0) < 50) return false;
    return true;
  });
  filteredPlayers.sort((a,b) => {
    if (sort === 'name') return a.label.localeCompare(b.label);
    if (sort === 'debut') return String(a.firstTeamDebut || '9999').localeCompare(String(b.firstTeamDebut || '9999'));
    if (sort === 'recent') return Number(b.isCurrent)-Number(a.isCurrent) || String(b.lastAppearance || b.firstTeamDebut || '').localeCompare(String(a.lastAppearance || a.firstTeamDebut || ''));
    if (sort === 'goals') return (Number(b.goals)||-1)-(Number(a.goals)||-1) || (Number(b.appearances)||-1)-(Number(a.appearances)||-1);
    return (Number(b.appearances)||-1)-(Number(a.appearances)||-1) || a.label.localeCompare(b.label);
  });
  $('#visibleCount').textContent = String(filteredPlayers.length);
  buildRoster();
  renderCardGrid();
  if (!players[selectedKey] || !filteredPlayers.some(p => p.id === selectedKey)) {
    const next = filteredPlayers[0];
    if (next) applyPlayer(next.id, false, 'clear');
  }
}

function populateCompareSelect() {
  const select = $('#compareSelect');
  if (!select) return;
  const options = orderedPlayers.filter(player => player.id !== selectedKey);
  select.innerHTML = options.map(player => `<option value="${esc(player.id)}">${esc(player.label)}</option>`).join('');
  if (!players[compareKey] || compareKey === selectedKey) compareKey = options[0]?.id || null;
  if (compareKey) select.value = compareKey;
}


function hasValue(value) {
  return value !== null && value !== undefined && value !== '' && value !== '—';
}

function formatNumber(value) {
  return hasValue(value) && Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-GB') : '—';
}

function buildCareerGridRows(player) {
  const startsKnown = hasValue(player.starts);
  const subsKnown = hasValue(player.substituteAppearances);
  const third = startsKnown ? ['STARTS', formatNumber(player.starts)] : hasValue(player.leedsSeasons) ? ['LEEDS UNITED SEASONS', formatNumber(player.leedsSeasons)] : ['STARTS', '—'];
  const fourth = subsKnown ? ['SUB APPS', formatNumber(player.substituteAppearances)] : hasValue(player.majorHonours) ? ['MAJOR HONOURS', formatNumber(player.majorHonours)] : ['SUB APPS', '—'];
  return [
    ['APPEARANCES', formatNumber(player.appearances)],
    ['GOALS', formatNumber(player.goals)],
    third,
    fourth,
    ['CLUB CAREER', player.clubCareer || (player.firstTeamDebut ? formatDate(player.firstTeamDebut) : (player.isCurrent ? 'Current squad' : 'Not yet verified'))],
    ['NATIONALITY', player.nationality || 'Not yet verified']
  ];
}

function sourceTableForPlayer(player) {
  if (player.isCurrent && Number(player.appearances || 0) < 50) {
    return { publisher:'Leeds United Football Club', title:'Leeds United men’s first-team profiles and squad information', url:'https://www.leedsunited.com/en/teams/men', type:'OFFICIAL CLUB' };
  }
  if (Number(player.appearances || 0) >= 100) {
    return { publisher:'Wikipedia contributors', title:'List of Leeds United F.C. players', url:'https://en.wikipedia.org/wiki/List_of_Leeds_United_F.C._players', type:'CAREER TABLE' };
  }
  return { publisher:'Wikipedia contributors', title:'List of Leeds United F.C. players', url:'https://en.wikipedia.org/wiki/List_of_Leeds_United_F.C._players', type:'CAREER TABLE' };
}

function careerYears(player) {
  const years = String(player.clubCareer || '').match(/(?:18|19|20)\d{2}/g) || [];
  const unique = [...new Set(years.map(Number))].filter(Number.isFinite);
  const start = unique.length ? Math.min(...unique) : (String(player.firstTeamDebut || '').match(/(?:18|19|20)\d{2}/)?.[0] ? Number(String(player.firstTeamDebut).match(/(?:18|19|20)\d{2}/)[0]) : null);
  const endRaw = unique.length ? Math.max(...unique) : (String(player.lastAppearance || '').match(/(?:18|19|20)\d{2}/)?.[0] ? Number(String(player.lastAppearance).match(/(?:18|19|20)\d{2}/)[0]) : null);
  return { start, end: player.isCurrent ? 'Present' : endRaw };
}

function coreProfileStory(player) {
  const parts = [];
  const apps = Number(player.appearances);
  if (Number.isFinite(apps)) parts.push(`${player.label} made ${apps.toLocaleString('en-GB')} competitive first-team appearance${apps===1?'':'s'} for Leeds United.`);
  else parts.push(`${player.label} is included in the LeedsBuzz.biz White Vault as a verified Leeds United first-team player.`);
  if (hasValue(player.goals) && Number.isFinite(Number(player.goals))) parts.push(`The archive records ${Number(player.goals).toLocaleString('en-GB')} Leeds United goal${Number(player.goals)===1?'':'s'}.`);
  const identity = [player.nationality, player.positionLabel && player.positionLabel !== 'Leeds United player' ? player.positionLabel : null].filter(Boolean);
  if (identity.length) parts.push(`${identity.join(' • ')}.`);
  if (player.clubCareer) parts.push(`Leeds United career: ${player.clubCareer}.`);
  else if (player.isCurrent) parts.push('Current first-team player at the latest squad snapshot.');
  parts.push('LeedsBuzz.biz leaves any unverified career field visibly unfilled rather than guessing it.');
  return parts.join(' ');
}

function profileCompleteness(player, detail = {}, summary = null) {
  const checks = [
    hasValue(player.appearances), hasValue(player.goals), player.positionCode !== 'LBUZZ', hasValue(player.nationality),
    hasValue(player.clubCareer), hasValue(player.starts), hasValue(player.substituteAppearances),
    Boolean(summary?.extract || player.bio), Array.isArray(player.honours) && player.honours.length > 0,
    Boolean((detail.sources || []).length || summary?.url)
  ];
  const complete = checks.filter(Boolean).length;
  const score = Math.round(complete / checks.length * 100);
  const factualCore = checks.slice(0,7).filter(Boolean).length;
  const label = score >= 80 ? 'SOURCE ENRICHED' : factualCore >= 5 ? 'VERIFIED CORE' : 'CORE RECORD';
  return { score, complete, total: checks.length, label };
}

function renderVerification(player, detail = {}, summary = null) {
  const status = profileCompleteness(player, detail, summary);
  const bar = $('#profileCompletenessBar'); if (bar) bar.style.width = `${status.score}%`;
  $('#profileCompletenessScore').textContent = `${status.score}%`;
  $('#profileVerificationLabel').textContent = status.label;
  $('#profileCompletenessText').textContent = `${status.complete} of ${status.total} archive fields currently source-backed`;
  $('#storyVerificationBadge').textContent = status.label;
  $('#storySourceDate').textContent = summary?.fetchedAt ? `Extended story checked ${new Date(summary.fetchedAt).toLocaleDateString('en-GB')}` : 'Core source snapshot: July 2026';
}

function renderCareerTimeline(player) {
  const years = careerYears(player);
  const holder = $('#careerTimeline');
  const startLabel = years.start || 'Unknown';
  const endLabel = years.end || (player.isCurrent ? 'Present' : 'Unknown');
  const middle = Number(player.appearances || 0) >= 250 ? '250+ Club' : Number(player.appearances || 0) >= 100 ? '100+ Club' : Number(player.appearances || 0) >= 50 ? 'Vault Standard' : 'Current squad';
  $('#careerSpanBadge').textContent = player.clubCareer || (years.start ? `${years.start}–${endLabel}` : (player.isCurrent ? 'CURRENT' : 'NOT PUBLISHED'));
  if (holder) holder.innerHTML = [
    ['ARRIVAL', String(startLabel), years.start ? 'First recorded Leeds United year' : 'Career year not yet verified'],
    ['VAULT STATUS', middle, `${formatNumber(player.appearances)} competitive appearances`],
    [player.isCurrent ? 'NOW' : 'FINAL YEAR', String(endLabel), player.isCurrent ? 'Active at latest squad snapshot' : (years.end ? 'Last recorded Leeds United year' : 'Final year not yet verified')]
  ].map(item => `<div><i></i><small>${esc(item[0])}</small><strong>${esc(item[1])}</strong><em>${esc(item[2])}</em></div>`).join('');
  const apps = Math.max(0, Number(player.appearances) || 0);
  const milestones = [50,100,250,500];
  const next = milestones.find(value => apps < value);
  const items = milestones.map(value => `<span class="${apps>=value?'achieved':next===value?'next':''}">${apps>=value?'✓ ':next===value?'NEXT ':''}${value}+ APPEARANCES</span>`);
  if (player.isCurrent && apps < 50) items.unshift(`<span class="achieved">CURRENT SQUAD ELIGIBLE</span>`);
  $('#appearanceMilestones').innerHTML = items.join('');
}

function normaliseHonour(item) {
  if (typeof item === 'string') return { title:item, season:'', count:1 };
  if (!item || typeof item !== 'object') return null;
  return { title:item.title || item.name || item.competition || 'Leeds United honour', season:item.season || item.year || item.years || '', count:Number(item.count || 1) };
}

function renderHonours(player) {
  const honours = (Array.isArray(player.honours) ? player.honours : []).map(normaliseHonour).filter(Boolean);
  $('#profileHonoursCount').textContent = honours.length ? `${honours.length} VERIFIED` : 'NOT PUBLISHED';
  const holder = $('#profileHonours');
  if (!holder) return;
  holder.innerHTML = honours.length ? honours.map(item => `<div class="profile-honour"><span>🏆</span><div><strong>${esc(item.title)}</strong><small>${esc(item.season || 'Verified Leeds United honour')}</small></div><b>${item.count>1?`×${item.count}`:'✓'}</b></div>`).join('') : '<div class="profile-empty-note"><b>No individual honours list has been attached yet.</b>This does not mean the player won no trophies. LeedsBuzz.biz will only display player-specific silverware after it is independently verified.</div>';
}

function renderKeyFacts(player) {
  const apps = Number(player.appearances);
  const goals = hasValue(player.goals) ? Number(player.goals) : null;
  const goalRate = Number.isFinite(apps) && apps > 0 && Number.isFinite(goals) ? (goals/apps).toFixed(3) : null;
  const years = careerYears(player);
  const facts = [
    ['ROLE', player.positionLabel || 'Not verified', player.ratings?.role ? `White DNA role: ${player.ratings.role}` : 'Archive position'],
    ['NATIONALITY', player.nationality || 'Not verified', 'As recorded for the Leeds United career table'],
    ['CAREER SPAN', player.clubCareer || (years.start ? `${years.start}–${years.end || '—'}` : 'Not verified'), player.isCurrent ? 'Current at latest snapshot' : 'Calendar years'],
    ['GOAL RATE', goalRate ? `${goalRate} per app` : 'Not available', goals === null ? 'Goals not yet source-backed' : `${formatNumber(goals)} goals in ${formatNumber(apps)} appearances`]
  ];
  $('#profileKeyFacts').innerHTML = facts.map(([label,value,note]) => `<div><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div>`).join('');
}

function relatedPlayersFor(player) {
  const targetApps = Number(player.appearances || 0);
  const targetYears = careerYears(player);
  const middleYear = targetYears.start && Number.isFinite(Number(targetYears.end)) ? (targetYears.start + Number(targetYears.end))/2 : targetYears.start || 2026;
  return orderedPlayers.filter(candidate => candidate.id !== player.id).map(candidate => {
    const candidateYears = careerYears(candidate);
    const candidateMiddle = candidateYears.start && Number.isFinite(Number(candidateYears.end)) ? (candidateYears.start + Number(candidateYears.end))/2 : candidateYears.start || 2026;
    let score = 0;
    if (candidate.positionCode === player.positionCode && player.positionCode !== 'LBUZZ') score += 80;
    if (candidate.eraLabel === player.eraLabel) score += 30;
    score -= Math.min(40, Math.abs(Number(candidate.appearances || 0)-targetApps)/10);
    score -= Math.min(35, Math.abs(candidateMiddle-middleYear)/2);
    return { candidate, score };
  }).sort((a,b)=>b.score-a.score).slice(0,4).map(item=>item.candidate);
}

function renderRelatedPlayers(player) {
  const holder = $('#relatedPlayers'); if (!holder) return;
  const related = relatedPlayersFor(player);
  holder.innerHTML = related.map(candidate => `<button class="related-player" type="button" data-related-player="${esc(candidate.id)}"><span>${esc(playerInitials(candidate))}</span><div><strong>${esc(candidate.label)}</strong><small>${esc(candidate.positionLabel)} • ${formatNumber(candidate.appearances)} apps</small></div></button>`).join('');
  holder.querySelectorAll('[data-related-player]').forEach(button => button.addEventListener('click', () => {
    applyPlayer(button.dataset.relatedPlayer, true, 'clear');
    $('#vaultChamber')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

function getWikiSummaryCache() {
  if (wikiSummaryCache) return wikiSummaryCache;
  try { wikiSummaryCache = JSON.parse(localStorage.getItem(WIKI_SUMMARY_CACHE_KEY) || '{}') || {}; }
  catch { wikiSummaryCache = {}; }
  return wikiSummaryCache;
}

function saveWikiSummaryCache() {
  try { localStorage.setItem(WIKI_SUMMARY_CACHE_KEY, JSON.stringify(wikiSummaryCache || {})); } catch {}
}

function trimSummary(value, max = 950) {
  const text = String(value || '').replace(/\s+/g,' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0,max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return `${cut.slice(0, sentence > max*.55 ? sentence+1 : max).trim()}…`;
}

function searchResultScore(player, result) {
  const title = metadataSlug(result?.title || '');
  const target = metadataSlug(player.label);
  const snippet = String(result?.snippet || '').replace(/<[^>]+>/g,' ').toLowerCase();
  let score = title === target ? 120 : title.includes(target) || target.includes(title) ? 75 : 0;
  if (snippet.includes('leeds')) score += 55;
  if (snippet.includes('football')) score += 15;
  if (snippet.includes('player')) score += 8;
  if (player.nationality && snippet.includes(String(player.nationality).toLowerCase())) score += 8;
  return score;
}

async function fetchWikipediaSummary(player) {
  if (!player?.slug) return null;
  const cache = getWikiSummaryCache();
  const cached = cache[player.slug];
  if (cached?.fetchedAt && Date.now()-Date.parse(cached.fetchedAt) < 30*24*60*60*1000) return cached.notFound ? null : cached;
  try {
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.searchParams.set('action','query'); searchUrl.searchParams.set('list','search');
    searchUrl.searchParams.set('srsearch',`\"${player.label}\" Leeds United footballer`); searchUrl.searchParams.set('srlimit','6');
    searchUrl.searchParams.set('format','json'); searchUrl.searchParams.set('formatversion','2'); searchUrl.searchParams.set('origin','*');
    const searchResponse = await fetch(searchUrl,{headers:{accept:'application/json'},cache:'no-store'});
    if (!searchResponse.ok) throw new Error(`Wikipedia search ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    const results = (searchData?.query?.search || []).map(result => ({...result,score:searchResultScore(player,result)})).sort((a,b)=>b.score-a.score);
    const best = results[0];
    if (!best || best.score < 55) { cache[player.slug]={notFound:true,fetchedAt:new Date().toISOString()}; saveWikiSummaryCache(); return null; }
    const pageUrl = new URL('https://en.wikipedia.org/w/api.php');
    pageUrl.searchParams.set('action','query'); pageUrl.searchParams.set('prop','extracts|info'); pageUrl.searchParams.set('pageids',String(best.pageid));
    pageUrl.searchParams.set('exintro','1'); pageUrl.searchParams.set('explaintext','1'); pageUrl.searchParams.set('inprop','url');
    pageUrl.searchParams.set('format','json'); pageUrl.searchParams.set('formatversion','2'); pageUrl.searchParams.set('origin','*');
    const pageResponse = await fetch(pageUrl,{headers:{accept:'application/json'},cache:'no-store'});
    if (!pageResponse.ok) throw new Error(`Wikipedia summary ${pageResponse.status}`);
    const pageData = await pageResponse.json(); const page = pageData?.query?.pages?.[0];
    const extract = trimSummary(page?.extract || '');
    if (!extract || !/(leeds(?: football club| f\.?c\.?)?|elland road)/i.test(extract)) {
      cache[player.slug]={notFound:true,fetchedAt:new Date().toISOString()}; saveWikiSummaryCache(); return null;
    }
    const summary = { title:page.title, extract, url:page.fullurl || `https://en.wikipedia.org/?curid=${best.pageid}`, fetchedAt:new Date().toISOString(), publisher:'Wikipedia contributors' };
    cache[player.slug]=summary; saveWikiSummaryCache(); return summary;
  } catch (error) {
    console.info('Extended player summary unavailable.', error?.message || error); return null;
  }
}

function dedupeSources(sources) {
  const map = new Map();
  for (const source of sources.filter(Boolean)) {
    const url = safeWebUrl(source.url); if (!url) continue;
    if (!map.has(url)) map.set(url,{...source,url});
  }
  return [...map.values()];
}

function renderSources(player, detail = {}, summary = null) {
  const sources = dedupeSources([
    sourceTableForPlayer(player),
    ...(detail.sources || []),
    summary ? {publisher:summary.publisher,title:summary.title,url:summary.url,type:'EXTENDED STORY'} : null,
    player.isCurrent ? {publisher:'Leeds United Football Club',title:'Leeds United men’s squad and player profiles',url:'https://www.leedsunited.com/en/teams/men',type:'CURRENT SQUAD'} : null
  ]);
  const holder = $('#vaultSources'); if (!holder) return;
  holder.innerHTML = sources.length ? sources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener"><span><i class="source-kind">${esc(source.type || 'SOURCE')}</i>${esc(source.publisher || 'Verified source')}</span><strong>${esc(source.title || source.url)}</strong><em>Open source ↗</em></a>`).join('') : '<p>No public source link is attached to this profile yet. No unsupported fact will be displayed in its place.</p>';
}

function renderProfileArchive(player, detail = {}, summary = null) {
  if (!player) return;
  player.career = buildCareerGridRows(player);
  $('#careerGrid').innerHTML = player.career.map(([label,value]) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
  renderVerification(player,detail,summary);
  renderCareerTimeline(player);
  renderHonours(player);
  renderKeyFacts(player);
  renderRelatedPlayers(player);
  $('#profileBio').textContent = summary?.extract || player.bio || coreProfileStory(player);
  const storySource = $('#profileStorySource');
  if (storySource) {
    storySource.hidden = !summary;
    storySource.innerHTML = summary ? `Extended summary attributed to <a href="${esc(summary.url)}" target="_blank" rel="noopener">${esc(summary.publisher)}</a>. Core Leeds United totals remain tied to the career-table source.` : '';
  }
  renderSources(player,detail,summary);
}

function applyPlayer(key, updateCompare = true, urlMode = 'clear') {
  const player = players[key];
  if (!player || !isTrueBlue(player)) return;
  selectedKey = key;
  rememberViewedPlayer(player);
  $$('.vault3d-player').forEach(btn => btn.classList.toggle('active', btn.dataset.player === key));
  $$('.vault-player-card').forEach(card => card.classList.toggle('active', card.dataset.player === key));
  $('#profileName').textContent = player.name;
  $('#profileBadge').textContent = player.isCurrent && Number(player.appearances || 0) < 50 ? 'NOW' : '50+';
  $('#profileRole').textContent = `${player.positionLabel || player.role} • ${player.nationality || 'Leeds United'} • ${player.eraLabel}`;
  $('#floatAppearances').textContent = player.appearances ?? '—';
  $('#floatGoals').textContent = player.goals ?? '—';
  $('#floatPosition').textContent = player.position;
  $('#floatEra').textContent = player.eraLabel;
  $('#floatStatus').textContent = player.status;
  $('#stageEra').textContent = player.eraLabel.toUpperCase();
  $('#comparePrimaryName').textContent = player.label;
  $('#likenessNote').textContent = player.likeness;
  $('#careerStatus').textContent = player.eligibility || 'WHITE ARCHIVE RECORD';
  $('#careerSourceNote').textContent = `${player.sourceCount || 0} stored source${player.sourceCount === 1 ? '' : 's'} plus the published Leeds United career table. Unknown fields are never guessed.`;
  renderProfileRadar(player);
  renderFanPanel(player, fanDetails.get(player.slug) || summaryAsDetail(player.slug));
  void loadFanDetail(player);
  renderProfileArchive(player, {}, null);
  $('#vaultFacts').innerHTML = '<div class="vault-detail-loading">Loading verified player facts…</div>';
  if (urlMode === 'set') setPlayerQuery(player);
  else if (urlMode === 'clear') clearPlayerQuery();

  if (bodyRoot) {
    bodyRoot.scale.set(player.body.width, player.body.height, player.body.width);
    modelParts.head.scale.set(player.look.face[0] * player.body.head, player.look.face[1] * player.body.head, player.look.face[2] * player.body.head);
    applyPose(player.body.pose);
    buildFace(player);
    updateNumberTexture(player.number || 'LBUZZ');
    playerRoot.rotation.y = 0;
  }
  populateCompareSelect();
  if (updateCompare) updateComparison();
  loadPlayerDetail(player);
}

async function loadPlayerDetail(player) {
  if (!player?.slug) return;
  let detail = detailCache.get(player.slug);
  if (!detail) {
    try {
      const response = await fetch(`/api/blue-vault/player/${encodeURIComponent(player.slug)}`, { headers:{accept:'application/json'} });
      if (!response.ok) throw new Error(`Profile detail ${response.status}`);
      detail = await response.json();
      detailCache.set(player.slug, detail);
    } catch (error) {
      console.info('Using bundled White Vault profile detail.', error?.message || error);
      const sourceList = [];
      if (Number(player.appearances || 0) >= 100) {
        sourceList.push({ publisher:'Wikipedia contributors', title:'List of Leeds United F.C. players', url:'https://en.wikipedia.org/wiki/List_of_Leeds_United_F.C._players' });
      } else if (Number(player.appearances || 0) >= 50) {
        sourceList.push({ publisher:'Wikipedia contributors', title:'List of Leeds United F.C. players', url:'https://en.wikipedia.org/wiki/List_of_Leeds_United_F.C._players' });
      }
      if (player.isCurrent) {
        sourceList.push({ publisher:'Leeds United Football Club', title:'Leeds United men’s first-team squad', url:'https://www.leedsunited.com/en/teams/men' });
      }
      detail = {
        facts:[{
          fact_type:'APPEARANCE RECORD',
          title:`${Number(player.appearances || 0).toLocaleString('en-GB')} competitive Leeds United appearances`,
          body: player.isCurrent ? 'Included in the bundled snapshot as a current Leeds United first-team player.' : 'Included in the bundled LeedsBuzz launch archive.'
        }],
        records:[],
        sources:sourceList
      };
    }
  }
  if (selectedKey !== player.id) return;
  const facts = [...(detail.facts || []), ...(detail.records || []).map(record => ({ title:record.title, body:record.value_text, fact_type:record.category }))];
  $('#vaultFacts').innerHTML = facts.length ? facts.slice(0,8).map(fact => `<article><small>${esc(fact.fact_type || 'ARCHIVE FACT')}</small><strong>${esc(fact.title || 'Leeds United record')}</strong><p>${esc(fact.body || '')}</p></article>`).join('') : '<p>No additional sourced records are attached yet. The verified core career record above remains available for every Vault player.</p>';
  renderProfileArchive(player, detail, null);
  const summary = await fetchWikipediaSummary(player);
  if (selectedKey !== player.id) return;
  renderProfileArchive(player, detail, summary);
}

function openComparisonWith(key) {
  if (!players[key]) return;
  if (key === selectedKey) {
    const alternative = orderedPlayers.find(player => player.id !== selectedKey);
    compareKey = alternative?.id || null;
  } else compareKey = key;
  populateCompareSelect();
  const drawer = $('#compareDrawer');
  drawer?.classList.add('open');
  drawer?.setAttribute('aria-hidden','false');
  updateComparison();
  drawer?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function updateComparison() {
  const a = players[selectedKey], b = players[compareKey];
  if (!a || !b) return;
  rememberComparison(a,b);
  a.ratings = buildPlayerRatings(a);
  b.ratings = buildPlayerRatings(b);
  $('#cmpNameA').textContent = a.name;
  $('#cmpRatingA').textContent = `${a.ratings.overall} RATING`;
  $('#cmpNameB').textContent = b.name;
  $('#cmpRatingB').textContent = `${b.ratings.overall} RATING`;
  $('#cmpModelA').textContent = a.ratings.model; $('#cmpConfidenceA').textContent = a.ratings.confidence;
  $('#cmpModelB').textContent = b.ratings.model; $('#cmpConfidenceB').textContent = b.ratings.confidence;
  $('#addCompareAName').textContent = a.label; $('#addCompareBName').textContent = b.label;
  renderCompareRadar(a,b);
  const goalRate = player => (Number.isFinite(Number(player.goals)) && Number(player.appearances)>0) ? Number(player.goals)/Number(player.appearances) : null;
  const metrics = [
    ['Appearances', a.appearances, b.appearances, value => Number(value).toLocaleString('en-GB')],
    ['Goals', a.goals, b.goals, value => Number(value).toLocaleString('en-GB')],
    ['Goals / game', goalRate(a), goalRate(b), value => Number(value).toFixed(2)],
    ['Clean sheets', a.cleanSheets, b.cleanSheets, value => Number(value).toLocaleString('en-GB')],
    ['White rating', a.ratings.overall, b.ratings.overall, value => String(value)],
    ['Fan rating', fanSummaries.get(a.slug)?.fanScore, fanSummaries.get(b.slug)?.fanScore, value => Number(value).toFixed(1)],
    ['Leeds United impact', a.ratings.impact, b.ratings.impact, value => String(value)]
  ];
  $('#compareRows').innerHTML = metrics.map(([label,av,bv,format]) => {
    const aKnown = av !== null && av !== undefined && Number.isFinite(Number(av));
    const bKnown = bv !== null && bv !== undefined && Number.isFinite(Number(bv));
    const aNum = aKnown ? Number(av) : 0, bNum = bKnown ? Number(bv) : 0, max = Math.max(aNum,bNum,1);
    const aDisplay = aKnown ? format(av) : '—', bDisplay = bKnown ? format(bv) : '—';
    return `<div class="compare-row"><span class="metric-a${aNum>bNum?' winner':''}">${aDisplay}</span><div class="compare-bar reverse"><i style="width:${aKnown?Math.round(aNum/max*100):0}%"></i></div><span class="compare-label">${esc(label.toUpperCase())}</span><div class="compare-bar"><i style="width:${bKnown?Math.round(bNum/max*100):0}%"></i></div><span class="metric-b${bNum>aNum?' winner':''}">${bDisplay}</span></div>`;
  }).join('');
}


function metadataSlug(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/&/g,' and ').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function parseInteger(value) {
  const match = String(value || '').replace(/,/g,'').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseWikipediaPlayerTable(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const results = [];
  for (const table of [...doc.querySelectorAll('table.wikitable')]) {
    const headerText = [...table.querySelectorAll('tr')].slice(0,3)
      .flatMap(row => [...row.querySelectorAll('th')].map(cell => cell.textContent.replace(/\s+/g,' ').trim().toLowerCase()))
      .join(' ');
    // Wikipedia uses a two-row header: Player…Appearances…Goals / Starts…Subs…Total.
    if (!headerText.includes('player') || !headerText.includes('club career') || !headerText.includes('starts') || !headerText.includes('subs') || !headerText.includes('total') || !headerText.includes('goals')) continue;
    for (const row of [...table.querySelectorAll('tr')]) {
      const cells = [...row.querySelectorAll(':scope > th, :scope > td')];
      if (cells.length < 8) continue;
      const clean = cell => (cell?.textContent || '').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
      const name = clean(cells[0]);
      const total = parseInteger(clean(cells[6]));
      if (!name || /^(player|list of)/i.test(name) || !Number.isFinite(total) || total < 50) continue;
      const nationalityLink = cells[1]?.querySelector('a[title]');
      const nationality = (nationalityLink?.getAttribute('title') || clean(cells[1]) || '').replace(/^Flag of /i,'').trim() || null;
      results.push({
        slug: metadataSlug(name), name, nationality,
        position: clean(cells[2]) || null,
        clubCareer: clean(cells[3]) || null,
        starts: parseInteger(clean(cells[4])),
        substituteAppearances: parseInteger(clean(cells[5])),
        appearances: total,
        goals: parseInteger(clean(cells[7]))
      });
    }
  }
  return results;
}

async function fetchWikipediaMetadata() {
  try {
    const cached = JSON.parse(localStorage.getItem(WIKI_CACHE_KEY) || 'null');
    if (cached?.savedAt && Date.now()-cached.savedAt < 7*24*60*60*1000 && Array.isArray(cached.rows) && cached.rows.length > 300) return cached.rows;
  } catch {}
  const pages = ['List_of_Leeds_United_F.C._players'];
  const payloads = await Promise.all(pages.map(async page => {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.searchParams.set('action','parse'); url.searchParams.set('page',page); url.searchParams.set('prop','text');
    url.searchParams.set('format','json'); url.searchParams.set('formatversion','2'); url.searchParams.set('origin','*');
    const response = await fetch(url, {headers:{accept:'application/json'}, cache:'no-store'});
    if (!response.ok) throw new Error(`Wikipedia metadata ${response.status}`);
    const json = await response.json();
    return parseWikipediaPlayerTable(json?.parse?.text || '');
  }));
  const map = new Map();
  for (const row of payloads.flat()) {
    const prior = map.get(row.slug);
    if (!prior || Number(row.appearances) > Number(prior.appearances)) map.set(row.slug,row);
  }
  const rows = [...map.values()];
  if (rows.length > 300) {
    try { localStorage.setItem(WIKI_CACHE_KEY, JSON.stringify({savedAt:Date.now(),rows})); } catch {}
  }
  return rows;
}

function rebuildCatalogueIndexes() {
  players = Object.fromEntries(orderedPlayers.map(player => [player.id,player]));
  leaders = [...orderedPlayers].sort((a,b)=>(Number(b.appearances)||0)-(Number(a.appearances)||0)).slice(0,8);
  const positions = [...new Set(orderedPlayers.map(p=>p.positionLabel).filter(v=>v && v!=='Leeds United player'))].sort();
  const nationalities = [...new Set(orderedPlayers.map(p=>p.nationality).filter(Boolean))].sort();
  const eras = [...new Set(orderedPlayers.map(p=>p.eraLabel).filter(Boolean))];
  populateFilterOptions({positions,nationalities,eras});
}

function mergeMetadataRows(rows, sourceLabel='metadata') {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const bySlug = new Map(rows.map(row => [metadataSlug(row.slug || row.name),row]));
  let changed = 0;
  orderedPlayers = orderedPlayers.map(player => {
    const row = bySlug.get(metadataSlug(player.slug || player.label));
    if (!row) return player;
    const mergedRow = {
      ...player,
      position: row.position || player.positionLabel,
      nationality: row.nationality || player.nationality,
      clubCareer: row.clubCareer || player.clubCareer,
      starts: row.starts ?? player.starts,
      substituteAppearances: row.substituteAppearances ?? player.substituteAppearances,
      appearances: row.appearances ?? player.appearances,
      goals: row.goals ?? player.goals,
      displayName: player.label,
      fullName: player.fullName,
      slug: player.slug,
      id: player.dbId || player.id,
      isCurrent: player.isCurrent,
      trueBlueEligible: player.trueBlueEligible,
      eligibility: player.eligibility,
      era: player.eraLabel,
      shirtNumber: player.number === 'LBUZZ' ? null : player.number,
      sourceCount: Math.max(Number(player.sourceCount||0),1)
    };
    changed++;
    return mapApiPlayer(mergedRow);
  });
  rebuildCatalogueIndexes();
  applyRosterFilter(true);
  renderLeaders();
  if (selectedKey && players[selectedKey]) applyPlayer(selectedKey,false,'preserve');
  const knownGoals = orderedPlayers.filter(p=>p.goals !== null && p.goals !== undefined).length;
  const knownPositions = orderedPlayers.filter(p=>p.positionCode !== 'LBUZZ').length;
  const coverage = $('#vaultCoverageText');
  if (coverage) coverage.textContent = `${orderedPlayers.filter(p=>Number(p.appearances)>=50).length.toLocaleString('en-GB')} 50+ players • ${knownGoals.toLocaleString('en-GB')} goal records • ${knownPositions.toLocaleString('en-GB')} positions loaded`;
  return changed;
}

async function enrichCatalogueFromWikipedia(){ return [];
}

function applyCatalogueData(data, sourceLabel = 'bundled') {
  const priorSelected = selectedKey;
  catalogueMeta.trueBlueMinimumAppearances = Number(data.threshold || 50);
  catalogueMeta.currentPlayersAlwaysEligible = data.currentPlayersIncluded !== false;
  orderedPlayers = (data.players || []).map(mapApiPlayer).filter(player => player.id && player.label);
  rebuildCatalogueIndexes();
  $('#vaultEligibleCount').textContent = Number(data.counts?.eligible || orderedPlayers.length).toLocaleString('en-GB');
  $('#vaultHundredCount').textContent = Number(data.counts?.hundredPlus || 0).toLocaleString('en-GB');
  $('#vaultFiveHundredCount').textContent = Number(data.counts?.fiveHundredPlus || 0).toLocaleString('en-GB');
  $('#vaultCurrentCount').textContent = Number(data.counts?.current || 0).toLocaleString('en-GB');
  const fiftyPlus = Number(data.counts?.fiftyPlus || 0);
  const eligible = Number(data.counts?.eligible || orderedPlayers.length);
  const complete = data.dataset?.complete === true;
  const status = sourceLabel === 'live' ? 'live White Archive synced' : 'complete bundled database loaded';
  $('#vaultCoverageText').textContent = `${fiftyPlus.toLocaleString('en-GB')} source-backed 50+ players • ${eligible.toLocaleString('en-GB')} total Vault profiles${complete ? ` • ${status}` : ''}`;
  renderLeaders();
  filteredPlayers = [...orderedPlayers];
  const currentUrl = new URL(location.href);
  const requested = currentUrl.searchParams.get('player');
  const requestedCompare = currentUrl.searchParams.get('compare');
  selectedKey = requested && players[requested] ? requested : (priorSelected && players[priorSelected] ? priorSelected : (leaders[0]?.id || orderedPlayers[0]?.id || null));
  compareKey = requestedCompare && players[requestedCompare] && requestedCompare !== selectedKey ? requestedCompare : ((compareKey && players[compareKey]) ? compareKey : (leaders.find(player => player.id !== selectedKey)?.id || orderedPlayers.find(player => player.id !== selectedKey)?.id || null));
}

async function loadCatalogue() {
  // Static-first by design: the page always has the complete catalogue even if D1,
  // the Worker or a third-party source is temporarily unavailable.
  applyCatalogueData(BLUE_VAULT_DATABASE, 'bundled');
}

async function refreshCatalogueFromApi() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/blue-vault/players?limit=500&sort=appearances&dataset=complete-2026-07-22', {
      headers:{accept:'application/json'}, cache:'no-store', signal:controller.signal
    });
    if (!response.ok) return;
    const data = await response.json();
    // Never replace the complete bundled database with a partial/empty API response.
    if (!Array.isArray(data.players) || data.players.length < BLUE_VAULT_DATABASE.players.length) return;
    const keepSelected = selectedKey;
    const apiRows = data.players.map(row => ({
      ...row,
      position: row.position || undefined,
      nationality: row.nationality || undefined,
      clubCareer: row.clubCareer || undefined
    }));
    mergeMetadataRows(apiRows,'live');
    $('#vaultEligibleCount').textContent = Number(data.counts?.eligible || orderedPlayers.length).toLocaleString('en-GB');
    $('#vaultHundredCount').textContent = Number(data.counts?.hundredPlus || 0).toLocaleString('en-GB');
    $('#vaultFiveHundredCount').textContent = Number(data.counts?.fiveHundredPlus || 0).toLocaleString('en-GB');
    $('#vaultCurrentCount').textContent = Number(data.counts?.current || 0).toLocaleString('en-GB');
    if (keepSelected && players[keepSelected]) applyPlayer(keepSelected, false, 'preserve');
  } catch (error) {
    console.info('White Vault is using its bundled database.', error?.message || error);
  } finally {
    clearTimeout(timer);
  }
}


function summaryAsDetail(slug){const s=fanSummaries.get(slug)||{};return{playerSlug:slug,fanScore:s.fanScore??null,voteCount:s.voteCount||0,favouriteCount:s.favouriteCount||0,distribution:[0,0,0,0,0],authenticated:memberFan.authenticated,userScore:memberFan.ratings.get(slug)??null,isFavourite:memberFan.favourites.has(slug)}}
function requireMember(){if(memberFan.authenticated)return true;if(window.LeedsBuzzMembership?.open)window.LeedsBuzzMembership.open('login');else location.href='/account';return false}
function renderFanPanel(player,detail={}){
  if(!player)return; const score=detail.fanScore;
  $('#fanAverageScore').textContent=score===null||score===undefined?'—':Number(score).toFixed(1).replace('.0','');
  const votes=Number(detail.voteCount||0), favs=Number(detail.favouriteCount||0);
  $('#fanVoteCount').textContent=votes?`${votes.toLocaleString('en-GB')} FAN VOTE${votes===1?'':'S'}`:'NO VOTES YET';
  $('#fanFavouriteCount').textContent=`${favs.toLocaleString('en-GB')} favourite${favs===1?'':'s'}`;
  const favourite=detail.isFavourite??memberFan.favourites.has(player.slug),favBtn=$('#profileFavouriteBtn');
  favBtn?.classList.toggle('active',Boolean(favourite)); favBtn?.setAttribute('aria-pressed',String(Boolean(favourite)));
  if(favBtn)favBtn.innerHTML=`${favourite?'♥':'♡'} <span>${favourite?'FAVOURITED':'FAVOURITE'}</span>`;
  const dist=Array.isArray(detail.distribution)?detail.distribution:[0,0,0,0,0],max=Math.max(...dist,1),labels=['0–59','60–69','70–79','80–89','90–100'];
  const holder=$('#fanDistribution'); if(holder)holder.innerHTML=labels.map((label,i)=>`<div><span>${label}</span><i><b style="width:${Math.round((dist[i]||0)/max*100)}%"></b></i><em>${dist[i]||0}</em></div>`).join('');
  const userScore=detail.userScore??memberFan.ratings.get(player.slug); const range=$('#fanRatingRange'),output=$('#fanRatingOutput');
  if(userScore!==null&&userScore!==undefined){range.value=String(userScore);output.value=String(userScore);output.textContent=String(userScore);}
  $('#removeFanRatingBtn').hidden=userScore===null||userScore===undefined;
  $('#fanRatingMessage').textContent=memberFan.authenticated?(userScore===null||userScore===undefined?'Your vote is private to your account and can be edited later.':`Your saved rating is ${userScore}/100. Move the slider and save to change it.`):'Sign in once, rate every Leeds player from 0–100 and edit your vote whenever you like.';
}
async function loadFanSummaries(){try{const r=await fetch('/api/fan/summaries',{headers:{accept:'application/json'},cache:'no-store'});if(!r.ok)return;const d=await r.json();fanSummaries=new Map((d.players||[]).map(x=>[x.playerSlug,x]));renderCardGrid();if(selectedKey)renderFanPanel(players[selectedKey],fanDetails.get(players[selectedKey].slug)||summaryAsDetail(players[selectedKey].slug));if(compareKey)updateComparison()}catch{}}
async function loadMemberFan(){try{const r=await fetch('/api/member/fan',{headers:{accept:'application/json'},cache:'no-store',credentials:'same-origin'});const d=await r.json();memberFan={authenticated:Boolean(d.authenticated),ratings:new Map((d.ratings||[]).map(x=>[x.playerSlug,Number(x.score)])),favourites:new Set((d.favourites||[]).map(x=>x.playerSlug))};renderCardGrid();if(selectedKey)void loadFanDetail(players[selectedKey],true)}catch{}}
async function loadFanDetail(player,force=false){if(!player)return; if(!force&&fanDetails.has(player.slug)){renderFanPanel(player,fanDetails.get(player.slug));return}try{const r=await fetch(`/api/fan/player/${encodeURIComponent(player.slug)}`,{headers:{accept:'application/json'},cache:'no-store',credentials:'same-origin'});if(!r.ok)return;const d=await r.json();fanDetails.set(player.slug,d);fanSummaries.set(player.slug,{playerSlug:player.slug,fanScore:d.fanScore,voteCount:d.voteCount,favouriteCount:d.favouriteCount});if(d.authenticated){memberFan.authenticated=true;if(d.userScore===null)memberFan.ratings.delete(player.slug);else memberFan.ratings.set(player.slug,Number(d.userScore));if(d.isFavourite)memberFan.favourites.add(player.slug);else memberFan.favourites.delete(player.slug)}if(selectedKey===player.id)renderFanPanel(player,d);renderCardGrid();if(compareKey)updateComparison()}catch{}}
async function saveFanRating(event){event?.preventDefault();const player=players[selectedKey];if(!player||!requireMember())return;const score=Number($('#fanRatingRange').value);const btn=$('#saveFanRatingBtn');btn.disabled=true;btn.textContent='SAVING…';try{const r=await fetch(`/api/fan/player/${encodeURIComponent(player.slug)}/rating`,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({score})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Rating could not be saved.');memberFan.ratings.set(player.slug,score);fanDetails.delete(player.slug);await loadFanDetail(player,true);btn.textContent='✓ SAVED';setTimeout(()=>btn.textContent='SAVE RATING',1300)}catch(error){$('#fanRatingMessage').textContent=error.message;btn.textContent='SAVE RATING'}finally{btn.disabled=false}}
async function removeFanRating(){const player=players[selectedKey];if(!player||!requireMember())return;await fetch(`/api/fan/player/${encodeURIComponent(player.slug)}/rating`,{method:'DELETE',credentials:'same-origin'});memberFan.ratings.delete(player.slug);fanDetails.delete(player.slug);await loadFanDetail(player,true)}
async function toggleFavourite(player){if(!player||!requireMember())return;const active=memberFan.favourites.has(player.slug);if(active)memberFan.favourites.delete(player.slug);else memberFan.favourites.add(player.slug);renderCardGrid();if(selectedKey===player.id)renderFanPanel(player,{...(fanDetails.get(player.slug)||summaryAsDetail(player.slug)),isFavourite:!active});try{const r=await fetch(`/api/fan/player/${encodeURIComponent(player.slug)}/favourite`,{method:active?'DELETE':'POST',credentials:'same-origin'});if(!r.ok)throw new Error();fanDetails.delete(player.slug);await loadFanDetail(player,true);void loadFanLeaderboards()}catch{if(active)memberFan.favourites.add(player.slug);else memberFan.favourites.delete(player.slug);renderCardGrid()}}
async function loadFanLeaderboards(){try{const r=await fetch('/api/fan/leaderboards',{headers:{accept:'application/json'},cache:'no-store'});if(!r.ok)return;fanLeaderboards=await r.json();$('#fanRankingMethod').textContent=fanLeaderboards.method||$('#fanRankingMethod').textContent;renderFanLeaderboard()}catch{renderFanLeaderboard()}}
function fanBoardMetric(item,board){if(board==='topRated')return`${item.fanScore}/100 • ${item.voteCount} vote${item.voteCount===1?'':'s'}`;if(board==='mostFavourited')return`${item.favouriteCount} favourite${item.favouriteCount===1?'':'s'}`;if(board==='mostSelected')return`${item.xiCount} saved XI${item.xiCount===1?'':'s'}`;return`${item.activity} interaction${item.activity===1?'':'s'} this week`}
function renderFanLeaderboard(){const rows=fanLeaderboards[activeFanBoard]||[],holder=$('#fanRankingGrid');if(!holder)return;holder.innerHTML=rows.length?rows.map((item,index)=>{const player=players[item.playerSlug];if(!player)return'';return`<button class="fan-ranking-card" data-ranking-player="${esc(player.id)}" type="button"><em>${index+1}</em>${renderCardAvatar(player)}<span><small>${activeFanBoard==='topRated'?'FAN RATING':activeFanBoard==='mostSelected'?'BUILD YOUR XI':activeFanBoard==='mostFavourited'?'SUPPORTER FAVOURITES':'TRENDING NOW'}</small><strong>${esc(player.label)}</strong><b>${esc(fanBoardMetric(item,activeFanBoard))}</b></span></button>`}).join(''):'<div class="fan-ranking-loading">This leaderboard will fill as Leeds supporters rate players, choose favourites and save XIs.</div>';holder.querySelectorAll('[data-ranking-player]').forEach(btn=>btn.addEventListener('click',()=>{applyPlayer(btn.dataset.rankingPlayer);$('#vaultChamber')?.scrollIntoView({behavior:'smooth',block:'start'})}))}

function askBizBotAboutSelected() {
  const player = players[selectedKey];
  if (!player) return;
  const prompt = `Tell me the full Leeds United story of ${player.label}: their career, best moments, records and legacy.`;
  const launcher = document.querySelector('#bbWidgetLauncher');
  if (launcher) {
    launcher.click();
    setTimeout(() => {
      const input = document.querySelector('#bbWidgetInput');
      const form = document.querySelector('#bbWidgetForm');
      if (input && form) { input.value = prompt; form.requestSubmit(); }
    }, 220);
    return;
  }
  location.href = `/bizbot?player=${encodeURIComponent(player.slug)}`;
}

async function shareSelectedPlayer() {
  const player = players[selectedKey];
  if (!player) return;
  const url = new URL(location.href); url.searchParams.set('player',player.slug);
  try {
    if (navigator.share) await navigator.share({ title:`${player.label} — LeedsBuzz.biz White Vault`, text:`Explore ${player.label} in the LeedsBuzz.biz White Vault.`, url:url.href });
    else { await navigator.clipboard.writeText(url.href); const btn=$('#sharePlayerBtn'); const old=btn.textContent; btn.textContent='✓ LINK COPIED'; setTimeout(()=>btn.textContent=old,1500); }
  } catch {}
}

function bindUI() {
  ['#vaultSearch','#positionFilter','#eraFilter','#nationalityFilter','#statusFilter','#sortFilter'].forEach(selector => $(selector)?.addEventListener(selector==='#vaultSearch'?'input':'change', () => applyRosterFilter(false)));
  $('#clearVaultFilters')?.addEventListener('click', () => {
    $('#vaultSearch').value='';
    ['#positionFilter','#eraFilter','#nationalityFilter','#statusFilter'].forEach(selector => { if ($(selector)) $(selector).value='all'; });
    if ($('#sortFilter')) $('#sortFilter').value='appearances';
    cardPage = 1;
    clearPlayerQuery();
    applyRosterFilter();
    const defaultPlayer = leaders[0] || orderedPlayers[0];
    if (defaultPlayer) applyPlayer(defaultPlayer.id, true, 'preserve');
  });
  $$('.profile-tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.profile-tab').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    $$('.profile-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === btn.dataset.tab));
  }));
  $('#autoRotateBtn')?.addEventListener('click', () => {
    autoRotate = !autoRotate; if (controls) controls.autoRotate = autoRotate;
    $('#autoRotateBtn').classList.toggle('active',autoRotate);
  });
  $('#resetViewBtn')?.addEventListener('click', () => {
    if (!camera || !controls) return;
    camera.position.set(0,1.15,7.2); controls.target.set(0,.15,0); controls.update(); playerRoot?.rotation.set(0,0,0);
  });
  $('#fanRatingRange')?.addEventListener('input',event=>{const output=$('#fanRatingOutput');output.value=event.target.value;output.textContent=event.target.value});
  $('#fanRatingForm')?.addEventListener('submit',saveFanRating);
  $('#removeFanRatingBtn')?.addEventListener('click',removeFanRating);
  $('#profileFavouriteBtn')?.addEventListener('click',()=>toggleFavourite(players[selectedKey]));
  $$('.fan-ranking-tabs [data-fan-board]').forEach(btn=>btn.addEventListener('click',()=>{activeFanBoard=btn.dataset.fanBoard;$$('.fan-ranking-tabs [data-fan-board]').forEach(x=>x.classList.toggle('active',x===btn));renderFanLeaderboard()}));
  window.addEventListener('leeds:memberchange',()=>void loadMemberFan());
  $('#sharePlayerBtn')?.addEventListener('click',shareSelectedPlayer);
  $('#addToXiBtn')?.addEventListener('click', () => queuePlayerForXI(players[selectedKey]));
  $('#askBizBotPlayer')?.addEventListener('click',askBizBotAboutSelected);
  $('#compareBtn')?.addEventListener('click', () => openComparisonWith(compareKey || orderedPlayers.find(player => player.id !== selectedKey)?.id));
  $('#closeCompareBtn')?.addEventListener('click', () => { const drawer=$('#compareDrawer'); drawer?.classList.remove('open'); drawer?.setAttribute('aria-hidden','true'); });
  $('#compareSelect')?.addEventListener('change', event => { compareKey=event.target.value; updateComparison(); });
  $('#addCompareAToXi')?.addEventListener('click', () => queuePlayerForXI(players[selectedKey]));
  $('#addCompareBToXi')?.addEventListener('click', () => queuePlayerForXI(players[compareKey]));
  $('#swapCompareBtn')?.addEventListener('click', () => { if (!players[compareKey]) return; const former=selectedKey; applyPlayer(compareKey,false,'preserve'); compareKey=former; populateCompareSelect(); if ($('#compareSelect')) $('#compareSelect').value=compareKey; updateComparison(); });
  window.addEventListener('popstate', () => {
    const slug = new URL(location.href).searchParams.get('player');
    if (slug && players[slug]) applyPlayer(slug, true, 'preserve');
    else {
      const defaultPlayer = leaders[0] || orderedPlayers[0];
      if (defaultPlayer) applyPlayer(defaultPlayer.id, true, 'preserve');
    }
  });
}

async function startVault() {
  try {
    await loadCatalogue();
    applyRosterFilter();
    bindUI();
    initThree();
    if (selectedKey) applyPlayer(selectedKey, true, 'preserve');
    const requestedCompare = new URL(location.href).searchParams.get('compare');
    if (requestedCompare && players[requestedCompare] && requestedCompare !== selectedKey) openComparisonWith(requestedCompare);
    if ('ResizeObserver' in window) new ResizeObserver(() => resizeRenderer()).observe($('#vault3dStage'));
    // The complete appearance catalogue renders immediately. Rich historical fields then
    // fill automatically and are cached; no manual database patch is required.
    void enrichCatalogueFromWikipedia();
    void refreshCatalogueFromApi();
    void loadFanSummaries();
    void loadMemberFan();
    void loadFanLeaderboards();
  } catch (error) {
    console.error(error);
    const roster=$('#vaultRoster');
    if (roster) roster.innerHTML=`<div class="roster-error"><b>White Vault unavailable</b><span>${esc(error.message)}</span></div>`;
    const grid=$('#vaultCardGrid');
    if (grid) grid.innerHTML=`<div class="vault-error-card"><strong>The player database could not load.</strong><span>Refresh once Cloudflare has finished deploying the latest deployment.</span></div>`;
    $('#stageLoading')?.classList.add('done');
  }
}
function resizeRenderer(){const stage=$('#vault3dStage');if(!stage||!renderer||!camera)return;const width=Math.max(320,stage.clientWidth),height=Math.max(420,stage.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()}
function animate(){requestAnimationFrame(animate);const t=clock.getElapsedTime();if(hologramMaterial)hologramMaterial.uniforms.uTime.value=t;if(playerRoot){playerRoot.position.y=Math.sin(t*1.55)*.035;modelParts.pedestal.rotation.z=t*.17}chamberRings.forEach(r=>r.rotation.z+=r.userData.speed*.0025);if(particleField)particleField.rotation.y=t*.018;controls?.update();renderer?.render(scene,camera)}


startVault();
