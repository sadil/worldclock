// State
let myLocations = [];
let clockInterval = null;
let deferredPrompt; // For install prompt

let appSettings = {
  szCity: 1.8, szCountry: 0.9, szTime: 2.8, szDate: 1.1, dateFormat: 'std'
};

// --- INIT ---
window.addEventListener('load', () => {
  const savedLocs = localStorage.getItem('om_locations');
  if (savedLocs) myLocations = JSON.parse(savedLocs);

  const savedSettings = localStorage.getItem('om_settings');
  if (savedSettings) appSettings = JSON.parse(savedSettings);

  // Bind UI Elements
  bindEvents();

  // Apply Settings
  applySettingsStyles();
  renderSearchPageList();

  // Check location to decide page
  if (myLocations.length > 0) {
    // Optional: Auto-go to dashboard?
    // keeping user on search page for now as requested previously
  }
});

// --- EVENT BINDING ---
function bindEvents() {
  // Navigation
  document.getElementById('btnToDash').onclick = goToDashboard;
  document.getElementById('btnToSearch').onclick = goToSearch;

  // Search
  document.getElementById('btnSearch').onclick = runSearch;
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if(e.key === 'Enter') runSearch();
  });

    // Settings
    ['setCity', 'setTime', 'setDate'].forEach(id => {
      document.getElementById(id).value = appSettings[id === 'setCity' ? 'szCity' : id === 'setTime' ? 'szTime' : 'szDate'];
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    document.getElementById('setDateFormat').value = appSettings.dateFormat;
    document.getElementById('setDateFormat').addEventListener('change', updatePreview);

    // PWA Install
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btn = document.getElementById('installBtn');
      btn.style.display = 'block';
      btn.addEventListener('click', () => {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            btn.style.display = 'none';
          }
          deferredPrompt = null;
        });
      });
    });
}

