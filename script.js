// --- Firebase CDN Imports ---------------------------------------------------
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// --- Firebase Config & Initialization ---------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCh1MJ9gLfcw0qnXIIyBm_HZPdsYP8X6AQ",
  authDomain: "apna-sathee.firebaseapp.com",
  projectId: "apna-sathee",
  storageBucket: "apna-sathee.firebasestorage.app",
  messagingSenderId: "613010043979",
  appId: "1:613010043979:web:23183f40daf344059809ce"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

// --- Global User Subscription State -----------------------------------------
let currentUserTier = null;      // null = logged out, 'Free', or 'Pro'
let currentMessagesUsed = 0;
let currentUserUid = null;

function showPaywall() {
  const modal = document.getElementById('paywallModal');
  if (modal) modal.style.display = 'flex';
}

function hidePaywall() {
  const modal = document.getElementById('paywallModal');
  if (modal) modal.style.display = 'none';
}

function isPremiumLocked() {
  return !currentUserTier || currentUserTier === 'Free';
}

// --- Auth UI Wiring ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userProfile = document.getElementById('userProfile');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');

  // Paywall close button
  const paywallCloseBtn = document.getElementById('paywallCloseBtn');
  if (paywallCloseBtn) paywallCloseBtn.addEventListener('click', hidePaywall);

  // Close paywall on backdrop click
  const paywallModal = document.getElementById('paywallModal');
  if (paywallModal) paywallModal.addEventListener('click', (e) => {
    if (e.target === paywallModal) hidePaywall();
  });

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      // Check if the user ticked the consent box
      const isAgreed = document.getElementById('legalAgreeCheckbox')?.checked;

      if (!isAgreed) {
        alert('Please read and agree to the Privacy Policy and Terms & Conditions to proceed.');
        return; // Stops the login execution right here!
      }

      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        console.error('Login failed:', err);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
      } catch (err) {
        console.error('Logout failed:', err);
      }
    });
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("👤 User logged in:", user.uid);

      // Show profile, hide login & consent UI
      if (loginBtn) loginBtn.style.display = 'none';

      const consentWrap = document.querySelector('.legal-consent-wrap');
      if (consentWrap) consentWrap.style.display = 'none';

      if (userProfile) userProfile.style.display = 'flex';
      if (userAvatar) {
        userAvatar.style.display = '';
        userAvatar.src = user.photoURL || '';
      }
      if (userName) userName.textContent = user.displayName ? user.displayName.split(' ')[0] : 'User';

      // Fetch user profile from Firestore
      currentUserUid = user.uid;
      let tier = 'Free';

      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          tier = userData.subscription_tier || 'Free';
          currentMessagesUsed = userData.free_messages_used || 0;
          console.log("📊 User subscription tier from DB:", tier);
        } else {
          // Brand new user - initialize Firestore document with legal audit trails
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            subscription_tier: 'Free',
            free_messages_used: 0,
            agreedToTerms: true,
            agreedToTermsAt: new Date(),
            createdAt: new Date()
          });
          currentMessagesUsed = 0;
          console.log("🆕 New user profile initialized in Firestore.");
        }
      } catch (err) {
        console.error('Firestore profile error:', err);
        currentMessagesUsed = 0;
      }

      // Set global state
      currentUserTier = tier;

      // Update PRO badge visibility based on database truth
      const badge = document.getElementById('proBadge');
      const upgradeToProBtn = document.getElementById('upgradeToProBtn');
      if (tier === 'Pro') {
        if (badge) badge.style.display = 'inline-block';
        if (upgradeToProBtn) upgradeToProBtn.style.display = 'none';
      } else {
        if (badge) badge.style.display = 'none';
        if (upgradeToProBtn) upgradeToProBtn.style.display = 'flex';
      }

    } else {
      // User is logged out
      if (loginBtn) loginBtn.style.display = 'flex';

      const consentWrap = document.querySelector('.legal-consent-wrap');
      if (consentWrap) consentWrap.style.display = 'flex';

      if (userProfile) userProfile.style.display = 'none';

      const badge = document.getElementById('proBadge');
      const upgradeToProBtn = document.getElementById('upgradeToProBtn');
      if (badge) badge.style.display = 'none';
      if (upgradeToProBtn) upgradeToProBtn.style.display = 'flex';

      currentUserTier = null;
      currentMessagesUsed = 0;
      currentUserUid = null;
    }
  });

  // --- Global Razorpay Checkout Function --------------------------------------
  window.openProCheckout = function() {
    if (!currentUserUid) {
      alert('Please login first to upgrade.');
      return;
    }

    const options = {
      "key": "rzp_live_SpLnehjbh9ZfBW",
      "amount": 24900,
      "currency": "INR",
      "name": "Apna Sathee",
      "description": "Unlock Pro Access",
      "image": "logo.png",
      "handler": function (response) {
        console.log("✅ Razorpay Payment Success:", response.razorpay_payment_id);
        try {
          const user = auth.currentUser;
          if (!user) {
            alert("Payment successful, but please log in to claim Pro status.");
            return;
          }

          // 1. OPTIMISTIC UI UPDATE (Do this instantly)
          if (typeof currentUserTier !== 'undefined') {
            currentUserTier = 'Pro';
          }
          const modal = document.querySelector('.paywall-modal') || document.getElementById('paywallModal') || document.querySelector('[class*="paywall"]');
          if (modal) modal.style.display = 'none';

          const badge = document.getElementById('proBadge');
          const upgradeToProBtn = document.getElementById('upgradeToProBtn');
          if (badge) badge.style.display = 'inline-block';
          if (upgradeToProBtn) upgradeToProBtn.style.display = 'none';

          alert('🎉 Payment Successful! Welcome to Apna Sathee Pro.');

          // 2. BACKGROUND FIREBASE SYNC (Don't await, let it run in background)
          console.log("🔄 Updating Firebase for user:", user.uid);
          const userRef = doc(db, 'users', user.uid);
          updateDoc(userRef, { subscription_tier: 'Pro' })
            .then(() => console.log("✅ Firebase Updated to Pro!"))
            .catch((error) => console.error("Firebase sync error (background):", error));

        } catch (error) {
          console.error("❌ CRITICAL ERROR in Payment Handler UI:", error);
        }
      },
      "prefill": {
        "name": auth.currentUser ? auth.currentUser.displayName : "",
        "email": auth.currentUser ? auth.currentUser.email : ""
      },
      "theme": {
        "color": "#1E293B"
      }
    };

    window.rzp1 = new window.Razorpay(options);
    window.rzp1.open();
  };

  // --- Upgrade Now Button (Razorpay Checkout from Paywall Modal) -------------
  const upgradeBtn = document.getElementById('upgradeBtn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', window.openProCheckout);
  }
});

// --- Existing Application Code ----------------------------------------------
const $ = (id) => document.getElementById(id);
const listen = (id, event, fn) => {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
};

if (window.location.protocol === 'file:') {
  alert('Please run the application using a local server (e.g. by running "npm run dev"). The AI Chatbot and other features will not work when opened directly from the file system.');
}

const fields = [
  "studentName",
  "exam",
  "rankMain",
  "rankAdvanced",
  "category",
  "gender",
  "homeState",
  "branches",
  "pwdStatus"
];
let currentSessionId = "session_" + Date.now();
let lastChoiceList = [];
let currentAmbitious = [];
let currentBalanced = [];
let currentSafe = [];
let cutoffsCache = null;
let masterInstitutes = null;
let seatStats = null;
let latestYearVal = null;
let finalRoundsMap = null;

