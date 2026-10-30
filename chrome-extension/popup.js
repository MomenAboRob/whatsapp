// منطق واجهة قائمة الإضافة في شريط كروم
document.addEventListener('DOMContentLoaded', () => {
  const versionLabel = document.getElementById('extensionVersion');
  if (versionLabel) versionLabel.textContent = chrome.runtime.getManifest().version;
  const masterToggle = document.getElementById('masterToggle');
  const masterCard = document.getElementById('masterCard');
  const statusBadge = document.getElementById('statusBadge');
  const statusBadgeText = document.getElementById('statusBadgeText');
  const switchTitle = document.getElementById('switchTitle');
  const switchDesc = document.getElementById('switchDesc');
  const serverStatusText = document.getElementById('serverStatusText');
  const refreshServerBtn = document.getElementById('refreshServerBtn');
  const pendingCard = document.getElementById('pendingCard');
  const pendingName = document.getElementById('pendingName');
  const pendingAmount = document.getElementById('pendingAmount');
  const dockToggle = document.getElementById('dockToggle');
  const guardToggle = document.getElementById('guardToggle');
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const openPortalBtn = document.getElementById('openPortalBtn');

  // 1. تحميل الإعدادات المحفوظة
  chrome.storage.local.get(['extensionEnabled', 'showDock', 'submitGuard'], (res) => {
    const isEnabled = res.extensionEnabled !== false; // القيمة الافتراضية مفعل
    const showDock = res.showDock !== false;
    const submitGuard = res.submitGuard !== false;

    masterToggle.checked = isEnabled;
    dockToggle.checked = showDock;
    guardToggle.checked = submitGuard;

    updateMasterUI(isEnabled);
  });

  // 2. تحديث الواجهة عند تغيير زر التفعيل الرئيسي
  function updateMasterUI(isEnabled) {
    if (isEnabled) {
      statusBadge.className = 'status-badge active';
      statusBadgeText.textContent = 'مفعل';
      masterCard.classList.remove('off');
      switchTitle.textContent = 'الإضافة قيد التشغيل';
      switchDesc.textContent = 'جاهزة لتعبئة البيانات في البوابة';
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '' });
      }
    } else {
      statusBadge.className = 'status-badge inactive';
      statusBadgeText.textContent = 'معطل';
      masterCard.classList.add('off');
      switchTitle.textContent = 'الإضافة متوقفة مؤقتاً';
      switchDesc.textContent = 'لن يتم تعبئة أي بيانات تلقائياً';
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      }
    }
  }

  // 3. مستمع تغيير زر التفعيل الرئيسي
  masterToggle.addEventListener('change', () => {
    const isEnabled = masterToggle.checked;
    chrome.storage.local.set({ extensionEnabled: isEnabled }, () => {
      updateMasterUI(isEnabled);
    });
  });

  // 4. مستمع خيارات Dock و Guard
  dockToggle.addEventListener('change', () => {
    chrome.storage.local.set({ showDock: dockToggle.checked });
  });

  guardToggle.addEventListener('change', () => {
    chrome.storage.local.set({ submitGuard: guardToggle.checked });
  });

  // 5. فحص حالة السيرفر المحلي والبيانات المعلقة
  async function checkServerStatus() {
    serverStatusText.innerHTML = '<span style="color:#94a3b8;">جاري فحص الاتصال...</span>';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      // فحص منفذ 3010 أولاً مع منع تسريب أي خطأ شبكي
      let res = await fetch('http://localhost:3010/api/portal/pending', {
        cache: 'no-store',
        signal: controller.signal,
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch('http://localhost:3000/api/portal/pending', {
          cache: 'no-store',
          signal: controller.signal,
        }).catch(() => null);
      }
      clearTimeout(timeoutId);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        serverStatusText.innerHTML = '<span style="color:#34d399; font-weight:600;">السيرفر متصل ويعمل بنجاح (3010)</span>';

        if (data && data.participantName) {
          pendingCard.style.display = 'block';
          pendingName.textContent = data.participantName;
          pendingAmount.textContent = `${data.amount || 85} ${data.currency || 'JOD'}`;
        } else {
          pendingCard.style.display = 'none';
        }
      } else {
        serverStatusText.innerHTML = '<span style="color:#fde047;">السيرفر يعمل ولكن لا توجد بيانات معلقة</span>';
        pendingCard.style.display = 'none';
      }
    } catch {
      serverStatusText.innerHTML = '<span style="color:#f87171;">السيرفر غير متصل (شغّل تشغيل_السيرفر.bat)</span>';
      pendingCard.style.display = 'none';
    }
  }

  refreshServerBtn.addEventListener('click', () => {
    checkServerStatus();
  });

  // فحص أولي عند فتح القائمة
  checkServerStatus();

  // 6. روابط سريعة
  openDashboardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'http://localhost:3010' });
  });

  openPortalBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://portal.aqleeat.com' });
  });
});
