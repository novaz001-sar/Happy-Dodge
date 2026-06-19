import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createI18n } from './i18n.js';
import { createLevels } from './levels.js';

// ---------- Guards ----------
(function pointerCaptureGuard(){
  const EP = Element.prototype;
  if (!EP) return;
  if (EP.setPointerCapture) {
    const _spc = EP.setPointerCapture;
    EP.setPointerCapture = function(id){ try { return _spc.call(this, id); } catch(e){} };
  }
  if (EP.releasePointerCapture) {
    const _rpc = EP.releasePointerCapture;
    EP.releasePointerCapture = function(id){ try { return _rpc.call(this, id); } catch(e){} };
  }
})();

// ---------- Tunables ----------
const GLOBAL_TURRET_RATE_MULT = 3.0;
const PLAYER_SPEED = 3;
const PLAYER_BULLET_SPEED = 150;
const PLAYER_RADIUS = 0.5; // For collision detection
const GameModes = { ELIM:'elimination', SURV:'survival', WAYPOINT:'waypoint' };
const ViewModes = { FIRST:'firstperson', TOPDOWN:'topdown' };
const CUSTOM_SLOTS = 5;
const VERSION = 153; // Updated version
const SLOT_KEY = (i)=> `gd_menu_custom_level_v${VERSION}_slot${i}`;
const SLOT_NAME_KEY = (i)=> `gd_menu_custom_name_v${VERSION}_slot${i}`;
const GLOBAL_SETTINGS_KEY = `gd_global_settings_v${VERSION}`;
const MODIFIED_BUILTIN_KEY_PREFIX = `gd_modified_builtin_v${VERSION}_`;
const LANG_KEY = `gd_language_v${VERSION}`;


// ---------- Global State ----------
let scene, camera, renderer;
let orbitControls;
let clock;
let gameMode = 'menu'; // 'menu' | 'playing' | 'paused' | 'editing'
let currentGameMode = GameModes.ELIM;
let lastLevel = null;
let loadedLevelMeta = null; // last loaded level's meta (name/mode/timer/camera)
let objectCounter = 0;
let gameStartTime = 0;
let editingBuiltInKey = null;
let editingCustomSlot = null;
let currentLang = 'zh-CN';
let isTestingFromEditor = false;
let totalWaypointsInLevel = 0;

// Environment and Visuals
let arena = { w: 90, d: 70, groundStyle: 'checkered', groundColor: '#FFFFFF', groundPatternColor: '#999999',
              groundTextureScale: 5, groundCustomTextureURL: null, groundCustomTexture: null,
              columnCustomTexture: null, lighthouseCustomTexture: null };

let visualSettings = {
    crosshairColor: '#00FF00', crosshairThickness: 4, crosshairSize: 20
};

// Camera / view settings (stored per-level)
const DEFAULT_CAMERA_SETTINGS = {
    viewMode: ViewModes.FIRST,
    topDownAngle: 60,      // degrees. 0=horizontal, 90=straight down
    topDownDistance: 35,   // world units
    topDownYaw: 0          // degrees around Y axis (not exposed in editor for now)
};
let cameraSettings = { ...DEFAULT_CAMERA_SETTINGS };

// Top-down aim state (mouse pointer on screen -> world point on ground)
const topDownAim = {
    ndc: new THREE.Vector2(0, 0),
    clientX: window.innerWidth / 2,
    clientY: window.innerHeight / 2,
    hasPointer: false
};
const topDownRaycaster = new THREE.Raycaster();
const topDownGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Updated Environment settings with Sky Colors
let levelEnvironment = {
    dayNightCycleEnabled: false, cycleDuration: 120, currentTime: 0,
    sunIntensityMultiplier: 1.0, // Increased default intensity slightly
    defaultSkyColor: '#FFFFFF',
    daySkyColor: '#BDE3FF',
    nightSkyColor: '#0f172a',
    centralGemHeight: 50, centralGemIntensity: 0.5, centralGemColor: '#FFFFFF',
    lighthouseColor: '#FFFF00', lighthouseIntensity: 1.5, lighthouseTowerColor: '#888888',
    columnColor: '#FFFFFF',
    columnCustomTextureURL: null, columnTextureScale: 1,
    lighthouseTowerCustomTextureURL: null, lighthouseTowerTextureScale: 4
};
let dirLight, hemiLight, stars;
let centralGem = null; // Central light object {mesh, light}


const turrets = [];
const walls = [];
const bullets = [];
const columns = [];
const lighthouses = [];
const waypoints = [];
const activeEffects = [];
let groundMesh = null;
let nextWaypointIndex = 1;
let aimedTurret = null;
const crosshairRaycaster = new THREE.Raycaster();


const player = { pos: new THREE.Vector3(0,1.6,10), vel: new THREE.Vector3(), speed: PLAYER_SPEED, hp: 200, weapon: null };
let playerMarker = null; // THREE.Group
let playerAvatar = null; // THREE.Group (visible in top-down mode)

// mouse-look state
const look = { yaw: 0, pitch: 0, sens: 0.0025, deltaX: 0, deltaY: 0 };
const altDrag = { active:false, lastX:0, lastY:0 };

// keys
const keys = { w:false,a:false,s:false,d:false, up:false,left:false,down:false,right:false };

// UI refs
const $ = (id) => document.getElementById(id);
const hud = $('hud'), hpEl = $('hp'), tmEl = $('tm'), goalEl = $('goal'), crosshair = $('crosshair'), damageFx = $('damage');
const menu = $('menu'), editorPanel = $('editor'), pausePanel = $('pause'), lockHint = $('lockHint');
const objKind = $('obj-kind'), posX = $('pos-x'), posZ = $('pos-z'), positionInputsRow = $('position-inputs-row');
const gameModeSel = $('game-mode'), topDownViewChk = $('topdown-view-enabled'), levelTimeInput = $('level-time'), arenaWInput = $('arena-w'), arenaDInput = $('arena-d'), playerHpInput = $('player-hp'), topDownAngleInput = $('topdown-angle'), topDownDistanceInput = $('topdown-distance'), topDownCameraSettingsRow = $('topdown-camera-settings');
const turretPanel = $('turret-panel'), turretType = $('turret-type'), turretRate = $('turret-rate'), bulletSpeed = $('bullet-speed');
const gearSel = $('gear'), moveModeSel = $('move-mode'), patrolW = $('patrol-w'), patrolD = $('patrol-d');
const pathEditBtn = $('path-edit'), pathDoneBtn = $('path-done'), pathClearBtn = $('path-clear'), pathLoopChk = $('path-loop');
// Updated Wall Panel Refs
const wallPanel = $('wall-panel'), wallH = $('wall-h'), wallT = $('wall-t'), wallTypeSel = $('wall-type');

// New UI refs for wall modes
const btnWallDragMode = $('btn-wall-drag-mode');
const btnWallStretchMode = $('btn-wall-stretch-mode');
const wallStretchInstructions = $('wall-stretch-instructions');
const btnWallExtendMode = $('btn-wall-extend-mode');
const wallExtendInstructions = $('wall-extend-instructions');

const waypointPanel = $('waypoint-panel'), waypointOrderInput = $('waypoint-order'), waypointSizeInput = $('waypoint-size'), waypointColorInput = $('waypoint-color'), waypointIntensityInput = $('waypoint-intensity'), waypointTextColorInput = $('waypoint-textColor');
const saveSlotSel = $('save-slot'), levelNameInput = $('level-name');
const objList = $('obj-list');
const turretStyleSel = $('turret-style');
const groundStyleSel = $('ground-style'), groundColorInput = $('ground-color');
const groundPatternColorInput = $('ground-pattern-color');
const wallBaseColorInput = $('wall-base-color');
const wallPatternColorInput = $('wall-pattern-color');
const kingkongTurretPanel = $('kingkong-turret-panel');
const kingkongHpInput = $('kingkong-hp');
const kingkongColorInput = $('kingkong-color');
const kingkongAoeRadiusInput = $('kingkong-aoe-radius');
const kingkongAoeDamageInput = $('kingkong-aoe-damage');
const kingkongAoeIntervalInput = $('kingkong-aoe-interval');
const kingkongGearSel = $('kingkong-gear');
const kingkongPathEditBtn = $('kingkong-path-edit'), kingkongPathDoneBtn = $('kingkong-path-done'), kingkongPathClearBtn = $('kingkong-path-clear'), kingkongPathLoopChk = $('kingkong-path-loop');

// Visual/Environment UI
const dayNightEnabledChk = $('day-night-enabled');
const cycleDurationInput = $('cycle-duration');
const crosshairColorInput = $('crosshair-color');
const crosshairThicknessInput = $('crosshair-thickness');
const crosshairSizeInput = $('crosshair-size');
const sunIntensityInput = $('sun-intensity');
const skyColorDefaultInput = $('sky-color-default');
const skyColorDayInput = $('sky-color-day');
const skyColorNightInput = $('sky-color-night');

const centralGemHeightInput = $('central-gem-height');
const centralGemIntensityInput = $('central-gem-intensity');
const centralGemColorInput = $('central-gem-color');
const lighthouseColorInput = $('lighthouse-color');
const lighthouseIntensityInput = $('lighthouse-intensity');
const lighthouseTowerColorInput = $('lighthouse-tower-color');
const columnColorInput = $('column-color');
const groundTextureScaleInput = $('ground-texture-scale');
const wallTextureScaleInput = $('wall-texture-scale');
const columnTextureScaleInput = $('column-texture-scale');
const lighthouseTextureScaleInput = $('lighthouse-texture-scale');


// ---------- Editor State ----------
const EDITOR_Y_OFFSET = 0.06;
// Updated Editor Data for Handles and Stretch Mode
const editorData={ selection:null, dragging:false, dragPlane:new THREE.Plane(new THREE.Vector3(0,1,0), -EDITOR_Y_OFFSET), ray:new THREE.Raycaster(), handles: [], draggingHandle: null,
  // New state for wall stretch mode
  wallStretchMode: { active: false, mode: 'stretch', wall: null, stretchingEnd: null, hoverMarker: null }
};
const pathEdit={ active:false, turret:null, markers:[], line:null };
// Texture loading state
const textureLoader = new THREE.TextureLoader();
let textureUploadTarget = null; // 'ground' or 'wall' or 'column' or 'lighthouse'

// Internationalization (i18n) Definitions
const i18n = createI18n(VERSION);

// i18n Helper Functions
function T(key, ...args) {
    const langTranslations = i18n[currentLang] || i18n['zh-CN'];
    let translation = langTranslations[key];

    if (translation === undefined) {
        // Handle the specific case where the old key might still be used if the new one isn't found (though both should be updated)
        if (key === 'editor_wall_tips_new' && !translation && langTranslations['editor_wall_tips']) {
             translation = langTranslations['editor_wall_tips'];
        } else {
            translation = i18n['zh-CN'][key] || `[${key}]`;
        }
    }

    if (typeof translation === 'function') {
        return translation(...args);
    }
    return translation;
}

function setLanguage(lang) {
    if (i18n[lang]) {
        currentLang = lang;
        localStorage.setItem(LANG_KEY, lang);
        $('lang-switcher').value = lang;
        updateUIText();
    }
}

function updateUIText() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        // Allow HTML in specific elements like instructions, hints, and tips (Updated list)
        if (key.includes('instructions') || key.includes('hint') || key === 'lock_hint' || key === 'pause_hint' || key === 'editor_kingkong_tips' || key === 'editor_wall_tips_new' || key === 'editor_global_tips' || key === 'editor_wall_stretch_instructions') {
            el.innerHTML = T(key);
        } else {
            if (el.tagName === 'OPTION' || el.tagName === 'BUTTON' || el.tagName === 'H1' || el.tagName === 'H3' || el.tagName === 'H4' || el.tagName === 'P' || el.tagName === 'SPAN' || el.tagName === 'LABEL') {
               el.textContent = T(key);
            }
        }
    });
    refreshMenuLevelNames();
    refreshCustomMenuButtons();
    if (gameMode === 'playing' || gameMode === 'paused') {
         updateHUD();
    }
    if (gameMode === 'editing') {
        updateObjectListUI();
        onSelectedChanged();
        syncGroundUI();
    }
}


// ------- Editor picking & dragging -------
const ensureCanvasPE = ()=>{ try{ if (renderer && renderer.domElement) renderer.domElement.style.pointerEvents='auto'; }catch(e){} };
let dragging=false, dragTarget=null, dragStartOffset=new THREE.Vector3();

// New: Handle Management for Walls (Updated for Stretch Mode)

function clearHandles() {
for (const handle of editorData.handles) {
    scene.remove(handle.mesh);
}
editorData.handles.length = 0;
editorData.draggingHandle = null;

// Ensure hover marker is managed correctly when handles are cleared
const stretchMode = editorData.wallStretchMode;
// We only remove the marker from the scene if the mode is inactive. If the mode is active, showWallHandles will manage it.
if (stretchMode.hoverMarker && !stretchMode.active) {
     scene.remove(stretchMode.hoverMarker);
     stretchMode.hoverMarker.visible = false;
}
}

// Updated: Visually distinguish the active stretching end
function createHandleMesh(position, isActive) {
const geometry = new THREE.SphereGeometry(0.8, 16, 16);
// Green by default (0x00ff00), Bright White (0xffffff) if active (selected for stretching)
const color = isActive ? 0xffffff : 0x00ff00;
const material = new THREE.MeshBasicMaterial({ color: color, depthTest: false, transparent: true, opacity: 0.8 });
const mesh = new THREE.Mesh(geometry, material);
mesh.position.copy(position);
mesh.renderOrder = 1000; // Render on top
return mesh;
}

// Updated: Reflect the active end in Stretch Mode
function showWallHandles(wall) {
clearHandles();
if (!wall) return;

const stretchMode = editorData.wallStretchMode;
// Determine if P1 or P2 is actively being stretched right now
const isStretchingP1 = stretchMode.active && stretchMode.wall === wall && stretchMode.stretchingEnd === 'p1';
const isStretchingP2 = stretchMode.active && stretchMode.wall === wall && stretchMode.stretchingEnd === 'p2';

const p1Mesh = createHandleMesh(new THREE.Vector3(wall.p1.x, EDITOR_Y_OFFSET, wall.p1.z), isStretchingP1);
const p2Mesh = createHandleMesh(new THREE.Vector3(wall.p2.x, EDITOR_Y_OFFSET, wall.p2.z), isStretchingP2);

editorData.handles.push({ type: 'p1', mesh: p1Mesh, wall: wall });
editorData.handles.push({ type: 'p2', mesh: p2Mesh, wall: wall });

scene.add(p1Mesh);
scene.add(p2Mesh);
}

// New function to manage Wall Edit Modes

// 支持三种：'drag' | 'stretch' | 'extend'
function setWallEditMode(mode) {
  const sel = editorData.selection;
  const stretchMode = editorData.wallStretchMode;
  const wall = (sel && sel.kind === 'wall') ? sel.ref : null;

  // 进入两种端点模式（需选中墙）
  if ((mode === 'stretch' || mode === 'extend') && wall) {
stretchMode.active = true;
stretchMode.mode = mode;
stretchMode.wall = wall;
stretchMode.stretchingEnd = null;

// UI 状态
btnWallDragMode.classList.remove('primary');
btnWallStretchMode.classList.toggle('primary', mode === 'stretch');
if (typeof btnWallExtendMode !== 'undefined') btnWallExtendMode.classList.toggle('primary', mode === 'extend');

wallStretchInstructions.style.display = (mode === 'stretch') ? 'block' : 'none';
if (typeof wallExtendInstructions !== 'undefined') wallExtendInstructions.style.display  = (mode === 'extend')  ? 'block' : 'none';

// 悬浮黄点（初始隐藏）
if (!stretchMode.hoverMarker) {
  const geometry = new THREE.SphereGeometry(0.6, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.7, depthTest: false });
  stretchMode.hoverMarker = new THREE.Mesh(geometry, material);
  stretchMode.hoverMarker.renderOrder = 999;
}
if (stretchMode.hoverMarker.parent !== scene) scene.add(stretchMode.hoverMarker);
stretchMode.hoverMarker.visible = false;

// 端点小球刷新
showWallHandles(wall);
return;
  }

  // 其他情况（含 drag 或未选中墙）：回到拖拽模式/清理
  stretchMode.active = false;
  stretchMode.mode = 'stretch';
  stretchMode.wall = null;
  stretchMode.stretchingEnd = null;

  if (wallPanel.style.display === 'block') {
btnWallDragMode.classList.add('primary');
btnWallStretchMode.classList.remove('primary');
if (typeof btnWallExtendMode !== 'undefined') btnWallExtendMode.classList.remove('primary');
wallStretchInstructions.style.display = 'none';
if (typeof wallExtendInstructions !== 'undefined') wallExtendInstructions.style.display  = 'none';
  }
  if (stretchMode.hoverMarker) {
scene.remove(stretchMode.hoverMarker);
stretchMode.hoverMarker.visible = false;
  }
  if (wall) showWallHandles(wall);
}



// Update the object list UI
function updateObjectListUI() {
objList.innerHTML = '';
const allObjects = [
    ...walls.map(w => ({ kind: 'wall', ref: w, id: w.id })),
    ...turrets.map(t => ({ kind: t.kind, ref: t, id: t.id })),
    ...waypoints.map(wp => ({ kind: 'waypoint', ref: wp, id: wp.id }))
];

allObjects.sort((a, b) => a.id - b.id);

allObjects.forEach(obj => {
    const item = document.createElement('div');
    item.classList.add('obj-item');
    let typeName;
    switch(obj.kind) {
        case 'wall': typeName = T('obj_wall'); break;
        case 'turret': typeName = T('obj_turret'); break;
        case 'kingkong_turret': typeName = T('obj_turret_kingkong'); break;
        case 'waypoint': typeName = `${T('obj_waypoint')} #${obj.ref.order}`; break;
        default: typeName = obj.kind;
    }
    item.textContent = `${typeName} (ID: ${obj.id})`;
    item.dataset.id = obj.id;
    item.dataset.kind = obj.kind;

    if (editorData.selection && editorData.selection.kind === obj.kind && editorData.selection.ref.id === obj.id) {
        item.classList.add('selected');
    }

    item.addEventListener('click', () => {
        editorData.selection = { kind: obj.kind, ref: obj.ref };
        onSelectedChanged();
        if (orbitControls && orbitControls.enabled) {
            // Updated centering logic for new wall structure
            let pos;
            if (obj.kind === 'wall') {
                pos = obj.ref.mesh.position;
            } else {
                pos = obj.ref.group.position;
            }
            orbitControls.target.copy(pos);
            if (camera.position.distanceTo(pos) < 10) {
                camera.position.lerp(pos.clone().add(new THREE.Vector3(5, 10, 5)), 0.1);
            }
            orbitControls.update();
        }
    });
    objList.appendChild(item);
});
}