async function loadDataFiles() {
  if (cutoffsCache && masterInstitutes) return;

  try {
    console.log('Fetching data files from public path...');
    const [cutoffsRes, masterRes] = await Promise.all([
      fetch('/josaa_real_cutoffs.json'),
      fetch('/institutes_master.json')
    ]);

    cutoffsCache = await cutoffsRes.json();
    console.log('Fetched Data: josaa_real_cutoffs.json', cutoffsCache);

    masterInstitutes = await masterRes.json();
    console.log('Fetched Data: institutes_master.json', masterInstitutes);

    // Pre-calculate stats for recommendation engine
    const years = [...new Set(cutoffsCache.map(r => r.year))];
    latestYearVal = Math.max(...years);
    finalRoundsMap = new Map();
    years.forEach(y => {
      const rounds = cutoffsCache.filter(r => r.year === y).map(r => r.round);
      finalRoundsMap.set(y, Math.max(...rounds));
    });

    seatStats = new Map();
    for (const row of cutoffsCache) {
      if (row.round !== finalRoundsMap.get(row.year)) continue;
      const instKey = normalizeName(row.institute);
      const progKey = normalizeName(row.program);
      const key = `${instKey}||${progKey}||${row.quota}||${row.seatType}||${row.gender}`;

      if (!seatStats.has(key)) seatStats.set(key, { sum: 0, count: 0 });
      const stats = seatStats.get(key);
      // Defensive cast: closingRank may arrive as a string from some JSON
      // sources.  Force to Number first, then parseInt to strip any trailing
      // non-digit characters (e.g. 'P' for preparatory ranks).
      const raw = row.closingRank;
      const rankVal = (typeof raw === 'number' && Number.isFinite(raw))
        ? raw
        : parseInt(String(raw).replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(rankVal) && rankVal > 0) {
        stats.sum += rankVal;
        stats.count += 1;
      }
    }

    const cleanDisplayName = (name) => name.replace(/\s*\(.*?\)/g, '').trim();
    const uniqueOptions = new Set();
    cutoffsCache.forEach(row => uniqueOptions.add(`${row.institute} - ${row.program}`));
    const datalist = $("collegeSuggestions");
    if (datalist) {
      datalist.style.cssText = "max-height: 250px; overflow-y: auto; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;";
      datalist.innerHTML = Array.from(uniqueOptions)
        .map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(cleanDisplayName(opt))}</option>`)
        .join("");
    }
  } catch (err) {
    console.error('Failed to load data files:', err);
    throw err;
  }
}

function normalizeName(value = '') {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(indian institute of technology)\b/g, 'iit')
    .replace(/\b(national institute of technology)\b/g, 'nit')
    .replace(/\b(indian institute of information technology)\b/g, 'iiit')
    .replace(/\b(international institute of information technology)\b/g, 'iiit')
    .replace(/\b(birla institute of technology)\b/g, 'bit')
    .replace(/\btiruchirappalli\b/g, 'trichy')
    .replace(/\btiruchirapalli\b/g, 'trichy')
    .replace(/\bcalicut\b/g, 'kozhikode calicut')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getSeatTypes(category, pwdStatus) {
  const base = category || 'OPEN';
  const types = [base];
  if (pwdStatus === 'yes' || pwdStatus === 'Yes') {
    types.push(base + ' (PwD)');
  }
  return types;
}

function classifyBand(studentRank, avgClosingRank) {
  if (!avgClosingRank) return null;
  const R = studentRank;
  const CR = avgClosingRank;

  if (R <= 0.85 * CR) return 'SAFE';
  if (R > 0.85 * CR && R <= 1.05 * CR) return 'BALANCED';
  if (R > 1.05 * CR && R <= 1.20 * CR) return 'AMBITIOUS';

  return null; // Drop anything R > 1.20 * CR
}

function normalizeBranchQuery(branch) {
  const value = branch.trim().toLowerCase();
  // Map student shorthand to the SHORTEST unique substring that will match
  // against official JoSAA program names via .includes().  Keep these
  // short: 'electronics' catches 'Electronics and Communication Engineering',
  // 'Electronics Engineering', 'Electronics and Electrical', etc.
  const aliases = {
    // Computer Science variants
    cse: 'computer science',
    cs: 'computer science',
    csd: 'computer science',
    csbs: 'computer science',
    // Information Technology
    it: 'information technology',
    // Electronics - short base catches all ECE / EEE variants
    ece: 'electronics',
    ec: 'electronics',
    // Electrical - catches 'Electrical Engineering', 'Electrical and Electronics', etc.
    eee: 'electrical',
    ee: 'electrical',
    // Mechanical
    mech: 'mechanical',
    me: 'mechanical',
    // Other engineering branches
    chem: 'chemical',
    aero: 'aerospace',
    biotech: 'biotechnology',
    civil: 'civil',
    meta: 'metallurg',        // catches both 'metallurgical' and 'metallurgy'
    mining: 'mining',
    // Interdisciplinary / newer branches
    mnc: 'mathematics and computing',
    ai: 'artificial intelligence',
    ml: 'artificial intelligence',
    ds: 'data science',
    ep: 'engineering physics'
  };
  return aliases[value] || value;
}

function branchScore(program, preferredBranches) {
  const text = (program || '').toLowerCase();
  const priority = [
    ['computer science', 92],
    ['artificial intelligence', 90],
    ['data science', 88],
    ['mathematics and computing', 86],
    ['electronics', 82],
    ['electrical', 78],
    ['mechanical', 72],
    ['aerospace', 70],
    ['chemical', 66],
    ['engineering physics', 64],
    ['civil', 58],
    ['metallurgical', 54],
    ['materials', 52],
    ['mining', 48],
    ['architecture', 46],
    ['biotechnology', 44]
  ];
  const base = priority.find(([needle]) => text.includes(needle))?.[1] || 55;
  const preferenceBoost = preferredBranches.some(branch => text.includes(branch)) ? 30 : 0;
  return base + preferenceBoost;
}

function matchStrictProfile(record, profile, instState) {
  const norm = (str) => (str || '').toLowerCase().replace(/[\s\-()]/g, '');

  const validCats = getSeatTypes(profile.category, profile.pwdStatus).map(norm);
  const rowCat = norm(record.seatType || record['Seat Type']);
  if (!validCats.includes(rowCat)) return false;

  const isUserFemale = norm(profile.gender).includes('female');
  const rowGender = norm(record.gender || record['Gender']);
  if (isUserFemale && !rowGender.includes('female')) return false;
  if (!isUserFemale && !rowGender.includes('neutral')) return false;

  const rowQuota = norm(record.quota || record['Quota']);
  const isIIT = isStrictlyIIT(record.institute || record['Institute']);
  const isHomeState = norm(profile.homeState) === norm(instState);

  if (isIIT) {
    if (rowQuota !== 'ai') return false;
  } else {
    if (isHomeState) {
      if (rowQuota !== 'hs' && rowQuota !== 'ai') return false;
    } else {
      if (rowQuota !== 'os' && rowQuota !== 'ai') return false;
    }
  }
  return true;
}

/**
 * Robust IIT identification based on the institute NAME, not the
 * instituteType field (which can be wrong or missing after extraction).
 *
 * Rules:
 * - 'IIT Bombay', 'IIT (BHU) Varanasi', 'IIT (ISM) Dhanbad' -> true
 * - 'IIIT Pune', 'IIIT Dharwad' -> false  (triple-I)
 * - 'NIT Trichy', 'BIT Mesra', 'IIEST Shibpur' -> false
 * - 'Indian Institute of Technology Madras' -> true
 * - 'Indian Institute of Information Technology Allahabad' -> false
 */
function isStrictlyIIT(instituteName) {
  const name = (instituteName || '').trim();

  // Full-form check (exclude Information Technology variant)
  if (/\bIndian\s+Institute\s+of\s+Technology\b/i.test(name) &&
    !/\bInformation\s+Technology\b/i.test(name)) {
    return true;
  }

  // Acronym check: 'IIT' that is NOT preceded by an extra 'I' (i.e. not 'IIIT')
  // \bIIT\b matches 'IIT' as a whole word; we additionally verify the character
  // just before 'IIT' (if any) is not another 'I'.
  if (/(?<![I])\bIIT\b/i.test(name)) {
    return true;
  }

  return false;
}

async function clientRecommend(p) {
  await loadDataFiles();

  const {
    exam, rankMain, rankAdvanced, category, gender, homeState,
    branches, pwdStatus
  } = p;

  const mainNum = rankMain ? parseInt(String(rankMain).replace(/,/g, ''), 10) : null;
  const advNum = rankAdvanced ? parseInt(String(rankAdvanced).replace(/,/g, ''), 10) : null;

  if (!exam || (exam === 'JEE Main' && !mainNum) || (exam === 'JEE Advanced' && !advNum) || (exam === 'Both' && (!mainNum || !advNum))) {
    return { ready: false, message: 'Please complete your profile.' };
  }

  const cat = category || 'OPEN';
  const seatTypes = getSeatTypes(cat, pwdStatus);
  const preferredBranches = branches
    ? branches.split(',').map(normalizeBranchQuery).filter(Boolean)
    : [];

  const targetYear = latestYearVal;
  const targetRound = finalRoundsMap.get(targetYear);

  const results = [];
  const seen = new Set();

  const allInstitutes = [...(masterInstitutes.IITs || []), ...(masterInstitutes.NITs || []), ...(masterInstitutes.IIITs || []), ...(masterInstitutes.IIESTs || []), ...(masterInstitutes.GFTIs || [])];
  const instMap = new Map();
  allInstitutes.forEach(i => instMap.set(normalizeName(i.name), i));

  for (const record of cutoffsCache) {
    if (record.round !== targetRound || record.year !== targetYear) continue;

    // Name-based IIT detection - robust against missing/wrong instituteType
    const isIIT = isStrictlyIIT(record.institute);

    // --- 1. EXAM GUARD & DYNAMIC RANK ROUTING -------------------------------
    let targetRank;
    if (exam === 'JEE Main') {
      if (isIIT) continue;
      targetRank = mainNum;
    } else if (exam === 'JEE Advanced') {
      if (!isIIT) continue;
      targetRank = advNum;
    } else if (exam === 'Both') {
      targetRank = isIIT ? advNum : mainNum;
    }
    if (!targetRank) continue;

    // Exclude Paper 2 programs (Architecture, Planning, Landscape)
    const programLower = (record.program || '').toLowerCase();
    if (
      programLower.includes('architecture') ||
      programLower.includes('planning') ||
      programLower.includes('landscape')
    ) continue;

    // --- 2. STRICT BRANCH GUARD ---------------------------------------------
    if (preferredBranches.length > 0) {
      const matchesBranch = preferredBranches.some(br => programLower.includes(br));
      if (!matchesBranch) continue;
    }

    const inst = instMap.get(normalizeName(record.institute));
    if (!matchStrictProfile(record, p, inst?.state)) continue;

    const key = `${record.institute}||${record.program}||${record.quota}||${record.seatType}||${record.gender}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const instKey = normalizeName(record.institute);
    const progKey = normalizeName(record.program);
    const statsKey = `${instKey}||${progKey}||${record.quota}||${record.seatType}||${record.gender}`;
    const stats = seatStats.get(statsKey);

    // Defensive cast: always coerce closingRank to a real integer.
    // If the JSON source emits strings (e.g. "1800" instead of 1800),
    // a raw `+` would concatenate rather than add.
    const rawClosing = record.closingRank;
    const currentClosing = (typeof rawClosing === 'number' && Number.isFinite(rawClosing))
      ? rawClosing
      : parseInt(String(rawClosing).replace(/[^\d]/g, ''), 10);

    // Compute average from stats; guard against NaN and divide-by-zero.
    let avgClosing;
    if (stats && stats.count > 0 && Number.isFinite(stats.sum)) {
      avgClosing = stats.sum / stats.count;
    } else if (Number.isFinite(currentClosing) && currentClosing > 0) {
      avgClosing = currentClosing;
    } else {
      continue; // no usable rank data - skip
    }

    // Final sanity gate: avgClosing must be a positive finite number
    if (!Number.isFinite(avgClosing) || avgClosing <= 0) continue;

    const band = classifyBand(targetRank, avgClosing);

    results.push({
      institute: record.institute,
      instituteType: record.instituteType,
      program: record.program,
      quota: record.quota,
      seatType: record.seatType,
      gender: record.gender,
      openingRank: record.openingRank,
      closingRank: currentClosing,
      avgClosingRank: Math.round(avgClosing),
      closingNumeric: currentClosing,
      round: record.round,
      year: record.year,
      band,
      branchScore: branchScore(record.program, preferredBranches),
      city: inst?.city || '',
      state: inst?.state || '',
      nirf: inst?.nirf_2024 || null
    });
  }

  let categorizedResults = results.filter(r => r.band !== null);

  const dedupMap = new Map();
  for (const r of categorizedResults) {
    const dKey = `${r.institute}||${r.program}||${r.seatType}||${r.gender}`;
    if (!dedupMap.has(dKey)) {
      dedupMap.set(dKey, r);
    } else {
      const existing = dedupMap.get(dKey);
      const priority = { 'HS': 3, 'OS': 2, 'AI': 1 };
      if ((priority[r.quota] || 0) > (priority[existing.quota] || 0)) {
        dedupMap.set(dKey, r);
      }
    }
  }
  categorizedResults = Array.from(dedupMap.values());

  // --- EXTREME RANK FALLBACK ------------------------------------------------
  if (categorizedResults.length === 0 && results.length > 0) {
    results.sort((a, b) => (b.avgClosingRank || 0) - (a.avgClosingRank || 0));
    categorizedResults = results.slice(0, 30).map(r => ({ ...r, band: 'AMBITIOUS' }));
  }

  const bucketOrder = { AMBITIOUS: 0, BALANCED: 1, SAFE: 2 };
  categorizedResults.sort((a, b) => {
    const bucketDiff = (bucketOrder[a.band] ?? 9) - (bucketOrder[b.band] ?? 9);
    if (bucketDiff !== 0) return bucketDiff;

    // Prioritize explicitly specified branches if the user typed them in
    if (preferredBranches.length > 0) {
      const aMatches = preferredBranches.some(p => a.program.toLowerCase().includes(p)) ? 1 : 0;
      const bMatches = preferredBranches.some(p => b.program.toLowerCase().includes(p)) ? 1 : 0;
      if (bMatches !== aMatches) return bMatches - aMatches;
    }

    // Sort strictly by avgClosingRank ASCENDING (most prestigious/lowest number first)
    return (a.avgClosingRank || Infinity) - (b.avgClosingRank || Infinity);
  });

  return {
    ready: true,
    results: categorizedResults,
    fullResults: results,
    choiceList: categorizedResults,
    total: categorizedResults.length,
    message: `Found ${categorizedResults.length} matching options.`
  };
}

let sessions = JSON.parse(localStorage.getItem("apnaSaathiChats") || "[]");
let activeSlide = 0;
let historyQuery = "";
let activeMode = "normal";
let showOnlySaved = false;
let activeChancesType = "IIT";
let chancesCache = null;
const PREF_STORAGE_KEY = "apnaSaathiPreferenceRows";
let preferenceState = {
  rows: [],
  undo: [],
  redo: [],
  snapshots: []
};
const savedComparisonsKey = "apnaSaathiSavedComparisons";

// --- Preference localStorage helpers ----------------------------------------
function savePreferenceToStorage() {
  try {
    localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(preferenceState.rows));
  } catch (e) {
    console.warn('Could not save preference list:', e);
  }
}

function loadPreferenceFromStorage() {
  try {
    const stored = localStorage.getItem(PREF_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        preferenceState.rows = parsed;
      }
    }
  } catch (e) {
    console.warn('Could not load preference list:', e);
  }
}

// Hydrate immediately on script load
loadPreferenceFromStorage();
const screenLabels = {
  choiceScreen: "Dashboard",
  profileScreen: "Profile",
  chatScreen: "Ask Saathi",
  chancesScreen: "My Chances",
  preferenceScreen: "Preference List",
  compareScreen: "Compare"
};
const counsellingDeadline = new Date("2026-06-19T17:00:00+05:30");
const rotatingTips = [
  {
    title: "Daily counselling tip",
    text: "Fill at least 25 choices to improve upgrade chances."
  },
  {
    title: "Did you know?",
    text: "Students who fill broader balanced options usually avoid empty rounds."
  },
  {
    title: "Quick action",
    text: "Review only top 10 choices daily to keep your order sharp and stress low."
  }
];
const topNews = [
  "Mock seat-allocation window active this week for profile verification.",
  "JoSAA helpline hours extended during round locking dates.",
  "Seat acceptance checklist updated for this counselling season."
];

function profile() {
  return Object.fromEntries(fields.map((field) => [field, $(field)?.value?.trim() || ""]));
}

function hasRequiredProfile() {
  const data = profile();
  const exam = data.exam;
  if (exam === "JEE Main") return Boolean(data.exam && data.rankMain && data.category && data.gender);
  if (exam === "JEE Advanced") return Boolean(data.exam && data.rankAdvanced && data.category && data.gender);
  return Boolean(data.exam && data.rankMain && data.rankAdvanced && data.category && data.gender);
}

function saveProfile() {
  const next = profile();
  localStorage.setItem("apnaSaathiProfile", JSON.stringify(next));
  renderProfileSummary();
  chancesCache = null; // Invalidate cache so My Chances re-fetches with new profile
}

function updateRankInputsVisibility() {
  const exam = $("exam").value;
  const category = $("category").value;
  const mainLabel = $("rankMainLabel");
  const advLabel = $("rankAdvancedLabel");
  if (!mainLabel || !advLabel) return;

  if (exam === "JEE Main") {
    mainLabel.style.display = "block";
    advLabel.style.display = "none";
  } else if (exam === "JEE Advanced") {
    mainLabel.style.display = "none";
    advLabel.style.display = "block";
  } else {
    mainLabel.style.display = "block";
    advLabel.style.display = "block";
  }

  const mainSuffix = $("rankMainSuffix");
  const advSuffix = $("rankAdvancedSuffix");

  const helperText = category === "OPEN" ? "" : " (Enter category rank)";
  console.log("Updating rank visibility. Category:", category, "Helper:", helperText, "mainSuffix exists?", !!mainSuffix);

  if (mainSuffix) mainSuffix.textContent = helperText;
  if (advSuffix) advSuffix.textContent = helperText;
}

