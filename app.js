// --- FIREBASE MULTIPLAYER CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDummyKeyForCompatMode991283",
    authDomain: "ciss-space-architect.firebaseapp.com",
    databaseURL: "https://ciss-space-architect-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ciss-space-architect",
    storageBucket: "ciss-space-architect.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456"
};

// Initialize Firebase if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let currentRoomCode = null;
let myAssignedRole = null; // 'cmd', 'eng', 'sci', 'fd', or null (solo)
let isHost = false;
let isSyncingFromRemote = false;

// JSONBin Configuration
const BIN_ID = "6aca8347ac6210605a260af8";
const SECRET_KEY = "$2a$10$ecFZJaddOFpTKUceuAmtLul1pA8X5H6hhiP2M5VOKEFq14UcriUD.";
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// Sound Effects
const audioClick = new Audio('click.mp3');
audioClick.volume = 0.2;

const audioAlarm = new Audio('alarm.mp3');
audioAlarm.volume = 0.3;

const audioAmbient = new Audio('ambient.mp3');
audioAmbient.loop = true;
audioAmbient.volume = 0.2;

const audioWin = new Audio('win.mp3');
audioWin.volume = 0.4;

const audioLose = new Audio('lose.mp3');
audioLose.volume = 0.4;

const audioLoader = new Audio('loader.mp3');
audioLoader.volume = 0.1;

function playClick() {
    audioClick.currentTime = 0;
    audioClick.play().catch(() => {});
}

let zipFlagCache = {};
let zipLoaded = false;
let cachedGlobalScores = [];

// Function to load and unzip flags.zip automatically when the game starts
async function loadFlagsFromZip() {
    if (zipLoaded) return;
    try {
        const response = await fetch('flags.zip');
        const blob = await response.blob();
        const zip = new JSZip();
        const contents = await zip.loadAsync(blob);
        
        // Loop through every file inside the zip and store them in memory
        for (let filename in contents.files) {
            if (!contents.files[filename].dir) {
                let fileData = await contents.files[filename].async("blob");
                // Create a temporary local URL for each flag image
                let blobUrl = URL.createObjectURL(fileData);
                // Clean filename (e.g., "af-flag.png" or "flags/af-flag.png" -> "af")
                let cleanName = filename.split('/').pop().replace('-flag.png', '').replace('.png', '').toLowerCase().trim();
                zipFlagCache[cleanName] = blobUrl;
            }
        }
        zipLoaded = true;
        console.log("Flags successfully extracted from ZIP archive!");
    } catch (err) {
        console.warn("Could not load flags.zip:", err);
    }
}

// Run this when your game boots up
loadFlagsFromZip();

// Function to update the flag preview image next to the dropdown selection
async function updateFlagPreview() {
    const flagSelect = document.getElementById('player-flag-select');
    const flagPreview = document.getElementById('selected-flag-preview');
    if (flagSelect && flagPreview) {
        let countryCode = flagSelect.value.toLowerCase().trim();
        
        // Wait until zip is ready, then pull the image URL from memory
        if (!zipLoaded) await loadFlagsFromZip();
        
        if (zipFlagCache[countryCode]) {
            flagPreview.src = zipFlagCache[countryCode];
        }
    }
}

// Destinations Database (Including 16 Psyche Asteroid)
const destinations = {
    Europa: {
        x: 350, y: 160, color: '#a6e3e9', name: 'Europa (Jupiter)',
        goal: 'Confirm subsurface liquid ocean & evaluate habitability / biosignatures.',
        reqPower: 350, reqShielding: 80, minCommKbps: 100,
        radiationHazard: true, distAU: 5.2
    },
    Titan: {
        x: 380, y: 160, color: '#f0a500', name: 'Titan (Saturn)',
        goal: 'Explore nitrogen atmosphere & map hydrocarbon seas for organic chemistry.',
        reqPower: 500, reqShielding: 40, minCommKbps: 50,
        radiationHazard: false, distAU: 9.5
    },
    Psyche: {
        x: 270, y: 100, color: '#c0c0c0', name: '16 Psyche Asteroid',
        goal: 'Map the metallic composition of the asteroid and investigate planetary core formation.',
        reqPower: 250, reqShielding: 30, minCommKbps: 40,
        radiationHazard: false, distAU: 3.0
    }
};

const launchVehicles = {
    FalconHeavy: { cost: 150, maxMass: 1500 },
    SLS: { cost: 800, maxMass: 3000 }
};

const powerSystems = {
    Solar: { cost: 50, mass: 200, power: 200 },
    RTG: { cost: 200, mass: 150, power: 600 }
};

const commSystems = {
    LGA: { cost: 20, mass: 50, kbps: 10 },
    HGA: { cost: 80, mass: 120, kbps: 500 },
    Laser: { cost: 180, mass: 80, kbps: 5000 }
};

const instruments = {
    Camera: { cost: 40, mass: 60, sciencePoints: 50, dataRequirement: 50 },
    Radar: { cost: 150, mass: 220, sciencePoints: 120, dataRequirement: 400 },
    Spectrometer: { cost: 110, mass: 100, sciencePoints: 90, dataRequirement: 250 }
};

// Global State
let gameMode = "single"; // "single" or "team"
let crewRoster = { cmd: "", eng: "", sci: "", fd: "" };
let teamObjectivesMet = 0;

let activeTarget = destinations.Europa;
let totalBudget = 1000;
let isMissionActive = false;
let probeProgress = 0;
let speed = 0.001;
let missionStatus = "Awaiting Launch";

let totalCost = 0;
let totalMass = 0;
let maxMass = 1500;
let totalPower = 0;
let totalKbps = 0;
let currentShielding = 50;
let sciencePoints = 0;
let selectedRoute = "Direct";

let anomalyTriggered = false;
let anomalyResolved = false;
let currentActiveChallenge = null;

// High Score Persistence
let highScore = localStorage.getItem('space_architect_highscore') || 0;
const highScoreElem = document.getElementById('high-score-val');
if (highScoreElem) highScoreElem.innerText = highScore;

// --- MULTIPLAYER LOBBY UI FLOW & SYNCHRONIZATION ---
function startSolo() {
    playClick();
    gameMode = "single";
    myAssignedRole = null;
    closeWelcomeModal();
}

function showHostScreen() {
    playClick();
    gameMode = "team";
    isHost = true;
    myAssignedRole = "cmd"; // Host defaults to Commander

    // Generate random 4-digit room code
    currentRoomCode = Math.floor(1000 + Math.random() * 9000).toString();

    document.getElementById('lobby-main').style.display = 'none';
    document.getElementById('lobby-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = currentRoomCode;
    document.getElementById('role-display-text').innerText = "Role Assigned: 👑 Commander (Host) | Waiting for crew members...";

    // Initialize Firebase Room Entry
    db.ref('rooms/' + currentRoomCode).set({
        host: "Commander",
        state: {
            target: "Europa",
            difficulty: "Commander",
            route: "Direct",
            launcher: "FalconHeavy",
            power: "Solar",
            comm: "HGA",
            instrument: "Camera",
            shield: 50,
            launchTriggered: false
        }
    });

    listenToRoomSync();
    applyRoleAccessControl();
}

function showJoinScreen() {
    playClick();
    gameMode = "team";
    isHost = false;

    document.getElementById('lobby-main').style.display = 'none';
    document.getElementById('lobby-join').style.display = 'block';
}

function joinMultiplayerRoom() {
    playClick();
    const codeInput = document.getElementById('join-room-code');
    const roleSelect = document.getElementById('join-role');

    if (!codeInput || !codeInput.value.trim()) {
        alert("Please enter a valid 4-digit room code.");
        return;
    }

    currentRoomCode = codeInput.value.trim();
    myAssignedRole = roleSelect.value;

    db.ref('rooms/' + currentRoomCode).once('value', (snapshot) => {
        if (snapshot.exists()) {
            document.getElementById('lobby-join').style.display = 'none';
            document.getElementById('lobby-active').style.display = 'block';
            document.getElementById('display-room-code').innerText = currentRoomCode;
            document.getElementById('role-display-text').innerText = `Role Assigned: ${roleSelect.options[roleSelect.selectedIndex].text}`;
            
            listenToRoomSync();
            applyRoleAccessControl();
        } else {
            alert("⚠️ Room code not found! Please check the code with your host.");
        }
    });
}

function applyRoleAccessControl() {
    if (!myAssignedRole) return; // Solo mode = full access

    // Disable all controls initially
    const controlIDs = ['control-target', 'control-difficulty', 'control-route', 'control-launcher', 'control-power', 'control-comm', 'control-instrument', 'control-shield'];
    controlIDs.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.style.opacity = '0.3';
    });

    // Enable only controls assigned to my role
    let enabledIDs = [];
    if (myAssignedRole === 'cmd') enabledIDs = ['control-target', 'control-difficulty', 'control-launcher'];
    else if (myAssignedRole === 'eng') enabledIDs = ['control-power', 'control-shield'];
    else if (myAssignedRole === 'sci') enabledIDs = ['control-target', 'control-instrument'];
    else if (myAssignedRole === 'fd') enabledIDs = ['control-route', 'control-comm'];

    enabledIDs.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.style.opacity = '1.0';
    });

    console.log(`🔒 Role Access Control applied for: ${myAssignedRole}`);
}