// Update UI when selection changes
// Updated: Handle Wall Stretch Mode transitions
function onSelectedChanged(){
  const sel = editorData.selection;

  // Handle wall stretch mode interruption
  // If selection changes away from the active wall (or to nothing), reset the mode.
  if (editorData.wallStretchMode.active && (!sel || sel.kind !== 'wall' || editorData.wallStretchMode.wall.id !== sel.ref.id)) {
  setWallEditMode('drag'); // Reset to drag mode (performs cleanup)
  }

  // Handle path editing interruption
  if (pathEdit.active && (!sel || pathEdit.turret.id !== sel.ref.id)) {
  if (pathEditBtn.style.display === 'none') {
      pathEdit.active = false; pathEdit.turret = null;
      pathEditBtn.style.display = 'inline-block'; pathDoneBtn.style.display = 'none';
  }
  if (kingkongPathEditBtn.style.display === 'none') {
      pathEdit.active = false; pathEdit.turret = null;
      kingkongPathEditBtn.style.display = 'inline-block'; kingkongPathDoneBtn.style.display = 'none';
  }
  updatePathVisuals(null);
  }

  updateObjectListUI();
  clearHandles(); // Always clear handles when selection changes (setWallEditMode/showWallHandles will restore them if needed)

  if (!pathEdit.active) {
  updatePathVisuals(null);
  }
  // Default hide all panels
  turretPanel.style.display='none';
  kingkongTurretPanel.style.display='none';
  wallPanel.style.display='none';
  waypointPanel.style.display='none';
  positionInputsRow.style.display = 'flex'; // Show position inputs by default

  if (!sel || sel.kind==='none'){
posX.value = '';
posZ.value = '';
return;
  }

  try {
if (sel.kind==='turret'){
  const t = sel.ref;
  posX.value=t.group.position.x.toFixed(1); posZ.value=t.group.position.z.toFixed(1);
  objKind.value='turret';
  turretType.value=t.subType;
  turretStyleSel.value=t.style || 'scifi_blue';
  turretRate.value=(t.rate/GLOBAL_TURRET_RATE_MULT).toFixed(2);
  bulletSpeed.value=t.bps;
  gearSel.value=String(t.gear);
  moveModeSel.value=t.mode;
  patrolW.value=t.w;
  patrolD.value=t.d;
  pathLoopChk.checked=!!t.pathLoop;
  turretPanel.style.display='block';
  if (!pathEdit.active) {
      updatePathVisuals(t);
  }
} else if (sel.kind==='kingkong_turret') {
  const t = sel.ref;
  posX.value=t.group.position.x.toFixed(1); posZ.value=t.group.position.z.toFixed(1);
  objKind.value='kingkong_turret';
  kingkongHpInput.value = t.hp;
  kingkongColorInput.value = t.color;
  kingkongAoeRadiusInput.value = t.aoeRadius;
  kingkongAoeDamageInput.value = t.aoeDamage;
  kingkongAoeIntervalInput.value = t.aoeInterval;
  kingkongGearSel.value = String(t.gear);
  kingkongPathLoopChk.checked=!!t.pathLoop;
  kingkongTurretPanel.style.display='block';
  if (!pathEdit.active) {
      updatePathVisuals(t);
  }
} else if (sel.kind==='wall'){
  // Walls use handles, so we hide the standard X/Z position inputs
  positionInputsRow.style.display = 'none';
  const w = sel.ref;
  objKind.value='wall';
  wallH.value=w.h;
  wallT.value=w.t.toFixed(1); // Thickness
  wallTypeSel.value=w.type||'brick';

  const defaults = WallStyleDefaults[w.type] || WallStyleDefaults.brick;
  wallBaseColorInput.value = w.colors?.base || defaults.base;
  wallPatternColorInput.value = w.colors?.pattern || defaults.pattern;
  wallTextureScaleInput.value = w.textureScale || 1;

  wallPanel.style.display='block';

  // Default to Stretch Mode when a wall is selected (as per the new design preference)
  // If the mode is already active for this wall (e.g., clicking the item list), this call ensures UI consistency.
  if (!editorData.wallStretchMode.active || editorData.wallStretchMode.wall !== w) {
      setWallEditMode('stretch');
  } else {
      // If already in a mode, ensure UI reflects the current state (handles might have been cleared by clearHandles() above)
      // We rely on setWallEditMode logic to update the UI correctly based on the active state.
      setWallEditMode(editorData.wallStretchMode.active ? 'stretch' : 'drag');
  }

} else if (sel.kind==='player'){
  posX.value=player.pos.x.toFixed(1);
  posZ.value=player.pos.z.toFixed(1);
  objKind.value='player';
} else if (sel.kind === 'waypoint') {
    const wp = sel.ref;
    posX.value = wp.group.position.x.toFixed(1);
    posZ.value = wp.group.position.z.toFixed(1);
    objKind.value = 'waypoint';
    waypointOrderInput.value = wp.order;
    waypointSizeInput.value = wp.size.toFixed(1);
    waypointColorInput.value = wp.color;
    waypointIntensityInput.value = (wp.lightIntensity !== undefined ? wp.lightIntensity.toFixed(1) : 2.0);
    waypointTextColorInput.value = wp.textColor || '#FFFFFF';
    waypointPanel.style.display = 'block';
}
  } catch(e) { console.error("Error updating selection UI:", e); }
}

// Editor interaction helpers
function exScreenToRay(ev){
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((ev.clientX-rect.left)/rect.width)*2 - 1;
  const y = -((ev.clientY-rect.top)/rect.height)*2 + 1;
  const mouse = new THREE.Vector2(x,y);
  const rc = editorData.ray || new THREE.Raycaster();
  rc.setFromCamera(mouse, camera);
  return rc.ray;
}
function rayToGroundEx(ev){
  const ray = exScreenToRay(ev);
  // The plane is now correctly initialized at -EDITOR_Y_OFFSET
  const plane = editorData.dragPlane;
  const hit = new THREE.Vector3();
  if (ray.intersectPlane(plane, hit)) return hit;
  return null;
}

// Updated picking to include Handles
function pickObjectEx(ev){
  const rc = editorData.ray || new THREE.Raycaster();
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((ev.clientX-rect.left)/rect.width)*2 - 1;
  const y = -((ev.clientY-rect.top)/rect.height)*2 + 1;
  rc.setFromCamera(new THREE.Vector2(x,y), camera);

  const intersects = [];

  // 1. Check for handles first (as they are visually prioritized)
  for (const handle of editorData.handles) {
  const hits = rc.intersectObject(handle.mesh, false);
  if (hits.length > 0) {
      // Return immediately if a handle is hit
      return { kind: 'handle', ref: handle };
  }
  }

  // 2. Check for other objects
  const candidates = [];
  if (playerMarker && playerMarker.visible) candidates.push({obj: playerMarker, kind: 'player', ref: {mesh: playerMarker, id: -1}});
  walls.forEach(w => candidates.push({obj: w.mesh, kind: 'wall', ref: w}));
  turrets.forEach(t => candidates.push({obj: t.group, kind: t.kind, ref: t}));
  waypoints.forEach(wp => candidates.push({obj: wp.group, kind: 'waypoint', ref: wp}));

  for(const candidate of candidates) {
const isGroup = (candidate.kind !== 'wall');
const hits = rc.intersectObject(candidate.obj, isGroup);
if (hits.length > 0) {
    intersects.push({ hit: hits[0], kind: candidate.kind, ref: candidate.ref });
}
  }

  if (intersects.length === 0) return {kind:'none', ref:null};

  intersects.sort((a, b) => a.hit.distance - b.hit.distance);

  const closest = intersects[0];
  return { kind: closest.kind, ref: closest.ref };
}

// Main editor interaction handler (Updated for Stretch Mode)
function attachEditorMouse(){
  if (attachEditorMouse.__bound) return;
  attachEditorMouse.__bound = true;
  ensureCanvasPE();
  const cvs = renderer.domElement;

  cvs.addEventListener('mousedown', (ev)=>{
if (ev.button!==0 || gameMode!=='editing' || ev.target!==cvs) return;
if (ev.shiftKey) return;

const hitPt = rayToGroundEx(ev);
const picked = pickObjectEx(ev);
const stretchMode = editorData.wallStretchMode;

// Handle path editing click
if (pathEdit.active && pathEdit.turret && hitPt){
  // FIX 2: Disable OrbitControls during interaction
  if (orbitControls) orbitControls.enabled = false;
  const p = hitPt.clone();
  p.y = EDITOR_Y_OFFSET;
  pathEdit.turret.path.push(p);
  updatePathVisuals(pathEdit.turret);
  return;
}

// --- Wall Stretch/Extend Mode Logic ---
if (stretchMode.active && stretchMode.wall) {
  // 1) 点端点：选择锚点（被选端点会变白，黄点出现）
  if (picked.kind === 'handle' && picked.ref.wall === stretchMode.wall) {
  stretchMode.stretchingEnd = picked.ref.type; // 'p1' or 'p2'
  showWallHandles(stretchMode.wall);
  if (stretchMode.hoverMarker) stretchMode.hoverMarker.visible = true;
  return;
  }

  // 2) 已选择锚点后，点地面：根据模式执行
  if (stretchMode.stretchingEnd && hitPt) {
  const wall = stretchMode.wall;

  if (stretchMode.mode === 'extend') {
      // 从被选端点“生长”出一面新墙，复制旧墙参数
      const fixed = (stretchMode.stretchingEnd === 'p1') ? wall.p1 : wall.p2;
      addWall(
        fixed.x, fixed.z,
        hitPt.x, hitPt.z,
        wall.h, wall.t, wall.type, null,
        wall.colors, wall.customTextureURL, wall.textureScale
      );
      // 仍停留在外延模式，便于继续操作
      stretchMode.stretchingEnd = null;
      showWallHandles(wall);
      if (stretchMode.hoverMarker) stretchMode.hoverMarker.visible = false;
      updateObjectListUI();
      return;
  } else {
      // 端点拉伸：修改旧墙端点坐标
      if (stretchMode.stretchingEnd === 'p1') { wall.p1.x = hitPt.x; wall.p1.z = hitPt.z; }
      else { wall.p2.x = hitPt.x; wall.p2.z = hitPt.z; }
      updateWallMesh(wall);
      stretchMode.stretchingEnd = null;
      showWallHandles(wall);
      if (stretchMode.hoverMarker) stretchMode.hoverMarker.visible = false;
      return;
  }
  }
}
// --------------------------------

// Handle wall handle dragging (Traditional Drag Mode)
// Only allow dragging if Stretch Mode is NOT active
if (picked.kind === 'handle' && !stretchMode.active) {
    // FIX 2: Disable OrbitControls during interaction
    if (orbitControls) orbitControls.enabled = false;
    editorData.draggingHandle = picked.ref;
    // Set selection to the wall associated with the handle
    editorData.selection = { kind: 'wall', ref: picked.ref.wall };
    onSelectedChanged();
    // Safety check: Ensure we are in drag mode if the user started dragging (in case selection change logic failed)
    if (editorData.wallStretchMode.active) {
         setWallEditMode('drag');
    }
    return;
}

// Handle regular object dragging (Moving the whole object)
if (picked.kind!=='none' && picked.kind !== 'handle'){
  editorData.selection = picked;
  onSelectedChanged(); // This might activate Stretch Mode if a wall was picked

  // Allow dragging the object body regardless of the mode (e.g., moving the whole wall)
  if (editorData.selection) {
      // FIX 2: Disable OrbitControls during interaction
      if (orbitControls) orbitControls.enabled = false;
      dragging = true;
      dragTarget = picked;
      if (hitPt){
        let pos;
        if (picked.kind === 'player') {
            pos = player.pos;
        } else if (picked.kind === 'wall') {
            pos = picked.ref.mesh.position;
        } else {
            pos = picked.ref.group.position;
        }
        dragStartOffset.subVectors(pos, hitPt);
      }
  }
} else if (picked.kind === 'none') {
    // If user clicked nothing, clear selection (this will also exit stretch mode via onSelectedChanged)
    editorData.selection = null;
    onSelectedChanged();
}
  }, true);

  cvs.addEventListener('mousemove', (ev)=>{
const hit = rayToGroundEx(ev);
if (!hit) return;

const stretchMode = editorData.wallStretchMode;

// --- Wall Stretch Mode Hover Feedback (标黄点) ---
// If stretch mode is active AND an endpoint is selected AND the marker exists/is visible
if (stretchMode.active && stretchMode.stretchingEnd && stretchMode.hoverMarker && stretchMode.hoverMarker.visible) {
    // Update the yellow marker position to follow the mouse cursor on the ground
    stretchMode.hoverMarker.position.set(hit.x, EDITOR_Y_OFFSET, hit.z);
}
// -------------------------------------------------

// Handle dragging wall handles (Traditional Drag Mode)
// Only if draggingHandle is set (which implies !stretchMode.active)
if (editorData.draggingHandle) {
    const handle = editorData.draggingHandle;
    const wall = handle.wall;

    // Update the handle position and the wall endpoint
    handle.mesh.position.set(hit.x, EDITOR_Y_OFFSET, hit.z);
    if (handle.type === 'p1') {
        wall.p1.x = hit.x;
        wall.p1.z = hit.z;
    } else {
        wall.p2.x = hit.x;
        wall.p2.z = hit.z;
    }
    updateWallMesh(wall);
    return;
}

// Handle dragging regular objects (Moving the whole object)
if (dragging && dragTarget && !pathEdit.active){
    hit.add(dragStartOffset);
    let targetPos;

    if (dragTarget.kind==='player') {
        targetPos = player.pos;
    } else if (dragTarget.kind==='wall') {
        targetPos = dragTarget.ref.mesh.position;
    } else {
        targetPos = dragTarget.ref.group.position;
    }

    const dx = hit.x - targetPos.x;
    const dz = hit.z - targetPos.z;

    targetPos.x = hit.x;
    targetPos.z = hit.z;

    if (dragTarget.kind==='player'){
      playerMarker.position.set(hit.x, EDITOR_Y_OFFSET, hit.z);
    } else if (dragTarget.kind === 'wall') {
      // When moving the whole wall, also update its endpoints and handles
      const wall = dragTarget.ref;
      wall.p1.x += dx; wall.p1.z += dz;
      wall.p2.x += dx; wall.p2.z += dz;
      targetPos.y = wall.h / 2 - 0.01;
      showWallHandles(wall); // Reposition handles
    } else if (dragTarget.kind === 'waypoint') {
      targetPos.y = 1.5 * dragTarget.ref.size;
    } else if (dragTarget.kind === 'kingkong_turret') {
        targetPos.y = 0;
    } else if (dragTarget.kind === 'turret') {
        targetPos.y = 0.1;
    }
    applyPosInputs(); // update UI (only relevant if not a wall)
}
  });

  // This listener only resets the internal dragging state variables.
  // The re-enabling of OrbitControls is handled in setupCommon3D's global mouseup.
  window.addEventListener('mouseup', (ev)=>{
if (ev.button===0) {
    dragging=false;
    dragTarget=null;
    editorData.draggingHandle = null;
}
  });
}


// ---------- Helpers ----------
const clamp = (x,a,b)=>Math.max(a, Math.min(b, x));
const deepClone = (o)=>JSON.parse(JSON.stringify(o));
// Normalize game mode for backward compatibility (legacy 'topdown' used to be a gameMode).
const normalizeGameMode = (m)=>{
    if (m === 'topdown') return GameModes.ELIM;
    if (m === GameModes.ELIM || m === GameModes.SURV || m === GameModes.WAYPOINT) return m;
    return GameModes.ELIM;
};
// Gear speeds are based on player speed. Tier 1=0.25x, Tier 2=0.35x, Tier 3=0.5x (relative to player speed)
const gearToSpeed = (tier) => { const base = player.speed; if (String(tier)==='3') return base*0.5; if (String(tier)==='2') return base*0.35; return base*0.25; };
const isPointerLocked = ()=> document.pointerLockElement === (renderer && renderer.domElement);
const tryRequestPointerLock = () => {
    try {
        const promise = renderer?.domElement?.requestPointerLock?.();
        if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {});
        }
    } catch (e) {}
};
const initYawPitchFromCamera = ()=>{ const e = new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); look.pitch=e.x; look.yaw=e.y; };
const applyYawPitch = ()=>{ const maxP=Math.PI/2-0.05; look.pitch=Math.max(-maxP,Math.min(maxP,look.pitch)); camera.quaternion.setFromEuler(new THREE.Euler(look.pitch,look.yaw,0,'YXZ')); };

const updateTopDownCamera = ()=>{
    // Spherical camera around the player: distance + pitch angle (俯瞰角度)
    const angDeg = (Number(cameraSettings.topDownAngle) || DEFAULT_CAMERA_SETTINGS.topDownAngle);
    const dist = (Number(cameraSettings.topDownDistance) || DEFAULT_CAMERA_SETTINGS.topDownDistance);
    const yawDeg = (Number(cameraSettings.topDownYaw) || DEFAULT_CAMERA_SETTINGS.topDownYaw);

    const ang = THREE.MathUtils.degToRad(clamp(angDeg, 10, 89));
    const d = clamp(dist, 5, 200);
    const yaw = THREE.MathUtils.degToRad(yawDeg);

    const h = Math.sin(ang) * d;
    const r = Math.cos(ang) * d;
    const offX = Math.sin(yaw) * r;
    const offZ = Math.cos(yaw) * r;

    camera.position.set(player.pos.x + offX, player.pos.y + h, player.pos.z + offZ);
    camera.lookAt(player.pos.x, player.pos.y, player.pos.z);
};

const getTopDownAimPoint = (out)=>{
    if (!topDownAim.hasPointer) return null;
    topDownRaycaster.setFromCamera(topDownAim.ndc, camera);
    const hit = out || new THREE.Vector3();
    const ok = topDownRaycaster.ray.intersectPlane(topDownGroundPlane, hit);
    return ok ? hit : null;
};

const showHUD = (b)=>{
    hud.classList.toggle('hidden',!b);
    crosshair.classList.toggle('hidden',!b);
    if (player.weapon) {
         const weaponVisible = b && currentGameMode !== GameModes.WAYPOINT && cameraSettings.viewMode !== ViewModes.TOPDOWN;
         player.weapon.visible = weaponVisible;
    }
};