function loadProfile() {
  const saved = JSON.parse(localStorage.getItem("apnaSaathiProfile") || "{}");
  fields.forEach((field) => {
    if (saved[field] !== undefined && $(field)) $(field).value = saved[field];
  });
  updateRankInputsVisibility();
  renderProfileSummary();
  maybeLoadSharedProfile();
}

function renderProfileSummary() {
  const data = profile();
  const rankPart = data.exam === "JEE Main" ? `Main: ${data.rankMain}` : data.exam === "JEE Advanced" ? `Adv: ${data.rankAdvanced}` : `M: ${data.rankMain}, A: ${data.rankAdvanced}`;
  const parts = [data.exam, (data.rankMain || data.rankAdvanced) && rankPart, data.category, data.branches].filter(Boolean);
  const profileSummary = $("profileSummary");
  if (profileSummary) profileSummary.textContent = parts.length ? parts.join(" - ") : "Not saved yet";
  const completionFields = ["studentName", "exam", "rankMain", "rankAdvanced", "category", "gender", "homeState", "branches", "pwdStatus"];
  const completed = completionFields.filter((field) => {
    if (field === "rankMain" && data.exam === "JEE Advanced") return true;
    if (field === "rankAdvanced" && data.exam === "JEE Main") return true;
    return Boolean(data[field]);
  }).length;
  const percent = Math.round((completed / completionFields.length) * 100);
  const progressLabel = $("profileProgressLabel");
  const progressBar = $("profileProgressBar");
  if (progressLabel) progressLabel.textContent = `${percent}% complete`;
  if (progressBar) progressBar.style.width = `${percent}%`;
  renderHomePersonalization(data, percent);
  updateTopbar("choiceScreen");
  renderProfileVisuals(data);
}

function setStep(number) {
  document.querySelectorAll(".step").forEach((step) => {
    step.classList.toggle("active", step.dataset.step === String(number));
  });
}

function showScreen(id, step = 3) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.target === id);
  });
  updateTopbar(id);
  updateBreadcrumb(id);
  setStep(step);
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (id === "chancesScreen") {
    requireProfile("chancesScreen");
    renderChances();
  }
}

function updateBreadcrumb(screenId) {
  const bc = $("breadcrumbs");
  if (!bc) return;
  bc.textContent = `Home / ${screenLabels[screenId] || "Dashboard"}`;
}

function setButtonLoading(buttonId, loading, busyText = "Loading...") {
  const btn = $(buttonId);
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    btn.textContent = busyText;
    btn.classList.add("btn-loading");
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalText || btn.textContent;
    btn.classList.remove("btn-loading");
    btn.disabled = false;
  }
}

function updateTopbar(screenId) {
  const greeting = $("pageGreeting");
  const title = $("pageTitle");
  if (!greeting || !title) return;

  const name = $("studentName")?.value.trim();
  if (screenId === "choiceScreen") {
    greeting.textContent = name ? `Hi, ${name}` : "Hi";
    title.textContent = "What's on your mind today?";
    const homeGreeting = $("homeGreeting");
    if (homeGreeting) homeGreeting.textContent = name ? `Hi, ${name}` : "Hi, Jash Jain";
    return;
  }

  greeting.textContent = "Hi";
  title.textContent = $(screenId)?.dataset.title || "Apna Saathi";
}

function requireProfile(nextScreen) {
  if (hasRequiredProfile()) {
    showScreen(nextScreen, 3);
    return true;
  }
  localStorage.setItem("apnaSaathiAfterProfile", nextScreen);
  showScreen("profileScreen", 1);
  return false;
}

function setSlide(index) {
  const total = document.querySelectorAll("#featureTrack .tool-card").length;
  activeSlide = (index + total) % total;
  document.querySelectorAll("#featureTrack .tool-card").forEach((card, cardIndex) => {
    card.classList.toggle("active", cardIndex === activeSlide);
  });
  document.querySelectorAll(".slider-dots .dot").forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.slide) === activeSlide);
  });
}

function renderHomePersonalization(data, percent) {
  const greeting = $("insightGreeting");
  const subtitle = $("insightSubtitle");
  const safePicks = $("safePicks");
  const cta = $("insightCtaBtn");
  if (!greeting || !subtitle || !safePicks || !cta) return;

  if ((data.exam === "JEE Main" && !data.rankMain) || (data.exam === "JEE Advanced" && !data.rankAdvanced) || (data.exam === "Both" && (!data.rankMain || !data.rankAdvanced))) {
    greeting.textContent = "Welcome back! Complete your profile to unlock insights";
    subtitle.textContent = "We will show your rank-positioned opportunities once profile details are filled.";
    safePicks.innerHTML = '<div class="pick-chip">Add profile to see top safe picks</div>';
    cta.textContent = "Complete profile";
    cta.onclick = () => showScreen("profileScreen", 1);
    return;
  }

  const rankVal = data.exam === "JEE Advanced" ? data.rankAdvanced : data.rankMain;
  const rankNum = Number(rankVal.replace(/,/g, ""));
  const picks = rankNum <= 2500
    ? ["IIT Roorkee ME", "IIT BHU Civil", "IIT Mandi EE"]
    : rankNum <= 10000
      ? ["NIT Trichy ECE", "NIT Surathkal EE", "IIIT Allahabad IT"]
      : ["NIT Jalandhar ECE", "IIITDM Kancheepuram CSE", "GFTI safer band mix"];

  greeting.textContent = `Welcome back! Your rank ${rankVal} (${data.category}) is competitive for ${Math.min(47, Math.max(16, Math.floor(62000 / Math.max(1, rankNum))))} branches`;
  subtitle.textContent = percent < 100
    ? `Profile is ${percent}% complete. Add missing details for stronger recommendations and safer ordering.`
    : "Profile is complete. You can now generate cleaner safe-balanced-ambitious lists.";
  safePicks.innerHTML = picks.map((pick) => `<div class="pick-chip">${pick}</div>`).join("");
  cta.textContent = percent < 100 ? "Complete remaining profile" : "Generate preference list";
  cta.onclick = () => {
    if (percent < 100) {
      showScreen("profileScreen", 1);
      return;
    }
    showScreen("preferenceScreen", 3);
    generatePreferenceList("preferenceResults");
  };
}