// --- LOGIC ---
async function runSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if(!q) return;

  const loader = document.getElementById('loader');
  const box = document.getElementById('resultsBox');

  loader.style.display = 'block';
  box.style.display = 'none';

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`;
    const response = await fetch(url);
    const json = await response.json();

    loader.style.display = 'none';
    box.innerHTML = '';

    if (!json.results) {
      loader.textContent = "No cities found.";
      loader.style.display = 'block';
      return;
    }

    box.style.display = 'block';
    json.results.forEach(item => {
      const div = document.createElement('div');
      div.className = 'result-row';
      div.innerHTML = `<div class="r-name">${item.name}</div><div class="r-sub">${item.admin1 || ''}, ${item.country || ''}</div>`;

      const locObj = {
        name: item.name,
        country: item.country || "Unknown",
        zone: item.timezone || "UTC"
      };

      div.onclick = () => {
        addLocation(locObj);
        box.style.display='none';
        document.getElementById('searchInput').value = '';
        showToast(`Added ${item.name}`);
      };
      box.appendChild(div);
    });

  } catch (err) {
    loader.textContent = "Error searching.";
    console.error(err);
  }
}

function addLocation(loc) {
  const exists = myLocations.some(l => l.name === loc.name && l.country === loc.country);
  if(!exists) {
    myLocations.push(loc);
    localStorage.setItem('om_locations', JSON.stringify(myLocations));
    renderSearchPageList();
  } else {
    showToast("Already added!");
  }
}

function removeLocation(idx) {
  myLocations.splice(idx, 1);
  localStorage.setItem('om_locations', JSON.stringify(myLocations));
  renderSearchPageList();
}

function renderSearchPageList() {
  const list = document.getElementById('searchPageList');
  document.getElementById('listCount').textContent = myLocations.length;
  list.innerHTML = '';

  if(myLocations.length === 0) {
    list.innerHTML = '<div style="padding:20px; color:#666; font-style:italic;">No cities selected.</div>';
    return;
  }

  myLocations.forEach((loc, idx) => {
    const div = document.createElement('div');
    div.className = 'saved-item';
    div.innerHTML = `
    <div>
    <div style="font-weight:bold; color:var(--text-main);">${loc.name}</div>
    <div style="font-size:0.8em; color:var(--text-sub);">${loc.country}</div>
    </div>
    <span class="remove-link" onclick="removeLocation(${idx})">✖</span>
    `;
    list.appendChild(div);
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.opacity = '1';
  setTimeout(() => t.style.opacity = '0', 2000);
}

// --- DASHBOARD ---
function goToDashboard() {
  document.getElementById('page-search').style.display = 'none';
  document.getElementById('page-dashboard').style.display = 'block';
  renderGrid();
  startTicker();
}

function goToSearch() {
  if(clockInterval) clearInterval(clockInterval);
  document.getElementById('page-dashboard').style.display = 'none';
  document.getElementById('page-search').style.display = 'flex';
  renderSearchPageList();
}

function renderGrid() {
  const grid = document.getElementById('clockGrid');
  grid.innerHTML = '';
  if (myLocations.length === 0) {
    grid.innerHTML = `<div style="text-align:center; color:#666; grid-column:1/-1; padding:40px;">No cities selected.</div>`;
    return;
  }

  myLocations.forEach((loc, idx) => {
    const card = document.createElement('div');
    card.className = 'clock-card';
    card.innerHTML = `
    <div class="card-controls">
    <div class="ctrl-grp">
    <button class="ctrl-btn" onclick="moveCard(${idx}, -1)">&larr;</button>
    <button class="ctrl-btn" onclick="moveCard(${idx}, 1)">&rarr;</button>
    </div>
    <div class="ctrl-grp"><button class="ctrl-btn btn-del" onclick="deleteCard(${idx})">✖</button></div>
    </div>
    <div class="clock-city">${loc.name}</div>
    <div class="clock-country">${loc.country}</div>
    <div class="clock-time" id="t-${idx}">--:--</div>
    <div class="clock-date" id="d-${idx}">Loading</div>
    `;
    grid.appendChild(card);
  });
}

function moveCard(idx, dir) {
  if ((dir === -1 && idx === 0) || (dir === 1 && idx === myLocations.length - 1)) return;
  const temp = myLocations[idx];
  myLocations[idx] = myLocations[idx + dir];
  myLocations[idx + dir] = temp;
  localStorage.setItem('om_locations', JSON.stringify(myLocations));
  renderGrid(); updateClocks();
}

function deleteCard(idx) {
  if(confirm(`Remove ${myLocations[idx].name}?`)) {
    myLocations.splice(idx, 1);
    localStorage.setItem('om_locations', JSON.stringify(myLocations));
    renderGrid(); updateClocks();
  }
}

// --- CLOCK ---
function startTicker() {
  if(clockInterval) clearInterval(clockInterval);
  updateClocks();
  clockInterval = setInterval(updateClocks, 1000);
}

function updateClocks() {
  const now = new Date();
  let dateOpts = { weekday: 'short', month: 'short', day: 'numeric' };

  switch(appSettings.dateFormat) {
    case 'full': dateOpts = { weekday: 'long', month: 'long', day: 'numeric' }; break;
    case 'us': dateOpts = { year: 'numeric', month: '2-digit', day: '2-digit' }; break;
    case 'intl': dateOpts = { year: 'numeric', month: '2-digit', day: '2-digit' }; break;
    case 'short': dateOpts = { day: 'numeric', month: 'short' }; break;
    case 'day': dateOpts = { weekday: 'long' }; break;
  }

  myLocations.forEach((loc, idx) => {
    const tEl = document.getElementById(`t-${idx}`);
    const dEl = document.getElementById(`d-${idx}`);
    if(tEl && dEl) {
      try {
        tEl.textContent = new Intl.DateTimeFormat('en-US', {
          hour:'2-digit', minute:'2-digit', hour12:false, timeZone: loc.zone
        }).format(now);

        if (appSettings.dateFormat === 'intl') {
          dEl.textContent = new Intl.DateTimeFormat('en-CA', {
            year:'numeric', month:'2-digit', day:'2-digit', timeZone: loc.zone
          }).format(now);
        } else {
          dEl.textContent = new Intl.DateTimeFormat('en-US', {
            ...dateOpts, timeZone: loc.zone
          }).format(now);
        }
      } catch(e) { tEl.textContent = "--:--"; }
    }
  });
}

// --- SETTINGS ---
function updatePreview() {
  appSettings.szCity = document.getElementById('setCity').value;
  appSettings.szTime = document.getElementById('setTime').value;
  appSettings.szDate = document.getElementById('setDate').value;
  appSettings.dateFormat = document.getElementById('setDateFormat').value;

  localStorage.setItem('om_settings', JSON.stringify(appSettings));
  applySettingsStyles();
  updateClocks();
}

function applySettingsStyles() {
  const root = document.documentElement;
  root.style.setProperty('--sz-city', appSettings.szCity + 'rem');
  root.style.setProperty('--sz-country', (appSettings.szCity * 0.5) + 'rem');
  root.style.setProperty('--sz-time', appSettings.szTime + 'rem');
  root.style.setProperty('--sz-date', appSettings.szDate + 'rem');
}
