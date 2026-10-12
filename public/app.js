(() => {
  const $ = id => document.getElementById(id);
  const video = $('video'), canvas = $('overlayCanvas'), ctx = canvas.getContext('2d');
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let stream = null, cameras = [], selectedDeviceId = '',
      facing = isMobileDevice ? 'environment' : 'user', mirrored = false;
  let twibbonImage = null, twibbonObjectUrl = null, capturedBlob = null, capturedUrl = null, uploadCount = 0;
  const names = ['nama', 'kelompok', 'desa'];
  const clean = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._ -]/g, '').trim().replace(/[ ._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  const filename = () => `${clean($('nama').value) || 'Tanpa_Nama'}_${clean($('kelompok').value) || 'Tanpa_Kelompok'}_${clean($('desa').value) || 'Tanpa_Desa'}.jpg`;
  function setMessage(id, text, type) { const el = $(id); el.textContent = text; el.className = `message ${type}`; }
  function hideMessage(id) { $(id).classList.add('hidden'); }
  function updateFilename() { $('filenamePreview').textContent = filename(); }
  function setCameraError(text) { const el = $('cameraError'); if (!text) { el.classList.add('hidden'); el.textContent = ''; } else { el.textContent = text; el.classList.remove('hidden'); } }
  function stopCamera() { if (stream) stream.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; }
  async function refreshCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras = devices.filter(d => d.kind === 'videoinput');
      const select = $('cameraSelect'); const previous = selectedDeviceId;
      select.innerHTML = '';
      if (!cameras.length) select.add(new Option('Kamera tidak ditemukan', ''));
      cameras.forEach((cam, i) => select.add(new Option(cam.label || `Kamera ${i + 1}`, cam.deviceId)));
      if (cameras.some(c => c.deviceId === previous)) select.value = previous;
      else if (cameras[0]) { selectedDeviceId = cameras[0].deviceId; select.value = selectedDeviceId; }
    } catch (e) { console.warn('Tidak dapat membaca daftar kamera', e); }
  }
  async function startCamera(deviceId = '', nextFacing = facing) {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Browser tidak mendukung kamera. Buka aplikasi melalui HTTPS atau localhost.'); return; }
    stopCamera();
    try {
      const videoConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: nextFacing } };
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...videoConstraints, width: { ideal: 1920 }, height: { ideal: 1440 } } });
      video.srcObject = stream;
      await new Promise((resolve, reject) => { if (video.readyState >= 1) return resolve(); video.onloadedmetadata = resolve; video.onerror = reject; });
      await video.play();
      const track = stream.getVideoTracks()[0];
      selectedDeviceId = track.getSettings().deviceId || deviceId || '';
      const mode = track.getSettings().facingMode;
      if (mode) facing = mode;
      $('cameraPlaceholder').classList.add('hidden'); $('shutter').disabled = false;
      $('cameraBadge').textContent = 'Kamera aktif'; $('cameraBadge').classList.add('active');
      await refreshCameras();
      if (selectedDeviceId) $('cameraSelect').value = selectedDeviceId;
      drawOverlay();
    } catch (e) {
      console.error(e);
      $('cameraPlaceholder').classList.remove('hidden'); $('shutter').disabled = true;
      $('cameraBadge').textContent = 'Kamera belum aktif'; $('cameraBadge').classList.remove('active');
      const reason = e.name === 'NotAllowedError' ? 'Akses kamera ditolak. Izinkan kamera pada pengaturan browser.' : e.name === 'NotFoundError' ? 'Kamera tidak ditemukan. Sambungkan webcam atau pilih perangkat yang tersedia.' : `Kamera tidak dapat diaktifkan: ${e.message || e.name}.`;
      setCameraError(reason);
    }
  }
  function drawOverlay() {
    if (!video.videoWidth || !video.videoHeight) return;
    const rect = $('stage').getBoundingClientRect();
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const drawW = vw * scale, drawH = vh * scale;
    const dx = (rect.width - drawW) / 2, dy = (rect.height - drawH) / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    if (twibbonImage) {
      ctx.save(); ctx.globalAlpha = Number($('twibbonOpacity').value) / 100;
      if ($('twibbonFit').value === 'contain') {
        const s = Math.min(drawW / twibbonImage.width, drawH / twibbonImage.height);
        const w = twibbonImage.width * s, h = twibbonImage.height * s;
        ctx.drawImage(twibbonImage, dx + (drawW - w) / 2, dy + (drawH - h) / 2, w, h);
      } else {
        const s = Math.max(drawW / twibbonImage.width, drawH / twibbonImage.height);
        const w = twibbonImage.width * s, h = twibbonImage.height * s;
        ctx.drawImage(twibbonImage, dx + (drawW - w) / 2, dy + (drawH - h) / 2, w, h);
      }
      ctx.restore();
    }
  }
  function showTwibbonImage(img, url, isShared = false) {
    if (twibbonObjectUrl && twibbonObjectUrl.startsWith('blob:')) URL.revokeObjectURL(twibbonObjectUrl);
    twibbonObjectUrl = url; twibbonImage = img;
    $('twibbonPreview').src = url; $('twibbonPreview').classList.remove('hidden'); $('twibbonEmpty').classList.add('hidden');
    $('removeTwibbon').disabled = isShared;
    $('twibbonFilePicker').classList.toggle('hidden', isShared);
    $('twibbonServerStatus').textContent = isShared ? 'Twibbon bersama aktif di server. Semua perangkat menggunakan gambar yang sama.' : 'Twibbon dipilih. Mengunggah sebagai twibbon bersama…';
    $('twibbonServerStatus').className = `cloud-status ${isShared ? 'good' : 'bad'}`;
    drawOverlay();
  }
  function loadTwibbon(file) {
    if (!file) return;
    if (file.type !== 'image/png') { setMessage('uploadMessage', 'Twibbon bersama harus berupa PNG transparan.', 'error'); $('twibbonFile').value = ''; return; }
    if (file.size > 12 * 1024 * 1024) { setMessage('uploadMessage', 'Ukuran twibbon maksimal 12 MB.', 'error'); $('twibbonFile').value = ''; return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = async () => {
      try {
        const fd = new FormData(); fd.append('twibbon', file, 'twibbon.png');
        const response = await fetch('/api/twibbon', { method: 'POST', body: fd });
        const data = await response.json().catch(() => ({}));
        if (response.status === 409) {
          URL.revokeObjectURL(url); $('twibbonFile').value = '';
          await initializeTwibbon();
          setMessage('uploadMessage', 'Twibbon sudah diatur dari perangkat lain; twibbon server telah dimuat.', 'info');
          return;
        }
        if (!response.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan twibbon di server.');
        showTwibbonImage(img, url, true); hideMessage('uploadMessage');
      } catch (e) {
        // Jangan gunakan twibbon lokal saja, karena perangkat lain tidak akan menerimanya.
        URL.revokeObjectURL(url); $('twibbonFile').value = '';
        setMessage('uploadMessage', e.message || 'Gagal mengunggah twibbon ke server.', 'error');
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); setMessage('uploadMessage', 'File twibbon tidak dapat dibaca.', 'error'); };
    img.src = url;
  }
  async function initializeTwibbon() {
    const picker = $('twibbonFilePicker');
    const status = $('twibbonServerStatus');
    try {
      const response = await fetch('/api/twibbon/status', { cache: 'no-store' });
      const state = await response.json();
      if (!state.configured) {
        picker.classList.remove('hidden');
        status.className = 'cloud-status';
        status.textContent = 'Belum ada twibbon bersama. Unggah PNG satu kali dari perangkat mana saja.';
        $('removeTwibbon').disabled = true;
        return;
      }
      picker.classList.add('hidden');
      status.className = 'cloud-status good';
      status.textContent = 'Memuat twibbon bersama dari server…';
      const imageResponse = await fetch(`/api/twibbon?v=${Date.now()}`, { cache: 'no-store' });
      if (!imageResponse.ok) throw new Error('Twibbon server tidak dapat dimuat.');
      const blob = await imageResponse.blob();
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => showTwibbonImage(img, url, true);
      img.onerror = () => { URL.revokeObjectURL(url); status.className = 'cloud-status bad'; status.textContent = 'File twibbon di server tidak dapat dibaca.'; };
      img.src = url;
    } catch (e) {
      picker.classList.remove('hidden');
      status.className = 'cloud-status bad';
      status.textContent = 'Tidak dapat memeriksa twibbon server. Periksa koneksi lalu muat ulang.';
      console.warn('Gagal memuat twibbon bersama:', e);
    }
  }
  function capture() {
    if (!stream || !video.videoWidth) return;
    const out = document.createElement('canvas'); out.width = video.videoWidth; out.height = video.videoHeight;
    const c = out.getContext('2d');
    // Hasil foto memakai orientasi kamera asli; tombol cermin hanya mengubah tampilan live preview.
    c.drawImage(video, 0, 0, out.width, out.height);
    if (twibbonImage) {
      c.save(); c.globalAlpha = Number($('twibbonOpacity').value) / 100;
      if ($('twibbonFit').value === 'contain') {
        const s = Math.min(out.width / twibbonImage.width, out.height / twibbonImage.height), w = twibbonImage.width * s, h = twibbonImage.height * s;
        c.drawImage(twibbonImage, (out.width - w) / 2, (out.height - h) / 2, w, h);
      } else {
        const s = Math.max(out.width / twibbonImage.width, out.height / twibbonImage.height), w = twibbonImage.width * s, h = twibbonImage.height * s;
        c.drawImage(twibbonImage, (out.width - w) / 2, (out.height - h) / 2, w, h);
      }
      c.restore();
    }
    out.toBlob(blob => {
      if (!blob) { setMessage('uploadMessage', 'Gagal memproses foto. Silakan coba lagi.', 'error'); return; }
      capturedBlob = blob;
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
      capturedUrl = URL.createObjectURL(blob);
      $('capturedPhoto').src = capturedUrl; $('capturedPhoto').classList.remove('hidden'); $('resultBox').querySelector('.empty-photo').classList.add('hidden');
      $('photoState').textContent = 'Foto siap'; $('uploadButton').disabled = false; $('retake').disabled = false; updateFilename(); hideMessage('uploadMessage');
    }, 'image/jpeg', .92);
  }
  async function checkStatus() {
    try {
      const response = await fetch('/api/status'); const data = await response.json();
      const selected = $('provider').value; const el = $('cloudStatus');
      if (selected === 'nextcloud') {
        el.className = `cloud-status ${data.nextcloud.configured ? 'good' : 'bad'}`;
        el.textContent = data.nextcloud.configured ? `Nextcloud siap. Folder tujuan: ${data.nextcloud.target}` : 'Nextcloud belum dikonfigurasi. Isi NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD di .env.';
        $('googleConnect').classList.add('hidden'); $('googleDisconnect').classList.add('hidden');
      } else {
        const configured = data.googleDrive.configured, connected = data.googleDrive.connected;
        el.className = `cloud-status ${configured && connected ? 'good' : 'bad'}`;
        el.textContent = !configured ? 'Google OAuth belum dikonfigurasi. Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REDIRECT_URI di .env.' : connected ? (data.googleDrive.folderConfigured ? 'Google Drive terhubung. Upload ke folder yang ditentukan di server.' : 'Google Drive terhubung. Upload ke My Drive.') : 'Google OAuth sudah dikonfigurasi, tetapi akun belum terhubung.';
        $('googleConnect').classList.toggle('hidden', !configured || connected);
        $('googleDisconnect').classList.toggle('hidden', !connected);
      }
    } catch { $('cloudStatus').className = 'cloud-status bad'; $('cloudStatus').textContent = 'Tidak dapat memeriksa status server.'; }
  }
  async function uploadPhoto() {
    if (!capturedBlob) return;
    const form = $('participantForm');
    if (!form.reportValidity()) return;
    const provider = $('provider').value;
    $('uploadButton').disabled = true; $('uploadButton').textContent = 'Mengunggah…';
    setMessage('uploadMessage', 'Mengunggah foto ke penyimpanan cloud…', 'info');
    try {
      const fd = new FormData();
      fd.append('photo', capturedBlob, filename());
      names.forEach(n => fd.append(n, $(n).value.trim()));
      fd.append('daerah', $('daerah').value);
      fd.append('provider', provider);
      const response = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Upload gagal.');
      uploadCount++; $('sessionCount').textContent = `${uploadCount} foto berhasil`;
      const last = $('lastUpload'); last.innerHTML = '';
      const strong = document.createElement('strong'); strong.textContent = '✓ Upload berhasil';
      const detail = document.createElement('div'); detail.textContent = `${data.filename} · ${data.provider}${data.location ? ' · ' + data.location : ''}`;
      last.append(strong, detail);
      setMessage('uploadMessage', `Berhasil upload ${data.filename} ke ${data.provider}.`, 'success');
      form.reset(); updateFilename(); capturedBlob = null; $('capturedPhoto').classList.add('hidden'); $('resultBox').querySelector('.empty-photo').classList.remove('hidden'); $('photoState').textContent = 'Belum ada foto'; $('uploadButton').disabled = true; $('retake').disabled = true;
    } catch (e) { setMessage('uploadMessage', e.message || 'Upload gagal. Periksa koneksi dan konfigurasi cloud.', 'error'); }
    finally { $('uploadButton').textContent = '↑ Upload foto'; $('uploadButton').disabled = !capturedBlob; checkStatus(); }
  }
  names.forEach(n => $(n).addEventListener('input', updateFilename));

  // CUSTOM_AUTOCOMPLETE_V1
  const masterGroups = {
    'Batu Ampar': ['Kariangau', 'KM 7', 'Perumnas', 'PPM', 'Soekarno Hatta', 'Somber', 'KM 10'],
    'Ringroad': ['Bandara Utara', 'Gunung Samarinda', 'Sumber Rejo'],
    'Sepinggan': ['Bandara Baru', 'Melati', 'Sepinggan 1', 'Sepinggan 2', 'Sepinggan 3', 'Sepinggan 4'],
    'Timur Raya': ['Batakan', 'Lamaru', 'Manggar', 'Sosial']
  };
  const normalizeText = value => String(value || '').trim().replace(/\s+/g, ' ');
  const matchCanonical = (value, choices) => {
    const normalized = normalizeText(value).toLocaleLowerCase('id-ID');
    return choices.find(item => item.toLocaleLowerCase('id-ID') === normalized) || normalizeText(value);
  };

  function setupAutocomplete(input, getChoices, label) {
    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'autocomplete-trigger';
    trigger.setAttribute('aria-label', 'Tampilkan pilihan ' + label);
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    wrapper.appendChild(trigger);

    const menu = document.createElement('div');
    menu.className = 'autocomplete-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    wrapper.appendChild(menu);

    let activeIndex = -1;

    function close() {
      menu.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      activeIndex = -1;
    }

    function choose(value, canonical = false) {
      input.value = canonical ? value : normalizeText(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    }

    function render() {
      const query = normalizeText(input.value).toLocaleLowerCase('id-ID');
      const choices = getChoices().filter(Boolean);
      const matches = choices.filter(item =>
        item.toLocaleLowerCase('id-ID').includes(query)
      );
      menu.replaceChildren();
      activeIndex = -1;

      matches.forEach(item => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'autocomplete-option';
        option.setAttribute('role', 'option');
        const title = document.createElement('span');
        title.className = 'autocomplete-option-title';
        title.textContent = item;
        const sub = document.createElement('span');
        sub.className = 'autocomplete-option-sub';
        sub.textContent = label;
        option.append(title, sub);
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => choose(item, true));
        menu.appendChild(option);
      });

      const exactMatch = choices.some(item =>
        item.toLocaleLowerCase('id-ID') === query
      );
      if (normalizeText(input.value) && !exactMatch) {
        const custom = document.createElement('button');
        custom.type = 'button';
        custom.className = 'autocomplete-option autocomplete-custom';
        custom.setAttribute('role', 'option');
        const title = document.createElement('span');
        title.className = 'autocomplete-option-title';
        title.textContent = 'Gunakan "' + normalizeText(input.value) + '"';
        const sub = document.createElement('span');
        sub.className = 'autocomplete-option-sub';
        sub.textContent = 'Nama baru · input manual';
        custom.append(title, sub);
        custom.addEventListener('mousedown', event => event.preventDefault());
        custom.addEventListener('click', () => choose(input.value));
        menu.appendChild(custom);
      }

      if (!menu.children.length) {
        const empty = document.createElement('div');
        empty.className = 'autocomplete-empty';
        empty.textContent = 'Belum ada saran. Ketik nama secara manual.';
        menu.appendChild(empty);
      }

      menu.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    trigger.addEventListener('click', () => {
      if (menu.hidden) {
        input.focus();
        render();
      } else {
        close();
      }
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      const options = [...menu.querySelectorAll('.autocomplete-option')];
      if (event.key === 'ArrowDown' && !menu.hidden) {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, options.length - 1);
      } else if (event.key === 'ArrowUp' && !menu.hidden) {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (event.key === 'Enter' && !menu.hidden && activeIndex >= 0) {
        event.preventDefault();
        options[activeIndex]?.click();
        return;
      } else {
        return;
      }
      options.forEach((option, i) => option.classList.toggle('is-active', i === activeIndex));
      options[activeIndex]?.scrollIntoView({ block: 'nearest' });
    });

    input.addEventListener('blur', () => {
      input.value = normalizeText(input.value);
      updateFilename();
      setTimeout(() => {
        if (!wrapper.contains(document.activeElement)) close();
      }, 120);
    });

    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) close();
    });

    return { close };
  }

  const desaInput = $('desa');
  const kelompokInput = $('kelompok');
  const desaAutocomplete = setupAutocomplete(
    desaInput, () => Object.keys(masterGroups), 'Desa terdaftar'
  );
  setupAutocomplete(kelompokInput, () => {
    const desa = matchCanonical(desaInput.value, Object.keys(masterGroups));
    return masterGroups[desa] || [];
  }, 'Kelompok untuk desa terpilih');

  desaInput.addEventListener('change', () => {
    const canonical = matchCanonical(desaInput.value, Object.keys(masterGroups));
    if (Object.keys(masterGroups).includes(canonical)) desaInput.value = canonical;
    desaAutocomplete.close();
    updateFilename();
  });


  $('startCamera').addEventListener('click', () => startCamera(selectedDeviceId, facing));
  $('shutter').addEventListener('click', capture);
  $('switchCamera').addEventListener('click', async () => {
    if (!stream) return startCamera('', facing === 'user' ? 'environment' : 'user');
    const current = selectedDeviceId; await refreshCameras();
    if (cameras.length > 1) {
      let i = cameras.findIndex(c => c.deviceId === current); i = (i + 1) % cameras.length;
      selectedDeviceId = cameras[i].deviceId; await startCamera(selectedDeviceId, facing);
    } else {
      facing = facing === 'user' ? 'environment' : 'user'; selectedDeviceId = ''; await startCamera('', facing);
    }
  });
  $('cameraSelect').addEventListener('change', e => { selectedDeviceId = e.target.value; if (selectedDeviceId) startCamera(selectedDeviceId, facing); });
  $('mirrorCamera').addEventListener('click', () => { mirrored = !mirrored; video.style.transform = mirrored ? 'scaleX(-1)' : ''; $('mirrorCamera').setAttribute('aria-pressed', String(mirrored)); $('mirrorCamera').classList.toggle('button-primary', mirrored); });
  $('twibbonFile').addEventListener('change', e => loadTwibbon(e.target.files[0]));
  $('twibbonOpacity').addEventListener('input', () => { $('opacityValue').textContent = `${$('twibbonOpacity').value}%`; drawOverlay(); });
  $('twibbonFit').addEventListener('change', drawOverlay);
  $('removeTwibbon').addEventListener('click', () => { if ($('removeTwibbon').disabled) return; if (twibbonObjectUrl && twibbonObjectUrl.startsWith('blob:')) URL.revokeObjectURL(twibbonObjectUrl); twibbonObjectUrl = null; twibbonImage = null; $('twibbonPreview').removeAttribute('src'); $('twibbonPreview').classList.add('hidden'); $('twibbonEmpty').classList.remove('hidden'); $('removeTwibbon').disabled = true; $('twibbonFile').value = ''; drawOverlay(); });
  $('retake').addEventListener('click', () => { capturedBlob = null; $('capturedPhoto').classList.add('hidden'); $('resultBox').querySelector('.empty-photo').classList.remove('hidden'); $('photoState').textContent = 'Belum ada foto'; $('uploadButton').disabled = true; $('retake').disabled = true; hideMessage('uploadMessage'); });
  $('uploadButton').addEventListener('click', uploadPhoto);
  $('provider').addEventListener('change', checkStatus);
  $('googleDisconnect').addEventListener('click', async () => { await fetch('/auth/google/disconnect', { method: 'POST' }); checkStatus(); });
  video.addEventListener('loadedmetadata', drawOverlay);
  window.addEventListener('resize', drawOverlay);
  window.addEventListener('beforeunload', stopCamera);
  if (new URLSearchParams(location.search).get('google') === 'connected') { setMessage('uploadMessage', 'Google Drive berhasil dihubungkan.', 'success'); history.replaceState({}, '', '/'); }
  updateFilename(); checkStatus(); initializeTwibbon();
})();