function startCountdown() {
  const timer = $("countdownTimer");
  const urgentCardText = $("urgentCardText");
  if (!timer) return;
  const tick = () => {
    const diff = counsellingDeadline.getTime() - Date.now();
    if (diff <= 0) {
      timer.textContent = "00h 00m 00s";
      if (urgentCardText) urgentCardText.textContent = "Deadline has passed. Check round-result and reporting next steps now.";
      return;
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    timer.textContent = `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
    if (urgentCardText) {
      urgentCardText.textContent = hours < 24
        ? "Deadline in under 24 hours: lock safe + balanced choices now."
        : "Keep reviewing priorities daily before lock deadline.";
    }
  };
  tick();
  setInterval(tick, 1000);
}

function startRotatingTips() {
  const title = $("rotatingTipTitle");
  const text = $("rotatingTipText");
  if (!title || !text) return;
  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % rotatingTips.length;
    title.textContent = rotatingTips[idx].title;
    text.textContent = rotatingTips[idx].text;
  }, 4200);
}

function renderNewsFeed() {
  const newsFeed = $("newsFeed");
  if (!newsFeed) return;
  newsFeed.innerHTML = `<ul class="news-list">${topNews.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function persistSessions() {
  localStorage.setItem("apnaSaathiChats", JSON.stringify(sessions.slice(0, 25)));
  renderHistory();
}

function currentSession() {
  let session = sessions.find((item) => item.id === currentSessionId);
  if (!session) {
    session = {
      id: currentSessionId,
      title: "New counselling chat",
      messages: [],
      updatedAt: new Date().toISOString(),
      pinned: false
    };
    sessions.unshift(session);
  }
  return session;
}

function renderHistory() {
  const target = $("chatHistory");
  if (!sessions.length) {
    target.innerHTML = '<div class="history-item">No previous chats yet<span>Your doubts will appear here.</span></div>';
    return;
  }
  const q = historyQuery.trim().toLowerCase();
  const filtered = sessions
    .filter((s) => {
      if (!q) return true;
      const hay = `${s.title} ${s.messages?.map((m) => m.text).join(" ")}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  target.innerHTML = filtered
    .map(
      (session) => `<button class="history-item" data-session="${session.id}">
        <div class="history-row">
          <div class="history-title-wrap">
            <b class="history-title">${escapeHtml(session.title)}</b>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div class="rename-btn" data-rename="${session.id}" aria-label="Rename chat" title="Rename" role="button" tabindex="0">✏️</div>
            <span class="pin" data-pin="${session.id}" aria-label="Pin chat">${session.pinned ? "📌" : "📍"}</span>
          </div>
        </div>
        <span>${new Date(session.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
      </button>`
    )
    .join("");
  target.querySelectorAll("[data-session]").forEach((button) => {
    button.addEventListener("click", () => loadSession(button.dataset.session));
  });
  target.querySelectorAll("[data-rename]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.rename;
      const s = sessions.find((x) => x.id === id);
      if (!s) return;
      const newName = prompt("Enter new chat name:", s.title);
      if (newName !== null && newName.trim()) {
        s.title = newName.trim();
        s.updatedAt = new Date().toISOString();
        persistSessions();
      }
    });
  });
  target.querySelectorAll("[data-pin]").forEach((pin) => {
    pin.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = pin.dataset.pin;
      const s = sessions.find((x) => x.id === id);
      if (!s) return;
      s.pinned = !s.pinned;
      s.updatedAt = new Date().toISOString();
      persistSessions();
    });
  });
}

function loadSession(id) {
  const session = sessions.find((item) => item.id === id);
  if (!session) return;
  currentSessionId = id;
  $("messages").innerHTML = "";
  session.messages.forEach((message) => addMessage(message.role, message.text, false, message));
  renderEmptyState();
  showScreen("chatScreen", 3);
}

function addMessage(role, text, persist = true, messageObj) {
  const messageId = messageObj?.id || `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const box = document.createElement("article");
  box.className = `message ${role}`;
  box.dataset.messageId = messageId;
  const label = document.createElement("span");
  label.textContent = role === "user" ? "You" : "Apna Saathi";

  // MARDKOWN TRANSLATOR FIX ------------------------------------------
  const body = document.createElement("div");
  body.className = "message-body";
  if (role === "bot" && typeof marked !== 'undefined') {
    body.innerHTML = marked.parse(text);
  } else {
    body.textContent = text;
  }
  // ------------------------------------------------------------------

  box.append(label, body);

  if (role === "bot") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    // ALIEN EMOJI FIX ------------------------------------------------
    actions.innerHTML = `
      <button class="action-btn" data-action="up" type="button">👍</button>
      <button class="action-btn" data-action="down" type="button">👎</button>
      <button class="action-btn" data-action="save" type="button">Save</button>
      <button class="action-btn" data-action="share" type="button">Share</button>
    `;
    // ----------------------------------------------------------------
    const followups = document.createElement("div");
    followups.className = "followups";
    followups.innerHTML = buildFollowupChips(text).map((t) => `<button class="chip" type="button" data-followup="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("");
    box.append(actions, followups);

    actions.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => onMessageAction(messageId, btn.dataset.action));
    });
    followups.querySelectorAll("[data-followup]").forEach((btn) => {
      btn.addEventListener("click", () => askBot(btn.dataset.followup));
    });
  }

  $("messages").appendChild(box);
  $("messages").scrollTop = $("messages").scrollHeight;
  renderEmptyState();

  if (!persist) return;
  const session = currentSession();
  session.messages.push({
    id: messageId,
    role,
    text,
    feedback: messageObj?.feedback ?? null,
    saved: messageObj?.saved ?? false
  });
  if (role === "user" && session.title === "New counselling chat") {
    session.title = text.trim().length < 5 ? "New counselling chat" : text.trim().slice(0, 52);
  }
  session.updatedAt = new Date().toISOString();
  persistSessions();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildFollowupChips(answerText) {
  const base = [
    "Summarise this in 4 steps.",
    "What mistakes should I avoid here?",
    "What should I do today?"
  ];
  const t = String(answerText || "").toLowerCase();
  if (t.includes("document")) base.unshift("Make me a JoSAA reporting document checklist.");
  if (t.includes("float") || t.includes("freeze") || t.includes("slide")) base.unshift("Give an example of float vs freeze vs slide for my case.");
  if (t.includes("preference") || t.includes("choice")) base.unshift("Help me rearrange my preference list safely.");
  if (t.includes("report")) base.unshift("What happens on reporting day? Give a checklist.");
  return base.slice(0, 5);
}

function onMessageAction(messageId, action) {
  const session = currentSession();
  const msg = session.messages.find((m) => m.id === messageId);
  if (!msg) return;

  if (action === "up" || action === "down") {
    msg.feedback = action;
    const node = document.querySelector(`[data-message-id="${messageId}"]`);
    node?.querySelectorAll(`[data-action="up"],[data-action="down"]`).forEach((b) => b.classList.remove("active"));
    node?.querySelector(`[data-action="${action}"]`)?.classList.add("active");
    persistSessions();
    return;
  }

  if (action === "save") {
    msg.saved = !msg.saved;
    const node = document.querySelector(`[data-message-id="${messageId}"]`);
    node?.querySelector(`[data-action="save"]`)?.classList.toggle("active", msg.saved);
    persistSessions();
    return;
  }

  if (action === "share") {
    const url = new URL(window.location.href);
    url.searchParams.set("chat", session.id);
    url.searchParams.set("msg", messageId);
    const link = url.toString();
    navigator.clipboard?.writeText(link).then(
      () => addMessage("bot", "Link copied. You can share this answer.", false),
      () => window.prompt("Copy this link:", link)
    );
  }
}

function renderEmptyState() {
  const empty = $("chatEmpty");
  const chips = $("emptyChips");
  if (!empty || !chips) return;
  const session = currentSession();
  const hasUser = session.messages.some((m) => m.role === "user");
  empty.hidden = hasUser;
  if (!hasUser && chips.childElementCount === 0) {
    const suggestions = [
      "What is the best branch for placements at my rank?",
      "Explain float vs freeze in simple terms",
      "Should I prefer IIT lower branch or NIT top branch?",
      "What documents do I need on reporting day?"
    ];
    chips.innerHTML = suggestions.map((t) => `<button class="prompt-card" type="button" data-suggest="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("");
    chips.querySelectorAll("[data-suggest]").forEach((b) => b.addEventListener("click", () => askBot(b.dataset.suggest)));
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function approxPercentile(rank, isMain = true) {
  const r = Number(String(rank || "").replace(/,/g, ""));
  if (!Number.isFinite(r) || r <= 0) return null;
  const total = isMain ? 1500000 : 200000;
  const pct = Math.max(0.1, Math.min(99.9, ((total - r) / total) * 100));
  return Math.round(pct * 10) / 10;
}

function renderProfileVisuals(data) {
  const pctTitle = $("percentileTitle");
  const pctBar = $("percentileBar");
  const pctNote = $("percentileNote");

  if (!pctTitle || !pctBar || !pctNote) return;

  const rMain = Number(String(data.rankMain || "").replace(/,/g, ""));
  const rAdv = Number(String(data.rankAdvanced || "").replace(/,/g, ""));
  const exam = data.exam;

  let mainPct = null;
  let advPct = null;

  if ((exam === "JEE Main" || exam === "Both") && rMain > 0) {
    mainPct = approxPercentile(rMain, true);
  }
  if ((exam === "JEE Advanced" || exam === "Both") && rAdv > 0) {
    advPct = approxPercentile(rAdv, false);
  }

  if (mainPct === null && advPct === null) {
    pctTitle.innerHTML = "Add rank to see percentile";
    pctBar.style.width = "0%";
    pctNote.textContent = "This is an approximate visualiser for quick intuition.";
  } else {
    let titleHTML = "";
    let widthStr = "0%";
    if (mainPct !== null && advPct !== null) {
      titleHTML = `Top ${Math.max(0.1, (100 - mainPct).toFixed(1))}% (Main) • Top ${Math.max(0.1, (100 - advPct).toFixed(1))}% (Adv)`;
      widthStr = `${Math.max(mainPct, advPct)}%`;
      pctNote.textContent = "Showing percentiles for both exams based on official test takers.";
    } else if (mainPct !== null) {
      titleHTML = `Top ${Math.max(0.1, (100 - mainPct).toFixed(1))}% of JEE Main takers`;
      widthStr = `${mainPct}%`;
      pctNote.textContent = "Approximate only; use official data for final decisions.";
    } else if (advPct !== null) {
      titleHTML = `Top ${Math.max(0.1, (100 - advPct).toFixed(1))}% of JEE Advanced takers`;
      widthStr = `${advPct}%`;
      pctNote.textContent = "Approximate only; use official data for final decisions.";
    }
    pctTitle.innerHTML = titleHTML;
    pctBar.style.width = widthStr;
  }
}

function buildShareLink(payload) {
  const json = JSON.stringify(payload);
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
  const url = new URL(window.location.href);
  url.searchParams.set("share", encoded);
  return url.toString();
}

function maybeLoadSharedProfile() {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get("share");
  if (!encoded) return;
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
    const incoming = JSON.parse(json);
    fields.forEach((field) => {
      if (incoming[field] !== undefined && $(field)) $(field).value = incoming[field];
    });
    renderProfileSummary();
  } catch {
    // ignore invalid share
  }
}

async function askBot(message) {
  requireProfile("chatScreen");

  // 1. INSTANT UI: Show user message and clear input
  addMessage("user", message);
  const msgInput = $("messageInput");
  if (msgInput) msgInput.value = "";

  // 2. Show typing indicator
  const msgHost = $("messages");
  const typingBubble = document.createElement("article");
  typingBubble.className = "message bot typing-indicator";
  typingBubble.innerHTML = `<span>Apna Saathi</span><p>Sathee is typing...</p>`;
  if (msgHost) msgHost.appendChild(typingBubble);
  msgHost?.scrollTo({ top: msgHost.scrollHeight, behavior: "smooth" });

  const confEl = $("confidence");
  if (confEl) confEl.textContent = "thinking";

  // 3. FREEMIUM GATE: Check tier before making API call
  if (currentUserTier !== 'Pro') {
    if (currentMessagesUsed >= 5) {
      // Remove typing indicator
      if (typingBubble.parentNode) typingBubble.remove();
      addMessage("bot", "🔒 You have reached your 5 free messages. Upgrade to Apna Sathee Pro to continue chatting with unlimited AI counselling.");
      showPaywall();
      if (confEl) confEl.textContent = "locked";
      return;
    }
  }

  // 4. FETCH from Python FastAPI backend
  try {
    const response = await fetch("https://apna-sathee-backend.onrender.com/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();

    // Remove typing indicator
    if (typingBubble.parentNode) typingBubble.remove();

    // Append AI response
    const reply = data.reply || data.answer || data.response || "I'm not sure how to answer that. Please try rephrasing.";
    addMessage("bot", reply);
    if (confEl) confEl.textContent = "answered";

    // 5. INCREMENT usage for Free users (background, non-blocking)
    if (currentUserTier !== 'Pro') {
      currentMessagesUsed++;
      if (currentUserUid) {
        const userRef = doc(db, 'users', currentUserUid);
        updateDoc(userRef, { free_messages_used: currentMessagesUsed })
          .then(() => console.log("📊 Message count updated:", currentMessagesUsed))
          .catch((err) => console.error("Failed to update message count:", err));
      }
    }

  } catch (error) {
    // Remove typing indicator
    if (typingBubble.parentNode) typingBubble.remove();

    console.error("Chat fetch error:", error);
    addMessage("bot", "⚠️ Connection error. Please ensure your backend server is running at localhost:8000.");
    if (confEl) confEl.textContent = "error";
  }
}

const contactUsBtn = $("contactUsBtn");
if (contactUsBtn) {
  contactUsBtn.addEventListener("click", () => {
    window.open("https://wa.me/919479923607?text=Hi,%20I%20need%20help%20with%20my%20counselling", "_blank");
  });
}


async function handleGeneratePreferenceList(targetId = "preferenceDnDList") {
  saveProfile();
  const target = $(targetId);
  target.innerHTML = '<div class="rec-card"><p>Checking college options...</p></div>';
  setButtonLoading("preferenceGenerateBtn", true, "Generating...");
  try {
    const data = await clientRecommend(profile());
    if (!data.ready) {
      lastChoiceList = [];
      $("exportBtn").disabled = true;
      target.innerHTML = `<div class="rec-card warning"><strong>Predictor updating</strong><p>The college predictor is being updated by the Apna Saathi team. You can still ask Apna Saathi or create a support request right now.</p></div>`;
      return;
    }
    if (!data.results.length) {
      lastChoiceList = [];
      $("exportBtn").disabled = true;
      $("reviewWithAiBtn") && ($("reviewWithAiBtn").disabled = true);
      $("exportShareBtn") && ($("exportShareBtn").disabled = true);
      target.innerHTML = '<div class="rec-card"><strong>Fill your profile to see personalized chances.</strong></div>';
      return;
    }
    const p = profile();

    lastChoiceList = generatePreferenceList(data.results, p);

    // Save to explicit global buckets
    currentAmbitious = lastChoiceList.filter(r => (r.band || '').toUpperCase() === 'AMBITIOUS');
    currentBalanced = lastChoiceList.filter(r => (r.band || '').toUpperCase() === 'BALANCED');
    currentSafe = lastChoiceList.filter(r => (r.band || '').toUpperCase() === 'SAFE');
    const exportPdfBtn = $("exportPdfBtn");
    if (exportPdfBtn) exportPdfBtn.disabled = lastChoiceList.length === 0;
    buildPreferenceBoard(lastChoiceList);
    const choiceSummary = $("choiceSummary");
    if (choiceSummary) choiceSummary.textContent = `${lastChoiceList.length} options ready`;

    const isBothExam = profile().exam === "Both";
    const filterContainer = $("systemFilterContainer");
    if (filterContainer) {
      filterContainer.style.display = "flex";
    }
    const instituteFilterGroup = $("instituteFilterGroup");
    if (instituteFilterGroup) {
      instituteFilterGroup.style.display = isBothExam ? "flex" : "none";
    }
  } catch (error) {
    target.innerHTML = `<div class="rec-card warning"><strong>Error</strong><p>${error.message}</p></div>`;
  } finally {
    setButtonLoading("preferenceGenerateBtn", false);
  }
}

function prefBand(row) {
  const b = String(row.band || "").toLowerCase();
  if (b === "safe") return "safe";
  if (b === "balanced") return "balanced";
  return "ambitious";
}

function generatePreferenceList(filteredDatabase, userProfile) {
  const mainNum = parseInt(String(userProfile.rankMain).replace(/,/g, ''), 10) || Number.MAX_VALUE;
  const advNum = parseInt(String(userProfile.rankAdvanced).replace(/,/g, ''), 10) || Number.MAX_VALUE;

  return filteredDatabase
    .sort((a, b) => (a.closingRank || Infinity) - (b.closingRank || Infinity))
    .slice(0, 200)
    .map(college => {
      const name = college.institute || "";
      const isIIT = name.includes('IIT') && !name.includes('IIIT');
      const appliedRank = isIIT ? advNum : mainNum;

      return {
        ...college,
        band: classifyBand(appliedRank, college.closingRank) || 'AMBITIOUS'
      };
    });
}

function clonePrefRows(rows) {
  return rows.map((r) => ({ ...r }));
}

function pushPrefUndoSnapshot() {
  preferenceState.undo.push(clonePrefRows(preferenceState.rows));
  if (preferenceState.undo.length > 50) preferenceState.undo.shift();
  preferenceState.redo = [];
}

function buildPreferenceBoard(sourceRows) {
  preferenceState.rows = clonePrefRows(sourceRows);
  preferenceState.undo = [];
  preferenceState.redo = [];
  savePreferenceToStorage();
  pushPreferenceSnapshot("Generated");
  renderPreferenceBoard();
}

function pushPreferenceSnapshot(reason) {
  const stamp = new Date().toLocaleString();
  preferenceState.snapshots.unshift({
    at: stamp,
    reason,
    count: preferenceState.rows.length,
    rows: clonePrefRows(preferenceState.rows)
  });
  preferenceState.snapshots = preferenceState.snapshots.slice(0, 12);
}

function renderPreferenceBoard() {
  const host = $("preferenceDnDList");
  const history = $("preferenceHistory");
  const count = $("prefCount");
  const warnings = $("prefWarnings");
  if (!host || !history || !count || !warnings) return;

  console.log("Top list [0] element:", preferenceState.rows[0]);

  count.textContent = String(preferenceState.rows.length);
  if (preferenceState.rows.length === 0) {
    host.innerHTML = '<div class="rec-card">Fill your profile to see personalized chances.</div>';
    warnings.innerHTML = "";
    return;
  }
  host.innerHTML = preferenceState.rows
    .map((row, index) => {
      const band = prefBand(row);
      return `<article class="pref-item sys-row ${band}" draggable="true" data-pref-idx="${index}" data-system="${isStrictlyIIT(row.institute) ? 'IIT' : 'NIT'}">
        <div class="drag-handle" title="Drag to reorder">⋮</div>
        <div class="pref-main">
          <div class="pref-top">
            <b>${index + 1}. ${escapeHtml(row.institute || "Institute")}</b>
            <span class="pref-band ${band}">${band}</span>
          </div>
          <p>${escapeHtml(row.program || "Program")} • Closing rank ${escapeHtml(row.closingRank || "-")} • Round ${escapeHtml(row.round || "-")}</p>
        </div>
        <button class="mini-btn remove-pref" type="button" data-remove-pref="${index}">Remove</button>
      </article>`;
    })
    .join("");

  const warningList = buildPreferenceWarnings();
  warnings.innerHTML = warningList.map((w) => `<div class="warning-chip">${escapeHtml(w)}</div>`).join("");

  history.innerHTML = preferenceState.snapshots
    .map(
      (s) => `<button class="history-item" type="button" data-load-snap="${escapeHtml(s.at)}">
        ${escapeHtml(s.reason)} <span>${escapeHtml(s.at)} • ${s.count} choices</span>
      </button>`
    )
    .join("");

  host.querySelectorAll("[data-remove-pref]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.removePref);
      pushPrefUndoSnapshot();
      preferenceState.rows.splice(i, 1);
      pushPreferenceSnapshot("Manual edit");
      syncLastChoiceList();
      renderPreferenceBoard();
    });
  });

  let dragIndex = null;
  host.querySelectorAll("[data-pref-idx]").forEach((item) => {
    item.addEventListener("dragstart", () => {
      dragIndex = Number(item.dataset.prefIdx);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (e) => e.preventDefault());
    item.addEventListener("drop", () => {
      const to = Number(item.dataset.prefIdx);
      if (!Number.isInteger(dragIndex) || dragIndex === to) return;
      pushPrefUndoSnapshot();
      const [moved] = preferenceState.rows.splice(dragIndex, 1);
      preferenceState.rows.splice(to, 0, moved);
      pushPreferenceSnapshot("Reordered");
      syncLastChoiceList();
      renderPreferenceBoard();
    });
  });

  history.querySelectorAll("[data-load-snap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const snap = preferenceState.snapshots.find((s) => s.at === btn.dataset.loadSnap);
      if (!snap) return;
      pushPrefUndoSnapshot();
      preferenceState.rows = clonePrefRows(snap.rows);
      syncLastChoiceList();
      renderPreferenceBoard();
    });
  });

  $("undoPrefBtn") && ($("undoPrefBtn").disabled = preferenceState.undo.length === 0);
  $("redoPrefBtn") && ($("redoPrefBtn").disabled = preferenceState.redo.length === 0);
}

function buildPreferenceWarnings() {
  const list = [];
  const safe = preferenceState.rows.filter((r) => prefBand(r) === "safe").length;
  if (safe < 5) list.push(`You have only ${safe} safe options - add more.`);
  const top = preferenceState.rows.slice(0, 5).map((r) => `${r.institute} ${r.program}`.toLowerCase());
  if (top.some((x) => x.includes("civil")) && top.some((x) => x.includes("cse"))) {
    list.push("Your top 5 mixes very different branch priorities - review intent.");
  }
  return list.slice(0, 3);
}

function syncLastChoiceList() {
  lastChoiceList = preferenceState.rows.map((row, idx) => ({ ...row, order: idx + 1 }));
  savePreferenceToStorage();
  $("exportPdfBtn") && ($("exportPdfBtn").disabled = lastChoiceList.length === 0);
}

function exportToPdf() {
  if (!lastChoiceList.length) return;
  const element = document.createElement("div");
  element.style.padding = "20px";
  element.style.fontFamily = "sans-serif";

  element.style.color = "#000000";

  let html = `<h1>Apna Saathi - JEE Preference List</h1>`;
  html += `<p>Generated on ${new Date().toLocaleString()}</p>`;
  html += `<table border="1" style="width:100%; border-collapse: collapse; margin-top: 20px;">
    <thead>
      <tr style="background: #f4f2ff; color: #000000;">
        <th style="padding: 8px;">Order</th>
        <th style="padding: 8px;">Safety</th>
        <th style="padding: 8px;">Institute</th>
        <th style="padding: 8px;">Program</th>
        <th style="padding: 8px;">Current Cutoff</th>
        <th style="padding: 8px;">Avg Cutoff</th>
      </tr>
    </thead>
    <tbody style="color: #000000;">`;

  lastChoiceList.forEach((row, index) => {
    html += `<tr>
      <td style="padding: 8px; text-align: center;">${index + 1}</td>
      <td style="padding: 8px; text-align: center;"><b>${row.band}</b></td>
      <td style="padding: 8px;">${row.institute}</td>
      <td style="padding: 8px;">${row.program}</td>
      <td style="padding: 8px; text-align: center;">${row.closingRank}</td>
      <td style="padding: 8px; text-align: center;">${row.avgClosingRank || '-'}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  element.innerHTML = html;

  const opt = {
    margin: 1,
    filename: 'apna-saathi-preference-list.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save();
}

function instituteGroup(type, name) {
  const t = String(type || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  if (n.includes("iit ") || t.includes("iit")) return "iit";
  if (n.includes("national institute of technology") || n.includes("nit ") || t.includes("national institute of technology") || t === "nit") return "nit";
  if (n.includes("indian institute of information technology") || n.includes("iiit ") || t.includes("iiit")) return "iiit";
  if (t.includes("gfti")) return "iiit";
  return "other";
}

function verdictFromBand(band) {
  if (band === "safe") return { key: "safe", label: "Safe pick", why: "Opened at your rank band in recent cutoffs (safer)." };
  if (band === "balanced") return { key: "borderline", label: "Borderline", why: "Close to your rank; depends on round/category movement." };
  return { key: "reach", label: "Reach", why: "Possible only if cutoffs shift favourably; keep as ambitious choices." };
}

function getProbability(userRank, closingRank) {
  return calculateAdmissionChance(userRank, closingRank);
}

function calculateAdmissionChance(userRank, closingRank) {
  if (!closingRank || closingRank <= 0 || !userRank || userRank <= 0) {
    return { percent: 0, color: '#ef4444', label: 'N/A' };
  }
  const margin = ((closingRank - userRank) / closingRank) * 100;

  if (margin > 20) {
    return { percent: 98, color: '#10b981', label: 'Very Safe' };
  }
  if (margin > 5) {
    return { percent: Math.min(99, Math.round(85 + margin)), color: '#34d399', label: 'High Chance' };
  }
  if (margin >= -5 && margin <= 5) {
    return { percent: Math.max(1, Math.min(99, Math.round(50 + (margin * 5)))), color: '#fbbf24', label: 'Realistic' };
  }
  if (margin > -20) {
    return { percent: Math.max(1, Math.round(20 + (margin + 20))), color: '#f87171', label: 'Risky' };
  }
  return { percent: 5, color: '#ef4444', label: 'Dream' };
}

function trendArrow() {
  const arrows = ["▲", "▼", "→"];
  return arrows[Math.floor(Math.random() * arrows.length)];
}

async function loadChancesData() {
  if (chancesCache) return chancesCache;
  const notice = $("chancesNotice");
  const meta = $("chancesMeta");
  try {
    const data = await clientRecommend(profile());
    if (!data.ready) {
      chancesCache = { ready: false, rows: [], message: data.message || "Cutoff data not loaded yet." };
    } else {
      const rows = (data.fullResults || data.results || []).map((r) => ({
        institute: r.institute,
        instituteType: r.instituteType,
        program: r.program,
        round1: r.openingRank || null,
        final: r.closingRank || null,
        seats: r.seats || "-",
        band: (r.band || "ambitious").toLowerCase(),
        year: r.year,
        round: r.round,
        quota: r.quota,
        seatType: r.seatType,
        gender: r.gender
      }));
      chancesCache = { ready: true, rows, message: data.message || "" };
    }
  } catch (e) {
    chancesCache = { ready: false, rows: [], message: `Could not load cutoffs (${e.message}).` };
  }

  if (meta) {
    const p = profile();
    const rankPart = p.exam === "JEE Main" ? `rank ${p.rankMain}` : p.exam === "JEE Advanced" ? `rank ${p.rankAdvanced}` : `M: ${p.rankMain}, A: ${p.rankAdvanced}`;
    meta.textContent = `${rankPart} • ${p.category || "OPEN"} • ${p.gender || "Gender-Neutral"}`;
  }
  if (notice) {
    notice.hidden = chancesCache.ready;
    notice.textContent = chancesCache.ready ? "" : chancesCache.message;
  }
  return chancesCache;
}

const TOP_7_IITS = ["IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kanpur", "IIT Kharagpur", "IIT Roorkee", "IIT Guwahati"];
const OLD_IITS = [...TOP_7_IITS, "IIT Hyderabad", "IIT (BHU) Varanasi", "IIT Indore", "IIT Gandhinagar", "IIT Ropar"];
const TOP_10_NITS = ["NIT Trichy", "NIT Karnataka (Surathkal)", "NIT Rourkela", "NIT Warangal", "NIT Calicut", "Visvesvaraya NIT , Nagpur", "Malaviya NIT Jaipur", "NIT Kurukshetra", "NIT Silchar", "NIT Durgapur"];

const branchAliases = {
  // Core Branches
  'cse': 'computer science',
  'cs': 'computer science',
  'ece': 'electronics and communication',
  'ee': 'electrical',
  'eee': 'electrical and electronics',
  'me': 'mechanical',
  'mech': 'mechanical',
  'ce': 'civil',
  'civil': 'civil',
  // NIT Specific / Specialized
  'it': 'information technology',
  'chem': 'chemical',
  'chemical': 'chemical',
  'meta': 'metallurgical',
  'met': 'metallurgical',
  'prod': 'production',
  'pi': 'production',
  'ipe': 'industrial',
  'instru': 'instrumentation',
  'eie': 'instrumentation',
  'ice': 'instrumentation',
  'bio': 'biotech',
  'biotech': 'biotech',
  'mnc': 'mathematics and computing',
  'mac': 'mathematics and computing',
  'math': 'mathematics',
  'aero': 'aerospace',
  'mining': 'mining',
  'textile': 'textile',
  'arch': 'architecture'
};

function getBadgeText(name) {
  const n = String(name || "").trim().toLowerCase();
  if (n.startsWith("indian institute of technology") || n.startsWith("iit")) return "IIT";
  if (n.startsWith("national institute of technology") || n.startsWith("nit")) return "NIT";
  return "GFTI";
}

function filterBranches(rows, query) {
  if (!query) return rows;

  const cleanQuery = query.trim().toLowerCase();
  const mappedQuery = branchAliases[cleanQuery];

  const safeQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactRegex = new RegExp(`\\b${safeQuery}\\b`, 'i');

  return rows.filter(r => {
    // 1. Isolate the Branch Column
    const program = String(r.program || "");
    const programLower = program.toLowerCase();

    // 2. Strict Acronym Mapping
    if (mappedQuery) {
      return programLower.includes(mappedQuery) || exactRegex.test(program);
    }

    // 3. Implement Keyword Exclusion & Whole Word Match
    if (exactRegex.test(program)) {
      return true;
    }

    // Fallback Substring Match with exclusions to prevent false positives like 'Degree' or 'Engineering'
    const strippedProgram = program
      .replace(/Engineering/gi, "")
      .replace(/Degree/gi, "")
      .trim()
      .toLowerCase();

    return strippedProgram.includes(cleanQuery);
  });
}

function renderChances() {
  const body = $("chancesBody");
  if (!body) return;

  loadChancesData().then((store) => {
    const rawQuery = String($("chBranch")?.value || "");
    const activeCategory = $("chCategoryFilter")?.value || (activeChancesType === "IIT" ? "all-iits" : "all-nits");
    const p = profile();

    let rows = store.rows.slice();
    const mainNum = p.rankMain ? parseInt(String(p.rankMain).replace(/,/g, ''), 10) : null;
    const advNum = p.rankAdvanced ? parseInt(String(p.rankAdvanced).replace(/,/g, ''), 10) : null;

    // Apply branch keyword filter first
    rows = filterBranches(rows, rawQuery);

    // Centralized single pass filter (AND logic)
    rows = rows.filter((r) => {
      const group = instituteGroup(r.instituteType, r.institute);

      if (activeCategory === "all-iits") {
        if (group !== "iit") return false;
      } else if (activeCategory === "all-nits") {
        if (group !== "nit") return false;
      } else {
        // Specific category logic
        if (activeChancesType === "IIT") {
          if (group !== "iit") return false;
          if (activeCategory === "top7" && !TOP_7_IITS.includes(r.institute)) return false;
          if (activeCategory === "old12" && !OLD_IITS.includes(r.institute)) return false;
          if (activeCategory === "newer" && OLD_IITS.includes(r.institute)) return false;
        } else {
          if (group !== "nit") return false;
          if (activeCategory === "top10" && !TOP_10_NITS.includes(r.institute)) return false;
          if (activeCategory === "bottom" && TOP_10_NITS.includes(r.institute)) return false;
        }
      }

      // Rank type & Institute type check
      if (group === "iit" && p.exam !== "JEE Advanced" && p.exam !== "Both") return false;
      if (group !== "iit" && p.exam !== "JEE Main" && p.exam !== "Both") return false;

      return true;
    });

    const safetyOrder = { safe: 0, balanced: 1, ambitious: 2, reach: 2 };
    rows.sort((a, b) => (safetyOrder[a.band] ?? 9) - (safetyOrder[b.band] ?? 9) || (a.final || 1e18) - (b.final || 1e18));

    const hasRank = Boolean(mainNum > 0 || advNum > 0);

    if (!hasRank) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;">Fill your profile rank to see personalized chances.</td></tr>`;
      return;
    }

    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--muted);">No branches match your current filters. Try clearing the search.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((r) => {
      const v = verdictFromBand(r.band === "ambitious" ? "ambitious" : r.band);
      const rowClass = v.key === "safe" ? "row-safe" : v.key === "borderline" ? "row-borderline" : "row-reach";
      const type = getBadgeText(r.institute);
      const round1 = r.round1 ?? "-";
      const final = r.final ?? "-";
      const seats = r.seats ?? "-";

      const finalRankNum = parseInt(String(r.final).replace(/,/g, ''), 10);
      const group = instituteGroup(r.instituteType, r.institute);
      let uRankNum = group === 'iit' ? advNum : mainNum;

      if (!uRankNum) {
        uRankNum = p.exam === 'JEE Advanced' ? advNum : mainNum;
      }

      let probUI = `<span class="verdict reach">N/A</span>`;
      if (uRankNum && !isNaN(finalRankNum) && finalRankNum > 0) {
        const prob = getProbability(uRankNum, finalRankNum);
        probUI = `
          <div style="display:flex; align-items:center; gap:8px;" title="${escapeHtml(v.why)}">
            <div style="width: 60px; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; flex-shrink: 0;">
              <div style="width: ${prob.percent}%; height: 100%; background: ${prob.color}; border-radius: 4px;"></div>
            </div>
            <div style="display:flex; flex-direction:column; line-height:1.2; min-width: 60px;">
              <span style="font-size:0.85em; font-weight:bold; color: var(--fg);">${prob.percent}%</span>
              <span style="font-size:0.7em; color:var(--muted); white-space: nowrap;">${prob.label}</span>
            </div>
          </div>
        `;
      }

      let trendUI = "-";
      if (cutoffsCache && r.quota && r.seatType && r.gender) {
        const historyData = cutoffsCache.filter(c =>
          c.institute === r.institute &&
          c.program === r.program &&
          c.quota === r.quota &&
          c.seatType === r.seatType &&
          c.gender === r.gender &&
          c.round === finalRoundsMap.get(c.year)
        ).sort((a, b) => a.year - b.year);

        if (historyData.length > 0) {
          trendUI = `<div style="display:flex; flex-direction:column; font-size:0.75em; color:var(--muted); line-height:1.3; white-space:nowrap;">` +
            historyData.slice(-3).map(c => {
              const cr = (typeof c.closingRank === 'number' && Number.isFinite(c.closingRank))
                ? c.closingRank
                : parseInt(String(c.closingRank).replace(/[^\\d]/g, ''), 10);
              return `<span>${c.year}: <b>${cr || 'N/A'}</b></span>`;
            }).join("") +
            `</div>`;
        } else {
          trendUI = trendArrow();
        }
      } else {
        trendUI = trendArrow();
      }

      const id = `${r.institute}__${r.program}`.replace(/\s+/g, "_");
      const alreadyAdded = preferenceState.rows.some(
        (p) => p.institute === r.institute && p.program === r.program
      );
      const btnClass = alreadyAdded ? "add-pref added" : "add-pref";
      const btnText = alreadyAdded ? "Added ✓" : "Add to preference";
      const btnDisabled = alreadyAdded ? "disabled" : "";
      return `<tr class="${rowClass}">
        <td><span class="inst-badge"><b>${escapeHtml(r.institute)}</b> <span class="inst-type">${escapeHtml(type)}</span></span></td>
        <td>${escapeHtml(r.program)}</td>
        <td>${escapeHtml(round1)}</td>
        <td>${escapeHtml(final)}</td>
        <td>${trendUI}</td>
        <td>${escapeHtml(seats)}</td>
        <td>${probUI}</td>
        <td class="row-action"><button class="${btnClass}" type="button" data-add-pref="${escapeHtml(id)}" ${btnDisabled}>${btnText}</button></td>
      </tr>`;
    }).join("");

    body.querySelectorAll("[data-add-pref]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        const institute = tr?.querySelector("td:nth-child(1) b")?.textContent || "";
        const program = tr?.querySelector("td:nth-child(2)")?.textContent || "";
        const closingRank = tr?.querySelector("td:nth-child(4)")?.textContent || "-";
        const round1 = tr?.querySelector("td:nth-child(3)")?.textContent || "-";

        // Find the full row data from the current filtered set
        const matchedRow = rows.find(r => r.institute === institute && r.program === program) || {};

        // Use the exact schema from clientRecommend to prevent drag-and-drop crashes
        addToPreference({
          institute: institute,
          instituteType: matchedRow.instituteType || "",
          program: program,
          quota: matchedRow.quota || "",
          seatType: matchedRow.seatType || "",
          gender: matchedRow.gender || "",
          openingRank: matchedRow.round1 || round1,
          closingRank: matchedRow.final || closingRank,
          avgClosingRank: matchedRow.avgClosingRank || null,
          closingNumeric: matchedRow.final || parseInt(String(closingRank).replace(/[^\\d]/g, ''), 10) || null,
          round: matchedRow.round || "-",
          year: matchedRow.year || "-",
          band: matchedRow.band || "balanced",
          branchScore: matchedRow.branchScore || 0,
          city: matchedRow.city || "",
          state: matchedRow.state || "",
          nirf: matchedRow.nirf || null
        }, btn);
      });
    });
  });
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3500);
}