function saveGlobalSettings() {
    try {
        const settings = {
            crosshairColor: visualSettings.crosshairColor,
            crosshairThickness: visualSettings.crosshairThickness,
            crosshairSize: visualSettings.crosshairSize
        };
        localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { console.error("Error saving global settings:", e); }
}

function loadGlobalSettings() {
    try {
        const txt = localStorage.getItem(GLOBAL_SETTINGS_KEY);
        if (txt) {
            const settings = JSON.parse(txt);
            visualSettings.crosshairColor = settings.crosshairColor || visualSettings.crosshairColor;
            visualSettings.crosshairThickness = settings.crosshairThickness || visualSettings.crosshairThickness;
            visualSettings.crosshairSize = settings.crosshairSize || visualSettings.crosshairSize;
        }
    } catch (e) { console.error("Error loading global settings:", e); }
    applyCrosshairSettings();
}


function applyCrosshairSettings() {
    const thickness = `${visualSettings.crosshairThickness}px`;
    const color = visualSettings.crosshairColor;
    const size = `${visualSettings.crosshairSize}px`;

    let styleSheet = document.getElementById('dynamic-styles');
    if (!styleSheet) {
        styleSheet = document.createElement('style');
        styleSheet.id = 'dynamic-styles';
        document.head.appendChild(styleSheet);
    }
    styleSheet.innerHTML = `
        #crosshair:before { height: ${thickness} !important; background: ${color} !important; width: ${size} !important; }
        #crosshair:after { width: ${thickness} !important; background: ${color} !important; height: ${size} !important; }
    `;
}


// ---------- Scene Setup ----------
function setupCommon3D(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.2, 2000);
  camera.position.set(player.pos.x, player.pos.y+0.2, player.pos.z + 8);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Initialize lighting with default intensities
  hemiLight = new THREE.HemisphereLight(0xffffff, 0xdddddd, 0.1);
  scene.add(hemiLight);
  dirLight = new THREE.DirectionalLight(0xffffff, 0.1);
  dirLight.position.set(18,30,14);
  scene.add(dirLight);

  // Initialize background color
  scene.background = new THREE.Color(levelEnvironment.defaultSkyColor);

  const starGeometry = new THREE.BufferGeometry();
  const starVertices = [];
  for (let i = 0; i < 3000; i++) {
      const x = (Math.random() - 0.5) * 2000;
      const y = Math.random() * 500 + 100;
      const z = (Math.random() - 0.5) * 2000;
      starVertices.push(x, y, z);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 1.5, transparent: true, opacity: 0 });
  stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  setupGround();
  refreshColumns();
  refreshLighthouses();
  setupCentralGem();
  createPlayerWeapon();
  applyCrosshairSettings();

  orbitControls = new OrbitControls(camera, renderer.domElement);
  try{ orbitControls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }; orbitControls.enableDamping = true; orbitControls.dampingFactor = 0.08; }catch(e){};
  orbitControls.enabled=false;

    // ... (Event listeners initialization) ...

    document.addEventListener('pointerlockchange', ()=>{
        if (gameMode==='playing') {
            if (cameraSettings.viewMode === ViewModes.TOPDOWN) {
                lockHint.style.display = 'none';
            } else {
                lockHint.style.display = isPointerLocked()? 'none':'block';
            }
            look.deltaX = 0;
            look.deltaY = 0;
        }
    });

    document.addEventListener('mousemove', (e)=>{
        if (gameMode==='playing' && isPointerLocked()){
        look.deltaX += (e.movementX||0);
        look.deltaY += (e.movementY||0);
        }
    });

    renderer.domElement.addEventListener('contextmenu',(e)=>e.preventDefault());
    renderer.domElement.addEventListener('mousedown',(e)=>{
        if (gameMode==='playing' && cameraSettings.viewMode !== ViewModes.TOPDOWN && e.button===2 && !isPointerLocked()){
        altDrag.active=true; altDrag.lastX=e.clientX; altDrag.lastY=e.clientY; initYawPitchFromCamera(); lockHint.style.display='none';
        look.deltaX = 0;
        look.deltaY = 0;
        }
        if (gameMode === 'editing' && e.button === 0 && e.shiftKey) {
            if (orbitControls && orbitControls.enabled) {
                orbitControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            }
        }
    });

    renderer.domElement.addEventListener('mousemove',(e)=>{
        // Top-down aim tracking (free mouse)
        if (gameMode === 'playing' && cameraSettings.viewMode === ViewModes.TOPDOWN) {
            const rect = renderer.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            topDownAim.ndc.set(x, y);
            topDownAim.clientX = e.clientX;
            topDownAim.clientY = e.clientY;
            topDownAim.hasPointer = true;
            setCrosshairToClientXY(e.clientX, e.clientY);
        }

        if (gameMode==='playing' && altDrag.active && !isPointerLocked()){
            const dx=e.clientX-altDrag.lastX, dy=e.clientY-altDrag.lastY;
            altDrag.lastX=e.clientX; altDrag.lastY=e.clientY;
            look.deltaX += dx;
            look.deltaY += dy;
        }
    });
    renderer.domElement.addEventListener('mouseleave', ()=>{
        if (gameMode === 'playing' && cameraSettings.viewMode === ViewModes.TOPDOWN) {
            topDownAim.hasPointer = false;
        }
    });

    // FIX 3: Ensure OrbitControls are re-enabled after custom dragging interactions end.
    window.addEventListener('mouseup',(e)=>{
        altDrag.active=false;
        if (gameMode === 'editing' && orbitControls) {
            // Re-enable controls if they were disabled by custom drag handlers (in attachEditorMouse)
            if (!orbitControls.enabled) {
                orbitControls.enabled = true;
            }
            // Reset mouse button mapping after potential Shift+Pan
            orbitControls.mouseButtons.LEFT = null;
        }
    });
    renderer.domElement.addEventListener('click',()=>{ if (gameMode==='playing' && cameraSettings.viewMode !== ViewModes.TOPDOWN && !isPointerLocked()) tryRequestPointerLock(); });

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown',(e)=>{
        if ((gameMode==='playing' || gameMode==='paused') && e.code==='Escape'){ try{e.preventDefault();}catch{}; togglePause(); }
    }, true);
}
function onResize(){ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

// ---------- Arena Decorations ----------
function clearColumns(){ for (const c of columns){ scene.remove(c); } columns.length=0; }

function makeColumn(color, texture, scale){
  const g=new THREE.Group();
  let mat;
  if (texture) {
      mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, metalness: 0.1, roughness: 0.7 });
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2 / scale, 4 / scale);
  } else {
      mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness:0.05, roughness:0.8 });
  }
  const base1=new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 3.0), mat); base1.position.y=0.15; g.add(base1);
  const base2=new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), mat); base2.position.y=0.45; g.add(base2);
  const shaftHeight = 6.0;
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, shaftHeight, 48), mat);
  shaft.position.y = 0.6 + shaftHeight/2;
  g.add(shaft);
  const echinus = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.8, 0.5, 48), mat);
  echinus.position.y = 0.6 + shaftHeight + 0.25;
  g.add(echinus);
  const abacus = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 2.5), mat);
  abacus.position.y = 0.6 + shaftHeight + 0.5 + 0.15;
  g.add(abacus);
  return g;
}

function refreshColumns(){
  clearColumns();
  const spacing=12;
  const exclusionRadius = 8;
  const w = arena.w/2;
  const d = arena.d/2;
  const isExcluded = (x, z) => {
      if (Math.abs(x - w) < exclusionRadius && Math.abs(z - d) < exclusionRadius) return true;
      if (Math.abs(x + w) < exclusionRadius && Math.abs(z - d) < exclusionRadius) return true;
      if (Math.abs(x - w) < exclusionRadius && Math.abs(z + d) < exclusionRadius) return true;
      if (Math.abs(x + w) < exclusionRadius && Math.abs(z + d) < exclusionRadius) return true;
      return false;
  };
  const useTexture = !!arena.columnCustomTexture;
  for (let x=-w; x<=w+1e-3; x+=spacing){
    if (!isExcluded(x, -d)) {
        const c1=makeColumn(levelEnvironment.columnColor, arena.columnCustomTexture, levelEnvironment.columnTextureScale); c1.position.set(x,0,-d); scene.add(c1); columns.push(c1);
    }
    if (!isExcluded(x, d)) {
        const c2=makeColumn(levelEnvironment.columnColor, arena.columnCustomTexture, levelEnvironment.columnTextureScale); c2.position.set(x,0, d); scene.add(c2); columns.push(c2);
    }
  }
  for (let z=-d+spacing; z<=d-spacing+1e-3; z+=spacing){
    if (!isExcluded(-w, z)) {
        const c1=makeColumn(levelEnvironment.columnColor, arena.columnCustomTexture, levelEnvironment.columnTextureScale); c1.position.set(-w,0,z); scene.add(c1); columns.push(c1);
    }
    if (!isExcluded(w, z)) {
        const c2=makeColumn(levelEnvironment.columnColor, arena.columnCustomTexture, levelEnvironment.columnTextureScale); c2.position.set( w,0,z); scene.add(c2); columns.push(c2);
    }
  }
}

function clearLighthouses(){ for (const l of lighthouses){ scene.remove(l); } lighthouses.length=0; }

function createLighthouseModel(towerColor, lightColor, lightIntensity, towerTexture, towerTextureScale) {
    const group = new THREE.Group();
    let stoneMat, darkStoneMat;

    if (towerTexture) {
        towerTexture.wrapS = THREE.RepeatWrapping;
        towerTexture.wrapT = THREE.RepeatWrapping;
        towerTexture.repeat.set(8 / towerTextureScale, 8 / towerTextureScale);
        stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: towerTexture, roughness: 0.9, metalness: 0.1 });
        darkStoneMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, map: towerTexture, roughness: 0.9, metalness: 0.1 });
    } else {
        stoneMat = new THREE.MeshStandardMaterial({color: new THREE.Color(towerColor), roughness: 0.9, metalness: 0.1});
        darkStoneMat = new THREE.MeshStandardMaterial({color: new THREE.Color(towerColor).multiplyScalar(0.75), roughness: 0.9, metalness: 0.1});
    }

    const baseHeight = 4;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, baseHeight, 12), stoneMat);
    base.position.y = baseHeight / 2;
    group.add(base);

    const towerHeight = 20;
    const mainTower = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6, towerHeight, 12), stoneMat);
    mainTower.position.y = baseHeight + towerHeight / 2;
    group.add(mainTower);

    const totalHeight = baseHeight + towerHeight;

    const platform = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 1, 16), darkStoneMat);
    platform.position.y = totalHeight + 0.5;
    group.add(platform);

    const merlonHeight = 1.5;
    const merlonGeo = new THREE.BoxGeometry(1.2, merlonHeight, 0.8);
    const numMerlons = 16;
    const battlementsRadius = 6.0;

    for (let i = 0; i < numMerlons; i++) {
        const angle = (i / numMerlons) * Math.PI * 2;
        const merlon = new THREE.Mesh(merlonGeo, darkStoneMat);
        merlon.position.set( Math.cos(angle) * battlementsRadius, totalHeight + 1 + merlonHeight / 2, Math.sin(angle) * battlementsRadius);
        merlon.lookAt(0, merlon.position.y, 0);
        group.add(merlon);
    }

    const lightGroup = new THREE.Group();
    lightGroup.position.y = totalHeight + 2.5;
    group.add(lightGroup);

    const gemColor = new THREE.Color(lightColor);
    const coreGeo = new THREE.IcosahedronGeometry(1.5, 1);
    const coreMat = new THREE.MeshStandardMaterial({ color: gemColor, emissive: gemColor, metalness: 0.2, roughness: 0.1 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    lightGroup.add(core);

    const shellGeo = new THREE.IcosahedronGeometry(2.5, 1);
    const shellMat = new THREE.MeshPhysicalMaterial({ color: gemColor, transmission: 0.9, thickness: 1.0, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.3 });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    lightGroup.add(shell);

    const light = new THREE.PointLight(lightColor, lightIntensity, 80);
    lightGroup.add(light);

    group.userData.lightGroup = lightGroup;

    return group;
}

function refreshLighthouses() {
    clearLighthouses();
    const w = arena.w / 2, d = arena.d / 2;
    const positions = [[w,d], [-w,d], [w,-d], [-w,-d]];
    for (const p of positions) {
        const house = createLighthouseModel(
            levelEnvironment.lighthouseTowerColor,
            levelEnvironment.lighthouseColor,
            levelEnvironment.lighthouseIntensity,
            arena.lighthouseCustomTexture,
            levelEnvironment.lighthouseTowerTextureScale
        );
        house.position.set(p[0], 0, p[1]);
        scene.add(house);
        lighthouses.push(house);
    }
}

function setupCentralGem() {
    const height = levelEnvironment.centralGemHeight;
    const intensity = levelEnvironment.centralGemIntensity;
    const color = new THREE.Color(levelEnvironment.centralGemColor || '#FFFFFF');

    if (!centralGem) {
        const group = new THREE.Group();
        const coreGeo = new THREE.IcosahedronGeometry(2.5, 1);
        const coreMat = new THREE.MeshStandardMaterial({
            color: color, emissive: color, metalness: 0.2, roughness: 0.1
        });
        const core = new THREE.Mesh(coreGeo, coreMat);

        const shellGeo = new THREE.IcosahedronGeometry(4, 1);
        const shellMat = new THREE.MeshPhysicalMaterial({
            color: color, transmission: 0.9, thickness: 1.0, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.3
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);

        const light = new THREE.PointLight(color, intensity, 250);

        group.add(core);
        group.add(shell);
        scene.add(group);
        scene.add(light);
        centralGem = { group, core, shell, light };
    }

    // Update properties
    centralGem.group.position.set(0, height, 0);
    centralGem.light.position.set(0, height, 0);
    centralGem.light.intensity = intensity * 1;
    centralGem.light.color.set(color);

    centralGem.core.material.color.set(color);
    centralGem.core.material.emissive.set(color);
    centralGem.core.material.emissiveIntensity = intensity * 2;

    centralGem.shell.material.color.set(color);

    const visible = intensity > 0.01;
    centralGem.group.visible = visible;
    centralGem.light.visible = visible;
}


// ---------- Materials & Textures ----------
function createTexture(size, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    return texture;
}

function drawHex(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const px = x + size * Math.cos(angle);
        const py = y + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

function createCheckeredTexture(size, color1, color2) {
    return createTexture(size, (ctx, sz) => {
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, sz, sz);
        ctx.fillStyle = color2;
        const half = sz / 2;
        ctx.fillRect(0, 0, half, half);
        ctx.fillRect(half, half, half, half);
    });
}

function createSciFiTexture(size, color1, color2) {
    return createTexture(size, (ctx, sz) => {
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, sz, sz);
        ctx.strokeStyle = color2;
        ctx.lineWidth = sz * 0.02;
        const hexSize = sz / 4;
        const hexWidth = Math.sqrt(3) * hexSize;
        const hexHeight = 2 * hexSize;

        const rows = Math.ceil(sz / (hexHeight * 0.75)) + 2;
        const cols = Math.ceil(sz / hexWidth) + 2;
         for (let row = -1; row < rows; row++) {
            for (let col = -1; col < cols; col++) {
                let x = col * hexWidth;
                let y = row * hexHeight * 0.75;
                if (row % 2 !== 0) {
                    x += hexWidth / 2;
                }
                drawHex(ctx, x, y, hexSize);
            }
        }
        ctx.stroke();
    });
}

function createTextileTexture(size, color1, color2) {
    return createTexture(size, (ctx, sz) => {
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, sz, sz);
        ctx.strokeStyle = color2;
        ctx.lineWidth = sz * 0.08;
        const step = sz / 8;
        for (let i = 0; i < sz; i += step) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, sz); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(sz, i); ctx.stroke();
        }
    });
}

function createClassicTexture(size, color1, color2) {
    return createTexture(size, (ctx, sz) => {
        ctx.fillStyle = color1; ctx.fillRect(0, 0, sz, sz);
        ctx.strokeStyle = color2; ctx.lineWidth = sz * 0.03;
        const half = sz / 2;
        ctx.strokeRect(0, 0, half, half); ctx.strokeRect(half, half, half, half);
        ctx.strokeRect(0, half, half, half); ctx.strokeRect(half, 0, half, half);
        ctx.fillStyle = color2; const dotSize = sz * 0.05;
        ctx.fillRect(half - dotSize / 2, half - dotSize / 2, dotSize, dotSize);
    });
}

function setupGround() {
    if (groundMesh) {
        scene.remove(groundMesh);
        groundMesh.geometry.dispose();
        if (groundMesh.material.map && groundMesh.material.map !== arena.groundCustomTexture) {
            groundMesh.material.map.dispose();
        }
        groundMesh.material.dispose();
    }
    if (arena.groundStyle === 'custom' && arena.groundCustomTextureURL && !arena.groundCustomTexture) {
        loadCustomTexture(arena.groundCustomTextureURL, (texture) => {
            arena.groundCustomTexture = texture;
            updateGroundTexture(arena.groundStyle, arena.groundColor, arena.groundPatternColor);
        });
    }
    const texture = updateGroundTexture(arena.groundStyle, arena.groundColor, arena.groundPatternColor);
    const groundMat = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.1, roughness: 0.7 });
    groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = 0;
    scene.add(groundMesh);
}

function updateGroundTexture(style, color, patternColor) {
    let texture;
    let tileSize = arena.groundTextureScale || 5;
    if (style === 'custom' && arena.groundCustomTexture) {
        texture = arena.groundCustomTexture;
    } else {
        switch (style) {
            case 'scifi': texture = createSciFiTexture(512, color, patternColor); break;
            case 'textile': texture = createTextileTexture(512, color, patternColor); break;
            case 'classic': texture = createClassicTexture(512, color, patternColor); break;
            case 'checkered': default: texture = createCheckeredTexture(512, color, patternColor); break;
        }
    }
    if (texture) {
        texture.repeat.set(1000/tileSize, 1000/tileSize);
        texture.needsUpdate = true;
    }
    if (groundMesh && groundMesh.material) {
        if (groundMesh.material.map && groundMesh.material.map !== arena.groundCustomTexture && groundMesh.material.map !== texture) {
            groundMesh.material.map.dispose();
        }
        groundMesh.material.map = texture;
        groundMesh.material.needsUpdate = true;
    }
    return texture;
}

const WallStyleDefaults = {
    brick: { base: '#B22222', pattern: '#8B0000' }, glass: { base: '#ADD8E6' },
    castle: { base: '#A9A9A9', pattern: '#696969' }, wood: { base: '#DEB887', pattern: '#8B4513' },
    imperial: { base: '#FF4500', pattern: '#FFD700' }, cute: { base: '#FFC0CB', pattern: '#FF69B4' },
    geometric: { base: '#FFFFFF', pattern: '#000000' }
};

function createBrickTexture(size, color1, color2) {
  return createTexture(size, (ctx, sz)=>{
    ctx.fillStyle = color1; ctx.fillRect(0,0,sz,sz);
    ctx.fillStyle = color2;
    const brickH=sz/8, brickW=sz/4;
    for (let y=0; y<8; y++){
      for (let x=0; x<4; x++){
        const xOffset = (y%2===0)? 0 : brickW/2;
        ctx.fillRect(x*brickW - xOffset, y*brickH, brickW*0.9, brickH*0.85);
        ctx.fillRect(x*brickW - xOffset + brickW, y*brickH, brickW*0.9, brickH*0.85);
      }
    }
  });
}
function createCastleTexture(size, color1, color2) {
  return createTexture(size, (ctx,sz)=>{
    ctx.fillStyle = color1; ctx.fillRect(0,0,sz,sz);
    ctx.strokeStyle=color2; ctx.lineWidth = sz*0.02;
    const stoneW=sz/3, stoneH=sz/4;
    for(let y=0;y<4;y++){
      for(let x=0;x<3;x++){
        const xOffset = (y%2===0)?0:stoneW/2;
        ctx.strokeRect(x*stoneW-xOffset, y*stoneH, stoneW, stoneH);
        ctx.strokeRect(x*stoneW-xOffset+stoneW, y*stoneH, stoneW, stoneH);
      }
    }
  });
}
function createWoodTexture(size, color1, color2) {
  return createTexture(size, (ctx,sz)=>{
    ctx.fillStyle=color1; ctx.fillRect(0,0,sz,sz);
    ctx.strokeStyle=color2; ctx.lineWidth = sz*0.015;
    for (let i=0; i<20; i++){
      ctx.beginPath();
      ctx.moveTo(Math.random()*sz,0);
      ctx.bezierCurveTo(Math.random()*sz, sz/3, Math.random()*sz, sz*2/3, Math.random()*sz, sz);
      ctx.stroke();
    }
  });
}
function createImperialTexture(size, color1, color2) {
  return createTexture(size, (ctx,sz)=>{
    ctx.fillStyle=color1; ctx.fillRect(0,0,sz,sz);
    ctx.fillStyle=color2;
    const s = sz/8;
    for (let y=0; y<8; y++){
      for (let x=0; x<8; x++){
        ctx.beginPath(); ctx.arc(x*s+s/2, y*s+s/2, s*0.2, 0, Math.PI*2); ctx.fill();
      }
    }
  });
}
function createCuteTexture(size, color1, color2) {
  return createTexture(size, (ctx,sz)=>{
    ctx.fillStyle=color1; ctx.fillRect(0,0,sz,sz);
    ctx.fillStyle=color2;
    const s = sz/10;
    for (let y=0; y<10; y++){
      for (let x=0; x<10; x++){
        const xOffset = (y%2===0)?0:s/2;
        ctx.beginPath(); ctx.arc(x*s+xOffset, y*s+s/2, s*0.35, 0, Math.PI*2); ctx.fill();
      }
    }
  });
}
function createGeometricTexture(size, color1, color2) {
  return createTexture(size, (ctx,sz)=>{
    ctx.fillStyle=color1; ctx.fillRect(0,0,sz,sz);
    ctx.strokeStyle=color2; ctx.lineWidth=sz*0.03;
    const step = sz/6;
    for(let i=-sz; i<sz*2; i+=step){
      ctx.beginPath(); ctx.moveTo(i, -sz); ctx.lineTo(i+sz*2, sz); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, sz*2); ctx.lineTo(i+sz*2, -sz); ctx.stroke();
    }
  });
}

