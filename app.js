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

// Destinations Database
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

// Fetch & Display Live Global Leaderboard (Unified JSONBin Object Structure)
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

        list.sort((a, b) => b.score - a.score);

        if (list.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #8b949e;">No records transmitted yet. Be the first!</td></tr>`;
            return;
        }

        tableBody.innerHTML = '';
        list.slice(0, 10).forEach((entry, index) => {
            const row = document.createElement('tr');
            
let flagCode = entry.country ? entry.country.toLowerCase().trim() : 'af';
            // Check both clean name and with '-flag' suffix
            let flagUrl = zipFlagCache[flagCode] || zipFlagCache[flagCode + '-flag'] || '';

            row.innerHTML = `
                <td>#${index + 1}</td>
                <td style="text-align: center;">
                    <img src="${flagUrl}" alt="${flagCode}" style="width: 22px; height: 16px; vertical-align: middle; border-radius: 2px; object-fit: cover;">
                </td>
                <td>${entry.name || 'Commander'}</td>
                <td>${entry.target || 'N/A'}</td>
                <td>${entry.score || 0}</td>
                <td><strong>${entry.grade || 'F'}</strong></td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.warn("Leaderboard fetch error:", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #f0883e;">
                    📡 Telemetry Link Offline (Verify Bin ID / API Key)
                </td>
            </tr>`;
    }
}

// Submit Scores Live
async function submitLiveScore() {
    const submitBtn = document.getElementById('submit-score-btn');
    const submitStatus = document.getElementById('submit-status');
    
    const playerName = document.getElementById('player-name-input') ? document.getElementById('player-name-input').value.trim() : "Commander";
    const playerFlag = document.getElementById('player-flag-select') ? document.getElementById('player-flag-select').value : "af";
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
        
        let binData = { scores: [], reviews: [] };
        if (Array.isArray(binRecord)) {
            binData.scores = binRecord;
        } else if (binRecord && typeof binRecord === 'object') {
            binData.scores = Array.isArray(binRecord.scores) ? binRecord.scores : [];
            binData.reviews = Array.isArray(binRecord.reviews) ? binRecord.reviews : [];
        }

        const newEntry = {
            name: playerName,
            country: playerFlag,
            score: currentScore,
            target: activeTarget.name.split(' ')[0],
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

        let binData = { scores: [], reviews: [] };
        if (Array.isArray(binRecord)) {
            binData.scores = binRecord;
        } else if (binRecord && typeof binRecord === 'object') {
            binData.scores = Array.isArray(binRecord.scores) ? binRecord.scores : [];
            binData.reviews = Array.isArray(binRecord.reviews) ? binRecord.reviews : [];
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

    const trackerBox = document.querySelector('.tracker-box');
    if (trackerBox) {
        trackerBox.style.borderColor = (budgetRemaining < 0 || totalMass > maxMass) ? '#f85149' : '#238636';
    }
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

    const viewportSection = document.querySelector('.viewport');
    if (viewportSection) {
        viewportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 7 NASA-Grounded Dynamic Challenges per Destination
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

function triggerRandomChallenge() {
    const pool = activeTarget.name.includes('Europa') ? europaChallenges : titanChallenges;
    currentActiveChallenge = pool[Math.floor(Math.random() * pool.length)];

    const titleElem = document.getElementById('anomaly-title');
    const descElem = document.getElementById('anomaly-desc');
    const btn1 = document.getElementById('anomaly-btn-1');
    const btn2 = document.getElementById('anomaly-btn-2');

    if (titleElem) titleElem.innerText = currentActiveChallenge.title;
    if (descElem) descElem.innerText = currentActiveChallenge.desc;
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

        ctx.beginPath();
        ctx.arc(probeX, probeY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.fill();

        if (probeProgress > 0.45 && probeProgress < 0.50 && !anomalyTriggered && !anomalyResolved) {
            anomalyTriggered = true;
            triggerRandomChallenge();
        }

        if (probeProgress > 0.5 && !anomalyTriggered) {
            if (activeTarget.radiationHazard && currentShielding < activeTarget.reqShielding) {
                missionStatus = "WARNING: Radiation Damaged Electronics!";
            } else if (totalPower < activeTarget.reqPower) {
                missionStatus = "WARNING: Low Power Level!";
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
        
        if (finalScore > 1200) grade = 'S';
        else if (finalScore > 900) grade = 'A';
        else grade = 'B';

        if (debrief) debrief.innerText = "OPTIMAL SUCCESS: All scientific goals fulfilled for " + activeTarget.name + "!" + bottleneckWarning;
        missionStatus = "SUCCESSFUL";
        audioWin.currentTime = 0;
        audioWin.play().catch(() => {});
        
        if (activeTarget.name.includes('Europa')) {
            playCutscene('videos/europa-win.mp4', true, "MISSION SUCCESSFUL", "EUROPA ORBIT INSERTION CONFIRMED");
        } else if (activeTarget.name.includes('Titan')) {
            playCutscene('videos/titan-win.mp4', true, "MISSION SUCCESSFUL", "TITAN ATMOSPHERIC DESCENT SUCCESS");
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