function addToPreference(item, btn) {
  // --- 1. Read latest from localStorage before writing ------------------------
  loadPreferenceFromStorage();

  // --- 2. Duplicate check against the live list -------------------------------
  const isDuplicate = preferenceState.rows.some(
    (r) => r.institute === item.institute && r.program === item.program
  );

  if (isDuplicate) {
    if (btn) {
      btn.textContent = "Already added";
      btn.classList.add("already");
      btn.disabled = true;
    }
    showToast("⚠️ This college + branch combo is already in your preference list.");
    return;
  }

  // --- 3. Push to the bottom (no auto-sort, no cap) ---------------------------
  pushPrefUndoSnapshot();
  preferenceState.rows.push({ ...item, at: new Date().toISOString() });
  pushPreferenceSnapshot("Added manually");
  syncLastChoiceList();   // this also calls savePreferenceToStorage()

  // --- 4. Force re-render if Preference List tab is active --------------------
  if ($("preferenceScreen").classList.contains("active")) {
    renderPreferenceBoard();
  }

  // --- 5. UI feedback ---------------------------------------------------------
  if (btn) {
    btn.textContent = "Added ✓";
    btn.classList.add("added");
    btn.disabled = true;
  }

  showToast(`✅ Added to your preference list (${preferenceState.rows.length} total). You can sort it later!`);
}