function pushStateToNetwork() {
    if (!currentRoomCode || isSyncingFromRemote) return;

    // Only allow pushing state if player has permission for that control
    const statePayload = {
        target: activeTarget ? (activeTarget.name.includes('Europa') ? 'Europa' : activeTarget.name.includes('Titan') ? 'Titan' : 'Psyche') : 'Europa',
        difficulty: document.getElementById('difficulty-select') ? document.getElementById('difficulty-select').value : 'Commander',
        route: document.getElementById('route-select') ? document.getElementById('route-select').value : 'Direct',
        launcher: document.getElementById('launcher-select') ? document.getElementById('launcher-select').value : 'FalconHeavy',
        power: document.getElementById('power-select') ? document.getElementById('power-select').value : 'Solar',
        comm: document.getElementById('comm-select') ? document.getElementById('comm-select').value : 'HGA',
        instrument: document.getElementById('instrument-select') ? document.getElementById('instrument-select').value : 'Camera',
        shield: document.getElementById('shield-slider') ? document.getElementById('shield-slider').value : '50',
        launchTriggered: false
    };

    db.ref('rooms/' + currentRoomCode + '/state').set(statePayload);
    updateSettings();
}

function listenToRoomSync() {
    if (!currentRoomCode) return;

    db.ref('rooms/' + currentRoomCode + '/state').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        isSyncingFromRemote = true;

        if (data.target) {
            let targetKey = data.target;
            if (destinations[targetKey]) {
                activeTarget = destinations[targetKey];
                document.querySelectorAll('.target-card').forEach(card => card.classList.remove('active'));
            }
        }
        if (data.difficulty && document.getElementById('difficulty-select')) {
            document.getElementById('difficulty-select').value = data.difficulty;
            updateDifficulty();
        }
        if (data.route && document.getElementById('route-select')) document.getElementById('route-select').value = data.route;
        if (data.launcher && document.getElementById('launcher-select')) document.getElementById('launcher-select').value = data.launcher;
        if (data.power && document.getElementById('power-select')) document.getElementById('power-select').value = data.power;
        if (data.comm && document.getElementById('comm-select')) document.getElementById('comm-select').value = data.comm;
        if (data.instrument && document.getElementById('instrument-select')) document.getElementById('instrument-select').value = data.instrument;
        if (data.shield && document.getElementById('shield-slider')) document.getElementById('shield-slider').value = data.shield;

        updateSettings();
        isSyncingFromRemote = false;

        if (data.launchTriggered && !isMissionActive) {
            startMission();
        }
    });
}

function handleLaunchClick() {
    if (currentRoomCode) {
        db.ref('rooms/' + currentRoomCode + '/state/launchTriggered').set(true);
    }
    startMission();
}