// Updated: Wall material generation now takes length into account for texture repeat
function wallMaterial(wall, length){
  const type = wall.type || 'brick';
  const scale = wall.textureScale || 1;
  const colors = wall.colors;
  const baseColor = colors?.base || null;
  const patternColor = colors?.pattern || null;
  if (type==='glass'){
    const color = baseColor ? new THREE.Color(baseColor).getHex() : WallStyleDefaults.glass.base;
    return new THREE.MeshPhysicalMaterial({ color: color, metalness:0.0, roughness:0.05, transmission:0.9, transparent:true, opacity:0.95, thickness:0.6, reflectivity:0.12, clearcoat:1.0, clearcoatRoughness:0.05, side:THREE.DoubleSide });
  }
  let texture; let roughness = 0.8; let metalness = 0.05;
  if (type === 'custom' && wall.customTexture) {
      texture = wall.customTexture; roughness = 0.7;
  } else {
    const c1 = baseColor || WallStyleDefaults[type]?.base || '#FFFFFF';
    const c2 = patternColor || WallStyleDefaults[type]?.pattern || '#999999';
    switch (type) {
        case 'castle': texture = createCastleTexture(512, c1, c2); break;
        case 'wood': texture = createWoodTexture(512, c1, c2); roughness = 0.9; break;
        case 'imperial': texture = createImperialTexture(512, c1, c2); metalness = 0.2; break;
        case 'cute': texture = createCuteTexture(512, c1, c2); break;
        case 'geometric': texture = createGeometricTexture(512, c1, c2); break;
        case 'brick': default: texture = createBrickTexture(512, c1, c2); break;
    }
  }
  if (texture) {
      // Use the calculated length for the X repeat
      texture.repeat.set(length / scale, wall.h / scale);
      texture.needsUpdate = true;
  }
  return new THREE.MeshStandardMaterial({ color:0xffffff, map:texture, metalness: metalness, roughness: roughness });
}

// ---------- Objects ----------

// New: Updates the wall mesh geometry, position, and rotation based on endpoints
function updateWallMesh(wall) {
    const p1 = new THREE.Vector3(wall.p1.x, 0, wall.p1.z);
    const p2 = new THREE.Vector3(wall.p2.x, 0, wall.p2.z);

    const length = p1.distanceTo(p2);
    if (length < 0.1) return; // Prevent near-zero length walls

    // Calculate center position
    const center = p1.clone().add(p2).multiplyScalar(0.5);
    center.y = wall.h / 2 - 0.01;

    // Calculate rotation
    const direction = p2.clone().sub(p1);
    // Angle relative to the positive X axis (BoxGeometry's default length axis)
    const rotationY = Math.atan2(-direction.z, direction.x);

    wall.mesh.position.copy(center);
    wall.mesh.rotation.set(0, rotationY, 0);
    wall.mesh.scale.set(length, wall.h, wall.t);

    // Update material/texture tiling if needed (crucial for stretching)
    if (wall.mesh.material.map) {
        const scale = wall.textureScale || 1;
        wall.mesh.material.map.repeat.set(length / scale, wall.h / scale);
        wall.mesh.material.needsUpdate = true;
    }

    // Force update the bounding box for collision detection
    wall.mesh.geometry.computeBoundingBox();
    wall.mesh.updateMatrixWorld(true);
}

// Updated: Add wall using endpoints (p1x, p1z, p2x, p2z) and thickness (t)
function addWall(p1x, p1z, p2x, p2z, h=4, t=1, type='brick', id=null, colors=null, customTextureURL=null, textureScale=1){
  if (!colors) {
      const defaults = WallStyleDefaults[type] || WallStyleDefaults.brick;
      colors = { base: defaults.base, pattern: defaults.pattern };
  }
  const objectId = id !== null ? id : ++objectCounter;
  if (id !== null && id > objectCounter) objectCounter = id;

  // New wall definition structure
  const rec={
      mesh: null,
      p1: {x: p1x, z: p1z},
      p2: {x: p2x, z: p2z},
      h, t, type, id: objectId, colors: colors,
      customTextureURL: customTextureURL, customTexture: null, textureScale: textureScale
  };

  // Calculate initial length for material generation
  const initialLength = new THREE.Vector3(p1x, 0, p1z).distanceTo(new THREE.Vector3(p2x, 0, p2z));

  if (type === 'custom' && customTextureURL && !rec.customTexture) {
      loadCustomTexture(customTextureURL, (texture) => {
          rec.customTexture = texture;
          if (rec.mesh) {
              rec.mesh.material.dispose();
              const currentLength = new THREE.Vector3(rec.p1.x, 0, rec.p1.z).distanceTo(new THREE.Vector3(rec.p2.x, 0, rec.p2.z));
              rec.mesh.material = wallMaterial(rec, currentLength);
          }
      });
  }

  // Create the mesh placeholder (dimensions/position set by updateWallMesh)
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), wallMaterial(rec, initialLength));
  mesh.userData.__wall=true;
  scene.add(mesh);
  rec.mesh = mesh;

  updateWallMesh(rec); // Position and scale the mesh correctly

  walls.push(rec);
  updateObjectListUI();
  return rec;
}

const TurretStyles = {
    scifi_blue: { base: '#3b82f6', emissive: '#60a5fa' }, military_green: { base: '#4d7c0f', emissive: '#84cc16' },
    stealth_black: { base: '#1e293b', emissive: '#475569' }, alert_red: { base: '#dc2626', emissive: '#f87171' },
    construction_yellow: { base: '#f59e0b', emissive: '#fcd34d' }
};

function createTurretModel(style='scifi_blue'){
    const group = new THREE.Group();
    const colors = TurretStyles[style] || TurretStyles.scifi_blue;

    const mat = new THREE.MeshStandardMaterial({color: colors.base, metalness: 0.8, roughness: 0.4});
    const darkMat = new THREE.MeshStandardMaterial({color: new THREE.Color(colors.base).multiplyScalar(0.4), metalness: 0.7, roughness: 0.6});
    const emat = new THREE.MeshStandardMaterial({color: colors.emissive, emissive: colors.emissive, emissiveIntensity: 3.5});

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2.5), mat);
    chassis.position.y = 0.45;
    group.add(chassis);

    const trackGeo = new THREE.BoxGeometry(0.5, 0.6, 2.8);
    const trackL = new THREE.Mesh(trackGeo, darkMat);
    trackL.position.set(-1, 0.3, 0);
    group.add(trackL);

    const trackR = new THREE.Mesh(trackGeo, darkMat);
    trackR.position.set(1, 0.3, 0);
    group.add(trackR);

    const turretHead = new THREE.Group();
    turretHead.name = "turretHead";
    turretHead.position.y = 0.8;
    group.add(turretHead);

    const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.3, 24), mat);
    turretHead.add(turretBase);

    const turretHousing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.5), mat);
    turretHousing.position.y = 0.3;
    turretHead.add(turretHousing);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.0, 12), darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.3, 1.5);
    turretHead.add(barrel);

    const muzzleMarker = new THREE.Object3D();
    muzzleMarker.name = "muzzle";
    muzzleMarker.position.z = 1.0;
    barrel.add(muzzleMarker);

    const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), emat);
    sensor.name = "sensor";
    sensor.position.set(0.4, 0.45, 0.8);
    turretHead.add(sensor);

    group.scale.setScalar(0.8);

    group.userData.materials = { mat, darkMat, emat };
    return group;
}

// Futuristic Hover Drone Design for King Kong Turret
function createKingKongTurretModel(color = '#4A4A6A') {
    const group = new THREE.Group();
    const mainColor = new THREE.Color(color);
    // Tech glow (Cyan/Blue)
    const techEmissiveColor = new THREE.Color(0x00FFFF).lerp(mainColor, 0.2);

    // Use Phong material for a shinier, metallic look
    const mat = new THREE.MeshPhongMaterial({ color: mainColor, shininess: 80, specular: 0xaaaaaa });
    const emat = new THREE.MeshStandardMaterial({ color: techEmissiveColor, emissive: techEmissiveColor, emissiveIntensity: 5.0 });

    // Core Body (Sleek Ellipsoid)
    const coreGeo = new THREE.SphereGeometry(1.5, 32, 16);
    coreGeo.scale(1, 0.6, 1.2);
    const core = new THREE.Mesh(coreGeo, mat);
    core.position.y = 2.5; // Hover height
    group.add(core);

    // Engine Vents (Glowing)
    const ventGeo = new THREE.CylinderGeometry(0.5, 0.7, 0.3, 16);
    const vent1 = new THREE.Mesh(ventGeo, emat);
    vent1.position.set(-1.2, 2.2, 0);
    group.add(vent1);
    const vent2 = new THREE.Mesh(ventGeo, emat);
    vent2.position.set(1.2, 2.2, 0);
    group.add(vent2);

    // Turret Head/Weapon System (Mounted on top)
    const turretHead = new THREE.Group();
    turretHead.name = "turretHead";
    turretHead.position.y = 3.5;
    group.add(turretHead);

    const weaponBaseGeo = new THREE.BoxGeometry(0.8, 0.4, 1.2);
    const weaponBase = new THREE.Mesh(weaponBaseGeo, mat);
    turretHead.add(weaponBase);

    // Main Cannon (Plasma projector)
    const cannonGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.5, 16);
    const cannon = new THREE.Mesh(cannonGeo, mat);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(0, 0, 1.3);
    turretHead.add(cannon);

    const muzzleMarker = new THREE.Object3D();
    muzzleMarker.name = "muzzle";
    muzzleMarker.position.z = 0.75;
    cannon.add(muzzleMarker);

    // Sensor Eye (Front of the core)
    const sensorGeo = new THREE.SphereGeometry(0.4, 16, 16);
    const sensor = new THREE.Mesh(sensorGeo, emat);
    sensor.name = "sensor";
    // Positioned relative to the group for visibility checks
    sensor.position.set(0, 2.6, 1.6);
    group.add(sensor);

    group.scale.setScalar(0.9);
    group.userData.materials = { mat, emat }; // darkMat not used in this design
    return group;
}

function updateTurretStyle(turret, style) {
    turret.style = style;
    const colors = TurretStyles[style] || TurretStyles.scifi_blue;
    const {mat, darkMat, emat} = turret.group.userData.materials;
    mat.color.set(colors.base);
    darkMat.color.set(new THREE.Color(colors.base).multiplyScalar(0.5));
    emat.color.set(colors.emissive);
    emat.emissive.set(colors.emissive);
}

// Apply colors to the new King Kong model
function updateKingKongTurretColor(turret, color) {
    turret.color = color;
    const mainColor = new THREE.Color(color);
    const techEmissiveColor = new THREE.Color(0x00FFFF).lerp(mainColor, 0.2);

    const {mat, emat} = turret.group.userData.materials;
    if (mat) mat.color.set(mainColor);
    if (emat) {
        emat.color.set(techEmissiveColor);
        emat.emissive.set(techEmissiveColor);
    }
}

function addTurret(params){
    const {x, z, kind, id} = params;
    const objectId = id !== null ? id : ++objectCounter;
    if (id !== null && id > objectCounter) objectCounter = id;

    let t;
    if (kind === 'kingkong_turret') {
        const group = createKingKongTurretModel(params.color);
        group.position.set(x, 0, z); // Y=0, model defines its height
        scene.add(group);
        t = {
            group, kind, id: objectId,
            hp: params.hp, maxHp: params.hp, color: params.color,
            aoeRadius: params.aoeRadius, aoeDamage: params.aoeDamage, aoeInterval: params.aoeInterval,
            lastAoeAttack: 0, lastShot: 0,
            turretHead: group.getObjectByName("turretHead"),
            muzzle: group.getObjectByName("muzzle"),
            sensor: group.getObjectByName("sensor"),
            rate: 2.0 * GLOBAL_TURRET_RATE_MULT, bps: 70,
            // Movement properties
            gear: params.gear || 2,
            path: (params.path || []).map(p => ({ x: p.x, y: p.y, z: p.z })),
            pathLoop: params.pathLoop !== undefined ? params.pathLoop : true,
            currentPathIdx: 0,
            pathForward: true,
            pausedByAim: false,
        };
    } else { // Standard turret
        const group = createTurretModel(params.style);
        group.position.set(x, 0.1, z);
        scene.add(group);
        t = {
            group, kind: 'turret', id: objectId,
            subType: params.subType, rate: params.rate * GLOBAL_TURRET_RATE_MULT, bps: params.bps, lastShot: 0,
            startPos: new THREE.Vector3(x, 0, z), w: params.w, d: params.d, gear: String(params.gear),
            mode: params.mode, path: (params.path || []).map(p => ({ x: p.x, y: p.y, z: p.z })),
            pathLoop: params.pathLoop, currentPathIdx: 0, pathForward: true, style: params.style,
            pausedByAim: false,
            turretHead: group.getObjectByName("turretHead"),
            muzzle: group.getObjectByName("muzzle"),
            sensor: group.getObjectByName("sensor")
        };
    }
    turrets.push(t);
    updateObjectListUI();
    return t;
}