listen("chatForm", "submit", (event) => {
  event.preventDefault();
  const message = $("messageInput").value.trim();
  if (!message) return;
  askBot(message);
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => askBot(button.dataset.prompt));
});

document.querySelectorAll(".resource-link").forEach((button) => {
  button.addEventListener("click", () => askBot(button.dataset.prompt));
});

listen("preferenceGenerateBtn", "click", () => handleGeneratePreferenceList("preferenceDnDList"));

listen("chatSupportBtn", "click", () => $("supportDialog").showModal());
listen("closeSupportBtn", "click", () => $("supportDialog").close());

function hashScore(text, salt = "") {
  const s = `${text}|${salt}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h;
}

function splitInstituteBranch(label) {
  const raw = String(label || "").trim();
  const parts = raw.split(/\s+/);
  if (parts.length < 2) return { institute: raw || "Unknown", branch: "Not specified" };
  return { institute: parts.slice(0, -1).join(" "), branch: parts.slice(-1).join(" ") };
}

async function fetchInstituteDetails(query) {
  try {
    await loadDataFiles();
    const all = [...(masterInstitutes.IITs || []), ...(masterInstitutes.NITs || []), ...(masterInstitutes.IIITs || []), ...(masterInstitutes.IIESTs || []), ...(masterInstitutes.GFTIs || [])];
    const q = normalizeName(query);
    if (!q) return [];
    const results = all.filter(i => normalizeName(i.name).includes(q) || normalizeName(i.code || '').includes(q)).slice(0, 10);
    return results.map(i => ({ ...i, label: i.name }));
  } catch {
    return [];
  }
}

async function fetchInstituteById(id) {
  try {
    await loadDataFiles();
    const all = [...(masterInstitutes.IITs || []), ...(masterInstitutes.NITs || []), ...(masterInstitutes.IIITs || []), ...(masterInstitutes.IIESTs || []), ...(masterInstitutes.GFTIs || [])];
    return all.find(i => i.code === id || i.name === id) || null;
  } catch {
    return null;
  }
}

async function compareInstitutes(options) {
  try {
    const data = await postJson("/api/compare", { options });
    return data.ok ? data.options : [];
  } catch {
    return [];
  }
}



function classByRank(values, value) {
  const sorted = [...values].sort((a, b) => b - a);
  const top = sorted[0];
  const mid = sorted[1] ?? sorted[0];
  if (value === top) return "compare-better";
  if (value === mid) return "compare-mid";
  return "compare-low";
}

function renderCompareTable(options) {
  const body = $("compareTableBody");
  if (!body) return;
  if (!options.length) {
    body.innerHTML = `<tr><td colspan="4">No data available for these options.</td></tr>`;
    return;
  }
  const rows = [
    ["Closing Rank", "r5"]
  ];
  body.innerHTML = rows
    .map(([label, key]) => {
      const vals = options.map((o) => {
        if (key === "locationClimate") return `${o.city || "-"}, ${o.state || "-"}`;
        return o[key] !== undefined && o[key] !== null && o[key] !== "" ? o[key] : "-";
      });
      const numeric = options.map((o) => (typeof o[key] === "number" ? o[key] : parseFloat(String(o[key]).replace(/[^\d.]/g, "")) || 0));
      return `<tr>
        <td class="compare-metric">${label}</td>
        ${vals
          .map((v, i) => `<td><div class="${classByRank(numeric, numeric[i])}">${escapeHtml(v)}</div></td>`)
          .join("")}
        ${Array.from({ length: Math.max(0, 3 - vals.length) }).map(() => "<td>-</td>").join("")}
      </tr>`;
    })
    .join("");
}

function currentCompareInputs() {
  return [$("compareA")?.value.trim(), $("compareB")?.value.trim(), $("compareC")?.value.trim()].filter(Boolean);
}

function saveComparison(options, verdictText) {
  const log = JSON.parse(localStorage.getItem(savedComparisonsKey) || "[]");
  log.unshift({
    id: `cmp-${Date.now()}`,
    at: new Date().toISOString(),
    options: options.map((o) => o.label),
    verdictText
  });
  localStorage.setItem(savedComparisonsKey, JSON.stringify(log.slice(0, 20)));
  renderSavedComparisons();
}

function renderSavedComparisons() {
  const host = $("savedComparisons");
  if (!host) return;
  const log = JSON.parse(localStorage.getItem(savedComparisonsKey) || "[]");
  if (!log.length) {
    host.innerHTML = '<div class="history-item">No saved comparisons<span>Save one to revisit later.</span></div>';
    return;
  }
  host.innerHTML = log
    .map((s) => `<button class="history-item" data-load-cmp="${s.id}">
      ${escapeHtml(s.options.join(" vs "))}
      <span>${new Date(s.at).toLocaleString()}</span>
    </button>`)
    .join("");
  host.querySelectorAll("[data-load-cmp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = log.find((x) => x.id === btn.dataset.loadCmp);
      if (!item) return;
      $("compareA").value = item.options[0] || "";
      $("compareB").value = item.options[1] || "";
      $("compareC").value = item.options[2] || "";
      $("compareResult").innerHTML = `<div class="rec-card"><strong>Saved verdict</strong><p class="compare-analysis">${escapeHtml(item.verdictText || "No verdict saved.")}</p></div>`;
      runCompare();
    });
  });
}

async function runCompare() {
  const labels = currentCompareInputs();
  if (labels.length < 2) {
    showToast("Need at least 2 options (Option A and Option B).");
    renderCompareTable([]);
    return;
  }

  setButtonLoading("compareBtn", true, "Fetching details...");

  try {
    const options = [];
    for (const label of labels) {
      let institute = label;
      let branch = "Not specified";
      if (label.includes(" - ")) {
        const parts = label.split(" - ");
        institute = parts[0].trim();
        branch = parts.slice(1).join(" - ").trim();
      } else {
        const split = splitInstituteBranch(label);
        institute = split.institute;
        branch = split.branch;
      }

      const detailsArray = await fetchInstituteDetails(institute);
      const details = detailsArray.length > 0 ? detailsArray[0] : {};

      let openingRank = "-";
      let closingRank = "-";

      if (cutoffsCache) {
        const p = profile();
        const cat = p.category || 'OPEN';
        const norm = (str) => (str || '').toLowerCase().replace(/[\s\-()]/g, '');
        const validCats = getSeatTypes(cat, p.pwdStatus).map(norm);
        const isFemale = norm(p.gender).includes('female');

        const allInstitutes = [...(masterInstitutes.IITs || []), ...(masterInstitutes.NITs || []), ...(masterInstitutes.IIITs || []), ...(masterInstitutes.IIESTs || []), ...(masterInstitutes.GFTIs || [])];

        let targetSet = cutoffsCache.filter(c => {
          if (label.includes(" - ")) {
            if (c.institute !== institute || c.program !== branch) return false;
          } else {
            if (!normalizeName(c.institute).includes(normalizeName(institute))) return false;
          }

          const rowCat = norm(c.seatType || c['Seat Type']);
          if (!validCats.includes(rowCat)) return false;

          const rowGender = norm(c.gender || c['Gender']);
          if (isFemale && !rowGender.includes('female')) return false;
          if (!isFemale && !rowGender.includes('neutral')) return false;

          const rowQuota = norm(c.quota || c['Quota']);
          const isIIT = isStrictlyIIT(c.institute || c['Institute']);
          const officialInst = allInstitutes.find(i => normalizeName(i.name) === normalizeName(c.institute));
          const instState = officialInst ? officialInst.state : details.state;
          const isHomeState = norm(p.homeState) === norm(instState);

          if (isIIT) {
            if (rowQuota !== 'ai') return false;
          } else {
            if (isHomeState) {
              if (rowQuota !== 'hs' && rowQuota !== 'ai') return false;
            } else {
              if (rowQuota !== 'os' && rowQuota !== 'ai') return false;
            }
          }
          return true;
        });

        if (targetSet.length > 0) {
          if (!label.includes(" - ")) {
            const branchCutoffs = filterBranches(targetSet, branch);
            if (branchCutoffs.length > 0) targetSet = branchCutoffs;

            const programs = [...new Set(targetSet.map(c => c.program))];
            if (programs.length > 1) {
              programs.sort((a, b) => a.length - b.length);
              targetSet = targetSet.filter(c => c.program === programs[0]);
            }
          }

          // Prioritize Round 6 (final round) for realistic cutoffs
          const r6Set = targetSet.filter(c => String(c.round) === '6');
          const finalSet = r6Set.length > 0 ? r6Set : [...targetSet].sort((a, b) => b.round - a.round);

          const r1Row = targetSet.find(c => String(c.round) === '1') || finalSet[0];
          const rLastRow = finalSet[0];

          console.log('Compare Tool Match:', {
            inputLabel: label,
            r1Match: r1Row,
            rLastMatch: rLastRow
          });

          openingRank = r1Row.openingRank || "-";
          closingRank = rLastRow.closingRank || "-";
        }
      }

      options.push({
        label,
        institute: details.name || institute,
        branch,
        r1: openingRank,
        r5: closingRank
      });
    }

    renderCompareTable(options);

    // --- PART 3: AI Verdict Integration ---------------------------------------
    if (options.length >= 2) {
      // Dynamically inject verdict container below compare table
      let verdictContainer = document.getElementById('aiVerdictContainer');
      if (!verdictContainer) {
        verdictContainer = document.createElement('div');
        verdictContainer.id = 'aiVerdictContainer';
        const compareTable = document.getElementById('compareTableBody')?.closest('table');
        if (compareTable && compareTable.parentNode) {
          compareTable.parentNode.insertBefore(verdictContainer, compareTable.nextSibling);
        }
      }

      // Show typing indicator
      verdictContainer.innerHTML = `
        <div style="margin-top: 16px; padding: 16px 20px; border-radius: 12px; border: 1px solid rgba(251, 191, 36, 0.4); background: rgba(251, 191, 36, 0.05);">
          <strong style="color: #fbbf24; font-size: 14px;">✦ Sathee's Final Verdict</strong>
          <p style="color: var(--muted); margin: 8px 0 0; font-size: 13px;">Sathee is analyzing the placements...</p>
        </div>`;

      // Fire background fetch to AI verdict endpoint
      const college1 = options[0]?.label || options[0]?.institute || '';
      const college2 = options[1]?.label || options[1]?.institute || '';

      fetch('https://apna-sathee-backend.onrender.com/api/compare-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ college1, college2 })
      })
        .then(res => {
          if (!res.ok) throw new Error(`Status ${res.status}`);
          return res.json();
        })
        .then(data => {
          const verdictText = data.verdict || data.reply || data.answer || 'No verdict available at this time.';
          verdictContainer.innerHTML = `
            <div style="margin-top: 16px; padding: 16px 20px; border-radius: 12px; border: 1px solid rgba(251, 191, 36, 0.4); background: rgba(251, 191, 36, 0.05); box-shadow: 0 0 12px rgba(251, 191, 36, 0.08);">
              <strong style="color: #fbbf24; font-size: 14px;">✦ Sathee's Final Verdict</strong>
              <p style="color: var(--fg); margin: 8px 0 0; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(verdictText)}</p>
            </div>`;
        })
        .catch(err => {
          console.error('AI Verdict fetch error:', err);
          verdictContainer.innerHTML = `
            <div style="margin-top: 16px; padding: 16px 20px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05);">
              <strong style="color: #f87171; font-size: 14px;">Verdict Unavailable</strong>
              <p style="color: var(--muted); margin: 8px 0 0; font-size: 13px;">Could not connect to AI server. Ensure backend is running at localhost:8000.</p>
            </div>`;
        });
    }

    return { options, verdict: "" };
  } catch (error) {
    showToast("Comparison failed: " + error.message);
    return { options: [], verdict: "" };
  } finally {
    setButtonLoading("compareBtn", false);
  }
}

listen("compareBtn", "click", async () => {
  await runCompare();
});

listen("saveCompareBtn", "click", async () => {
  const payload = await runCompare();
  if (!payload) return;
  saveComparison(payload.options, payload.verdict);
});



listen("exportBtn", "click", () => {
  if (!lastChoiceList.length) return;
  const columns = ["order", "band", "institute", "program", "quota", "seatType", "gender", "closingRank", "avgClosingRank", "round", "year"];
  const rows = [
    columns.join(","),
    ...lastChoiceList.map((row) =>
      columns.map((column) => `"${String(row[column] || "").replace(/"/g, '""')}"`).join(",")
    )
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "apna-saathi-choice-list.csv";
  link.click();
  URL.revokeObjectURL(url);
});

