(() => {
  const $ = id => document.getElementById(id);
  const video = $('video'), canvas = $('overlayCanvas'), ctx = canvas.getContext('2d');
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let stream = null, cameras = [], selectedDeviceId = '',
      facing = isMobileDevice ? 'environment' : 'user', mirrored = false;
  let twibbonImage = null, twibbonObjectUrl = null, capturedBlob = null, capturedRawBlob = null, capturedUrl = null, captureVersion = 0, uploadCount = 0;
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
    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!twibbonImage) return;

    ctx.save();
    ctx.globalAlpha = Number($('twibbonOpacity').value) / 100;

    const fit = $('twibbonFit').value;
    const scale = fit === 'contain'
      ? Math.min(rect.width / twibbonImage.width, rect.height / twibbonImage.height)
      : Math.max(rect.width / twibbonImage.width, rect.height / twibbonImage.height);

    const w = twibbonImage.width * scale;
    const h = twibbonImage.height * scale;

    ctx.drawImage(
      twibbonImage,
      (rect.width - w) / 2,
      (rect.height - h) / 2,
      w,
      h
    );

    ctx.restore();
  }

  let activeTwibbonId = null;

  function showTwibbonImage(img, url, isShared = false) {
    if (twibbonObjectUrl && twibbonObjectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(twibbonObjectUrl);
    }
    twibbonObjectUrl = url;
    twibbonImage = img;
    $('twibbonPreview').src = url;
    $('twibbonPreview').classList.remove('hidden');
    $('twibbonEmpty').classList.add('hidden');
    $('removeTwibbon').disabled = !isShared || !activeTwibbonId;
    $('twibbonFilePicker').classList.remove('hidden');
    drawOverlay();
  }

  function clearActiveTwibbon() {
    if (twibbonObjectUrl && twibbonObjectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(twibbonObjectUrl);
    }
    twibbonObjectUrl = null;
    twibbonImage = null;
    activeTwibbonId = null;
    $('twibbonPreview').removeAttribute('src');
    $('twibbonPreview').classList.add('hidden');
    $('twibbonEmpty').classList.remove('hidden');
    $('removeTwibbon').disabled = true;
    drawOverlay();
  }

  async function renderTwibbonGallery() {
    const gallery = $('twibbonGallery');
    const response = await fetch(`/api/twibbons?v=${Date.now()}`, {
      cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Galeri gagal dimuat.');

    const items = Array.isArray(data.items) ? data.items : [];
    activeTwibbonId = data.activeId ||
      (data.active && data.active.id) ||
      (items.find(item => item.active || item.isActive) || {}).id ||
      null;

    gallery.replaceChildren();

    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent = 'Belum ada desain. Tambahkan file PNG di atas.';
      gallery.appendChild(empty);
      return;
    }

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'twibbon-gallery-item';

      const thumbnail = document.createElement('img');
      thumbnail.className = 'twibbon-gallery-thumb';
      thumbnail.alt = item.name || item.filename || 'Pratinjau twibbon';
      thumbnail.loading = 'lazy';
      thumbnail.src = `/api/twibbons/${encodeURIComponent(item.id)}/image?v=${Date.now()}`;

      const details = document.createElement('div');
      details.className = 'twibbon-gallery-details';

      const name = document.createElement('strong');
      name.className = 'twibbon-gallery-name';
      name.textContent = item.name || item.filename || 'Twibbon PNG';
      details.appendChild(name);

      const isActive = item.id === activeTwibbonId;
      const badge = document.createElement('span');
      badge.className = isActive ? 'twibbon-active-badge' : 'twibbon-inactive-badge';
      badge.textContent = isActive ? '✓ Sedang aktif' : 'Tersimpan';
      details.appendChild(badge);

      const actions = document.createElement('div');
      actions.className = 'twibbon-gallery-actions';

      if (!isActive) {
        const activate = document.createElement('button');
        activate.type = 'button';
        activate.className = 'button button-secondary';
        activate.textContent = 'Aktifkan';
        activate.addEventListener('click', async () => {
          activate.disabled = true;
          try {
            const result = await fetch(
              `/api/twibbons/${encodeURIComponent(item.id)}/activate`,
              { method: 'POST' }
            );
            const body = await result.json().catch(() => ({}));
            if (!result.ok || body.ok === false) {
              throw new Error(body.error || 'Gagal mengaktifkan twibbon.');
            }
            await initializeTwibbon();
          } catch (error) {
            alert(error.message || 'Gagal mengaktifkan twibbon.');
            activate.disabled = false;
          }
        });
        actions.appendChild(activate);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button gallery-delete';
      remove.textContent = 'Hapus';
      remove.addEventListener('click', async () => {
        if (!confirm(`Hapus desain "${name.textContent}" dari galeri?`)) return;
        remove.disabled = true;
        try {
          const result = await fetch(
            `/api/twibbons/${encodeURIComponent(item.id)}`,
            { method: 'DELETE' }
          );
          const body = await result.json().catch(() => ({}));
          if (!result.ok || body.ok === false) {
            throw new Error(body.error || 'Gagal menghapus twibbon.');
          }
          await initializeTwibbon();
        } catch (error) {
          alert(error.message || 'Gagal menghapus twibbon.');
          remove.disabled = false;
        }
      });
      actions.appendChild(remove);

      details.appendChild(actions);
      card.append(thumbnail, details);
      gallery.appendChild(card);
    }
  }

  async function loadTwibbon(file) {
    if (!file) return;
    if (file.type !== 'image/png') {
      setMessage('uploadMessage', 'Twibbon harus berupa file PNG.', 'error');
      $('twibbonFile').value = '';
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setMessage('uploadMessage', 'Ukuran twibbon maksimal 12 MB.', 'error');
      $('twibbonFile').value = '';
      return;
    }

    const picker = $('twibbonFilePicker');
    const label = picker.querySelector('span');
    const previousLabel = label.textContent;
    label.textContent = 'Mengunggah twibbon…';

    try {
      const fd = new FormData();
      fd.append('twibbon', file, file.name || 'twibbon.png');

      const response = await fetch('/api/twibbons', {
        method: 'POST',
        body: fd
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || 'Gagal menyimpan twibbon ke server.');
      }

      hideMessage('uploadMessage');
      await initializeTwibbon();
    } catch (error) {
      setMessage(
        'uploadMessage',
        error.message || 'Gagal mengunggah twibbon.',
        'error'
      );
    } finally {
      label.textContent = previousLabel;
      $('twibbonFile').value = '';
    }
  }

  async function initializeTwibbon() {
    const picker = $('twibbonFilePicker');
    const status = $('twibbonServerStatus');

    picker.classList.remove('hidden');
    status.className = 'cloud-status';
    status.textContent = 'Memuat galeri twibbon…';

    try {
      await renderTwibbonGallery();

      if (!activeTwibbonId) {
        clearActiveTwibbon();
        status.textContent = 'Belum ada twibbon aktif. Tambahkan PNG atau pilih desain dari galeri.';
        return;
      }

      const response = await fetch(`/api/twibbon?v=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error('Gambar twibbon aktif gagal dimuat.');
      }

      const blob = await response.blob();
      if (!blob.size || !blob.type.includes('image')) {
        throw new Error('Server tidak mengirim gambar twibbon yang valid.');
      }

      const url = URL.createObjectURL(blob);
      const img = new Image();

      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Browser gagal membaca gambar twibbon.'));
          img.src = url;
        });

        showTwibbonImage(img, url, true);
        status.className = 'cloud-status good';
        status.textContent = 'Twibbon aktif tersimpan di server dan digunakan semua perangkat.';
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
    } catch (error) {
      status.className = 'cloud-status bad';
      status.textContent = error.message || 'Galeri gagal dimuat. Periksa koneksi server.';
      console.warn('Gagal memuat galeri twibbon:', error);
    }
  }
  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gagal memproses foto.')), 'image/jpeg', .92);
    });
  }

  async function capture() {
    if (!stream || !video.videoWidth || !video.videoHeight) return;
    const version = ++captureVersion;

    // Crop tengah ke rasio portrait Instagram 4:5.
    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;
    const targetRatio = 4 / 5;
    const sourceRatio = sourceW / sourceH;

    let sx = 0, sy = 0, sw = sourceW, sh = sourceH;

    if (sourceRatio > targetRatio) {
      sw = sourceH * targetRatio;
      sx = (sourceW - sw) / 2;
    } else if (sourceRatio < targetRatio) {
      sh = sourceW / targetRatio;
      sy = (sourceH - sh) / 2;
    }

    const outputH = Math.round(sh);
    const outputW = Math.round(outputH * targetRatio);

    // Foto raw: seluruh frame kamera, tanpa crop dan tanpa twibbon.
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = sourceW;
    rawCanvas.height = sourceH;
    rawCanvas.getContext('2d').drawImage(video, 0, 0, sourceW, sourceH);

    // Foto bertwibbon: tetap menggunakan crop 4:5 seperti sebelumnya.
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = outputW;
    croppedCanvas.height = outputH;
    croppedCanvas.getContext('2d').drawImage(
      video, sx, sy, sw, sh, 0, 0, outputW, outputH
    );

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = outputW;
    finalCanvas.height = outputH;
    const c = finalCanvas.getContext('2d');
    c.drawImage(croppedCanvas, 0, 0);

    if (twibbonImage) {
      c.save();
      c.globalAlpha = Number($('twibbonOpacity').value) / 100;

      if ($('twibbonFit').value === 'contain') {
        const scale = Math.min(
          outputW / twibbonImage.width,
          outputH / twibbonImage.height
        );
        const w = twibbonImage.width * scale;
        const h = twibbonImage.height * scale;
        c.drawImage(twibbonImage, (outputW - w) / 2, (outputH - h) / 2, w, h);
      } else {
        const scale = Math.max(
          outputW / twibbonImage.width,
          outputH / twibbonImage.height
        );
        const w = twibbonImage.width * scale;
        const h = twibbonImage.height * scale;
        c.drawImage(twibbonImage, (outputW - w) / 2, (outputH - h) / 2, w, h);
      }

      c.restore();
    }

    try {
      const [rawBlob, finalBlob] = await Promise.all([
        canvasBlob(rawCanvas),
        canvasBlob(finalCanvas)
      ]);

      if (version !== captureVersion) return;

      capturedRawBlob = rawBlob;
      capturedBlob = finalBlob;

      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
      capturedUrl = URL.createObjectURL(finalBlob);

      $('capturedPhoto').src = capturedUrl;
      $('capturedPhoto').classList.remove('hidden');
      $('resultBox').querySelector('.empty-photo').classList.add('hidden');
      $('photoState').textContent = 'Foto siap';
      $('uploadButton').disabled = false;
      $('retake').disabled = false;
      updateFilename();
      hideMessage('uploadMessage');
    } catch (e) {
      if (version === captureVersion) {
        setMessage('uploadMessage', e.message || 'Gagal memproses foto. Silakan coba lagi.', 'error');
      }
    }
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
    if (!capturedBlob || !capturedRawBlob) return;
    const form = $('participantForm');
    if (!form.reportValidity()) return;

    const version = captureVersion;
    const photoBlob = capturedBlob;
    const rawBlob = capturedRawBlob;
    const photoName = filename();
    const rawName = photoName.replace(/\.jpg$/i, '_raw.jpg');
    const participant = Object.fromEntries(
      names.map(n => [n, $(n).value.trim()])
    );
    const daerah = $('daerah').value;
    const jenisKelamin = $('jenisKelamin').value;
    const provider = $('provider').value;

    $('uploadButton').disabled = true;
    $('uploadButton').textContent = 'Mengunggah…';
    setMessage('uploadMessage', 'Mengunggah foto bertwibbon dan foto raw…', 'info');

    try {
      const fd = new FormData();
      fd.append('photo', photoBlob, photoName);
      fd.append('rawPhoto', rawBlob, rawName);
      names.forEach(n => fd.append(n, participant[n]));
      fd.append('daerah', daerah);
      fd.append('jenisKelamin', jenisKelamin);
      fd.append('provider', provider);

      const response = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Upload gagal.');

      uploadCount++;
      $('sessionCount').textContent = `${uploadCount} foto berhasil`;
      const last = $('lastUpload');
      last.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = '✓ Upload berhasil';
      const detail = document.createElement('div');
      detail.textContent = `${data.filename} + ${data.rawFilename} · ${data.provider}${data.location ? ' · ' + data.location : ''}`;
      last.append(strong, detail);

      // Hanya bersihkan form jika tidak ada foto/data baru sejak upload dimulai.
      const sameParticipant = names.every(n => $(n).value.trim() === participant[n]) &&
        $('daerah').value === daerah &&
        $('jenisKelamin').value === jenisKelamin;
      if (captureVersion === version && sameParticipant) {
        capturedBlob = null;
        capturedRawBlob = null;
        if (capturedUrl) URL.revokeObjectURL(capturedUrl);
        capturedUrl = null;
        $('capturedPhoto').removeAttribute('src');
        $('capturedPhoto').classList.add('hidden');
        $('resultBox').querySelector('.empty-photo').classList.remove('hidden');
        $('photoState').textContent = 'Belum ada foto';
        $('retake').disabled = true;
        form.reset();
        $('daerah').value = daerah;
        $('jenisKelamin').value = jenisKelamin;
        updateFilename();
      }

      if (captureVersion === version && sameParticipant) {
        setMessage('uploadMessage', `Berhasil upload ${data.filename} dan ${data.rawFilename}.`, 'success');
      } else {
        setMessage('uploadMessage', `Upload ${data.filename} dan ${data.rawFilename} berhasil. Foto/data terbaru tetap dipertahankan.`, 'success');
      }
    } catch (e) {
      setMessage('uploadMessage', e.message || 'Upload gagal. Periksa koneksi dan konfigurasi cloud.', 'error');
    } finally {
      if (captureVersion === version) {
        $('uploadButton').textContent = '↑ Upload foto';
        $('uploadButton').disabled = !capturedBlob || !capturedRawBlob;
      }
      checkStatus();
    }
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
  const photoPreviewPanel = $('photoPreviewPanel');
  const cameraPanel = document.querySelector('.camera-panel');
  const formPanel = document.querySelector('.form-panel');

  const mobileUploadSlot = $('mobileUploadSlot');
  const uploadButton = $('uploadButton');
  const uploadMessage = $('uploadMessage');
  const uploadButtonRow = uploadButton.parentElement;

  function arrangePhotoPreview() {
    if (window.matchMedia('(max-width: 850px)').matches) {
      cameraPanel.appendChild(photoPreviewPanel);
      mobileUploadSlot.append(uploadButton, uploadMessage);
    } else {
      uploadButtonRow.appendChild(uploadButton);
      photoPreviewPanel.appendChild(uploadMessage);
      formPanel.appendChild(photoPreviewPanel);
    }
  }

  arrangePhotoPreview();
  window.addEventListener('resize', arrangePhotoPreview);

  $('retake').addEventListener('click', () => {
    captureVersion++;
    capturedBlob = null;
    capturedRawBlob = null;

    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    capturedUrl = null;

    $('capturedPhoto').removeAttribute('src');
    $('capturedPhoto').classList.add('hidden');
    $('resultBox').querySelector('.empty-photo').classList.remove('hidden');
    $('photoState').textContent = 'Belum ada foto';
    $('retake').disabled = true;
    $('uploadButton').disabled = true;
    hideMessage('uploadMessage');
  });

  $('uploadButton').addEventListener('click', uploadPhoto);

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
  $('removeTwibbon').addEventListener('click', async () => {
    if ($('removeTwibbon').disabled || !activeTwibbonId) return;
    if (!confirm('Hapus twibbon yang sedang aktif dari galeri?')) return;

    const button = $('removeTwibbon');
    button.disabled = true;

    try {
      const response = await fetch(
        `/api/twibbons/${encodeURIComponent(activeTwibbonId)}`,
        { method: 'DELETE' }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || 'Gagal menghapus twibbon aktif.');
      }
      await initializeTwibbon();
    } catch (error) {
      alert(error.message || 'Gagal menghapus twibbon aktif.');
      button.disabled = !activeTwibbonId;
    }
  });

  video.addEventListener('loadedmetadata', drawOverlay);
  window.addEventListener('resize', drawOverlay);
  window.addEventListener('beforeunload', stopCamera);
  if (new URLSearchParams(location.search).get('google') === 'connected') { setMessage('uploadMessage', 'Google Drive berhasil dihubungkan.', 'success'); history.replaceState({}, '', '/'); }
  updateFilename(); checkStatus(); initializeTwibbon();
})();