function createWaypointTexture(number, glowColor = '#f59e0b', textColor = '#FFFFFF') {
    return createTexture(256, (ctx, sz) => {
        ctx.fillStyle = textColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 20;
        ctx.font = `bold ${sz * 0.6}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(number), sz / 2, sz / 2 + sz*0.05);
    });
}

function createWaypointModel(order, color = '#f59e0b', size = 1.0, lightIntensity = 2.0, textColor = '#FFFFFF') {
    const group = new THREE.Group();
    const gemColor = new THREE.Color(color);

    const coreGeo = new THREE.IcosahedronGeometry(0.8, 1);
    const coreMat = new THREE.MeshStandardMaterial({
        color: gemColor, emissive: gemColor, emissiveIntensity: 2.5,
        metalness: 0.1, roughness: 0.2, name: 'wp_core'
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    const shellGeo = new THREE.IcosahedronGeometry(1.5, 1);
    const shellMat = new THREE.MeshPhysicalMaterial({
        color: gemColor, transmission: 0.9, thickness: 1.0,
        roughness: 0.1, transparent: true, opacity: 0.3, name: 'wp_shell'
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    group.add(shell);

    const spriteMap = createWaypointTexture(order, color, textColor);
    const spriteMat = new THREE.SpriteMaterial({
        map: spriteMap, color: 0xffffff, transparent: true,
        blending: THREE.AdditiveBlending, depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3, 3, 1);
    group.add(sprite);

    const light = new THREE.PointLight(color, lightIntensity, 10 * size);
    group.add(light);

    group.scale.setScalar(size);
    group.userData = { sprite, light, shell, core };
    return group;
}

function addWaypoint(x, z, order = 1, id = null, color = '#f59e0b', size = 1.0, lightIntensity = 2.0, textColor = '#FFFFFF') {
    const objectId = id !== null ? id : ++objectCounter;
    if (id !== null && id > objectCounter) objectCounter = id;
    const group = createWaypointModel(order, color, size, lightIntensity, textColor);
    group.position.set(x, 1.5 * size, z);

    const wp = { group, order, id: objectId, color, size, lightIntensity, textColor };
    scene.add(group);
    waypoints.push(wp);
    waypoints.sort((a, b) => a.order - b.order);
    updateObjectListUI();
    return wp;
}

function playFireworksEffect(position, color) {
    const particleCount = 80;
    const particleGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const particleMat = new THREE.MeshBasicMaterial({ color: color, blending: THREE.AdditiveBlending, transparent: true });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeo, particleMat.clone());
        particle.position.copy(position);

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const speed = Math.random() * 8 + 6;

        particle.userData.velocity = new THREE.Vector3(
            speed * Math.sin(phi) * Math.cos(theta),
            speed * Math.cos(phi),
            speed * Math.sin(phi) * Math.sin(theta)
        );

        activeEffects.push({ type: 'firework', mesh: particle, startTime: clock.getElapsedTime(), duration: 1.0 + Math.random() * 0.5 });
        scene.add(particle);
    }
}

// Creates a visual explosion effect (Shockwave + Particles)
function createExplosionEffect(position, radius, color) {
    // 1. Expanding Sphere (Shockwave)
    const sphereGeo = new THREE.SphereGeometry(radius, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.copy(position);
    sphere.scale.set(0.1, 0.1, 0.1);

    activeEffects.push({
        type: 'explosion_shockwave',
        mesh: sphere,
        startTime: clock.getElapsedTime(),
        duration: 0.6,
        targetScale: 1.0
    });
    scene.add(sphere);

    // 2. Particles (Debris/Fire) - uses 'firework' type for physics simulation
    const particleCount = 100;
    const particleGeo = new THREE.SphereGeometry(0.15, 6, 6);
    const particleMat = new THREE.MeshBasicMaterial({ color: color, blending: THREE.AdditiveBlending, transparent: true });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeo, particleMat.clone());
        // Start particles randomly near the ground within the radius
        const r = Math.random() * radius * 0.5;
        const theta = Math.random() * Math.PI * 2;
        particle.position.set(
            position.x + r * Math.cos(theta),
            position.y + 0.1,
            position.z + r * Math.sin(theta)
        );

        const speed = Math.random() * 15 + 10;
        // Velocity directed upwards and outwards
        particle.userData.velocity = new THREE.Vector3(
            speed * Math.cos(theta) * 0.5,
            speed,
            speed * Math.sin(theta) * 0.5
        );

        activeEffects.push({ type: 'firework', mesh: particle, startTime: clock.getElapsedTime(), duration: 1.2 + Math.random() * 0.5 });
        scene.add(particle);
    }
}


function addPlayerSpawn(x,z){ player.pos.set(x,1.6,z); if (playerMarker) playerMarker.position.set(x,EDITOR_Y_OFFSET,z); }

function ensurePlayerMarker(){
    if (playerMarker) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color:0x34d399});
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), mat); head.position.y=1.6; g.add(head);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 4, 16), mat); body.position.y=0.8; g.add(body);
    g.position.set(player.pos.x, EDITOR_Y_OFFSET, player.pos.z);
    scene.add(g);
    playerMarker = g;
}
function hidePlayerMarker(){ if (playerMarker) playerMarker.visible=false; }

function ensurePlayerAvatar(){
    if (playerAvatar) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color:0x34d399});
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), mat); head.position.y=1.6; g.add(head);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 4, 16), mat); body.position.y=0.8; g.add(body);
    g.position.set(player.pos.x, 0, player.pos.z);
    g.visible = false;
    scene.add(g);
    playerAvatar = g;
}
function setPlayerAvatarVisible(v){
    ensurePlayerAvatar();
    playerAvatar.visible = !!v;
}
function updatePlayerAvatar(){
    if (!playerAvatar || !playerAvatar.visible) return;
    playerAvatar.position.set(player.pos.x, 0, player.pos.z);
}

function resetCrosshairPosition(){
    // Restore default center positioning used by first-person modes
    crosshair.style.left = '50%';
    crosshair.style.top = '50%';
}
function setCrosshairToClientXY(x, y){
    crosshair.style.left = `${x}px`;
    crosshair.style.top = `${y}px`;
}

function createPlayerWeapon(){
    if (player.weapon) return;
    const group=new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color:0x475569, metalness:0.6, roughness:0.4});
    const body=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.15,0.7), mat); group.add(body);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.4,8), mat); barrel.position.z=0.55; group.add(barrel);
    group.position.set(0.25, -0.2, -0.6);
    group.rotation.y = -0.05;
    camera.add(group);
    player.weapon=group;
    player.weapon.visible=false;
}

function intersectsWalls(from,to){ const ray=new THREE.Raycaster(); const dir=new THREE.Vector3().subVectors(to,from); const dist=dir.length(); if (dist<=1e-6) return false; ray.set(from, dir.normalize()); const hits=ray.intersectObjects(walls.map(w=>w.mesh),false); return hits.length > 0 && hits[0].distance<dist-0.01; }

function fireFromTurret(t){
    const from = new THREE.Vector3();
    t.muzzle.getWorldPosition(from);

    const playerPos = player.pos.clone();
    const playerVel = player.vel.clone();
    const s = t.bps;

    // Predictive aiming calculation
    const r = new THREE.Vector2(playerPos.x - from.x, playerPos.z - from.z);
    const v = new THREE.Vector2(playerVel.x, playerVel.z);

    const a = v.dot(v) - s*s;
    const b = 2 * r.dot(v);
    const c = r.dot(r);

    let tHit = null;
    if (Math.abs(a) < 1e-6) {
        if (Math.abs(b) > 1e-6) tHit = Math.max(0, -c / b);
    } else {
        const disc = b*b - 4*a*c;
        if (disc >= 0) {
            const sqrtDisc = Math.sqrt(disc);
            const t1 = (-b - sqrtDisc) / (2*a);
            const t2 = (-b + sqrtDisc) / (2*a);
            const candidates = [t1, t2].filter(tt => tt > 0);
            if (candidates.length > 0) tHit = Math.min(...candidates);
        }
    }
    if (tHit === null) tHit = 0;
    tHit = Math.min(tHit, 2.0); // Clamp prediction time

    const predicted = new THREE.Vector3(
        playerPos.x + playerVel.x * tHit,
        playerPos.y,
        playerPos.z + playerVel.z * tHit
    );

    const dir = new THREE.Vector3().subVectors(predicted, from);
    if (dir.lengthSq() < 1e-6) dir.set(0,0,-1);
    dir.normalize();

    const bulletColor = t.kind === 'kingkong_turret' ? 0x00FFFF : 0xff6600; // King Kong shoots cyan bullets
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3,10,8), new THREE.MeshBasicMaterial({color:bulletColor}));
    mesh.position.copy(from);
    scene.add(mesh);
    bullets.push({mesh:mesh, vel:dir.multiplyScalar(t.bps), from:'turret'});
}

function playerShoot(){
    if (currentGameMode === GameModes.WAYPOINT) return;

    // Top-down mode: shoot from player towards mouse point on the ground
    if (cameraSettings.viewMode === ViewModes.TOPDOWN) {
        const from = new THREE.Vector3(player.pos.x, player.pos.y - 0.2, player.pos.z);
        const hit = getTopDownAimPoint(new THREE.Vector3());
        const dir = new THREE.Vector3();
        if (hit) dir.subVectors(hit, from);
        else dir.set(0,0,-1).applyQuaternion(camera.quaternion);

        if (dir.lengthSq() < 1e-8) dir.set(0,0,-1);
        dir.normalize();

        const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({color:0x00aaff}));
        mesh.position.copy(from);
        scene.add(mesh);
        bullets.push({mesh:mesh, vel:dir.multiplyScalar(PLAYER_BULLET_SPEED), from:'player'});
        return;
    }

    const from = new THREE.Vector3(); player.weapon.children[1].getWorldPosition(from);
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({color:0x00aaff}));
    mesh.position.copy(from);
    scene.add(mesh);
    bullets.push({mesh:mesh, vel:dir.multiplyScalar(PLAYER_BULLET_SPEED), from:'player'});
}

// ---------- Game Loop ----------
let timeLeft = 60;
function flashDamage(){ damageFx.style.opacity='1'; setTimeout(()=>damageFx.style.opacity='0',110); }
function updateHUD(){
    hpEl.textContent=Math.max(0,Math.round(player.hp));
    tmEl.textContent=Math.max(0,Math.ceil(timeLeft));
    if (currentGameMode === GameModes.ELIM) {
         goalEl.textContent = T('goal_elimination', turrets.length);
    } else if (currentGameMode === GameModes.SURV) {
         goalEl.textContent = T('goal_survival');
    } else if (currentGameMode === GameModes.WAYPOINT) {
         goalEl.textContent = T('goal_waypoint', Math.min(nextWaypointIndex, totalWaypointsInLevel), totalWaypointsInLevel);
    }
}

// Updated: Environment update using customizable sky colors
function updateEnvironment(dt) {
    const baseIntensity = levelEnvironment.sunIntensityMultiplier;
    const defaultSky = new THREE.Color(levelEnvironment.defaultSkyColor);
    const daySky = new THREE.Color(levelEnvironment.daySkyColor);
    const nightSky = new THREE.Color(levelEnvironment.nightSkyColor);

    // Helper to calculate ground color (slightly darker version of sky)
    const getGroundColor = (skyColor) => skyColor.clone().multiplyScalar(0.8);

    if (!levelEnvironment.dayNightCycleEnabled || levelEnvironment.cycleDuration <= 0) {
        // Fixed time of day (Daylight simulation based on defaultSkyColor)
        hemiLight.intensity = 1.0 * baseIntensity;
        dirLight.intensity = 0.9 * baseIntensity;
        hemiLight.color.copy(defaultSky);
        hemiLight.groundColor.copy(getGroundColor(defaultSky));
        dirLight.color.set(0xffffff); // Sun color is usually white/slightly yellow
        scene.background.copy(defaultSky);
        if (stars) stars.material.opacity = 0;
        return;
    }

    // Day/Night Cycle Active
    levelEnvironment.currentTime += dt / levelEnvironment.cycleDuration;
    levelEnvironment.currentTime %= 1;
    const angle = (levelEnvironment.currentTime + 0.25) * Math.PI * 2;
    let sunIntensity = Math.max(0, Math.sin(angle));
    sunIntensity = Math.pow(sunIntensity, 0.5); // 0 (night) to 1 (day)

    dirLight.position.set(0, 500 * Math.sin(angle), 500 * Math.cos(angle));

    // Adjust intensities based on time of day and user multiplier
    // Hemi light provides ambient illumination, less intense at night
    const hemiIntensity = (0.2 + sunIntensity * 0.8) * baseIntensity;
    // Direct light is the sun, off at night
    const directIntensity = sunIntensity * baseIntensity;

    dirLight.intensity = directIntensity;
    hemiLight.intensity = hemiIntensity;

    // Interpolate colors
    const skyColor = nightSky.clone().lerp(daySky, sunIntensity);
    const groundColor = getGroundColor(nightSky).lerp(getGroundColor(daySky), sunIntensity);

    hemiLight.color.copy(skyColor);
    hemiLight.groundColor.copy(groundColor);
    scene.background.copy(skyColor);

    // Star visibility (inverse of sun intensity)
    if (stars) stars.material.opacity = Math.max(0, (1 - sunIntensity * 1.5)) * 0.8;
}


function checkPlayerCollision(newPos) {
    const playerBox = new THREE.Box3().setFromCenterAndSize( newPos, new THREE.Vector3(PLAYER_RADIUS * 2, 1.8, PLAYER_RADIUS * 2) );
    for (const wall of walls) {
        // Ensure bounding box is calculated and updated with world matrix (crucial for rotated walls)
        if (!wall.mesh.geometry.boundingBox) wall.mesh.geometry.computeBoundingBox();
        const wallBox = wall.mesh.geometry.boundingBox.clone().applyMatrix4(wall.mesh.matrixWorld);
        if (playerBox.intersectsBox(wallBox)) return true;
    }
    return false;
}

// AOE targets player location, includes warning indicator and delayed explosion
function triggerKingKongAoe(turret) {
    turret.lastAoeAttack = clock.getElapsedTime();

    // Target the player's current location on the ground
    const targetPosition = player.pos.clone();
    targetPosition.y = 0.1; // Slightly above ground

    const radius = turret.aoeRadius;
    const damage = turret.aoeDamage;
    const color = 0xff4400; // Orange/Red for explosion

    // 1. AOE Indicator (Warning ring before explosion)
    const indicatorDuration = 1.5; // Time player has to react
    const ringGeo = new THREE.RingGeometry(radius - 0.5, radius, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(targetPosition);
    ringMesh.rotation.x = -Math.PI / 2;

    // Add indicator effect
    activeEffects.push({
        type: 'aoe_indicator',
        mesh: ringMesh,
        startTime: clock.getElapsedTime(),
        duration: indicatorDuration
    });
    scene.add(ringMesh);

    // 2. Delayed Explosion and Damage
    setTimeout(() => {
        // Check if game is still running when the explosion happens
        if (gameMode !== 'playing') return;

        // Create visual explosion effect
        createExplosionEffect(targetPosition, radius, color);

        // Apply damage if player is still within range
        const distance = player.pos.distanceTo(targetPosition);
        if (distance < radius) {
            player.hp -= damage;
            flashDamage();
            updateHUD();
            if (player.hp <= 0) endGame(false);
        }
    }, indicatorDuration * 1000);
}


function update(dt){
  if (gameMode === 'playing' && cameraSettings.viewMode !== ViewModes.TOPDOWN && (look.deltaX !== 0 || look.deltaY !== 0)) {
      const clampedDeltaX = clamp(look.deltaX, -100, 100);
      const clampedDeltaY = clamp(look.deltaY, -100, 100);
      look.yaw -= clampedDeltaX * look.sens;
      look.pitch -= clampedDeltaY * look.sens;
      applyYawPitch();
      look.deltaX = 0; look.deltaY = 0;
  }

  const time = clock.getElapsedTime();

  // Update active visual effects
  for (let i = activeEffects.length - 1; i >= 0; i--) {
      const effect = activeEffects[i];
      const elapsed = time - effect.startTime;
      const progress = Math.min(1.0, elapsed / effect.duration);

      if (effect.type === 'firework') {
          // Particle physics (gravity and movement)
          effect.mesh.position.add(effect.mesh.userData.velocity.clone().multiplyScalar(dt));
          effect.mesh.userData.velocity.y -= 20 * dt; // Gravity
          effect.mesh.material.opacity = 1.0 - progress;
      } else if (effect.type === 'ascension') {
          effect.mesh.position.y += 10 * dt;
          effect.mesh.traverse((child) => {
              if (child.material) {
                  if (child.material.userData.initialOpacity === undefined) {
                      child.material.userData.initialOpacity = child.material.opacity;
                  }
                  child.material.transparent = true;
                  child.material.opacity = child.material.userData.initialOpacity * (1.0 - progress);
              }
          });
      } else if (effect.type === 'aoe_ring') {
          // Legacy type, kept for compatibility if needed elsewhere
          effect.mesh.material.opacity = 1.0 - progress;
      } else if (effect.type === 'aoe_indicator') {
          // Pulsing effect during warning phase
          effect.mesh.material.opacity = 0.6 + Math.sin(elapsed * Math.PI * 4) * 0.2;
      } else if (effect.type === 'explosion_shockwave') {
          // Expanding sphere
          const scale = progress * effect.targetScale;
          effect.mesh.scale.set(scale, scale, scale);
          effect.mesh.material.opacity = (1.0 - progress) * 0.6;
      }

      if (progress >= 1) {
          scene.remove(effect.mesh);
          effect.mesh.traverse((child) => {
              if (child.isMesh) {
                  child.geometry.dispose();
                  if(child.material.map) child.material.map.dispose();
                  child.material.dispose();
              } else if (child.isSprite) {
                  if(child.material.map) child.material.map.dispose();
                  child.material.dispose();
              }
          });
          activeEffects.splice(i, 1);
      }
  }

  if (centralGem && centralGem.group.visible) {
    centralGem.core.rotation.y += dt * 0.3;
    centralGem.shell.rotation.y -= dt * 0.15;
    const yOffset = Math.sin(time * 0.5) * 1.5;
    const baseHeight = levelEnvironment.centralGemHeight;
    centralGem.group.position.y = baseHeight + yOffset;
    centralGem.light.position.y = baseHeight + yOffset;
  }

  for (const l of lighthouses) {
      if (l.userData.lightGroup) {
          l.userData.lightGroup.rotation.y += dt * 0.5;
      }
  }

  updateEnvironment(dt);

  const timeElapsed = clock.elapsedTime - gameStartTime;

   // Waypoint Mode Aiming Logic (Updated for Task 1: Include King Kong)
   if (gameMode === 'playing' && currentGameMode === GameModes.WAYPOINT) {
        const aimNDC = (cameraSettings.viewMode === ViewModes.TOPDOWN && topDownAim.hasPointer) ? topDownAim.ndc : { x: 0, y: 0 };
        crosshairRaycaster.setFromCamera(aimNDC, camera);
        const intersects = crosshairRaycaster.intersectObjects(turrets.map(t => t.group), true);
        let foundGroup = intersects.length > 0 ? intersects[0].object : null;
        if(foundGroup) {
            while (foundGroup.parent && !(foundGroup.parent instanceof THREE.Scene)) {
                foundGroup = foundGroup.parent;
            }
        }
        // Check if the found group belongs to any turret (Standard or King Kong)
        const newlyAimedTurret = turrets.find(t => t.group === foundGroup) || null;

        if (newlyAimedTurret !== aimedTurret) {
            // Restore previous turret
            if (aimedTurret) {
                aimedTurret.pausedByAim = false;
                const originalColors = aimedTurret.group.userData.originalColors;
                const materials = aimedTurret.group.userData.materials;
                if(originalColors && materials) {
                    const { mat, darkMat, emat } = materials;
                    if (mat) mat.color.setHex(originalColors.base);
                    if (darkMat) darkMat.color.setHex(originalColors.dark);
                    if (emat) {
                        emat.color.setHex(originalColors.emissive);
                        emat.emissive.setHex(originalColors.emissive);
                    }
                }
            }

            // Pause new turret
            if (newlyAimedTurret) {
                newlyAimedTurret.pausedByAim = true;
                const materials = newlyAimedTurret.group.userData.materials;
                const { mat, darkMat, emat } = materials;

                // Store original colors if not already stored
                if (!newlyAimedTurret.group.userData.originalColors) {
                     newlyAimedTurret.group.userData.originalColors = {
                         base: mat ? mat.color.getHex() : null,
                         dark: darkMat ? darkMat.color.getHex() : null,
                         emissive: emat ? emat.color.getHex() : null
                     };
                }

                // Apply pause color (Purple)
                const purple = 0x9333ea;
                if (mat) mat.color.setHex(purple);
                if (darkMat) darkMat.color.setHex(new THREE.Color(purple).multiplyScalar(0.5).getHex());
                if (emat) {
                    emat.color.setHex(purple);
                    emat.emissive.setHex(purple);
                }
            }
            aimedTurret = newlyAimedTurret;
        }
    } else if (gameMode !== 'playing' && aimedTurret) {
        // Clean up if mode changes
        aimedTurret.pausedByAim = false;
        aimedTurret = null;
    }

  for (const t of turrets){
    let canSeePlayer = false;
    if (gameMode === 'playing') {
        const headPos = new THREE.Vector3();
        const sensor = t.sensor || t.turretHead;
        sensor.getWorldPosition(headPos);
        // Check visibility to player's body height (approximated)
        const playerHeadPos = player.pos.clone().setY(headPos.y);
        canSeePlayer = !intersectsWalls(headPos, playerHeadPos);

        const targetDir = new THREE.Vector3().subVectors(player.pos, t.turretHead.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
        const currentDir = new THREE.Vector3(0,0,1).applyQuaternion(t.turretHead.getWorldQuaternion(new THREE.Quaternion()));

        if (canSeePlayer) {
            // Turret rotation towards player
            const angle = currentDir.angleTo(targetDir);
            const cross = new THREE.Vector3().crossVectors(currentDir, targetDir);
            const sign = cross.y < 0 ? -1:1;
            t.turretHead.rotation.y += sign * Math.min(angle, dt*2.0);

            // Check if paused by aim (Task 1 update applies here)
            if (t.pausedByAim) {
                continue;
            }

            // Firing logic
            if (timeElapsed > 5.0 && (clock.elapsedTime - t.lastShot > t.rate)) {
                t.lastShot = clock.elapsedTime;
                fireFromTurret(t);
            }

            // AOE logic for King Kong
            if (t.kind === 'kingkong_turret' && (clock.elapsedTime - t.lastAoeAttack > t.aoeInterval)) {
                triggerKingKongAoe(t);
            }
        }
    }

    if (t.kind === 'turret') { // Standard turret movement
        switch(t.subType) {
            case 'fixed': break;
            case 'moving':
                if (gameMode !== 'playing' || !canSeePlayer) {
                     if (t.path && t.path.length > 0) {
                        const targetNode = t.path[t.currentPathIdx];
                        const dir = new THREE.Vector3().subVectors(targetNode, t.group.position);
                        if (dir.length() < 0.5) {
                            if (t.pathForward) t.currentPathIdx++; else t.currentPathIdx--;
                            if (t.currentPathIdx >= t.path.length || t.currentPathIdx < 0) {
                                if (t.pathLoop) {
                                    t.pathForward = !t.pathForward;
                                    t.currentPathIdx = clamp(t.currentPathIdx, 0, t.path.length - 1);
                                } else {
                                    t.currentPathIdx = clamp(t.currentPathIdx, 0, t.path.length - 1);
                                }
                            }
                        }
                        dir.normalize();
                        t.group.position.add(dir.multiplyScalar(dt * gearToSpeed(t.gear)));
                    } else {
                        const s=Math.sin(clock.elapsedTime * gearToSpeed(t.gear)*0.8); // Increased frequency for standard turrets
                        if (t.mode==='lr') t.group.position.x = t.startPos.x+s*t.w/2;
                        else { const c=Math.cos(clock.elapsedTime*gearToSpeed(t.gear)*0.8); t.group.position.x=t.startPos.x+s*t.w/2; t.group.position.z=t.startPos.z+c*t.d/2; }
                    }
                }
                break;
            case 'tracking':
                if (gameMode === 'playing' && canSeePlayer && timeElapsed > 5.0) {
                    const dir = new THREE.Vector3().subVectors(player.pos, t.group.position);
                    dir.y = 0;
                    dir.normalize();
                    t.group.position.add(dir.multiplyScalar(dt * gearToSpeed(t.gear) * 1.5));
                } else {
                     // If not tracking player, follow path or patrol (same as 'moving')
                     if (t.path && t.path.length > 0) {
                        const targetNode = t.path[t.currentPathIdx];
                        const dir = new THREE.Vector3().subVectors(targetNode, t.group.position);
                        if (dir.length() < 0.5) {
                            if (t.pathForward) t.currentPathIdx++; else t.currentPathIdx--;
                            if (t.currentPathIdx >= t.path.length || t.currentPathIdx < 0) {
                                if (t.pathLoop) {
                                    t.pathForward = !t.pathForward;
                                    t.currentPathIdx = clamp(t.currentPathIdx, 0, t.path.length - 1);
                                } else {
                                    t.currentPathIdx = clamp(t.currentPathIdx, 0, t.path.length - 1);
                                }
                            }
                        }
                        dir.normalize();
                        t.group.position.add(dir.multiplyScalar(dt * gearToSpeed(t.gear)));
                    } else {
                        const s=Math.sin(clock.elapsedTime * gearToSpeed(t.gear)*0.8);
                        if (t.mode==='lr') t.group.position.x = t.startPos.x+s*t.w/2;
                        else { const c=Math.cos(clock.elapsedTime*gearToSpeed(t.gear)*0.8); t.group.position.x=t.startPos.x+s*t.w/2; t.group.position.z=t.startPos.z+c*t.d/2; }
                    }
                }
                break;
        }
    } else if (t.kind === 'kingkong_turret') { // King Kong movement (Path or Tracking)
         if (gameMode === 'playing') {
            // 1. Prioritize Path Movement
            if (t.path && t.path.length > 0) {
                const targetNode = t.path[t.currentPathIdx];
                // We ignore Y coordinate for movement direction calculation as it's a ground/hovering unit
                const targetPos = new THREE.Vector3(targetNode.x, t.group.position.y, targetNode.z);
                const dir = new THREE.Vector3().subVectors(targetPos, t.group.position);

                // Check arrival
                if (dir.length() < 0.5) {
                    // Update path index
                    if (t.pathForward) t.currentPathIdx++; else t.currentPathIdx--;

                    // Handle loop/end conditions (Standard Ping-Pong loop for King Kong if pathLoop is true)
                     if (t.currentPathIdx >= t.path.length || t.currentPathIdx < 0) {
                        if (t.pathLoop) {
                            t.pathForward = !t.pathForward;
                            t.currentPathIdx = clamp(t.currentPathIdx, 0, t.path.length - 1);
                        } else {
                            // If not looping, stop at the ends
                            t.currentPathIdx = clamp(t.currentPathIdx, 0, t.path.length - 1);
                        }
                    }
                } else {
                     dir.normalize();
                    // Move along the path using the defined gear speed
                    t.group.position.add(dir.multiplyScalar(dt * gearToSpeed(t.gear)));
                }
            }
            // 2. Fallback to Tracking if no path is defined
            else if (canSeePlayer && timeElapsed > 2.0) {
                const dir = new THREE.Vector3().subVectors(player.pos, t.group.position);
                dir.y = 0;
                if (dir.length() > 15) { // Keep distance
                    dir.normalize();
                    // Track player using the defined gear speed (slightly slower multiplier for tracking)
                    t.group.position.add(dir.multiplyScalar(dt * gearToSpeed(t.gear) * 0.8));
                }
            }
         }
         // Add subtle hover effect (bobbing) - only affects visual Y, not movement logic Y
         if (t.group) {
             t.group.position.y = Math.sin(time * 2.0) * 0.15;
         }
    }
  }

  if (gameMode === 'playing') {
      const fwdInput=(keys.w||keys.up?1:0) - (keys.s||keys.down?1:0);
      const rightInput=(keys.d||keys.right?1:0) - (keys.a||keys.left?1:0);

      if (fwdInput!==0 || rightInput!==0){
        const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion); forward.y=0; forward.normalize();
        const right=new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
        const move=new THREE.Vector3().addScaledVector(forward,fwdInput).addScaledVector(right,rightInput).normalize().multiplyScalar(player.speed*dt);

        // Collision detection
        const potentialPos = player.pos.clone();
        potentialPos.x += move.x;
        if (checkPlayerCollision(potentialPos)) { potentialPos.x = player.pos.x; move.x = 0; }
        potentialPos.z += move.z;
        if (checkPlayerCollision(potentialPos)) { potentialPos.z = player.pos.z; move.z = 0; }
        player.pos.add(move);
        player.vel.copy(move).divideScalar(dt||1/60);
      } else player.vel.set(0,0,0);

      // Arena boundaries
      player.pos.x=clamp(player.pos.x, -arena.w/2 + PLAYER_RADIUS, arena.w/2 - PLAYER_RADIUS);
      player.pos.z=clamp(player.pos.z, -arena.d/2 + PLAYER_RADIUS, arena.d/2 - PLAYER_RADIUS);
      if (cameraSettings.viewMode === ViewModes.TOPDOWN) {
          updateTopDownCamera();
          updatePlayerAvatar();
      } else {
          camera.position.set(player.pos.x, player.pos.y, player.pos.z);
      }

      if (currentGameMode === GameModes.WAYPOINT) {
            const targetWp = waypoints.find(wp => wp.order === nextWaypointIndex);
            if (targetWp) {
                targetWp.group.userData.light.intensity = targetWp.lightIntensity + Math.sin(clock.elapsedTime * 5) * 1;
                if (player.pos.distanceTo(targetWp.group.position) < 2.0 * targetWp.size) {
                    playFireworksEffect(targetWp.group.position, targetWp.color);
                    activeEffects.push({ type: 'ascension', mesh: targetWp.group, startTime: clock.getElapsedTime(), duration: 1.2 });
                    const wpIndex = waypoints.findIndex(wp => wp.id === targetWp.id);
                    if(wpIndex > -1) waypoints.splice(wpIndex, 1);
                    nextWaypointIndex++;
                    if (nextWaypointIndex > totalWaypointsInLevel) {
                        endGame(true);
                    }
                }
            }
        }

      // Bullet updates
      for (let i=bullets.length-1; i>=0; i--){
        const b = bullets[i];
        const oldPos = b.mesh.position.clone();
        const step = b.vel.clone().multiplyScalar(dt);
        const newPos = oldPos.clone().add(step);
        if (intersectsWalls(oldPos, newPos)) { scene.remove(b.mesh); bullets.splice(i,1); continue; }
        b.mesh.position.copy(newPos);
        if (b.mesh.position.y < 0 || b.mesh.position.length()>500) { scene.remove(b.mesh); bullets.splice(i,1); continue; }

        // Turret bullet hits player
        if (b.from==='turret') {
          // Ray-sphere intersection check for bullet trajectory vs player radius
          const seg = new THREE.Vector3().subVectors(newPos, oldPos);
          const segLen = seg.length();
          if (segLen > 1e-6) {
            const dir = seg.clone().divideScalar(segLen);
            const toCenter = new THREE.Vector3().subVectors(player.pos, oldPos);
            const tProj = THREE.MathUtils.clamp(toCenter.dot(dir), 0, segLen);
            const closest = oldPos.clone().add(dir.multiplyScalar(tProj));
            const hitRadius = PLAYER_RADIUS + 0.3;
            if (closest.distanceTo(player.pos) < hitRadius) {
              player.hp-=10; flashDamage(); updateHUD();
              if (player.hp<=0) endGame(false);
              scene.remove(b.mesh); bullets.splice(i,1);
              continue;
            }
          }
        }
        // Player bullet hits turret
        if (b.from === 'player'){
          for (let j=turrets.length-1;j>=0;j--){
            const t=turrets[j];
            // Adjust hit distance based on turret model size
            const hitDist = t.kind === 'kingkong_turret' ? 3.0 : 1.2;
            if (b.mesh.position.distanceTo(t.group.position)<hitDist){
              if (t.kind === 'kingkong_turret') {
                  t.hp--;
                  if (t.hp > 0) {
                      // Flash effect on hit
                      const materials = t.group.userData.materials;
                      if (materials && materials.mat) {
                          const originalColor = materials.mat.color.clone();
                          materials.mat.color.set(0xffffff);
                          setTimeout(() => { if(materials.mat) materials.mat.color.copy(originalColor); }, 100);
                      }
                  } else {
                      scene.remove(t.group); turrets.splice(j,1);
                  }
              } else {
                  scene.remove(t.group); turrets.splice(j,1);
              }

              updateHUD();
              if (turrets.length===0 && currentGameMode===GameModes.ELIM) endGame(true);
              scene.remove(b.mesh); bullets.splice(i,1); break;
            }
          }
        }
      }
      // Timer checks
      timeLeft -= dt;
      if (timeLeft <= 0 && currentGameMode!==GameModes.ELIM) endGame(currentGameMode===GameModes.SURV);
      else if (timeLeft <= 0 && currentGameMode===GameModes.ELIM) endGame(false);
      updateHUD();
    }
}

function render(){
    requestAnimationFrame(render);
    const dt = clock.getDelta();
    if (gameMode==='playing' || gameMode==='editing') update(dt);
    if(renderer && scene && camera) renderer.render(scene,camera);
    if (orbitControls && orbitControls.enabled) orbitControls.update();
}

// ---------- Levels ----------
const levels = createLevels(GameModes);

// Updated: Load level handles wall conversion and environment settings
function loadLevel(level){
  for (const b of bullets) scene.remove(b.mesh); bullets.length=0;
  for (const t of turrets) scene.remove(t.group); turrets.length=0;
  for (const w of walls) {
      if (w.customTexture) w.customTexture.dispose();
      scene.remove(w.mesh);
  }
  walls.length=0;
  for (const wp of waypoints) scene.remove(wp.group); waypoints.length = 0;
  clearLighthouses();

  // Ensure stretch mode and handles are cleared when loading a new level
  setWallEditMode('drag'); // Reset mode (cleanup)
  clearHandles();
  updatePathVisuals(null);

  objectCounter = 0;

  // Remember meta so the editor UI can reflect loaded levels (name/mode/timer/camera)
  loadedLevelMeta = {
      name: level.name,
      gameMode: normalizeGameMode(level.gameMode),
      timer: level.timer,
      camera: level.camera
  };

  arena.w=parseFloat(level.arenaSize?.width ?? 90);
  arena.d=parseFloat(level.arenaSize?.depth ?? 70);

  // Camera settings (defaults apply for older levels)
  const cam = level.camera || {};
  // View mode (default first-person). Backward compatible with legacy levels where gameMode was 'topdown'.
  cameraSettings.viewMode = (cam.viewMode === ViewModes.TOPDOWN || cam.viewMode === 'topdown' || level.gameMode === 'topdown') ? ViewModes.TOPDOWN : ViewModes.FIRST;
  cameraSettings.topDownAngle = clamp(parseFloat(cam.topDownAngle ?? DEFAULT_CAMERA_SETTINGS.topDownAngle), 10, 89);
  cameraSettings.topDownDistance = clamp(parseFloat(cam.topDownDistance ?? DEFAULT_CAMERA_SETTINGS.topDownDistance), 5, 200);
  cameraSettings.topDownYaw = parseFloat(cam.topDownYaw ?? DEFAULT_CAMERA_SETTINGS.topDownYaw);

  arena.groundStyle = level.ground?.style || 'checkered';
  arena.groundColor = level.ground?.color || '#FFFFFF';
  arena.groundPatternColor = level.ground?.patternColor || '#999999';
  arena.groundTextureScale = level.ground?.textureScale || 5;
  if (arena.groundCustomTexture) {
      arena.groundCustomTexture.dispose();
      arena.groundCustomTexture = null;
  }
  arena.groundCustomTextureURL = level.ground?.customTextureURL || null;
  setupGround();
  applyCrosshairSettings();

  // Environment Loading (Updated for Sky Colors)
  const env = level.environment || {};
  levelEnvironment.dayNightCycleEnabled = env.dayNightCycleEnabled || false;
  levelEnvironment.cycleDuration = env.cycleDuration || 120;
  levelEnvironment.currentTime = 0;
  levelEnvironment.sunIntensityMultiplier = env.sunIntensityMultiplier !== undefined ? env.sunIntensityMultiplier : 1.0;
  levelEnvironment.defaultSkyColor = env.defaultSkyColor || '#FFFFFF';
  levelEnvironment.daySkyColor = env.daySkyColor || '#BDE3FF';
  levelEnvironment.nightSkyColor = env.nightSkyColor || '#0f172a';

  levelEnvironment.centralGemHeight = env.centralGemHeight || 50;
  levelEnvironment.centralGemIntensity = env.centralGemIntensity !== undefined ? env.centralGemIntensity : 0.1;
  levelEnvironment.centralGemColor = env.centralGemColor || '#FFFFFF';
  levelEnvironment.lighthouseColor = env.lighthouseColor || '#FFFF00';
  levelEnvironment.lighthouseIntensity = env.lighthouseIntensity !== undefined ? env.lighthouseIntensity : 0.1;
  levelEnvironment.lighthouseTowerColor = env.lighthouseTowerColor || '#888888';
  levelEnvironment.columnColor = env.columnColor || '#FFFFFF';

  levelEnvironment.columnCustomTextureURL = env.columnCustomTextureURL || null;
  levelEnvironment.columnTextureScale = env.columnTextureScale || 1;
  levelEnvironment.lighthouseTowerCustomTextureURL = env.lighthouseTowerCustomTextureURL || null;
  levelEnvironment.lighthouseTowerTextureScale = env.lighthouseTowerTextureScale || 4;

  // Update scene background immediately if cycle is disabled
  if (!levelEnvironment.dayNightCycleEnabled) {
      scene.background.set(levelEnvironment.defaultSkyColor);
  }

  if(arena.columnCustomTexture) arena.columnCustomTexture.dispose();
  arena.columnCustomTexture = null;
  if(levelEnvironment.columnCustomTextureURL) {
      loadCustomTexture(levelEnvironment.columnCustomTextureURL, (tex)=>{ arena.columnCustomTexture = tex; refreshColumns(); });
  } else {
      refreshColumns();
  }

  if(arena.lighthouseCustomTexture) arena.lighthouseCustomTexture.dispose();
  arena.lighthouseCustomTexture = null;
  if(levelEnvironment.lighthouseTowerCustomTextureURL) {
      loadCustomTexture(levelEnvironment.lighthouseTowerCustomTextureURL, (tex)=>{ arena.lighthouseCustomTexture = tex; refreshLighthouses(); });
  } else {
      refreshLighthouses();
  }

  setupCentralGem();
  addPlayerSpawn(level.playerStart?.x??0, level.playerStart?.z??20);
  (level.turrets??[]).forEach(t => {
      const params = {
          x: t.x, z: t.z, kind: t.kind, id: t.id,
          // Standard turret properties
          subType: t.subType, rate: t.rate, bps: t.bps, gear: t.gear,
          mode: t.mode, w: t.w, d: t.d, path: t.path, pathLoop: t.pathLoop, style: t.style,
          // King Kong properties
          hp: t.hp, color: t.color, aoeRadius: t.aoeRadius, aoeDamage: t.aoeDamage, aoeInterval: t.aoeInterval,
      };
      addTurret(params);
  });

  // Wall Loading and Migration
  (level.walls??[]).forEach(w => {
      if (w.p1 && w.p2) {
          // New format (endpoints)
          addWall(w.p1.x, w.p1.z, w.p2.x, w.p2.z, w.h, w.t, w.type||'brick', w.id || null, w.colors || null, w.customTextureURL || null, w.textureScale || 1);
      } else if (w.x !== undefined && w.z !== undefined && w.w !== undefined && w.d !== undefined) {
          // Old format (center + dimensions) - Migration needed
          const width = w.w;
          const depth = w.d;
          const height = w.h || 4;
          let p1x, p1z, p2x, p2z, thickness;

          // Assume axis alignment based on larger dimension
          if (width >= depth) {
              thickness = depth;
              p1x = w.x - width / 2;
              p2x = w.x + width / 2;
              p1z = w.z;
              p2z = w.z;
          } else {
              thickness = width;
              p1x = w.x;
              p2x = w.x;
              p1z = w.z - depth / 2;
              p2z = w.z + depth / 2;
          }
          addWall(p1x, p1z, p2x, p2z, height, thickness, w.type||'brick', w.id || null, w.colors || null, w.customTextureURL || null, w.textureScale || 1);
      }
  });

  (level.waypoints ?? []).forEach(wp => addWaypoint(wp.x, wp.z, wp.order, wp.id, wp.color, wp.size, wp.lightIntensity, wp.textColor));
  updateHUD();
  updateObjectListUI();
}

// ---------- Game State ----------
function startGame(level, isTesting = false) {
    lastLevel = deepClone(level);
    isTestingFromEditor = isTesting;

    if (!isTesting) {
        editingBuiltInKey = null;
        editingCustomSlot = null;
    }

    gameMode = 'playing';
    menu.classList.add('hidden');
    editorPanel.style.display = 'none';
    if(orbitControls) orbitControls.enabled=false;
    // Set player HP from editor input or default
    player.hp = parseInt(playerHpInput.value, 10) || 100;
    timeLeft = parseFloat(level.timer ?? 60);
    currentGameMode = normalizeGameMode(level.gameMode);
    totalWaypointsInLevel = (level.waypoints || []).length;
    loadLevel(level);
    if (currentGameMode === GameModes.WAYPOINT) {
        nextWaypointIndex = 1;
    }
    showHUD(true);
    hidePlayerMarker();

    // Third-person top-down mode uses free mouse (no pointer lock) and shows a player avatar
    if (cameraSettings.viewMode === ViewModes.TOPDOWN) {
        setPlayerAvatarVisible(true);
        try { document.exitPointerLock(); } catch(e){}
        lockHint.style.display = 'none';
        if (topDownAim.hasPointer) setCrosshairToClientXY(topDownAim.clientX, topDownAim.clientY);
    } else {
        if (playerAvatar) playerAvatar.visible = false;
        resetCrosshairPosition();
        tryRequestPointerLock();
    }

    gameStartTime = clock.elapsedTime;
}

function endGame(victory) {
    if (gameMode !== 'playing') return;

    gameMode = 'menu'; // Neutral state
    showHUD(false);
    try { document.exitPointerLock(); } catch(e){}
    if (playerAvatar) playerAvatar.visible = false;
    resetCrosshairPosition();

    if (isTestingFromEditor) {
        setupEditor(lastLevel, editingBuiltInKey, editingCustomSlot);
    } else {
        if (victory) {
            $('victory').classList.remove('hidden');
        } else {
            menu.classList.remove('hidden');
        }
    }
}

function togglePause(){
    if (gameMode === 'playing') {
        gameMode = 'paused';
        pausePanel.style.display = 'block';
        try{ document.exitPointerLock(); } catch(e){}
        showHUD(false);

        const backToEditorBtn = $('btn-back-to-editor');
        const quitBtn = $('btn-quit');
        if (isTestingFromEditor) {
            backToEditorBtn.style.display = 'inline-block';
            quitBtn.style.display = 'none';
        } else {
            backToEditorBtn.style.display = 'none';
            quitBtn.style.display = 'inline-block';
        }

    } else if (gameMode === 'paused') {
        gameMode = 'playing';
        pausePanel.style.display = 'none';
        if (cameraSettings.viewMode !== ViewModes.TOPDOWN) {
            resetCrosshairPosition();
            tryRequestPointerLock();
        } else {
            lockHint.style.display = 'none';
            if (topDownAim.hasPointer) setCrosshairToClientXY(topDownAim.clientX, topDownAim.clientY);
        }
        showHUD(true);
    }
}

// ---------- Editor Functions ----------
function setupEditor(level, builtInKey = null, customSlot = null){
    gameMode = 'editing';
    editingBuiltInKey = builtInKey;
    editingCustomSlot = customSlot;
    menu.classList.add('hidden');
    editorPanel.style.display = 'block';
    if(orbitControls) {
        orbitControls.enabled=true;
        orbitControls.target.set(0,0,0);
        camera.position.set(0, 50, 40);
        orbitControls.update();
    }
    if (customSlot) {
        saveSlotSel.value = customSlot;
        saveSlotSel.disabled = true;
    } else {
        saveSlotSel.disabled = false;
    }
    ensurePlayerMarker();
    playerMarker.visible = true;
    loadLevel(level);
    enterEditor();
}

function applyPosInputs(){
    const sel = editorData.selection;
    if (!sel || sel.kind === 'wall') return; // Walls handled by handles/dragging body

    if (sel.kind === 'player') {
        const p = player.pos;
        posX.value = p.x.toFixed(1);
        posZ.value = p.z.toFixed(1);
    } else {
        const p = sel.ref.group.position;
        posX.value = p.x.toFixed(1);
        posZ.value = p.z.toFixed(1);
    }
}

function updatePathVisuals(turret){
  if (pathEdit.line) scene.remove(pathEdit.line);
  for(const m of pathEdit.markers) scene.remove(m);
  pathEdit.markers.length=0;

  if (!turret || !turret.path || turret.path.length===0) return;

  const pts = turret.path;
  const color = turret.kind === 'kingkong_turret' ? 0x00FFFF : 0xffaa00;

  for(const p of pts){
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshBasicMaterial({color: color}));
    m.position.copy(p);
    // Ensure path markers are visible slightly above ground
    m.position.y = EDITOR_Y_OFFSET;
    scene.add(m);
    pathEdit.markers.push(m);
  }
  if (pts.length>1){
    const mat = new THREE.LineBasicMaterial({color: color, linewidth:2});
    // Create points ensuring Y coordinate is consistent for the line visualization
    const linePts = pts.map(p => new THREE.Vector3(p.x, EDITOR_Y_OFFSET, p.z));
    const geom = new THREE.BufferGeometry().setFromPoints(linePts);
    pathEdit.line = new THREE.Line(geom,mat);
    scene.add(pathEdit.line);
  }
}

function findNextAvailableWaypointOrder() {
    const existingOrders = new Set(waypoints.map(wp => wp.order));
    let order = 1;
    while (existingOrders.has(order)) {
        order++;
    }
    return order;
}

// Updated: Export level data including new wall format and sky colors
function currentLevelData(){
    return {
        name: levelNameInput.value || "Custom Level",
        gameMode: gameModeSel.value,
        timer: parseFloat(levelTimeInput.value || 60),
        arenaSize: { width: parseFloat(arenaWInput.value || 90), depth: parseFloat(arenaDInput.value || 70) },
        camera: {
            viewMode: cameraSettings.viewMode,
            topDownAngle: cameraSettings.topDownAngle,
            topDownDistance: cameraSettings.topDownDistance,
            topDownYaw: cameraSettings.topDownYaw
        },
        ground: {
            style: arena.groundStyle, color: arena.groundColor, patternColor: arena.groundPatternColor,
            textureScale: arena.groundTextureScale, customTextureURL: arena.groundCustomTextureURL
        },
        environment: {
            dayNightCycleEnabled: levelEnvironment.dayNightCycleEnabled, cycleDuration: levelEnvironment.cycleDuration,
            sunIntensityMultiplier: levelEnvironment.sunIntensityMultiplier,
            defaultSkyColor: levelEnvironment.defaultSkyColor,
            daySkyColor: levelEnvironment.daySkyColor,
            nightSkyColor: levelEnvironment.nightSkyColor,
            centralGemHeight: levelEnvironment.centralGemHeight,
            centralGemIntensity: levelEnvironment.centralGemIntensity, centralGemColor: levelEnvironment.centralGemColor,
            lighthouseColor: levelEnvironment.lighthouseColor, lighthouseIntensity: levelEnvironment.lighthouseIntensity,
            lighthouseTowerColor: levelEnvironment.lighthouseTowerColor, columnColor: levelEnvironment.columnColor,
            columnCustomTextureURL: levelEnvironment.columnCustomTextureURL, columnTextureScale: levelEnvironment.columnTextureScale,
            lighthouseTowerCustomTextureURL: levelEnvironment.lighthouseTowerCustomTextureURL, lighthouseTowerTextureScale: levelEnvironment.lighthouseTowerTextureScale
        },
        playerStart: { x: player.pos.x, z: player.pos.z },
        turrets: turrets.map(t => {
            if (t.kind === 'kingkong_turret') {
                return {
                    kind: 'kingkong_turret', id: t.id, x: t.group.position.x, z: t.group.position.z,
                    hp: t.maxHp, color: t.color, aoeRadius: t.aoeRadius, aoeDamage: t.aoeDamage, aoeInterval: t.aoeInterval,
                    gear: t.gear,
                    path: t.path.map(p => ({ x: p.x, y: p.y, z: p.z })),
                    pathLoop: t.pathLoop
                };
            } else {
                return {
                    kind: 'turret', id: t.id, x: t.group.position.x, z: t.group.position.z,
                    subType: t.subType, rate: t.rate / GLOBAL_TURRET_RATE_MULT, bps: t.bps,
                    gear: t.gear, mode: t.mode, w: t.w, d: t.d,
                    path: t.path.map(p => ({ x: p.x, y: p.y, z: p.z })), pathLoop: t.pathLoop, style: t.style
                };
            }
        }),
        // New Wall Export Format
        walls: walls.map(w=>({
            p1: w.p1, p2: w.p2, h: w.h, t: w.t, type: w.type,
            id: w.id, colors: w.colors, customTextureURL: w.customTextureURL, textureScale: w.textureScale
        })),
        waypoints: waypoints.map(wp => ({
            x: wp.group.position.x, z: wp.group.position.z, order: wp.order, id: wp.id,
            color: wp.color, size: wp.size, lightIntensity: wp.lightIntensity, textColor: wp.textColor
        }))
    };
}

function syncGroundUI() {
    const isCustom = groundStyleSel.value === 'custom';
    $('ground-texture-upload-btn').style.display = isCustom ? 'inline-block' : 'none';
    $('ground-texture-clear-btn').style.display = isCustom ? 'inline-block' : 'none';
}

function syncTopDownCameraUI() {
    if (!topDownCameraSettingsRow) return;
    const enabled = !!(topDownViewChk && topDownViewChk.checked);
    topDownCameraSettingsRow.style.display = enabled ? 'flex' : 'none';
}

// Updated: Load editor UI state
function enterEditor(){
    gameMode = 'editing';
    menu.classList.add('hidden');
    editorPanel.style.display = 'block';
    showHUD(false);
    try{
        // Ensure basic meta fields reflect the last loaded level (important for Load/Import)
        if (loadedLevelMeta) {
            if (loadedLevelMeta.name) levelNameInput.value = loadedLevelMeta.name;
            if (loadedLevelMeta.gameMode) gameModeSel.value = loadedLevelMeta.gameMode;
            if (loadedLevelMeta.timer !== undefined && loadedLevelMeta.timer !== null) levelTimeInput.value = loadedLevelMeta.timer;
            // camera settings are loaded via loadLevel() into cameraSettings
        }

        const level = currentLevelData();
        gameModeSel.value = level.gameMode;
        levelTimeInput.value = level.timer;
        arenaWInput.value = arena.w;
        arenaDInput.value = arena.d;
        // Top-down camera settings
        if (topDownAngleInput) topDownAngleInput.value = cameraSettings.topDownAngle;
        if (topDownDistanceInput) topDownDistanceInput.value = cameraSettings.topDownDistance;
        if (topDownViewChk) topDownViewChk.checked = (cameraSettings.viewMode === ViewModes.TOPDOWN);
        syncTopDownCameraUI();
        groundStyleSel.value = arena.groundStyle;
        groundColorInput.value = arena.groundColor;
        groundPatternColorInput.value = arena.groundPatternColor;
        groundTextureScaleInput.value = arena.groundTextureScale;
        syncGroundUI();
        dayNightEnabledChk.checked = levelEnvironment.dayNightCycleEnabled;
        cycleDurationInput.value = levelEnvironment.cycleDuration;
        sunIntensityInput.value = levelEnvironment.sunIntensityMultiplier.toFixed(1);

        // Load Sky Colors into UI
        skyColorDefaultInput.value = levelEnvironment.defaultSkyColor;
        skyColorDayInput.value = levelEnvironment.daySkyColor;
        skyColorNightInput.value = levelEnvironment.nightSkyColor;

        centralGemHeightInput.value = levelEnvironment.centralGemHeight;
        centralGemIntensityInput.value = levelEnvironment.centralGemIntensity.toFixed(1);
        centralGemColorInput.value = levelEnvironment.centralGemColor;
        lighthouseColorInput.value = levelEnvironment.lighthouseColor;
        lighthouseIntensityInput.value = levelEnvironment.lighthouseIntensity;
        lighthouseTowerColorInput.value = levelEnvironment.lighthouseTowerColor;
        lighthouseTextureScaleInput.value = levelEnvironment.lighthouseTowerTextureScale;
        columnColorInput.value = levelEnvironment.columnColor;
        columnTextureScaleInput.value = levelEnvironment.columnTextureScale;
        crosshairColorInput.value = visualSettings.crosshairColor;
        crosshairThicknessInput.value = visualSettings.crosshairThickness;
        crosshairSizeInput.value = visualSettings.crosshairSize;
    }catch(e){}
    refreshColumns();
    refreshLighthouses();
    setupCentralGem();
    onSelectedChanged();
    updateUIText();
}

function loadCustomTexture(url, callback) {
    textureLoader.load(url,
        (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
            callback(texture);
        },
        undefined, (error) => { console.error("Texture loading failed:", error); }
    );
}

function handleTextureUpload(file) {
    if (!file) return;
    const tempUrl = URL.createObjectURL(file);
    loadCustomTexture(tempUrl, (texture) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            if (textureUploadTarget === 'ground') {
                if (arena.groundCustomTexture) arena.groundCustomTexture.dispose();
                arena.groundCustomTexture = texture; arena.groundCustomTextureURL = dataUrl;
                groundStyleSel.value = 'custom'; arena.groundStyle = 'custom';
                updateGroundTexture(arena.groundStyle, arena.groundColor, arena.groundPatternColor);
                syncGroundUI();
            } else if (textureUploadTarget === 'wall') {
                const s = editorData.selection;
                if (s && s.kind === 'wall') {
                    if (s.ref.customTexture) s.ref.customTexture.dispose();
                    s.ref.customTexture = texture; s.ref.customTextureURL = dataUrl;
                    wallTypeSel.value = 'custom'; s.ref.type = 'custom';
                    updateWallMaterialHandler();
                }
            } else if (textureUploadTarget === 'column') {
                if(arena.columnCustomTexture) arena.columnCustomTexture.dispose();
                arena.columnCustomTexture = texture;
                levelEnvironment.columnCustomTextureURL = dataUrl;
                refreshColumns();
            } else if (textureUploadTarget === 'lighthouse') {
                if(arena.lighthouseCustomTexture) arena.lighthouseCustomTexture.dispose();
                arena.lighthouseCustomTexture = texture;
                levelEnvironment.lighthouseTowerCustomTextureURL = dataUrl;
                refreshLighthouses();
            }
            URL.revokeObjectURL(tempUrl);
        };
        reader.readAsDataURL(file);
    });
}

// Updated: Wall material handler now recalculates length for texture update
const updateWallMaterialHandler = (event) => {
    const s=editorData.selection;
    if (!s||s.kind!=='wall') return;
    if (event && event.target === wallTypeSel && wallTypeSel.value !== 'custom') {
         const newType = wallTypeSel.value;
         const defaults = WallStyleDefaults[newType] || WallStyleDefaults.brick;
         wallBaseColorInput.value = defaults.base;
         wallPatternColorInput.value = defaults.pattern;
    }
    s.ref.type=wallTypeSel.value;
    s.ref.colors = { base: wallBaseColorInput.value, pattern: wallPatternColorInput.value };
    const scale = parseFloat(wallTextureScaleInput.value);
    if (Number.isFinite(scale) && scale > 0) s.ref.textureScale = scale;

    // Calculate current length
    const p1 = new THREE.Vector3(s.ref.p1.x, 0, s.ref.p1.z);
    const p2 = new THREE.Vector3(s.ref.p2.x, 0, s.ref.p2.z);
    const length = p1.distanceTo(p2);

    s.ref.mesh.material.dispose();
    s.ref.mesh.material=wallMaterial(s.ref, length);
    updateWallMesh(s.ref); // Ensure mesh updates if scale changed
};

function exportJSON() {
    const data = currentLevelData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name.replace(/\s/g, '_')}_level.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = event.target.result;
            const levelData = JSON.parse(json);
            if (levelData && levelData.playerStart) {
                if (arena.groundCustomTexture) {
                    arena.groundCustomTexture.dispose();
                    arena.groundCustomTexture = null;
                    arena.groundCustomTextureURL = null;
                }
                walls.forEach(w => { if (w.customTexture) w.customTexture.dispose(); });
                loadLevel(levelData);
                enterEditor();
            } else {
                alert(T('alert_invalid_json'));
            }
        } catch (e) {
            console.error("Failed to parse JSON:", e);
            alert(T('alert_invalid_json'));
        }
    };
    reader.readAsText(file);
}


function bindEditorEvents(){
    // Bind new Wall Mode Buttons
    btnWallDragMode.addEventListener('click', () => setWallEditMode('drag'));
    btnWallStretchMode.addEventListener('click', () => setWallEditMode('stretch'));
    btnWallExtendMode.addEventListener('click', () => setWallEditMode('extend'));

    // Top-down view settings (independent of game mode)
    if (topDownViewChk) {
        topDownViewChk.addEventListener('change', () => {
            cameraSettings.viewMode = topDownViewChk.checked ? ViewModes.TOPDOWN : ViewModes.FIRST;
            syncTopDownCameraUI();
        });
    }
    if (topDownAngleInput) {
        topDownAngleInput.addEventListener('input', () => {
            const v = clamp(parseFloat(topDownAngleInput.value) || DEFAULT_CAMERA_SETTINGS.topDownAngle, 10, 89);
            cameraSettings.topDownAngle = v;
            topDownAngleInput.value = v;
        });
    }
    if (topDownDistanceInput) {
        topDownDistanceInput.addEventListener('input', () => {
            const v = clamp(parseFloat(topDownDistanceInput.value) || DEFAULT_CAMERA_SETTINGS.topDownDistance, 5, 200);
            cameraSettings.topDownDistance = v;
            topDownDistanceInput.value = v;
        });
    }

    const posUpdater = () => {
        const sel = editorData.selection;
        if (!sel || sel.kind === 'wall') return; // Walls are positioned by handles/dragging body
        const x = parseFloat(posX.value),
            z = parseFloat(posZ.value);
        if (isNaN(x) || isNaN(z)) return;

        if (sel.kind === 'player') {
            player.pos.set(x, 1.6, z);
            playerMarker.position.set(x, EDITOR_Y_OFFSET, z);
        } else if (sel.kind === 'turret') {
            sel.ref.group.position.set(x, 0.1, z);
        } else if (sel.kind === 'kingkong_turret') {
            sel.ref.group.position.set(x, 0, z);
        } else if (sel.kind === 'waypoint') {
            sel.ref.group.position.set(x, 1.5 * sel.ref.size, z);
        }
    };
    posX.addEventListener('change',posUpdater); posZ.addEventListener('change', posUpdater);
    turretType.addEventListener('change',()=> {const s=editorData.selection; if (s&&s.kind==='turret') s.ref.subType=turretType.value;});
    turretStyleSel.addEventListener('change',()=> {const s=editorData.selection; if (s&&s.kind==='turret') updateTurretStyle(s.ref, turretStyleSel.value);});
    turretRate.addEventListener('input',()=> {const s=editorData.selection; if (s&&s.kind==='turret') s.ref.rate=parseFloat(turretRate.value)*GLOBAL_TURRET_RATE_MULT;});
    bulletSpeed.addEventListener('input',()=> {const s=editorData.selection; if (s&&s.kind==='turret') s.ref.bps=parseFloat(bulletSpeed.value);});
    gearSel.addEventListener('change',()=> {const s=editorData.selection; if (s&&s.kind==='turret') s.ref.gear=gearSel.value;});
    moveModeSel.addEventListener('change',()=> {const s=editorData.selection; if (s&&s.kind==='turret') s.ref.mode=moveModeSel.value;});
    patrolW.addEventListener('input',()=> {const s=editorData.selection; if (s&&s.kind==='turret') s.ref.w=parseFloat(patrolW.value);});
    patrolD.addEventListener('input',()=> {const s=editorData.selection; if (s&&s.kind==='turret') s.ref.d=parseFloat(patrolD.value);});
    pathEditBtn.addEventListener('click',()=>{ const s=editorData.selection; if (!s || s.kind!=='turret') {alert(T('alert_select_turret')); return;} pathEdit.active=true; pathEdit.turret=s.ref; pathEditBtn.style.display='none'; pathDoneBtn.style.display='inline-block'; updatePathVisuals(s.ref); });
    pathDoneBtn.addEventListener('click',()=>{ pathEdit.active=false; pathEdit.turret=null; pathEditBtn.style.display='inline-block'; pathDoneBtn.style.display='none'; updatePathVisuals(null); });
    pathClearBtn.addEventListener('click',()=>{ const s=editorData.selection; if(s&&s.kind==='turret'){ s.ref.path.length=0; updatePathVisuals(null); }});
    pathLoopChk.addEventListener('change',()=>{ const s=editorData.selection; if(s&&s.kind==='turret') s.ref.pathLoop=pathLoopChk.checked; });

    // Player HP Editor Binding
    playerHpInput.addEventListener('input', () => {
        const val = parseInt(playerHpInput.value, 10);
        if (!isNaN(val)) {
            player.hp = val;
            updateHUD();
        }
    });

    // King Kong Editor Bindings
    kingkongHpInput.addEventListener('input', () => { const s = editorData.selection; if (s?.kind === 'kingkong_turret') s.ref.hp = s.ref.maxHp = parseInt(kingkongHpInput.value, 10); });
    kingkongColorInput.addEventListener('input', () => { const s = editorData.selection; if (s?.kind === 'kingkong_turret') updateKingKongTurretColor(s.ref, kingkongColorInput.value); });
    kingkongAoeRadiusInput.addEventListener('input', () => { const s = editorData.selection; if (s?.kind === 'kingkong_turret') s.ref.aoeRadius = parseFloat(kingkongAoeRadiusInput.value); });
    kingkongAoeDamageInput.addEventListener('input', () => { const s = editorData.selection; if (s?.kind === 'kingkong_turret') s.ref.aoeDamage = parseFloat(kingkongAoeDamageInput.value); });
    kingkongAoeIntervalInput.addEventListener('input', () => { const s = editorData.selection; if (s?.kind === 'kingkong_turret') s.ref.aoeInterval = parseFloat(kingkongAoeIntervalInput.value); });
    kingkongGearSel.addEventListener('change', () => { const s = editorData.selection; if (s?.kind === 'kingkong_turret') s.ref.gear = kingkongGearSel.value; });

    // King Kong Path Editing Bindings
    kingkongPathEditBtn.addEventListener('click',()=>{
        const s=editorData.selection;
        if (!s || s.kind!=='kingkong_turret') {alert(T('alert_select_turret')); return;}
        pathEdit.active=true;
        pathEdit.turret=s.ref;
        kingkongPathEditBtn.style.display='none';
        kingkongPathDoneBtn.style.display='inline-block';
        updatePathVisuals(s.ref);
    });
    kingkongPathDoneBtn.addEventListener('click',()=>{
        pathEdit.active=false;
        pathEdit.turret=null;
        kingkongPathEditBtn.style.display='inline-block';
        kingkongPathDoneBtn.style.display='none';
        updatePathVisuals(null);
    });
    kingkongPathClearBtn.addEventListener('click',()=>{
        const s=editorData.selection;
        if(s&&s.kind==='kingkong_turret'){
            s.ref.path.length=0;
            updatePathVisuals(null);
        }
    });
    kingkongPathLoopChk.addEventListener('change',()=>{
        const s=editorData.selection;
        if(s&&s.kind==='kingkong_turret') s.ref.pathLoop=kingkongPathLoopChk.checked;
    });


    // Updated Wall Event Listeners
    wallTypeSel.addEventListener('change', updateWallMaterialHandler);
    wallBaseColorInput.addEventListener('input', updateWallMaterialHandler);
    wallPatternColorInput.addEventListener('input', updateWallMaterialHandler);
    wallTextureScaleInput.addEventListener('input', updateWallMaterialHandler);

    // Wall dimension inputs (H and T)
    wallH.addEventListener('input',()=>{
        const s=editorData.selection;
        if(s&&s.kind==='wall'){
            s.ref.h=parseFloat(wallH.value);
            updateWallMesh(s.ref);
            updateWallMaterialHandler(); // Update texture tiling
        }
    });
    wallT.addEventListener('input',()=>{
        const s=editorData.selection;
        if(s&&s.kind==='wall'){
            s.ref.t=parseFloat(wallT.value);
            updateWallMesh(s.ref);
        }
    });

    waypointOrderInput.addEventListener('change', () => { const s = editorData.selection; if (s && s.kind === 'waypoint') { const newOrder = parseInt(waypointOrderInput.value, 10); if (isNaN(newOrder) || newOrder < 1) { waypointOrderInput.value = s.ref.order; return; } if (waypoints.some(wp => wp.id !== s.ref.id && wp.order === newOrder)) { alert(T('alert_waypoint_order_exists', newOrder)); waypointOrderInput.value = s.ref.order; return; } s.ref.order = newOrder; const sprite = s.ref.group.userData.sprite; if (sprite && sprite.material) { if (sprite.material.map) sprite.material.map.dispose(); sprite.material.map = createWaypointTexture(newOrder, s.ref.color, s.ref.textColor); sprite.material.needsUpdate = true; } waypoints.sort((a, b) => a.order - b.order); updateObjectListUI(); }});
    waypointSizeInput.addEventListener('input', () => { const s = editorData.selection; if (s && s.kind === 'waypoint') { const newSize = parseFloat(waypointSizeInput.value); if (!isNaN(newSize) && newSize > 0) { s.ref.size = newSize; s.ref.group.scale.setScalar(newSize); s.ref.group.position.y = 1.5 * newSize; s.ref.group.userData.light.distance = 10 * newSize; } } });
    waypointColorInput.addEventListener('input', () => { const s = editorData.selection; if (s && s.kind === 'waypoint') { const newColor = waypointColorInput.value; s.ref.color = newColor; const gemColor = new THREE.Color(newColor); s.ref.group.userData.light.color.set(gemColor); if (s.ref.group.userData.shell.material) s.ref.group.userData.shell.material.color.set(gemColor); if (s.ref.group.userData.core.material) { s.ref.group.userData.core.material.color.set(gemColor); s.ref.group.userData.core.material.emissive.set(gemColor); } const sprite = s.ref.group.userData.sprite; if (sprite && sprite.material) { if (sprite.material.map) sprite.material.map.dispose(); sprite.material.map = createWaypointTexture(s.ref.order, newColor, s.ref.textColor); sprite.material.needsUpdate = true; } } });
    waypointIntensityInput.addEventListener('input', () => { const s = editorData.selection; if (s && s.kind === 'waypoint') { const newIntensity = parseFloat(waypointIntensityInput.value); if (!isNaN(newIntensity) && newIntensity >= 0) { s.ref.lightIntensity = newIntensity; s.ref.group.userData.light.intensity = newIntensity; } } });
    waypointTextColorInput.addEventListener('input', () => { const s = editorData.selection; if (s && s.kind === 'waypoint') { const newColor = waypointTextColorInput.value; s.ref.textColor = newColor; const sprite = s.ref.group.userData.sprite; if (sprite && sprite.material) { if (sprite.material.map) sprite.material.map.dispose(); sprite.material.map = createWaypointTexture(s.ref.order, s.ref.color, newColor); sprite.material.needsUpdate = true; } } });

    // Add new object button
    $('btn-add').addEventListener('click',()=>{
        const k=objKind.value;
        if(k==='turret') addTurret({x:0, z:0, kind:'turret', subType:'moving', rate:2.0, bps:60, gear:2, mode:'area', w:24, d:16, path:[], pathLoop:true, id:null, style:'scifi_blue'});
        else if (k==='kingkong_turret') addTurret({x:0, z:0, kind:'kingkong_turret', hp:10, color:'#4A4A6A', aoeRadius:10, aoeDamage:25, aoeInterval: 8.0, gear: 2, path:[], pathLoop: true, id: null});
        // Updated: Add wall uses endpoints
        else if(k==='wall') addWall(0, 0, 8, 0); // Start a default 8 unit long wall at origin
        else if(k==='waypoint') addWaypoint(0,0, findNextAvailableWaypointOrder());
    });
    // Updated Delete button logic
    $('btn-del').addEventListener('click',()=>{const s=editorData.selection; if(!s) { alert(T('alert_select_object')); return; } if(s.kind==='player') { alert(T('alert_player_cannot_delete')); return; } let arr; let obj; if (s.kind==='turret' || s.kind === 'kingkong_turret'){ arr=turrets; obj=s.ref.group; } else if(s.kind==='wall') { arr=walls; obj=s.ref.mesh; setWallEditMode('drag'); clearHandles(); } else { arr=waypoints; obj=s.ref.group; } const idx=arr.findIndex(i=>i.id===s.ref.id); if(idx>-1) arr.splice(idx,1); scene.remove(obj); editorData.selection=null; onSelectedChanged();});

    $('btn-test').addEventListener('click',()=>startGame(currentLevelData(), true));
    // Updated Exit button logic
    $('btn-exit').addEventListener('click',()=>{ gameMode='menu'; menu.classList.remove('hidden'); editorPanel.style.display='none'; if(orbitControls) orbitControls.enabled=false; hidePlayerMarker(); updatePathVisuals(null); setWallEditMode('drag'); clearHandles(); editingCustomSlot = null; saveSlotSel.disabled = false;});

    $('btn-save-main').addEventListener('click', ()=>{ const data=currentLevelData(); try{ if (editingBuiltInKey) { localStorage.setItem(MODIFIED_BUILTIN_KEY_PREFIX + editingBuiltInKey, JSON.stringify(data)); levels[editingBuiltInKey] = data; } else { const slot = editingCustomSlot || saveSlotSel.value; localStorage.setItem(SLOT_KEY(slot), JSON.stringify(data)); localStorage.setItem(SLOT_NAME_KEY(slot), data.name); } refreshCustomMenuButtons(); } catch(e) { alert(T('alert_save_failed', e.message)); } });
    $('btn-load-slot').addEventListener('click',()=>{ const slot=saveSlotSel.value; const txt=localStorage.getItem(SLOT_KEY(slot)); if (txt) { loadLevel(JSON.parse(txt)); enterEditor(); } else { alert(T('alert_slot_empty')); } });
    arenaWInput.addEventListener('input',()=>{arena.w=parseFloat(arenaWInput.value); refreshColumns(); refreshLighthouses();});
    arenaDInput.addEventListener('input',()=>{arena.d=parseFloat(arenaDInput.value); refreshColumns(); refreshLighthouses();});
    groundStyleSel.addEventListener('change', () => { arena.groundStyle = groundStyleSel.value; updateGroundTexture(arena.groundStyle, arena.groundColor, arena.groundPatternColor); syncGroundUI(); });
    groundColorInput.addEventListener('input', () => { arena.groundColor = groundColorInput.value; updateGroundTexture(arena.groundStyle, arena.groundColor, arena.groundPatternColor); });
    groundPatternColorInput.addEventListener('input', () => { arena.groundPatternColor = groundPatternColorInput.value; updateGroundTexture(arena.groundStyle, arena.groundColor, arena.groundPatternColor); });
    groundTextureScaleInput.addEventListener('input', () => { const scale = parseFloat(groundTextureScaleInput.value); if (Number.isFinite(scale) && scale > 0) { arena.groundTextureScale = scale; updateGroundTexture(arena.groundStyle, arena.groundColor, arena.groundPatternColor); } });
    dayNightEnabledChk.addEventListener('change', () => { levelEnvironment.dayNightCycleEnabled = dayNightEnabledChk.checked; });
    cycleDurationInput.addEventListener('input', () => { levelEnvironment.cycleDuration = parseFloat(cycleDurationInput.value); });
    sunIntensityInput.addEventListener('input', () => { const intensity = parseFloat(sunIntensityInput.value); if (Number.isFinite(intensity)) levelEnvironment.sunIntensityMultiplier = intensity; });

    // New Sky Color Bindings
    skyColorDefaultInput.addEventListener('input', () => { levelEnvironment.defaultSkyColor = skyColorDefaultInput.value; });
    skyColorDayInput.addEventListener('input', () => { levelEnvironment.daySkyColor = skyColorDayInput.value; });
    skyColorNightInput.addEventListener('input', () => { levelEnvironment.nightSkyColor = skyColorNightInput.value; });

    centralGemHeightInput.addEventListener('input', () => { const height = parseFloat(centralGemHeightInput.value); if (Number.isFinite(height)) { levelEnvironment.centralGemHeight = height; setupCentralGem(); } });
    centralGemIntensityInput.addEventListener('input', () => { const intensity = parseFloat(centralGemIntensityInput.value); if (Number.isFinite(intensity)) { levelEnvironment.centralGemIntensity = intensity; setupCentralGem(); } });
    centralGemColorInput.addEventListener('input', () => { levelEnvironment.centralGemColor = centralGemColorInput.value; setupCentralGem(); });
    lighthouseColorInput.addEventListener('input', () => { levelEnvironment.lighthouseColor = lighthouseColorInput.value; refreshLighthouses(); });
    lighthouseIntensityInput.addEventListener('input', () => { const intensity = parseFloat(lighthouseIntensityInput.value); if (Number.isFinite(intensity)) { levelEnvironment.lighthouseIntensity = intensity; refreshLighthouses(); } });
    lighthouseTowerColorInput.addEventListener('input', () => { levelEnvironment.lighthouseTowerColor = lighthouseTowerColorInput.value; refreshLighthouses(); });
    lighthouseTextureScaleInput.addEventListener('input', ()=>{ levelEnvironment.lighthouseTowerTextureScale = parseFloat(lighthouseTextureScaleInput.value); refreshLighthouses(); });
    columnColorInput.addEventListener('input', () => { levelEnvironment.columnColor = columnColorInput.value; refreshColumns(); });
    columnTextureScaleInput.addEventListener('input', ()=>{ levelEnvironment.columnTextureScale = parseFloat(columnTextureScaleInput.value); refreshColumns(); });
    crosshairColorInput.addEventListener('input', () => { visualSettings.crosshairColor = crosshairColorInput.value; applyCrosshairSettings(); saveGlobalSettings(); });
    crosshairThicknessInput.addEventListener('input', () => { visualSettings.crosshairThickness = parseInt(crosshairThicknessInput.value, 10); applyCrosshairSettings(); saveGlobalSettings(); });
    crosshairSizeInput.addEventListener('input', () => { visualSettings.crosshairSize = parseInt(crosshairSizeInput.value, 10) || 12; applyCrosshairSettings(); saveGlobalSettings(); });
    const fileInput = $('texture-loader-input'); fileInput.addEventListener('change', (event) => { handleTextureUpload(event.target.files[0]); fileInput.value = ''; });
    $('ground-texture-upload-btn').addEventListener('click', () => { textureUploadTarget = 'ground'; fileInput.click(); });
    $('ground-texture-clear-btn').addEventListener('click', () => { if (arena.groundCustomTexture) arena.groundCustomTexture.dispose(); arena.groundCustomTexture = null; arena.groundCustomTextureURL = null; if (arena.groundStyle === 'custom') { arena.groundStyle = 'checkered'; groundStyleSel.value = 'checkered'; } updateGroundTexture(arena.groundStyle, arena.groundColor, arena.groundPatternColor); syncGroundUI(); });
    $('wall-texture-upload-btn').addEventListener('click', () => { if (editorData.selection && editorData.selection.kind === 'wall') { textureUploadTarget = 'wall'; fileInput.click(); } else { alert(T('alert_select_object')); } });
    $('wall-texture-clear-btn').addEventListener('click', () => { const s = editorData.selection; if (s && s.kind === 'wall') { if (s.ref.customTexture) s.ref.customTexture.dispose(); s.ref.customTexture = null; s.ref.customTextureURL = null; if (s.ref.type === 'custom') { s.ref.type = 'brick'; wallTypeSel.value = 'brick'; } updateWallMaterialHandler(); } });
    $('column-texture-upload-btn').addEventListener('click', ()=>{ textureUploadTarget = 'column'; fileInput.click(); });
    $('column-texture-clear-btn').addEventListener('click', ()=>{ if(arena.columnCustomTexture) arena.columnCustomTexture.dispose(); arena.columnCustomTexture = null; levelEnvironment.columnCustomTextureURL = null; refreshColumns(); });
    $('lighthouse-texture-upload-btn').addEventListener('click', ()=>{ textureUploadTarget = 'lighthouse'; fileInput.click(); });
    $('lighthouse-texture-clear-btn').addEventListener('click', ()=>{ if(arena.lighthouseCustomTexture) arena.lighthouseCustomTexture.dispose(); arena.lighthouseCustomTexture = null; levelEnvironment.lighthouseTowerCustomTextureURL = null; refreshLighthouses(); });

    $('btn-export').addEventListener('click', exportJSON);
    $('btn-import').addEventListener('click', () => { $('import-json-input').click(); });
    $('import-json-input').addEventListener('change', (event) => { importJSON(event.target.files[0]); $('import-json-input').value = ''; });

}

// ---------- Input ----------
function bindGameInputs(){
  document.addEventListener('keydown', (e)=>{ const c=e.code.toLowerCase(); if(c.startsWith('key')) keys[c.slice(3)]=true; else if(c.startsWith('arrow')) keys[c.slice(5)]=true; });
  document.addEventListener('keyup', (e)=>{ const c=e.code.toLowerCase(); if(c.startsWith('key')) keys[c.slice(3)]=false; else if(c.startsWith('arrow')) keys[c.slice(5)]=false; });
  document.addEventListener('mousedown', (e)=>{ if(gameMode==='playing' && e.button===0) playerShoot(); });
  document.addEventListener('keydown', (e)=>{ if(gameMode==='playing' && e.code==='Space') playerShoot(); });
}

// ---------- Boot ----------
function refreshMenuLevelNames() {
    const startText = T('menu_start_level');
    if ($('play-level-1')) $('play-level-1').textContent = `${startText} 1${levels.one.name ? ': ' + levels.one.name : ''}`;
    if ($('play-level-2')) $('play-level-2').textContent = `${startText} 2${levels.two.name ? ': ' + levels.two.name : ''}`;
    if ($('play-level-3')) $('play-level-3').textContent = `${startText} 3${levels.three.name ? ': ' + levels.three.name : ''}`;
    if ($('play-level-4')) $('play-level-4').textContent = `${startText} 4${levels.four.name ? ': ' + levels.four.name : ''}`;
}

function loadModifiedBuiltInLevels() {
    const keys = ['one', 'two', 'three', 'four'];
    for (const key of keys) {
        try {
            const txt = localStorage.getItem(MODIFIED_BUILTIN_KEY_PREFIX + key);
            if (txt) {
                const data = JSON.parse(txt);
                if (levels[key]) Object.assign(levels[key], data);
            }
        } catch (e) { console.error(`Error loading modified built-in level ${key}:`, e); }
    }
}

function refreshCustomMenuButtons(){
    const startText = T('menu_start_custom');
    for (let i=1;i<=CUSTOM_SLOTS;i++){
        const row = $(`custom-level-row-${i}`);
        const playBtn=$(`play-custom-${i}`);
        if (!row || !playBtn) continue;

        const txt=localStorage.getItem(SLOT_KEY(i));
        if (txt){
            const nm=localStorage.getItem(SLOT_NAME_KEY(i)) || `${T('menu_custom_levels')} ${i}`;
            row.style.display = 'flex';
            playBtn.textContent=`${startText} ${i}：${nm}`;
        } else {
            row.style.display = 'none';
        }
    }
}

(function boot(){
  loadGlobalSettings();
  const savedLang = localStorage.getItem(LANG_KEY);
  if (savedLang && i18n[savedLang]) currentLang = savedLang;
  loadModifiedBuiltInLevels();
  setupCommon3D();
  attachEditorMouse();
  bindEditorEvents();
  bindGameInputs();
  clock=new THREE.Clock();
  render();

  $('lang-switcher').value = currentLang;
  $('lang-switcher').addEventListener('change', (e) => setLanguage(e.target.value));
  $('victory').addEventListener('click', () => { $('victory').classList.add('hidden'); menu.classList.remove('hidden'); updateUIText(); });

  $('play-level-1').addEventListener('click', ()=> startGame(levels.one));
  $('play-level-2').addEventListener('click', ()=> startGame(levels.two));
  $('play-level-3').addEventListener('click', ()=> startGame(levels.three));
  $('play-level-4').addEventListener('click', ()=> startGame(levels.four));

  $('edit-level-1').addEventListener('click', ()=> setupEditor(levels.one, 'one', null));
  $('edit-level-2').addEventListener('click', ()=> setupEditor(levels.two, 'two', null));
  $('edit-level-3').addEventListener('click', ()=> setupEditor(levels.three, 'three', null));
  $('edit-level-4').addEventListener('click', ()=> setupEditor(levels.four, 'four', null));

  $('btn-resume').addEventListener('click', togglePause);
  $('btn-restart').addEventListener('click', ()=> { togglePause(); startGame(lastLevel, isTestingFromEditor); });
  $('btn-quit').addEventListener('click', ()=> { togglePause(); endGame(false); });
  $('btn-back-to-editor').addEventListener('click', () => {
    gameMode = 'menu'; // prevent update loop issues
    pausePanel.style.display = 'none';
    showHUD(false);
    try{ document.exitPointerLock(); } catch(e){}
    setupEditor(lastLevel, editingBuiltInKey, editingCustomSlot);
  });

  $('open-editor').addEventListener('click', ()=> {
      // Updated Blank Level Defaults
      const blankLevel = {
          name: "新关卡", gameMode: GameModes.ELIM, timer: 60, arenaSize: { width: 90, depth: 70 }, camera: { viewMode: ViewModes.FIRST, topDownAngle: DEFAULT_CAMERA_SETTINGS.topDownAngle, topDownDistance: DEFAULT_CAMERA_SETTINGS.topDownDistance, topDownYaw: DEFAULT_CAMERA_SETTINGS.topDownYaw }, playerStart: { x: 0, z: 20 },
          ground: { style: 'checkered', color: '#FFFFFF', patternColor: '#999999', textureScale: 5 },
          environment: {
              dayNightCycleEnabled: false, cycleDuration: 120, sunIntensityMultiplier: 0.1,
              defaultSkyColor: '#FFFFFF', daySkyColor: '#BDE3FF', nightSkyColor: '#0f172a',
              centralGemHeight: 50, centralGemIntensity: 0.5, centralGemColor: '#FFFFFF',
              lighthouseColor: '#FFFF00', lighthouseIntensity: 1.5, lighthouseTowerColor: '#888888', columnColor: '#FFFFFF'
          },
          turrets: [], walls: [], waypoints: []
      };
      setupEditor(blankLevel, null, null);
  });

  updateUIText();

  for (let i=1;i<=CUSTOM_SLOTS;i++){
      const playBtn=$(`play-custom-${i}`);
      const editBtn=$(`edit-custom-${i}`);
      if (playBtn) playBtn.addEventListener('click', ()=>{
          const txt=localStorage.getItem(SLOT_KEY(i));
          if (txt) startGame(JSON.parse(txt));
          else alert(T('alert_slot_empty'));
      });
      if (editBtn) editBtn.addEventListener('click', ()=>{
          const txt=localStorage.getItem(SLOT_KEY(i));
          if (txt) {
              const levelData = JSON.parse(txt);
              setupEditor(levelData, null, i);
          } else {
              alert(T('alert_slot_empty'));
          }
      });
  }
})();