listen("exportPdfBtn", "click", exportToPdf);

listen("exportShareBtn", "click", async () => {
  if (!lastChoiceList.length) return;
  const payload = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(lastChoiceList.slice(0, 100))))));
  const url = new URL(window.location.href);
  url.searchParams.set("prefshare", payload);
  const link = url.toString();
  try {
    await navigator.clipboard.writeText(link);
    alert("Preference list share link copied.");
  } catch {
    window.prompt("Copy this share link:", link);
  }
});

listen("reviewWithAiBtn", "click", async () => {
  if (!lastChoiceList.length) return;
  const top = lastChoiceList.slice(0, 20);
  const prompt = `Review this counselling preference list and give strategy improvements. Mention conflicts, missing safe options, and ordering tweaks.\n${top.map((r, i) => `${i + 1}. ${r.institute} - ${r.program} [${r.band}]`).join("\n")}`;
  try {
    const data = await postJson("/api/chat", { message: prompt, profile: profile(), history: [] });
    const resEl = $("preferenceResults");
    if (resEl) resEl.innerHTML = `<div class="rec-card"><strong>Saathi strategic review</strong><p class="compare-analysis">${escapeHtml(data.answer || data.fallback || "No review returned.")}</p></div>`;
  } catch (e) {
    const resEl = $("preferenceResults");
    if (resEl) resEl.innerHTML = `<div class="rec-card warning"><strong>Review unavailable</strong><p>${escapeHtml(e.message)}</p></div>`;
  }
});

listen("undoPrefBtn", "click", () => {
  if (!preferenceState.undo.length) return;
  preferenceState.redo.push(clonePrefRows(preferenceState.rows));
  preferenceState.rows = preferenceState.undo.pop();
  pushPreferenceSnapshot("Undo");
  syncLastChoiceList();
  renderPreferenceBoard();
});

listen("redoPrefBtn", "click", () => {
  if (!preferenceState.redo.length) return;
  preferenceState.undo.push(clonePrefRows(preferenceState.rows));
  preferenceState.rows = preferenceState.redo.pop();
  pushPreferenceSnapshot("Redo");
  syncLastChoiceList();
  renderPreferenceBoard();
});

listen("supportBtn", "click", async () => {
  const payload = {
    name: $("supportName").value.trim(),
    contact: $("supportContact").value.trim(),
    question: $("supportQuestion").value.trim(),
    profile: profile()
  };
  try {
    const data = await postJson("/api/support", payload);
    $("supportResult").innerHTML = `<div class="ticket-card"><strong>${data.ticket.id}</strong><p>${data.message}</p></div>`;
  } catch (error) {
    $("supportResult").innerHTML = `<div class="ticket-card warning"><strong>Could not create ticket</strong><p>${error.message}</p></div>`;
  }
});

listen("continueBtn", "click", () => {
  saveProfile();
  const next = localStorage.getItem("apnaSaathiAfterProfile");
  localStorage.removeItem("apnaSaathiAfterProfile");
  showScreen(next || "choiceScreen", next ? 3 : 2);
  if (next === "preferenceScreen") {
    if (preferenceState.rows && preferenceState.rows.length > 0) {
      renderPreferenceBoard();
    } else {
      handleGeneratePreferenceList("preferenceDnDList");
    }
  }
});



listen("editProfileBtn", "click", () => showScreen("profileScreen", 1));
listen("openChat", "click", () => requireProfile("chatScreen"));
listen("openPreference", "click", () => {
  if (requireProfile("preferenceScreen")) {
    if (preferenceState.rows && preferenceState.rows.length > 0) {
      showScreen("preferenceScreen", 3);
      renderPreferenceBoard();
    } else {
      handleGeneratePreferenceList("preferenceDnDList");
    }
  }
});
listen("openChances", "click", () => {
  if (requireProfile("chancesScreen")) {
    showScreen("chancesScreen", 3);
    if (typeof renderChances === 'function') renderChances();
  }
});
listen("heroStartBtn", "click", () => showScreen("profileScreen", 1));
listen("heroAskBtn", "click", () => requireProfile("chatScreen"));
listen("prevFeature", "click", () => setSlide(activeSlide - 1));
listen("nextFeature", "click", () => setSlide(activeSlide + 1));

document.querySelectorAll(".slider-dots .dot").forEach((dot) => {
  dot.addEventListener("click", () => {
    const slideIdx = Number(dot.dataset.slide);
    if (!isNaN(slideIdx)) setSlide(slideIdx);
  });
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.target;
    if (!target) return;

    // --- Paywall gate for premium tabs --------------------------------------
    const premiumScreens = ["chancesScreen", "preferenceScreen", "compareScreen"];
    if (premiumScreens.includes(target) && isPremiumLocked()) {
      showPaywall();
      return;
    }

    if (target === "chatScreen") {
      requireProfile("chatScreen");
      return;
    }
    if (target === "chancesScreen") {
      requireProfile("chancesScreen");
      showScreen("chancesScreen", 3);
      renderChances();
      return;
    }
    if (target === "preferenceScreen") {
      if (requireProfile("preferenceScreen")) {
        showScreen("preferenceScreen", 3);
        if (preferenceState.rows && preferenceState.rows.length > 0) {
          renderPreferenceBoard();
        } else {
          handleGeneratePreferenceList("preferenceResults");
        }
      }
      return;
    }
    showScreen(target, Number(button.dataset.stepTarget || 3));
  });
});

document.querySelectorAll(".backBtn").forEach((button) => {
  button.addEventListener("click", () => showScreen("choiceScreen", 2));
});

listen("newChatBtn", "click", () => {
  currentSessionId = `chat-${Date.now()}`;
  const msgHost = $("messages");
  if (msgHost) msgHost.innerHTML = "";
  addMessage("bot", "Fresh chat started. Ask me anything about choice filling, documents, reporting, or college decisions.");
  renderEmptyState();
});

listen("toggleHistoryBtn", "click", () => {
  const chatApp = document.querySelector(".chat-app");
  if (chatApp) chatApp.classList.add("history-hidden");
});