// --- MISSION REPORT PAGE OPENER ---
function downloadMissionReportPDF() {
    const playerName = document.getElementById('player-name-input') ? document.getElementById('player-name-input').value.trim() : "Commander";
    const scoreVal = document.getElementById('current-score') ? document.getElementById('current-score').innerText : "0";
    const gradeVal = document.getElementById('current-grade') ? document.getElementById('current-grade').innerText : "N/A";
    const targetName = activeTarget ? activeTarget.name : "Unknown Target";
    const difficultyElem = document.getElementById('difficulty-select');
    const difficulty = difficultyElem ? difficultyElem.value : "Commander";
    const launcherElem = document.getElementById('launcher-select');
    const powerElem = document.getElementById('power-select');
    const commElem = document.getElementById('comm-select');
    const instElem = document.getElementById('instrument-select');
    const routeElem = document.getElementById('route-select');
    
    // Determine dynamic analysis paragraph based on mission parameters & result
    let analysisText = "";
    const isFail = gradeVal === 'F' || gradeVal === 'C' || parseInt(scoreVal) === 0;
    
    if (isFail) {
        let reasons = [];
        let recommendations = [];
        
        if (activeTarget.radiationHazard && currentShielding < activeTarget.reqShielding) {
            reasons.push(`insufficient radiation shielding (${currentShielding}%, whereas ${activeTarget.name} requires at least ${activeTarget.reqShielding}%)`);
            recommendations.push(`increase the Radiation Shielding slider to match or exceed ${activeTarget.reqShielding}% to protect avionics from particle degradation`);
        }
        if (totalPower < activeTarget.reqPower) {
            reasons.push(`suboptimal power generation (${totalPower}W delivered vs ${activeTarget.reqPower}W required)`);
            recommendations.push(`upgrade to a Nuclear RTG or balance your solar output to prevent power brownouts in deep space`);
        }
        if (totalKbps < activeTarget.minCommKbps) {
            reasons.push(`insufficient communications bandwidth (${totalKbps} kbps provided vs ${activeTarget.minCommKbps} kbps minimum uplink required)`);
            recommendations.push(`equip a High-Gain Dish or Laser Comms system to ensure high-speed data transmission back to Earth`);
        }
        
        if (reasons.length === 0) {
            reasons.push("unresolved telemetry anomalies or strict hazard constraints during transit");
            recommendations.push("optimize your payload and route trajectory carefully during flight maneuvers");
        }

        analysisText = `<strong>MISSION FAILURE ANALYSIS:</strong> This mission encountered critical system failures primarily caused by ${reasons.join(' and ')}. Because telemetry thresholds were breached, the spacecraft suffered permanent degradation or loss of communication.<br><br><strong>RECOMMENDATION FOR HIGHER SCORE:</strong> To successfully complete this mission profile and achieve a passing grade, you should ${recommendations.join(', and ')}. Keeping a close eye on your budget and mass caps will allow you to upgrade these crucial subsystems.`;
    } else {
        analysisText = `<strong>MISSION SUCCESS ANALYSIS:</strong> Exceptional engineering! All baseline scientific requirements for ${targetName} were successfully met, preserving structural integrity, power output, and communication throughput throughout the interplanetary transit.<br><br><strong>RECOMMENDATION FOR HIGHER SCORE:</strong> To maximize your Science Yield and push your score into the elite S-Grade tier (>1200 PTS), try utilizing the <em>Gravity Assist Flyby</em> route to save budget credits, keep unused budget margins high for the financial bonus multiplier, and pair high-volume instruments (like Radar) with Laser Communications to eliminate data bottlenecks.`;
    }
    
    // Open a new clean browser window / tab
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
        alert("⚠️ Popup blocked! Please allow popups for this site to view your Mission Report.");
        return;
    }

   // Direct SVG-based CISS emblem favicon matching your UI theme
    const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#0d1117" stroke="#58a6ff" stroke-width="8"/><circle cx="50" cy="50" r="25" fill="none" stroke="#f85149" stroke-width="6"/><line x1="50" y1="5" x2="50" y2="95" stroke="#58a6ff" stroke-width="4"/><line x1="5" y1="50" x2="95" y2="50" stroke="#58a6ff" stroke-width="4"/><circle cx="50" cy="50" r="8" fill="#58a6ff"/></svg>`;
    const cissFaviconSvg = `data:image/svg+xml,${encodeURIComponent(rawSvg)}`;

    reportWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>CISS - Mission Report (${playerName})</title>
            <link rel="icon" type="image/svg+xml" href="${cissFaviconSvg}">
            <style>
                body {
                    background-color: #0d1117;
                    color: #c9d1d9;
                    font-family: 'Courier New', Courier, monospace;
                    padding: 40px;
                    margin: 0;
                }
                .report-container {
                    max-width: 750px;
                    margin: auto;
                    background: #161b22;
                    border: 1px solid #30363d;
                    border-radius: 8px;
                    padding: 40px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                }
                h1 {
                    color: #58a6ff;
                    font-size: 1.5rem;
                    border-bottom: 2px solid #30363d;
                    padding-bottom: 10px;
                    margin-top: 0;
                }
                .subtitle {
                    color: #8b949e;
                    font-size: 0.85rem;
                    margin-top: -5px;
                    margin-bottom: 30px;
                }
                .grid-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin: 20px 0;
                }
                .card {
                    background: #0d1117;
                    border: 1px solid #30363d;
                    padding: 20px;
                    border-radius: 6px;
                }
                .analysis-card {
                    background: #0d1117;
                    border: 1px solid ${isFail ? '#f85149' : '#238636'};
                    padding: 20px;
                    border-radius: 6px;
                    margin-top: 25px;
                    font-size: 0.85rem;
                    line-height: 1.6;
                }
                .badge {
                    background: ${isFail ? '#f85149' : '#238636'};
                    color: white;
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-weight: bold;
                }
                p {
                    line-height: 1.6;
                    margin: 8px 0;
                }
                .footer {
                    margin-top: 40px;
                    font-size: 0.75rem;
                    color: #8b949e;
                    text-align: center;
                    border-top: 1px solid #30363d;
                    padding-top: 15px;
                }
            </style>
        </head>
        <body>
            <div class="report-container">
                <h1>CEYLON INSTITUTE OF SPACE SCIENCE (CISS)</h1>
                <div class="subtitle">OFFICIAL INTERPLANETARY MISSION ARCHITECT REPORT</div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
                    <div>
                        <p><strong>PILOT CALLSIGN:</strong> ${playerName}</p>
                        <p><strong>MISSION TIER:</strong> ${difficulty}</p>
                        <p><strong>TARGET DESTINATION:</strong> ${targetName}</p>
                    </div>
                    <div style="text-align: right;">
                        <p><strong>MISSION GRADE:</strong> <span class="badge">${gradeVal}</span></p>
                        <p><strong>SCIENCE YIELD:</strong> ${scoreVal} PTS</p>
                    </div>
                </div>

                <h2 style="color: #2ea043; font-size: 1.1rem; border-bottom: 1px solid #30363d; padding-bottom: 6px; margin-top: 30px;">SPACECRAFT CONFIGURATION & METRICS</h2>
                <div class="grid-2">
                    <div class="card">
                        <p><strong>Launch Vehicle:</strong> ${launcherElem ? launcherElem.value : 'N/A'}</p>
                        <p><strong>Power Generator:</strong> ${powerElem ? powerElem.value : 'N/A'} (${totalPower}W)</p>
                        <p><strong>Communications:</strong> ${commElem ? commElem.value : 'N/A'} (${totalKbps} kbps)</p>
                    </div>
                    <div class="card">
                        <p><strong>Scientific Instrument:</strong> ${instElem ? instElem.value : 'N/A'}</p>
                        <p><strong>Flight Route:</strong> ${routeElem ? routeElem.value : 'Direct'}</p>
                        <p><strong>Radiation Shielding:</strong> ${currentShielding}% ($${Math.round(currentShielding * 2)}M)</p>
                    </div>
                </div>

                <h2 style="color: #2ea043; font-size: 1.1rem; border-bottom: 1px solid #30363d; padding-bottom: 6px; margin-top: 30px;">FINANCIAL & TELEMETRY STATUS</h2>
                <div class="card">
                    <p><strong>Total Mission Cost:</strong> $${totalCost}M / Budget: $${totalBudget}M</p>
                    <p><strong>Payload Mass Used:</strong> ${totalMass} kg / Max Capacity: ${maxMass} kg</p>
                    <p><strong>Mission Status:</strong> ${missionStatus}</p>
                </div>

                <div class="analysis-card">
                    <h3 style="color: ${isFail ? '#f85149' : '#2ea043'}; margin-top: 0; font-size: 1rem;">📋 MISSION DEBRIEF & OPTIMIZATION ANALYSIS</h3>
                    <p>${analysisText}</p>
                </div>

                <div class="footer">
                    © 2026 Ceylon Institute of Space Science (CISS) • Generated via Space Mission Systems Architect Simulation
                </div>
            </div>
        </body>
        </html>
    `);
    reportWindow.document.close();
}

// --- MISSION ARCHIVE & COMPARE SYSTEM ---
function getCurrentBlueprintData() {
    return {
        target: activeTarget ? (activeTarget.name.includes('Europa') ? 'Europa' : activeTarget.name.includes('Titan') ? 'Titan' : 'Psyche') : 'Europa',
        difficulty: document.getElementById('difficulty-select') ? document.getElementById('difficulty-select').value : 'Commander',
        route: document.getElementById('route-select') ? document.getElementById('route-select').value : 'Direct',
        launcher: document.getElementById('launcher-select') ? document.getElementById('launcher-select').value : 'FalconHeavy',
        power: document.getElementById('power-select') ? document.getElementById('power-select').value : 'Solar',
        comm: document.getElementById('comm-select') ? document.getElementById('comm-select').value : 'HGA',
        instrument: document.getElementById('instrument-select') ? document.getElementById('instrument-select').value : 'Camera',
        shield: document.getElementById('shield-slider') ? document.getElementById('shield-slider').value : '50',
        score: document.getElementById('current-score') ? document.getElementById('current-score').innerText : '0',
        grade: document.getElementById('current-grade') ? document.getElementById('current-grade').innerText : 'N/A'
    };
}

function getPlayerStorageKey() {
    const nameInput = document.getElementById('player-name-input');
    const callsign = nameInput ? nameInput.value.trim().toLowerCase() : 'commander';
    return `saved_missions_${callsign}`;
}

function archiveCurrentMission() {
    let missionRecord = getCurrentBlueprintData();
    let storageKey = getPlayerStorageKey();
    let savedList = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    // Add timestamp for date & time display
    missionRecord.timestamp = new Date().toLocaleString();
    
    savedList.push(missionRecord);
    localStorage.setItem(storageKey, JSON.stringify(savedList));
}

function openComparePage() {
    archiveCurrentMission();
    const nameInput = document.getElementById('player-name-input');
    const callsign = nameInput ? nameInput.value.trim() : 'Commander';
    
    // Pass the player's callsign via URL so the compare page knows whose missions to load
    window.open(`compare.html?player=${encodeURIComponent(callsign)}`, '_blank');
}

// Automatically load design parameters if someone opens a shared link
window.addEventListener('DOMContentLoaded', () => {
    initThreeHangar();
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('target')) {
        setTimeout(() => {
            let targetKey = urlParams.get('target');
            if (targetKey && destinations[targetKey]) {
                selectTarget(targetKey);
            }
            if (urlParams.get('difficulty')) {
                document.getElementById('difficulty-select').value = urlParams.get('difficulty');
                updateDifficulty();
            }
            if (urlParams.get('route')) document.getElementById('route-select').value = urlParams.get('route');
            if (urlParams.get('launcher')) document.getElementById('launcher-select').value = urlParams.get('launcher');
            if (urlParams.get('power')) document.getElementById('power-select').value = urlParams.get('power');
            if (urlParams.get('comm')) document.getElementById('comm-select').value = urlParams.get('comm');
            if (urlParams.get('instrument')) document.getElementById('instrument-select').value = urlParams.get('instrument');
            if (urlParams.get('shield')) {
                document.getElementById('shield-slider').value = urlParams.get('shield');
            }
            if (urlParams.get('name')) {
                document.getElementById('player-name-input').value = urlParams.get('name');
            }
            updateSettings();
        }, 300);
    }
});

// Handle Difficulty Selection Changes
function updateDifficulty() {
    const diffSelect = document.getElementById('difficulty-select');
    if (!diffSelect) return;

    const diff = diffSelect.value;
    if (diff === "Cadet") {
        totalBudget = 1500;
    } else if (diff === "Commander") {
        totalBudget = 1000;
    } else if (diff === "Architect") {
        totalBudget = 750;
    }
    
    updateSettings();
}

// Fetch & Display Live Global Leaderboard with Filtering Support
async function loadGlobalLeaderboard() {
    const tableBody = document.getElementById('leaderboard-body');
    if (!tableBody) return;

    try {
        if (!zipLoaded) await loadFlagsFromZip();

        const response = await fetch(`${API_URL}/latest`, {
            method: 'GET',
            headers: { 
                'X-Master-Key': SECRET_KEY 
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Key/Bin Mismatch`);
        }

        const resData = await response.json();
        const binRecord = resData.record || resData;

        let list = [];
        if (Array.isArray(binRecord)) {
            list = binRecord;
        } else if (binRecord && Array.isArray(binRecord.scores)) {
            list = binRecord.scores;
        }

        cachedGlobalScores = list;
        renderLeaderboardTable(cachedGlobalScores);

    } catch (err) {
        console.warn("Leaderboard fetch error:", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #f0883e;">
                    📡 Telemetry Link Offline (Verify Bin ID / API Key)
                </td>
            </tr>`;
    }
}

function renderLeaderboardTable(dataList) {
    const tableBody = document.getElementById('leaderboard-body');
    if (!tableBody) return;

    // Apply active dropdown filters
    const filterTarget = document.getElementById('filter-target') ? document.getElementById('filter-target').value : 'ALL';
    const filterDiff = document.getElementById('filter-difficulty') ? document.getElementById('filter-difficulty').value : 'ALL';

    let filtered = dataList.filter(entry => {
        let matchTarget = (filterTarget === 'ALL' || (entry.target && entry.target.toLowerCase().includes(filterTarget.toLowerCase())));
        let matchDiff = (filterDiff === 'ALL' || (entry.difficulty && entry.difficulty.toLowerCase() === filterDiff.toLowerCase()));
        return matchTarget && matchDiff;
    });

    // Sort descending by score
    filtered.sort((a, b) => b.score - a.score);

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #8b949e;">No records match selected filters.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    filtered.slice(0, 15).forEach((entry, index) => {
        const row = document.createElement('tr');
        
        let flagCode = entry.country ? entry.country.toLowerCase().trim() : 'af';
        let flagUrl = zipFlagCache[flagCode] || zipFlagCache[flagCode + '-flag'] || '';

        row.innerHTML = `
            <td>#${index + 1}</td>
            <td style="text-align: center;">
                <img src="${flagUrl}" alt="${flagCode}" style="width: 22px; height: 16px; vertical-align: middle; border-radius: 2px; object-fit: cover;">
            </td>
            <td>${entry.name || 'Commander'}</td>
            <td>${entry.target || 'N/A'}</td>
            <td><span style="font-size: 0.75rem; padding: 2px 6px; background: #21262d; border: 1px solid #30363d; border-radius: 3px;">${entry.difficulty || 'Commander'}</span></td>
            <td>${entry.score || 0}</td>
            <td><strong>${entry.grade || 'F'}</strong></td>
        `;
        tableBody.appendChild(row);
    });
}

function filterLeaderboardData() {
    renderLeaderboardTable(cachedGlobalScores);
}

// Submit Scores Live with Difficulty Tier Included
async function submitLiveScore() {
    const submitBtn = document.getElementById('submit-score-btn');
    const submitStatus = document.getElementById('submit-status');
    
    const playerName = document.getElementById('player-name-input') ? document.getElementById('player-name-input').value.trim() : "Commander";
    const playerFlag = document.getElementById('player-flag-select') ? document.getElementById('player-flag-select').value : "af";
    const difficultyElem = document.getElementById('difficulty-select');
    const currentDifficulty = difficultyElem ? difficultyElem.value : "Commander";
    const currentScore = parseInt(document.getElementById('current-score').innerText) || 0;
    const currentGrade = document.getElementById('current-grade').innerText;

    if (currentScore <= 0) {
        if (submitStatus) submitStatus.innerText = "❌ Only successful missions can be submitted!";
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (submitStatus) submitStatus.innerText = "Transmitting telemetry data to Earth...";

    try {
        const getRes = await fetch(`${API_URL}/latest`, {
            method: 'GET',
            headers: { 
                'X-Master-Key': SECRET_KEY 
            }
        });
        
        if (!getRes.ok) {
            throw new Error(`GET failed with status ${getRes.status}`);
        }

        const getResult = await getRes.json();
        let binRecord = getResult.record !== undefined ? getResult.record : getResult;
        
        let binData = { scores: [], reviews: [], blueprints: [] };
        if (Array.isArray(binRecord)) {
            binData.scores = binRecord;
        } else if (binRecord && typeof binRecord === 'object') {
            binData.scores = Array.isArray(binRecord.scores) ? binRecord.scores : [];
            binData.reviews = Array.isArray(binRecord.reviews) ? binRecord.reviews : [];
            binData.blueprints = Array.isArray(binRecord.blueprints) ? binRecord.blueprints : [];
        }

        const newEntry = {
            name: playerName,
            country: playerFlag,
            score: currentScore,
            target: activeTarget.name.includes('Psyche') ? 'Psyche' : activeTarget.name.split(' ')[0],
            difficulty: currentDifficulty,
            grade: currentGrade
        };
        binData.scores.push(newEntry);

        const putRes = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': SECRET_KEY
            },
            body: JSON.stringify(binData)
        });

        if (putRes.ok) {
            if (submitStatus) submitStatus.innerText = "✅ Transmission confirmed! Leaderboard updated.";
            loadGlobalLeaderboard();
        } else {
            const errorBody = await putRes.text();
            console.error("JSONBin PUT Error Response:", errorBody);
            throw new Error(`PUT failed with status ${putRes.status}`);
        }
    } catch (err) {
        console.error("Live Score Submission Exception:", err);
        if (submitStatus) submitStatus.innerText = "❌ Transmission error. Check console logs.";
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Handle Player Review Submission
async function submitPlayerReview() {
    const nameInput = document.getElementById('reviewer-name');
    const commentInput = document.getElementById('review-comment');
    const statusElem = document.getElementById('review-status');

    if (!nameInput || !commentInput || !statusElem) return;

    const name = nameInput.value.trim();
    const comment = commentInput.value.trim();

    if (!name || !comment) {
        statusElem.style.color = '#f85149';
        statusElem.innerText = "❌ Please enter your name and comment!";
        return;
    }

    statusElem.style.color = '#58a6ff';
    statusElem.innerText = "📡 Transmitting review to ground station...";

    try {
        const getRes = await fetch(`${API_URL}/latest`, {
            method: 'GET',
            headers: { 'X-Master-Key': SECRET_KEY }
        });
        
        const getResult = await getRes.json();
        let binRecord = getResult.record !== undefined ? getResult.record : getResult;

        let binData = { scores: [], reviews: [], blueprints: [] };
        if (Array.isArray(binRecord)) {
            binData.scores = binRecord;
        } else if (binRecord && typeof binRecord === 'object') {
            binData.scores = Array.isArray(binRecord.scores) ? binRecord.scores : [];
            binData.reviews = Array.isArray(binRecord.reviews) ? binRecord.reviews : [];
            binData.blueprints = Array.isArray(binRecord.blueprints) ? binRecord.blueprints : [];
        }

        binData.reviews.push({
            name: name,
            comment: comment,
            date: new Date().toISOString()
        });

        const putRes = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': SECRET_KEY
            },
            body: JSON.stringify(binData)
        });

        if (putRes.ok) {
            statusElem.style.color = '#2ea043';
            statusElem.innerText = "✅ Review received! Thank you, Commander.";
            commentInput.value = '';
        } else {
            throw new Error("Failed to save review.");
        }
    } catch (err) {
        console.error(err);
        statusElem.style.color = '#f85149';
        statusElem.innerText = "❌ Transmission error. Check network.";
    }
}

function updateSettings() {
    const launcherElem = document.getElementById('launcher-select');
    const powerElem = document.getElementById('power-select');
    const commElem = document.getElementById('comm-select');
    const instElem = document.getElementById('instrument-select');
    const routeElem = document.getElementById('route-select');
    const shieldElem = document.getElementById('shield-slider');

    if (!launcherElem || !powerElem || !commElem || !instElem) return;

    const launcherKey = launcherElem.value;
    const powerKey = powerElem.value;
    const commKey = commElem.value;
    const instKey = instElem.value;
    selectedRoute = routeElem ? routeElem.value : "Direct";
    currentShielding = shieldElem ? parseInt(shieldElem.value) : 50;

    const shieldCost = Math.round(currentShielding * 2);
    const shieldMass = Math.round(currentShielding * 5);

    if (document.getElementById('shield-val')) document.getElementById('shield-val').innerText = currentShielding;
    if (document.getElementById('shield-cost')) document.getElementById('shield-cost').innerText = shieldCost;
    if (document.getElementById('shield-mass')) document.getElementById('shield-mass').innerText = shieldMass;

    const launcher = launchVehicles[launcherKey];
    const power = powerSystems[powerKey];
    const comm = commSystems[commKey];
    const inst = instruments[instKey];

    sciencePoints = inst.sciencePoints;
    maxMass = launcher.maxMass;
    
    let routeCostDiscount = selectedRoute === "GravityAssist" ? 50 : 0;
    speed = selectedRoute === "GravityAssist" ? 0.0004 : 0.001;

    totalCost = (launcher.cost + power.cost + comm.cost + inst.cost + shieldCost) - routeCostDiscount;
    totalMass = power.mass + comm.mass + inst.mass + shieldMass;
    
    totalPower = power.power;
    totalKbps = comm.kbps;

    const budgetRemaining = totalBudget - totalCost;
    if (document.getElementById('budget-left')) document.getElementById('budget-left').innerText = budgetRemaining;
    if (document.getElementById('mass-used')) document.getElementById('mass-used').innerText = totalMass;
    if (document.getElementById('max-mass')) document.getElementById('max-mass').innerText = maxMass;

    // SYNC REAL-TIME RESOURCE DASHBOARD UI IN SECTION 6
    const dashPower = document.getElementById('dash-power');
    const dashKbps = document.getElementById('dash-kbps');
    const dashShield = document.getElementById('dash-shield');
    if (dashPower) dashPower.innerText = `${totalPower}W / ${activeTarget.reqPower}W Req`;
    if (dashKbps) dashKbps.innerText = `${totalKbps} kbps`;
    if (dashShield) dashShield.innerText = `${currentShielding}%`;

    const trackerBox = document.querySelector('.tracker-box');
    if (trackerBox) {
        trackerBox.style.borderColor = (budgetRemaining < 0 || totalMass > maxMass) ? '#f85149' : '#238636';
    }

    rebuildThreeSpacecraftModel();
}

function selectTarget(name, element) {
    if (destinations[name]) {
        activeTarget = destinations[name];
        isMissionActive = false;
        probeProgress = 0;
        
        if (element) {
            document.querySelectorAll('.target-card').forEach(card => card.classList.remove('active'));
            element.classList.add('active');
        }

        if (document.getElementById('target-display')) document.getElementById('target-display').innerText = "Selected Target: " + activeTarget.name + " | Distance: " + activeTarget.distAU + " AU";
        if (document.getElementById('debrief-text')) document.getElementById('debrief-text').innerText = "Target changed to " + name + ". Design systems to achieve: " + activeTarget.goal;
        if (document.getElementById('score-display')) document.getElementById('score-display').classList.add('hidden');
        
        updateSettings();
    }
}

function startMission() {
    const budgetRemaining = totalBudget - totalCost;

    if (budgetRemaining < 0) {
        alert("CRITICAL WARNING: Budget Limit Exceeded!");
        return;
    }
    if (totalMass > maxMass) {
        alert("CRITICAL WARNING: Payload Capacity Exceeded!");
        return;
    }

    probeProgress = 0;
    isMissionActive = true;
    anomalyTriggered = false;
    anomalyResolved = false;
    if (document.getElementById('anomaly-alert')) document.getElementById('anomaly-alert').classList.add('hidden');
    if (document.getElementById('score-display')) document.getElementById('score-display').classList.add('hidden');
     
    missionStatus = "TRANSIT INITIATED...";
    if (document.getElementById('debrief-text')) document.getElementById('debrief-text').innerText = "Spacecraft en route to " + activeTarget.name + "...";

    // Update Dashboard Badge to ACTIVE
    const dashBadge = document.getElementById('dash-status-badge');
    if (dashBadge) {
        dashBadge.innerText = "IN TRANSIT";
        dashBadge.style.background = "#1f6feb";
    }

    const viewportSection = document.querySelector('.viewport');
    if (viewportSection) {
        viewportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Procedural Spacecraft Assembly Renderer (For Flight Canvas)
function drawProceduralSpacecraft(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    const launcherKey = document.getElementById('launcher-select') ? document.getElementById('launcher-select').value : 'FalconHeavy';
    const powerKey = document.getElementById('power-select') ? document.getElementById('power-select').value : 'Solar';
    const commKey = document.getElementById('comm-select') ? document.getElementById('comm-select').value : 'HGA';

    const scale = launcherKey === 'SLS' ? 1.25 : 1.0;
    ctx.scale(scale, scale);

    // 1. Central Spacecraft Bus
    ctx.fillStyle = '#d4af37'; 
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeRect(-8, -8, 16, 16);

    // 2. Power Systems
    if (powerKey === 'Solar') {
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(-34, -4, 22, 8);
        ctx.fillRect(12, -4, 22, 8);
        
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-34, -4, 22, 8);
        ctx.strokeRect(12, -4, 22, 8);
    } else {
        ctx.fillStyle = '#374151';
        ctx.fillRect(-3, -16, 6, 8);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-2, -14, 4, 4);
    }

    // 3. Communications Systems
    if (commKey === 'Laser') {
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(-2, -18, 4, 6);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(-1, -17, 2, 2);
    } else if (commKey === 'HGA') {
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -12, 7, Math.PI, 0, false);
        ctx.stroke();
    } else {
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(0, -14);
        ctx.stroke();
    }

    // 4. Engine Exhaust Plume during flight
    if (isMissionActive) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(-4, 8);
        ctx.lineTo(0, 16 + Math.random() * 6);
        ctx.lineTo(4, 8);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

// --- REALISTIC THREE.JS 3D HANGAR INSPECTION ENGINE ---
let threeScene, threeCamera, threeRenderer, spacecraftGroup;
let isDragging3D = false;
let previousMousePosition = { x: 0, y: 0 };
let targetRotationX = 0.3;
let targetRotationY = 0.5;

function initThreeHangar() {
    const container = document.getElementById('hangar-container');
    if (!container) return;

    // 1. Scene & Camera Setup
    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    threeCamera.position.set(0, 3, 8);
    threeCamera.lookAt(0, 0, 0);

    // 2. WebGL Renderer
    threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    threeRenderer.setSize(container.clientWidth, container.clientHeight);
    threeRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(threeRenderer.domElement);

    // 3. Lighting for realistic 3D metallic surfaces & depth
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    threeScene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(5, 10, 7);
    threeScene.add(sunLight);

    const blueRimLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    blueRimLight.position.set(-5, -5, -5);
    threeScene.add(blueRimLight);

    // 4. Master Spacecraft Group
    spacecraftGroup = new THREE.Group();
    threeScene.add(spacecraftGroup);

    // Initial build of the 3D model based on default selections
    rebuildThreeSpacecraftModel();

    // 5. Mouse Dragging & Orbit Rotation Controls
    container.addEventListener('mousedown', (e) => {
        isDragging3D = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging3D) return;
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        targetRotationY += deltaX * 0.01;
        targetRotationX += deltaY * 0.01;

        // Clamp vertical rotation so it doesn't flip completely upside down
        targetRotationX = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, targetRotationX));

        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
        isDragging3D = false;
        if (container) container.style.cursor = 'grab';
    });

    // Touch support for mobile devices
    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging3D = true;
            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    });

    window.addEventListener('touchmove', (e) => {
        if (!isDragging3D || e.touches.length !== 1) return;
        const deltaX = e.touches[0].clientX - previousMousePosition.x;
        const deltaY = e.touches[0].clientY - previousMousePosition.y;

        targetRotationY += deltaX * 0.01;
        targetRotationX += deltaY * 0.01;

        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    });

    window.addEventListener('touchend', () => { isDragging3D = false; });

    // 6. Render Loop with smooth easing
    function animateThree() {
        requestAnimationFrame(animateThree);

        // Smooth interpolation (lerp) toward target rotation for fluidity
        spacecraftGroup.rotation.y += (targetRotationY - spacecraftGroup.rotation.y) * 0.1;
        spacecraftGroup.rotation.x += (targetRotationX - spacecraftGroup.rotation.x) * 0.1;

        // Subtle idle float animation when not dragging
        if (!isDragging3D) {
            targetRotationY += 0.003; 
        }

        threeRenderer.render(threeScene, threeCamera);
    }
    animateThree();
}

// Rebuilds the 3D geometry mesh whenever dropdown configurations change
function rebuildThreeSpacecraftModel() {
    if (!spacecraftGroup) return;

    // Clear previous meshes
    while (spacecraftGroup.children.length > 0) { 
        spacecraftGroup.remove(spacecraftGroup.children[0]); 
    }

    const launcherKey = document.getElementById('launcher-select') ? document.getElementById('launcher-select').value : 'FalconHeavy';
    const powerKey = document.getElementById('power-select') ? document.getElementById('power-select').value : 'Solar';
    const commKey = document.getElementById('comm-select') ? document.getElementById('comm-select').value : 'HGA';
    const instKey = document.getElementById('instrument-select') ? document.getElementById('instrument-select').value : 'Camera';
    const shieldSlider = document.getElementById('shield-slider');
    const shieldVal = shieldSlider ? parseInt(shieldSlider.value) : 50;

    // --- 1. CENTRAL SPACECRAFT BUS (Gold MLI Thermal Foil) ---
    const coreGeometry = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    const coreMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xd4af37, 
        metalness: 0.8, 
        roughness: 0.2 
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    spacecraftGroup.add(coreMesh);

    // --- 2. LAUNCH VEHICLE / BOOSTER BASE (Falcon Heavy vs. SLS) ---
    if (launcherKey === 'SLS') {
        const slsCoreGeo = new THREE.CylinderGeometry(0.5, 0.5, 2.2, 16);
        const slsCoreMat = new THREE.MeshStandardMaterial({ color: 0xc2410c, metalness: 0.4, roughness: 0.5 });
        const slsCore = new THREE.Mesh(slsCoreGeo, slsCoreMat);
        slsCore.position.set(0, -1.8, 0);
        spacecraftGroup.add(slsCore);

        const boosterGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 16);
        const boosterMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.6, roughness: 0.2 });
        
        const leftBooster = new THREE.Mesh(boosterGeo, boosterMat);
        leftBooster.position.set(-0.8, -1.6, 0);
        spacecraftGroup.add(leftBooster);

        const rightBooster = new THREE.Mesh(boosterGeo, boosterMat);
        rightBooster.position.set(0.8, -1.6, 0);
        spacecraftGroup.add(rightBooster);
    } else {
        const fhCoreGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.8, 16);
        const fhCoreMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.7, roughness: 0.2 });
        const fhCore = new THREE.Mesh(fhCoreGeo, fhCoreMat);
        fhCore.position.set(0, -1.6, 0);
        spacecraftGroup.add(fhCore);

        const sideBGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.5, 16);
        const leftSB = new THREE.Mesh(sideBGeo, fhCoreMat);
        leftSB.position.set(-0.6, -1.5, 0);
        spacecraftGroup.add(leftSB);

        const rightSB = new THREE.Mesh(sideBGeo, fhCoreMat);
        rightSB.position.set(0.6, -1.5, 0);
        spacecraftGroup.add(rightSB);
    }

    // --- 3. RADIATION SHIELDING HULL LAYER (Transparent Wireframe) ---
    const shieldSize = 1.4 + (shieldVal / 200);
    const shieldGeo = new THREE.BoxGeometry(shieldSize, shieldSize, shieldSize);
    const shieldMat = new THREE.MeshBasicMaterial({ 
        color: 0x38bdf8, 
        wireframe: true, 
        transparent: true, 
        opacity: shieldVal / 150 
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    spacecraftGroup.add(shieldMesh);

    // --- 4. POWER SYSTEMS (Solar Wings vs. Nuclear RTG Cask) ---
    if (powerKey === 'Solar') {
        const panelGeo = new THREE.BoxGeometry(2.6, 0.05, 0.9);
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.9, roughness: 0.1 });
        
        const leftWing = new THREE.Mesh(panelGeo, panelMat);
        leftWing.position.set(-2.0, 0, 0);
        spacecraftGroup.add(leftWing);

        const rightWing = new THREE.Mesh(panelGeo, panelMat);
        rightWing.position.set(2.0, 0, 0);
        spacecraftGroup.add(rightWing);
    } else {
        const rtgGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16);
        const rtgMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.7, roughness: 0.3 });
        const rtgMesh = new THREE.Mesh(rtgGeo, rtgMat);
        rtgMesh.position.set(0, 1.3, 0);
        spacecraftGroup.add(rtgMesh);

        const coreGlowGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.6, 16);
        const coreGlowMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const coreGlow = new THREE.Mesh(coreGlowGeo, coreGlowMat);
        coreGlow.position.set(0, 1.3, 0);
        spacecraftGroup.add(coreGlow);
    }

    // --- 5. COMMUNICATIONS SYSTEMS ---
    if (commKey === 'Laser') {
        const laserGeo = new THREE.CylinderGeometry(0.08, 0.15, 0.9, 16);
        const laserMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, metalness: 0.8 });
        const laserMesh = new THREE.Mesh(laserGeo, laserMat);
        laserMesh.position.set(0.4, 1.1, 0);
        spacecraftGroup.add(laserMesh);
    } else if (commKey === 'HGA') {
        const dishGeo = new THREE.ConeGeometry(0.6, 0.3, 24, 1, true);
        const dishMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.8, roughness: 0.2, side: THREE.DoubleSide });
        const dishMesh = new THREE.Mesh(dishGeo, dishMat);
        dishMesh.position.set(0.4, 1.1, 0);
        dishMesh.rotation.x = Math.PI;
        spacecraftGroup.add(dishMesh);
    } else {
        const lgaGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8);
        const lgaMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.9 });
        const lgaMesh = new THREE.Mesh(lgaGeo, lgaMat);
        lgaMesh.position.set(0.4, 1.1, 0);
        spacecraftGroup.add(lgaMesh);
    }

    // --- 6. SCIENTIFIC PAYLOAD INSTRUMENT ---
    if (instKey === 'Radar') {
        const radarGeo = new THREE.BoxGeometry(0.8, 0.25, 0.8);
        const radarMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, metalness: 0.6 });
        const radarMesh = new THREE.Mesh(radarGeo, radarMat);
        radarMesh.position.set(0, -0.9, 0.5);
        spacecraftGroup.add(radarMesh);
    } else if (instKey === 'Spectrometer') {
        const specGeo = new THREE.SphereGeometry(0.35, 16, 16);
        const specMat = new THREE.MeshStandardMaterial({ color: 0xa78bfa, metalness: 0.5, roughness: 0.2 });
        const specMesh = new THREE.Mesh(specGeo, specMat);
        specMesh.position.set(0, -0.9, 0.5);
        spacecraftGroup.add(specMesh);
    } else {
        const camGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 16);
        const camMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.9, roughness: 0.1 });
        const camMesh = new THREE.Mesh(camGeo, camMat);
        camMesh.position.set(0, -0.9, 0.5);
        camMesh.rotation.x = Math.PI / 2;
        spacecraftGroup.add(camMesh);
    }
}

// Dynamic Challenges per Destination
const europaChallenges = [
    { title: "⚠️ JOVIAN RADIATION TORUS SURGE", desc: "Intense plasma belt radiation is frying electronics!", action1: "Divert Power to Shields", action2: "Spin-Axis Maneuver", type: "radiation" },
    { title: "⚠️ CRYOCVOLCANIC PLUME EJECTION", desc: "Subsurface water vapor plume detected ahead!", action1: "Fire Thrusters (Alt-Path)", action2: "Retract Instruments & Coast", type: "plume" },
    { title: "⚠️ DEEP-SPACE SOLAR DROP-OFF", desc: "Solar panel voltage dropping due to distance from Sun!", action1: "Overclock RTG Backup", action2: "Shed Comms Bandwidth", type: "power" },
    { title: "⚠️ TIDAL FLEXING MICRO-FRACTURE", desc: "Jupiter's gravity is causing structural stress on antenna!", action1: "Realign via Thrusters", action2: "Lock Gimbal Position", type: "structure" },
    { title: "⚠️ MAGNETOSPHERIC ELECTROSTATIC SPIKE", desc: "Static electrical charge buildup triggering computer loops!", action1: "Execute Warm Reset", action2: "Discharge via Plasma-Arcs", type: "electrical" },
    { title: "⚠️ ORBITAL RESONANCE DRIFT", desc: "Gravitational pull from Io/Ganymede altering trajectory!", action1: "Manual Correction Burn", action2: "Accept Higher Altitude", type: "orbit" },
    { title: "⚠️ MICROMETEOROID IMPACT WARNING", desc: "Interplanetary dust cloud crossing flight vector!", action1: "Rotate Core Protection", action2: "Monitor Pressure Loss", type: "impact" }
];

const titanChallenges = [
    { title: "⚠️ THOLIN ATMOSPHERIC SUPER-HAZE", desc: "Dense organic haze obscuring optical instruments!", action1: "Switch to Radar Mode", action2: "Dive Lower Through Haze", type: "haze" },
    { title: "⚠️ METHANE RAIN SQUALL SHEAR", desc: "Atmospheric methane storm causing severe wind turbulence!", action1: "Deploy Drogue Parachute", action2: "Adjust Ballast Weight", type: "storm" },
    { title: "⚠️ CRYOGENIC TEMPERATURE DROP", desc: "Extreme cold (−179°C) threatening battery chemistry!", action1: "Divert Core Heat to Batteries", action2: "Isolate Auxiliary Systems", type: "cold" },
    { title: "⚠️ SATURN RING-PLANE DUST HAZARD", desc: "High-velocity microscopic ring debris detected!", action1: "Roll Spacecraft Edge-First", action2: "Burn Retrojet Delay", type: "debris" },
    { title: "⚠️ HYDROCARBON SEA RADAR GLINT", desc: "Specular reflection blinding surface altimeters!", action1: "Recalibrate Radar Filters", action2: "Switch to Passive Radiometry", type: "radar" },
    { title: "⚠️ ATMOSPHERIC SUPER-ROTATION DRAG", desc: "High-speed winds creating unexpected aerodynamic friction!", action1: "Raise Periapsis Altitude", action2: "Strengthen Attitude Control", type: "drag" },
    { title: "⚠️ DEEP SATURN COMMS BLACKOUT", desc: "Solar plasma interference cutting Earth uplink!", action1: "Enable Autonomous AI Mode", action2: "Store Data in Buffer", type: "comms" }
];

const psycheChallenges = [
    { title: "⚠️ METALLIC ASTEROID MAGNETIC ANOMALY", desc: "Unexpected core magnetism interference disrupting guidance systems!", action1: "Switch to Inertial Gyro Backup", action2: "Shield Magnetometers", type: "magnetic" },
    { title: "⚠️ ASTEROID BELT DEBRIS FIELD", desc: "Dense concentration of nickel-iron micrometeoroids detected!", action1: "Execute Evasive Roll Vector", action2: "Increase Shield Draw", type: "debris" },
    { title: "⚠️ SOLAR FLUX REDUCTION", desc: "Main asteroid belt distance weakening array power efficiency!", action1: "Tilt Solar Wings 15°", action2: "Duty-Cycle Secondary Sensors", type: "power" },
    { title: "⚠️ LOW GRAVITY CAPTURE INSTABILITY", desc: "Micro-gravity environment threatening orbit insertion accuracy!", action1: "Fire Cold-Gas Thrusters", action2: "Adjust Capture Hyperbolic Path", type: "gravity" },
    { title: "⚠️ SURFACE REFLECTIVITY GLARE", desc: "Pure metal surface causing high-intensity optical glare!", action1: "Deploy Sensor Sunshades", action2: "Switch to Infrared Band", type: "glare" },
    { title: "⚠️ DEEP BELT COMMS LATENCY SPIKE", desc: "Solar conjunction causing telemetry transmission packet loss!", action1: "Buffer Data to Solid-State", action2: "Increase High-Gain Power", type: "comms" },
    { title: "⚠️ ION THRUSTER PLUME CONTAMINATION", desc: "Ion propulsion exhaust settling on optical lenses!", action1: "Vector Thruster Away from Target", action2: "Thermal Bake-Out Cycle", type: "thruster" }
];

function triggerRandomChallenge() {
    let pool = europaChallenges;
    if (activeTarget.name.includes('Titan')) pool = titanChallenges;
    else if (activeTarget.name.includes('Psyche')) pool = psycheChallenges;

    currentActiveChallenge = pool[Math.floor(Math.random() * pool.length)];

    const titleElem = document.getElementById('anomaly-title');
    const descElem = document.getElementById('anomaly-desc');
    const btn1 = document.getElementById('anomaly-btn-1');
    const btn2 = document.getElementById('anomaly-btn-2');

    // Display appropriate anomaly text based on whether it is Team Mode or Single Player
    if (titleElem) {
        if (gameMode === "team") {
            titleElem.innerHTML = `🚨 TEAM OVERRIDE REQUIRED: <br>${currentActiveChallenge.title}`;
            if (descElem) descElem.innerHTML = `<strong>DEBATE REQUIRED:</strong> ${currentActiveChallenge.desc}<br><br><em>Does the team prioritize structural integrity (Action 1) or mission timeline (Action 2)? You must reach a consensus before acting!</em>`;
        } else {
            titleElem.innerText = currentActiveChallenge.title;
            if (descElem) descElem.innerText = currentActiveChallenge.desc;
        }
    }

    if (btn1) btn1.innerText = currentActiveChallenge.action1.toUpperCase();
    if (btn2) btn2.innerText = currentActiveChallenge.action2.toUpperCase();

    audioAlarm.play().catch(() => {});
    if (document.getElementById('anomaly-alert')) {
        document.getElementById('anomaly-alert').classList.remove('hidden');
    }
}

function handleChallengeChoice(choiceNumber) {
    if (document.getElementById('anomaly-alert')) {
        document.getElementById('anomaly-alert').classList.add('hidden');
    }

    if (choiceNumber === 1) {
        currentShielding += 15;
        totalPower -= 50;
        missionStatus = "CHALLENGE RESOLVED: Optimal Protocol Executed";
    } else {
        currentShielding -= 10;
        missionStatus = "CHALLENGE RESOLVED: Alternate Route Taken (Minor Penalty)";
    }
    anomalyResolved = true;
}

const canvas = document.getElementById('spaceCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const earth = { x: 40, y: 160, radius: 18, color: '#58a6ff' };

function drawSpace() {
    if (!ctx) return;
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(earth.x, earth.y);
    if (selectedRoute === "GravityAssist") {
        ctx.quadraticCurveTo(200, 240, activeTarget.x, activeTarget.y);
    } else {
        ctx.lineTo(activeTarget.x, activeTarget.y);
    }
    ctx.strokeStyle = '#21262d';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(earth.x, earth.y, earth.radius, 0, Math.PI * 2);
    ctx.fillStyle = earth.color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(activeTarget.x, activeTarget.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = activeTarget.color;
    ctx.fill();

   if (isMissionActive) {
        let probeX, probeY;
        if (selectedRoute === "GravityAssist") {
            let t = probeProgress;
            probeX = (1 - t) * (1 - t) * earth.x + 2 * (1 - t) * t * 200 + t * t * activeTarget.x;
            probeY = (1 - t) * (1 - t) * earth.y + 2 * (1 - t) * t * 240 + t * t * activeTarget.y;
        } else {
            probeX = earth.x + (activeTarget.x - earth.x) * probeProgress;
            probeY = earth.y + (activeTarget.y - earth.y) * probeProgress;
        }

        drawProceduralSpacecraft(ctx, probeX, probeY);

        // --- REALISTIC DYNAMIC PARAMETER UPDATES DURING TRANSIT ---
        
        // 1. Consumable Fuel Burn-Down (100% down to 0%)
        let fuelPct = Math.max(0, Math.round((1 - probeProgress) * 100));
        const dashFuel = document.getElementById('dash-fuel');
        if (dashFuel) dashFuel.innerText = `${fuelPct}%`;

        // 2. Power Draw & Solar Decay (Inverse-Square Law approximation for Solar vs RTG)
        const powerKey = document.getElementById('power-select') ? document.getElementById('power-select').value : 'Solar';
        let currentLivePower = totalPower;
        if (powerKey === 'Solar') {
            // Solar power degrades significantly further out in the solar system (scaled by target AU distance)
            let solarDecayFactor = Math.max(0.15, 1 - (probeProgress * (activeTarget.distAU / 8)));
            currentLivePower = Math.round(powerSystems.Solar.power * solarDecayFactor);
        }
        const dashPower = document.getElementById('dash-power');
        if (dashPower) {
            dashPower.innerText = `${currentLivePower}W / ${activeTarget.reqPower}W Req`;
            dashPower.style.color = currentLivePower < activeTarget.reqPower ? '#f85149' : '#e6edf3';
        }

        // 3. Data Throughput Attenuation over Deep Space Distance
        const dashKbps = document.getElementById('dash-kbps');
        if (dashKbps) {
            // Slight signal attenuation jitter over distance
            let attenuation = 1 - (probeProgress * 0.15);
            let liveKbps = Math.round(totalKbps * attenuation);
            dashKbps.innerText = `${liveKbps} kbps`;
        }

        // 4. Shield Integrity Display Sync
        const dashShield = document.getElementById('dash-shield');
        if (dashShield) {
            dashShield.innerText = `${currentShielding}%`;
            dashShield.style.color = currentShielding < activeTarget.reqShielding ? '#f0883e' : '#e6edf3';
        }

        // Trigger Mid-Flight Emergency Anomaly Event
        if (probeProgress > 0.45 && probeProgress < 0.50 && !anomalyTriggered && !anomalyResolved) {
            anomalyTriggered = true;
            triggerRandomChallenge();
        }

        if (probeProgress > 0.5 && !anomalyTriggered) {
            if (activeTarget.radiationHazard && currentShielding < activeTarget.reqShielding) {
                missionStatus = "WARNING: Radiation Damaged Electronics!";
            } else if (currentLivePower < activeTarget.reqPower) {
                missionStatus = "WARNING: Solar Power Drop Below Requirement!";
            } else {
                missionStatus = "TELEMETRY NOMINAL";
            }
        }

        probeProgress += speed;

        if (probeProgress >= 1) {
            probeProgress = 1;
            evaluateMission();
        }
    }

    ctx.fillStyle = "#8b949e";
    ctx.font = "11px monospace";
    ctx.fillText("STATUS: " + missionStatus, 10, 20);

    requestAnimationFrame(drawSpace);
}

function playCutscene(videoSrc, isSuccess, titleText, subText) {
    const videoElem = document.getElementById('debrief-video');
    const statusOverlay = document.getElementById('status-overlay');
    const overlayTitle = document.getElementById('status-overlay-title');
    const overlaySub = document.getElementById('status-overlay-sub');
    
    if (!videoElem || !statusOverlay) return;

    if (overlayTitle) {
        overlayTitle.innerText = titleText;
        overlayTitle.style.color = isSuccess ? '#2ea043' : '#f85149';
    }
    if (overlaySub) overlaySub.innerText = subText;
    
    statusOverlay.style.display = 'flex';
    videoElem.style.display = 'none';

    setTimeout(() => {
        statusOverlay.style.display = 'none';
        
        videoElem.src = videoSrc;
        videoElem.style.display = 'block';
        videoElem.currentTime = 0;
        videoElem.muted = false;
        
        videoElem.play().catch(err => console.warn("Cutscene autoplay prevented:", err));

        videoElem.onended = () => {
            videoElem.style.display = 'none';
        };
    }, 2500);
}

function evaluateMission() {
    isMissionActive = false;
    const debrief = document.getElementById('debrief-text');
    let finalScore = 0;
    let grade = 'F';

    // Reset Dashboard Status Badge
    const dashBadge = document.getElementById('dash-status-badge');
    if (dashBadge) {
        dashBadge.innerText = "MISSION COMPLETE";
        dashBadge.style.background = "#238636";
    }

    const instKey = document.getElementById('instrument-select').value;
    const commKey = document.getElementById('comm-select').value;
    const chosenInstrument = instruments[instKey];
    const chosenComm = commSystems[commKey];

    if (activeTarget.radiationHazard && currentShielding < activeTarget.reqShielding) {
        if (debrief) debrief.innerText = "MISSION FAILURE: Severe Radiation Damage. Payload Lost.";
        missionStatus = "SYSTEM FAILURE";
        audioLose.currentTime = 0;
        audioLose.play().catch(() => {});
        
        playCutscene('videos/mission-fail.mp4', false, "MISSION FAILED", "CRITICAL ANOMALY // TELEMETRY LOST");

    } else if (totalPower < activeTarget.reqPower) {
        if (debrief) debrief.innerText = "MISSION FAILURE: Total Power Depletion. Instruments Frozen.";
        missionStatus = "SYSTEM FROZEN";
        audioLose.currentTime = 0;
        audioLose.play().catch(() => {});
        
        playCutscene('videos/mission-fail.mp4', false, "MISSION FAILED", "POWER DEPLETION // SYSTEMS FROZEN");

    } else if (totalKbps < activeTarget.minCommKbps) {
        if (debrief) debrief.innerText = "PARTIAL SUCCESS: Target reached, but antenna throughput was insufficient.";
        missionStatus = "COMMS FAILURE";
        finalScore = Math.round(sciencePoints * 0.3);
        grade = 'C';
        audioLose.currentTime = 0;
        audioLose.play().catch(() => {});
        
        playCutscene('videos/mission-fail.mp4', false, "MISSION COMPROMISED", "LOW BANDWIDTH // INSUFFICIENT UPLINK");

    } else {
        let dataEfficiency = 1.0;
        let bottleneckWarning = "";
        
        if (chosenInstrument.dataRequirement > chosenComm.kbps) {
            dataEfficiency = chosenComm.kbps / chosenInstrument.dataRequirement;
            bottleneckWarning = " (⚠️ Data Bottleneck: Antenna too slow for high-volume instrument!)";
        }

        const budgetBonus = (totalBudget - totalCost);
        finalScore = Math.round((sciencePoints * 10 * dataEfficiency) + budgetBonus);

        // --- TEAM MODE COMPETING PRIORITIES EVALUATION ---
        if (gameMode === "team") {
            teamObjectivesMet = 0;
            let teamDebrief = "<br><br><strong>TEAM SYNERGY REPORT:</strong><br>";

            // Commander KPI: Saved at least 150M
            if (budgetBonus >= 150) { teamObjectivesMet++; teamDebrief += `✅ Commander (CMD) met financial goals.<br>`; }
            else { teamDebrief += `❌ Commander (CMD) overspent the budget.<br>`; }

            // Engineer KPI: Mass under 1000kg
            if (totalMass <= 1000) { teamObjectivesMet++; teamDebrief += `✅ Lead Engineer (ENG) optimized payload mass.<br>`; }
            else { teamDebrief += `❌ Lead Engineer (ENG) built a heavy, inefficient craft.<br>`; }

            // Scientist KPI: High-Tier Science
            if (instKey === 'Radar' || instKey === 'Spectrometer') { teamObjectivesMet++; teamDebrief += `✅ Chief Scientist (SCI) secured high-yield data.<br>`; }
            else { teamDebrief += `❌ Chief Scientist (SCI) compromised on science sensors.<br>`; }

            // Flight Director KPI: Fast Data Downlink
            if (totalKbps >= 500) { teamObjectivesMet++; teamDebrief += `✅ Flight Director (FD) established high-bandwidth link.<br>`; }
            else { teamDebrief += `❌ Flight Director (FD) accepted sub-optimal telemetry.<br>`; }

            // Negotiation Score Multiplier
            if (teamObjectivesMet === 4) {
                finalScore += 500; // Perfect coordination bonus
                teamDebrief += "<br>🌟 <strong style='color:#a5d6ff;'>FLAWLESS COORDINATION: +500 PTS</strong>";
            } else if (teamObjectivesMet >= 2) {
                finalScore += 150;
                teamDebrief += "<br>🤝 <strong style='color:#2ea043;'>ADEQUATE COMPROMISE: +150 PTS</strong>";
            } else {
                finalScore -= 200; // Penalty for poor teamwork
                teamDebrief += "<br>⚠️ <strong style='color:#f85149;'>POOR SYNERGY: -200 PTS</strong>";
            }
            
            bottleneckWarning += teamDebrief;
        }
        
        if (finalScore > 1200) grade = 'S';
        else if (finalScore > 900) grade = 'A';
        else grade = 'B';

        // NOTE: Uses innerHTML instead of innerText to render the Team Synergy <br> and <strong> tags
        if (debrief) debrief.innerHTML = "OPTIMAL SUCCESS: All scientific goals fulfilled for " + activeTarget.name + "!" + bottleneckWarning;
        missionStatus = "SUCCESSFUL";
        audioWin.currentTime = 0;
        audioWin.play().catch(() => {});
        
        if (activeTarget.name.includes('Europa')) {
            playCutscene('videos/europa-win.mp4', true, "MISSION SUCCESSFUL", "EUROPA ORBIT INSERTION CONFIRMED");
        } else if (activeTarget.name.includes('Titan')) {
            playCutscene('videos/titan-win.mp4', true, "MISSION SUCCESSFUL", "TITAN ATMOSPHERIC DESCENT SUCCESS");
        } else if (activeTarget.distAU === 3.0 || activeTarget.name.toLowerCase().includes('psyche')) {
            playCutscene('videos/psyche-win.mp4', true, "MISSION SUCCESSFUL", "16 PSYCHE ORBIT INSERTION CONFIRMED");
        } else {
            playCutscene('videos/europa-win.mp4', true, "MISSION SUCCESSFUL", "ALL OBJECTIVES ACHIEVED");
        }
    }

    if (finalScore > highScore) {
        highScore = finalScore;
        localStorage.setItem('space_architect_highscore', highScore);
        if (document.getElementById('high-score-val')) {
            document.getElementById('high-score-val').innerText = highScore;
        }
    }

    if (document.getElementById('current-score')) document.getElementById('current-score').innerText = finalScore;
    if (document.getElementById('current-grade')) document.getElementById('current-grade').innerText = grade;
    if (document.getElementById('score-display')) document.getElementById('score-display').classList.remove('hidden');

    // Automatically archive the completed mission into past mission history
    archiveCurrentMission();
}

// 3D Starfield Engine
const bgCanvas = document.getElementById('bgCanvas');
const bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
let stars = [];
const numStars = 250;
let centerX = window.innerWidth / 2;
let centerY = window.innerHeight / 2;

function resizeBg() {
    if (!bgCanvas) return;
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    centerX = bgCanvas.width / 2;
    centerY = bgCanvas.height / 2;
}

window.addEventListener('resize', resizeBg);
resizeBg();

for (let i = 0; i < numStars; i++) {
    stars.push({
        x: (Math.random() - 0.5) * (bgCanvas ? bgCanvas.width : 800) * 2,
        y: (Math.random() - 0.5) * (bgCanvas ? bgCanvas.height : 600) * 2,
        z: Math.random() * (bgCanvas ? bgCanvas.width : 800),
        prevZ: 0
    });
}

function animateStarfield() {
    if (!bgCtx) return;
    bgCtx.fillStyle = 'rgba(2, 4, 8, 0.5)';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    for (let i = 0; i < stars.length; i++) {
        let s = stars[i];
        s.prevZ = s.z;
        s.z -= 1.8;

        if (s.z <= 0) {
            s.z = bgCanvas.width;
            s.prevZ = s.z;
            s.x = (Math.random() - 0.5) * bgCanvas.width * 2;
            s.y = (Math.random() - 0.5) * bgCanvas.height * 2;
        }

        const k = 280 / s.z;
        const px = s.x * k + centerX;
        const py = s.y * k + centerY;

        const prevK = 280 / s.prevZ;
        const prevPx = s.x * prevK + centerX;
        const prevPy = s.y * prevK + centerY;

        if (px >= 0 && px <= bgCanvas.width && py >= 0 && py <= bgCanvas.height) {
            const alpha = Math.min(1, (1 - s.z / bgCanvas.width) * 1.2);
            bgCtx.beginPath();
            bgCtx.moveTo(prevPx, prevPy);
            bgCtx.lineTo(px, py);
            bgCtx.strokeStyle = `rgba(180, 220, 255, ${alpha})`;
            bgCtx.stroke();
        }
    }
    requestAnimationFrame(animateStarfield);
}

function startLoadingSequence() {
    const startBtn = document.getElementById('start-loader-btn');
    if (startBtn) startBtn.style.display = 'none';

    audioLoader.currentTime = 0;
    audioLoader.play().catch(err => console.warn("Loader sound playback warning:", err));

    runGameLoader();
}

function runGameLoader() {
    let progress = 0;
    const progressBar = document.getElementById('progress-bar');
    const loaderStatus = document.getElementById('loader-status');
    const loaderPercent = document.getElementById('loader-percent');
    const loaderScreen = document.getElementById('loader-screen');

    const statusMessages = [
        "CALIBRATING ORBITAL TELEMETRY...",
        "INITIALIZING PAYLOAD CONSTRAINTS...",
        "CONNECTING DEEP SPACE NETWORK...",
        "SYSTEMS OPERATIONAL"
    ];

    const interval = setInterval(() => {
        progress += 1;
        if (progressBar) progressBar.style.width = progress + "%";
        if (loaderPercent) loaderPercent.innerText = progress + "%";

        if (loaderStatus) {
            if (progress < 30) loaderStatus.innerText = statusMessages[0];
            else if (progress < 65) loaderStatus.innerText = statusMessages[1];
            else if (progress < 90) loaderStatus.innerText = statusMessages[2];
            else loaderStatus.innerText = statusMessages[3];
        }

        if (progress >= 100) {
            clearInterval(interval);
            
            audioLoader.pause();
            audioLoader.currentTime = 0;

            setTimeout(() => {
                if (loaderScreen) {
                    loaderScreen.style.opacity = '0';
                    loaderScreen.style.visibility = 'hidden';
                }
                
                audioAmbient.play().catch(() => {});

                const welcomeModal = document.getElementById('welcome-modal');
                if (welcomeModal) {
                    welcomeModal.style.display = 'flex';
                }
            }, 500);
        }
    }, 60);
}

function closeWelcomeModal() {
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) {
        welcomeModal.style.display = 'none';
    }
}

// SAFE INITIAL STARTUP EXECUTION
updateSettings();
updateFlagPreview();
drawSpace();
animateStarfield();
loadGlobalLeaderboard();