(() => {
  const chatPanel = document.querySelector(".chat-panel");
  if (!chatPanel) return;
  const showHistoryButton = document.createElement("button");
  showHistoryButton.className = "mini-btn history-toggle-floating";
  showHistoryButton.textContent = "Show previous chats";
  chatPanel.prepend(showHistoryButton);
  showHistoryButton.addEventListener("click", () => {
    const chatApp = document.querySelector(".chat-app");
    if (chatApp) chatApp.classList.remove("history-hidden");
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  listen("exam", "change", () => { updateRankInputsVisibility(); renderProfileVisuals(profile()); });
  listen("category", "change", updateRankInputsVisibility);
  listen("rankMain", "input", () => renderProfileVisuals(profile()));
  listen("rankAdvanced", "input", () => renderProfileVisuals(profile()));

  document.querySelectorAll(".sys-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sys-filter-btn").forEach(b => {
        b.classList.remove("active");
        b.classList.add("subtle");
      });
      btn.classList.add("active");
      btn.classList.remove("subtle");
      const targetSys = String(btn.dataset.sys).toLowerCase();
      document.querySelectorAll(".sys-row").forEach(row => {
        const rowSys = String(row.dataset.system).toLowerCase();
        if (targetSys === "all" || rowSys === targetSys || rowSys === "all") {
          row.style.display = "";
        } else {
          row.style.display = "none";
        }
      });
    });
  });

  try {
    loadProfile();
    // Explicitly call updateRankInputsVisibility once DOM is fully loaded just to be safe
    updateRankInputsVisibility();
    renderHistory();
    renderNewsFeed();
    startCountdown();
    startRotatingTips();
    renderEmptyState();
    renderSavedComparisons();
    updateBreadcrumb("choiceScreen");
  } catch (e) {
    console.error("Initialization error:", e);
  }
});

// Optional compare prefill from shared link
(() => {
  const url = new URL(window.location.href);
  const compare = url.searchParams.get("compare");
  if (!compare) return;
  const parts = decodeURIComponent(compare).split("|").filter(Boolean).slice(0, 3);
  ["compareA", "compareB", "compareC"].forEach((id, i) => {
    const el = $(id);
    if (el && parts[i]) el.value = parts[i];
  });
})();

// Accessibility preferences
(() => {
  const mode = localStorage.getItem("apnaTheme") || "light";
  if (mode === "dark") document.body.classList.add("theme-dark");
  const toggle = $("darkModeToggle");
  if (toggle) toggle.checked = mode === "dark";
})();

listen("darkModeToggle", "change", (e) => {
  const enabled = Boolean(e.target.checked);
  document.body.classList.toggle("theme-dark", enabled);
  localStorage.setItem("apnaTheme", enabled ? "dark" : "light");
});

listen("collapseSidebarBtn", "click", () => {
  const sidebar = document.querySelector(".app-sidebar");
  if (sidebar) {
    sidebar.classList.toggle("collapsed");
  }
});

// Lightweight first-time 3-step walkthrough
(() => {
  if (localStorage.getItem("apnaWalkthroughDone") === "1") return;
  const steps = [
    "Step 1/3: Fill your profile once for better recommendations.",
    "Step 2/3: Use My Chances to quickly identify safe, borderline, and reach options.",
    "Step 3/3: Build and reorder your preference list, then review with AI."
  ];
  let idx = 0;
  const card = $("walkthroughCard");
  const text = $("walkthroughText");
  const next = $("walkthroughNext");
  const skip = $("walkthroughSkip");
  if (!card || !text || !next || !skip) return;
  card.hidden = false;
  const paint = () => { if (text) text.textContent = steps[idx]; };
  paint();
  next.addEventListener("click", () => {
    idx += 1;
    if (idx >= steps.length) {
      card.hidden = true;
      localStorage.setItem("apnaWalkthroughDone", "1");
      return;
    }
    paint();
  });
  skip.addEventListener("click", () => {
    card.hidden = true;
    localStorage.setItem("apnaWalkthroughDone", "1");
  });
})();

listen("historySearch", "input", (e) => {
  historyQuery = e.target.value || "";
  renderHistory();
});
listen("clearSearchBtn", "click", () => {
  const input = $("historySearch");
  if (input) input.value = "";
  historyQuery = "";
  renderHistory();
});
listen("showSavedBtn", "click", () => {
  showOnlySaved = !showOnlySaved;
  const btn = $("showSavedBtn");
  btn?.classList.toggle("active", showOnlySaved);
  if (!showOnlySaved) {
    renderHistory();
    return;
  }
  const session = currentSession();
  const msgHost = $("messages");
  if (msgHost) {
    msgHost.innerHTML = "";
    session.messages.filter((m) => m.role === "bot" && m.saved).forEach((m) => addMessage("bot", m.text, false, m));
  }
  renderEmptyState();
});

document.querySelectorAll(".mode-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeMode = btn.dataset.mode || "normal";
  });
});

document.querySelectorAll(".segment-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".segment-btn").forEach((b) => {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    activeChancesType = btn.dataset.type;

    // Update dropdown options
    const filter = $("chCategoryFilter");
    if (filter) {
      if (activeChancesType === "IIT") {
        filter.innerHTML = `
          <option value="all-iits">All IITs</option>
          <option value="top7">Top 7</option>
          <option value="old12">Old 12</option>
          <option value="newer">Newer IITs</option>
        `;
      } else {
        filter.innerHTML = `
          <option value="all-nits">All NITs</option>
          <option value="top10">Top 10</option>
          <option value="bottom">Bottom NITs</option>
        `;
      }
    }
    renderChances();
  });
});

["chBranch", "chCategoryFilter"].forEach((id) => {
  listen(id, "input", renderChances);
  listen(id, "change", renderChances);
});

loadDataFiles().catch(console.error);

function triggerSortByRank() {
  if (typeof preferenceState === "undefined" || !preferenceState.rows) return;

  preferenceState.rows.sort((a, b) => {
    const rankA = parseInt(String(a.closingRank).replace(/,/g, ''), 10) || Number.MAX_VALUE;
    const rankB = parseInt(String(b.closingRank).replace(/,/g, ''), 10) || Number.MAX_VALUE;
    return rankA - rankB;
  });

  const rankBtn = document.getElementById('sortRankBtn');
  const bucketBtn = document.getElementById('sortBucketsBtn');

  if (rankBtn) {
    rankBtn.classList.add("active");
    rankBtn.classList.remove("subtle");
  }
  if (bucketBtn) {
    bucketBtn.classList.remove("active");
    bucketBtn.classList.add("subtle");
  }

  if (typeof syncLastChoiceList === "function") syncLastChoiceList();
  if (typeof renderPreferenceBoard === "function") renderPreferenceBoard();
}

function triggerSortByBuckets() {
  if (typeof preferenceState === "undefined" || !preferenceState.rows) return;

  const bucketWeights = { "AMBITIOUS": 1, "BALANCED": 2, "SAFE": 3 };
  preferenceState.rows.sort((a, b) => {
    const bandA = (a.band || "").toUpperCase();
    const bandB = (b.band || "").toUpperCase();
    const wA = bucketWeights[bandA] || 4;
    const wB = bucketWeights[bandB] || 4;

    if (wA !== wB) return wA - wB;

    const rankA = parseInt(String(a.closingRank).replace(/,/g, ''), 10) || Number.MAX_VALUE;
    const rankB = parseInt(String(b.closingRank).replace(/,/g, ''), 10) || Number.MAX_VALUE;
    return rankA - rankB;
  });

  const rankBtn = document.getElementById('sortRankBtn');
  const bucketBtn = document.getElementById('sortBucketsBtn');

  if (bucketBtn) {
    bucketBtn.classList.add("active");
    bucketBtn.classList.remove("subtle");
  }
  if (rankBtn) {
    rankBtn.classList.remove("active");
    rankBtn.classList.add("subtle");
  }

  if (typeof syncLastChoiceList === "function") syncLastChoiceList();
  if (typeof renderPreferenceBoard === "function") renderPreferenceBoard();
}

document.addEventListener("DOMContentLoaded", () => {
  const rankBtn = document.getElementById('sortRankBtn');
  if (rankBtn) rankBtn.addEventListener("click", triggerSortByRank);

  const bucketBtn = document.getElementById('sortBucketsBtn');
  if (bucketBtn) bucketBtn.addEventListener("click", triggerSortByBuckets);
});

// Add BETA badge to Compare tab
setTimeout(() => {
  const compareTitle = document.querySelector('#compareScreen .panel-head p');
  if (compareTitle && !compareTitle.innerHTML.includes('BETA')) {
    compareTitle.innerHTML = `Compare college/branch <span style="background: linear-gradient(135deg, #a855f7 0%, #fbbf24 100%); color: #fff; font-size: 0.65em; padding: 2px 6px; border-radius: 12px; margin-left: 8px; font-weight: bold; vertical-align: middle; letter-spacing: 0.5px;">BETA</span>`;
    compareTitle.style.display = 'flex';
    compareTitle.style.alignItems = 'center';
  }
}, 100);

// --- APNA SATHEE GLOBAL AI DISCLAIMER ---
document.addEventListener('DOMContentLoaded', () => {
  const disclaimerHTML = `
    <div style="text-align: center; padding: 12px 20px; font-size: 11px; color: #64748b; display: flex; justify-content: center; align-items: center; gap: 6px; width: 100%; border-top: 1px solid rgba(150, 150, 150, 0.1); margin-top: auto; opacity: 0.8;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      Apna Sathee uses AI to predict trends and can make mistakes. Always verify critical decisions, rules, and deadlines with official JoSAA documentation.
    </div>
  `;

  // The 4 feature screens you want to protect
  const targetScreens = ['chatScreen', 'chancesScreen', 'preferenceScreen', 'compareScreen'];

  targetScreens.forEach(id => {
    const screen = document.getElementById(id);
    if (screen) {
      screen.insertAdjacentHTML('beforeend', disclaimerHTML);
    }
  });
});
// --- APNA SATHEE MOBILE SIDEBAR LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  const appShell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('.app-sidebar');

  if (appShell && sidebar) {
    // 1. Create the Top Mobile Header (Hamburger + Logo)
    const mobileHeader = document.createElement('div');
    mobileHeader.className = 'mobile-header';
    mobileHeader.style.display = 'none'; // Hidden on desktop
    mobileHeader.innerHTML = `
            <div style="font-weight: 700; font-size: 1.2rem; color: #f8fafc; display: flex; align-items: center; gap: 10px;">
                <img src="/logo.png" style="width: 30px; height: 30px;" onerror="this.style.display='none'"> 
                Apna Sathee
            </div>
            <button class="hamburger-btn" aria-label="Open Menu">☰</button>
        `;

    // 2. Create the Dark Overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';

    // Inject them into the DOM
    appShell.insertBefore(mobileHeader, appShell.firstChild);
    appShell.appendChild(overlay);

    const hamburgerBtn = mobileHeader.querySelector('.hamburger-btn');
    const closeBtn = document.getElementById('collapseSidebarBtn');

    // 3. Open Sidebar Action
    hamburgerBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('open');
    });

    // 4. Close Sidebar Action
    const closeSidebar = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    };

    // Close when X is clicked, or background is clicked
    if (closeBtn) {
      // Change the standard collapse icon to an "X" on mobile
      if (window.innerWidth <= 768) closeBtn.innerHTML = "✕";
      closeBtn.addEventListener('click', closeSidebar);
    }
    overlay.addEventListener('click', closeSidebar);

    // 5. Auto-Close sidebar when a user clicks a menu link!
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      });
    });
  }
});

// =========================================
// MOBILE UI FIXES (Under 768px)
// =========================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Off-Canvas Main Sidebar Logic
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mainSidebar = document.querySelector('.app-sidebar');

  if (mobileMenuBtn && mainSidebar) {
    // Inject a backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    const toggleMainMenu = () => {
      mainSidebar.classList.toggle('mobile-open');
      backdrop.classList.toggle('active');
    };

    mobileMenuBtn.addEventListener('click', toggleMainMenu);
    backdrop.addEventListener('click', toggleMainMenu);

    // Auto-close main sidebar when a navigation link is clicked
    const navItems = mainSidebar.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          mainSidebar.classList.remove('mobile-open');
          backdrop.classList.remove('active');
        }
      });
    });
  }

  // 2. Chat Sidebar Drawer Logic
  const mobileChatToggle = document.getElementById('mobileChatToggle');
  const chatSidebar = document.querySelector('.chat-sidebar');

  if (mobileChatToggle && chatSidebar) {
    mobileChatToggle.addEventListener('click', () => {
      chatSidebar.classList.toggle('open');
    });

    // Auto-close chat drawer when a chat history item is clicked
    chatSidebar.addEventListener('click', (e) => {
      if (e.target.closest('.history-item') && window.innerWidth <= 768) {
        chatSidebar.classList.remove('open');
      }
    });
  }
});


// ==========================================
// THE PAYWALL BOUNCER (Updated with Firebase)
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    // Find all buttons that have the 'locked-feature' class
    const lockedButtons = document.querySelectorAll('.locked-feature');

    lockedButtons.forEach(function(btn) {
        // We use 'mousedown' to catch the click BEFORE the tab tries to open
        btn.addEventListener('mousedown', function(e) {
            
            // Check the exact global variable your database uses
            if (typeof currentUserTier !== 'undefined' && currentUserTier !== 'Pro') {
                e.preventDefault();       // Stop the click
                e.stopPropagation();      // Stop the tab from switching
                
                // Pop the Razorpay checkout instead!
                if (typeof window.openProCheckout === "function") {
                    window.openProCheckout(); 
                } else {
                    alert("Payment system initializing, please try again in a moment.");
                }
            }
        }, true); // The 'true' makes sure this runs before any other click events
    });
});
